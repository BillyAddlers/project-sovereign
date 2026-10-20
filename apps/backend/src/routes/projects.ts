import { Hono } from "hono";

import type { Prisma } from "@/generated/prisma/client";
import { projectAccessFor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { paginate, paginationSchema } from "@/lib/paginate";
import {
  canCreateProject,
  canDeleteProject,
  canEditProject,
  canManageProjectMembers,
  canViewStats,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  createProjectSchema,
  projectMemberInputSchema,
  updateProjectSchema,
} from "@/lib/schemas";
import { projectInclude, serializeProject } from "@/lib/serialize";
import { projectScope } from "@/lib/scope";
import { validated } from "@/lib/validate";
import { requireAuth } from "@/middleware/auth";
import type { AppEnv } from "@/types";

export const projects = new Hono<AppEnv>();

// Session required for every project route; rows are scoped by role below.
projects.use("*", requireAuth);

type Db = ReturnType<typeof prisma>;

/** The referenced client must exist and actually hold the client role. */
async function assertClient(db: Db, clientId: string | null): Promise<void> {
  if (clientId === null) return;
  const client = await db.user.findFirst({
    where: { id: clientId, deletedAt: null },
    select: { role: true },
  });
  if (!client || client.role !== "client") {
    throw AppError.badRequest("Client must be a user with the client role", { clientId });
  }
}

/** Members must exist and may not be clients — the client owns, never joins. */
async function assertMembers(db: Db, memberIds: string[]): Promise<void> {
  if (memberIds.length === 0) return;
  const users = await db.user.findMany({
    where: { id: { in: memberIds }, deletedAt: null },
    select: { id: true, role: true },
  });
  if (users.length !== memberIds.length) {
    throw AppError.badRequest("Unknown project member", { memberIds });
  }
  if (users.some((user) => user.role === "client")) {
    throw AppError.badRequest("Clients cannot be project members", { memberIds });
  }
}

/** GET /api/projects — paginated list, scoped to the viewer's role. */
projects.get("/", validated("query", paginationSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("query");
  const where = projectScope(user);
  const db = prisma();

  const [rows, total] = await Promise.all([
    db.project.findMany({
      where,
      skip: (input.page - 1) * input.rows,
      take: input.rows,
      orderBy: { createdAt: input.orderRule },
      include: projectInclude,
    }),
    db.project.count({ where }),
  ]);

  return c.json(paginate(rows.map((row) => serializeProject(row, user)), total, input));
});

/** POST /api/projects — PM only. */
projects.post("/", validated("json", createProjectSchema), async (c) => {
  const user = c.get("user");
  if (!canCreateProject(user)) {
    throw AppError.forbidden("Only a project manager can create projects");
  }

  const { memberIds: rawMemberIds, ...fields } = c.req.valid("json");
  // Duplicate ids are harmless input; keep one membership per user.
  const memberIds = [...new Set(rawMemberIds ?? [])];
  const db = prisma();
  await Promise.all([assertClient(db, fields.clientId ?? null), assertMembers(db, memberIds)]);

  const project = await db.project.create({
    data: {
      name: fields.name,
      description: fields.description,
      status: fields.status,
      clientId: fields.clientId ?? null,
      ...(memberIds.length > 0
        ? { members: { create: memberIds.map((userId) => ({ userId })) } }
        : {}),
    },
    include: projectInclude,
  });

  return c.json(serializeProject(project, user), 201);
});

/** GET /api/projects/:id */
projects.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const project = await prisma().project.findFirst({
    where: { AND: [{ id }, projectScope(user)] },
    include: projectInclude,
  });
  if (!project) throw AppError.notFound(`Project ${id} was not found`);
  return c.json(serializeProject(project, user));
});

/** PATCH /api/projects/:id — PM only, allow-listed fields. */
projects.patch("/:id", validated("json", updateProjectSchema), async (c) => {
  const user = c.get("user");
  if (!canEditProject(user)) {
    throw AppError.forbidden("Only a project manager can edit projects");
  }

  const id = c.req.param("id");
  const body = c.req.valid("json");
  const db = prisma();

  const existing = await db.project.findFirst({
    where: { AND: [{ id }, projectScope(user)] },
    select: { id: true },
  });
  if (!existing) throw AppError.notFound(`Project ${id} was not found`);

  if (body.clientId !== undefined) await assertClient(db, body.clientId);

  const data: Prisma.ProjectUncheckedUpdateInput = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.clientId !== undefined ? { clientId: body.clientId } : {}),
  };

  const updated = await db.project.update({
    where: { id },
    data,
    include: projectInclude,
  });
  return c.json(serializeProject(updated, user));
});

/**
 * DELETE /api/projects/:id — PM only, soft delete.
 *
 * A project with tasks is refused (409): `taskScope` does not join
 * `project.deletedAt`, so hiding a still-populated project would leave its
 * tasks visible. Fase 3 generalises soft delete (and its audit trail) to the
 * rest of the model.
 */
projects.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!canDeleteProject(user)) {
    throw AppError.forbidden("Only a project manager can delete projects");
  }

  const id = c.req.param("id");
  const db = prisma();

  const existing = await db.project.findFirst({
    where: { AND: [{ id }, projectScope(user)] },
    select: { id: true },
  });
  if (!existing) throw AppError.notFound(`Project ${id} was not found`);

  const tasks = await db.task.count({ where: { projectId: id, deletedAt: null } });
  if (tasks > 0) {
    throw new AppError(409, "PROJECT_NOT_EMPTY", "Move or delete the project's tasks first");
  }

  await db.project.update({ where: { id }, data: { deletedAt: new Date() } });
  return c.body(null, 204);
});

/** POST /api/projects/:id/members — PM only, idempotent. */
projects.post("/:id/members", validated("json", projectMemberInputSchema), async (c) => {
  const user = c.get("user");
  if (!canManageProjectMembers(user)) {
    throw AppError.forbidden("Only a project manager can change project members");
  }

  const id = c.req.param("id");
  const { userId } = c.req.valid("json");
  const db = prisma();

  const project = await db.project.findFirst({
    where: { AND: [{ id }, projectScope(user)] },
    select: { id: true },
  });
  if (!project) throw AppError.notFound(`Project ${id} was not found`);

  await assertMembers(db, [userId]);
  await db.projectMember.upsert({
    where: { projectId_userId: { projectId: id, userId } },
    create: { projectId: id, userId },
    update: {},
  });
  return c.body(null, 204);
});

/** DELETE /api/projects/:id/members/:userId — PM only. */
projects.delete("/:id/members/:userId", async (c) => {
  const user = c.get("user");
  if (!canManageProjectMembers(user)) {
    throw AppError.forbidden("Only a project manager can change project members");
  }

  const id = c.req.param("id");
  const userId = c.req.param("userId");
  const db = prisma();

  const project = await db.project.findFirst({
    where: { AND: [{ id }, projectScope(user)] },
    select: { id: true },
  });
  if (!project) throw AppError.notFound(`Project ${id} was not found`);

  const link = await db.projectMember.findFirst({ where: { projectId: id, userId } });
  if (!link) throw AppError.notFound("Member was not found");

  await db.projectMember.delete({
    where: { projectId_userId: { projectId: id, userId } },
  });
  return c.body(null, 204);
});

/**
 * GET /api/projects/:id/stats — aggregate metrics.
 *
 * This is the Client Guest's only read surface: their own project, computed
 * from client-visible tasks only. PM and engineers get the same shape for
 * projects they may see.
 */
projects.get("/:id/stats", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const access = await projectAccessFor(user.id, id);
  if (!access) throw AppError.notFound(`Project ${id} was not found`);
  if (!canViewStats(user, access)) {
    throw AppError.forbidden("You cannot view this project's metrics");
  }

  const db = prisma();
  const where: Prisma.TaskWhereInput = { projectId: id, deletedAt: null };
  if (user.role === "client") where.clientVisible = true;

  const [total, grouped, blockedCount] = await Promise.all([
    db.task.count({ where }),
    db.task.groupBy({ by: ["status"], where, _count: { _all: true } }),
    db.task.count({
      where: {
        ...where,
        status: { not: "done" },
        dependencies: {
          some: { dependsOn: { status: { not: "done" }, deletedAt: null } },
        },
      },
    }),
  ]);

  const counts = { todo: 0, in_progress: 0, done: 0 };
  for (const group of grouped) counts[group.status] = group._count._all;

  return c.json({
    total,
    byStatus: counts,
    percentComplete: total === 0 ? 0 : Math.round((counts.done / total) * 100),
    blockedCount,
  });
});
