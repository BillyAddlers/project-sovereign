import { mkdir } from "node:fs/promises";
import path from "node:path";

import { Hono } from "hono";

import type { Prisma, TaskStatus } from "@/generated/prisma/client";
import { projectAccessFor } from "@/lib/access";
import { type AuditEntry, createEntries, deleteEntry, updateEntries } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { buildTaskQuery, paginate, paginationSchema } from "@/lib/paginate";
import {
  canCreateTask,
  canDefineDependency,
  canDeleteTask,
  canEditTaskFields,
  canTransitionStatus,
  canUploadAttachment,
  canViewAttachment,
  canViewTask,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createTaskSchema, dependencyInputSchema, updateTaskSchema } from "@/lib/schemas";
import { serializeAttachment, serializeTask, taskInclude } from "@/lib/serialize";
import { taskScope } from "@/lib/scope";
import { validated } from "@/lib/validate";
import { buildTaskWhere } from "@/lib/validators";
import { requireAuth } from "@/middleware/auth";
import type { AppEnv } from "@/types";

export const tasks = new Hono<AppEnv>();

// Every task route requires a session; role rules are applied per handler.
tasks.use("*", requireAuth);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/**
 * Append audit rows inside the caller's transaction, so a mutation and its
 * trail commit or roll back together. A no-op when nothing actually changed.
 */
async function writeAudit(
  tx: Prisma.TransactionClient,
  taskId: string,
  userId: string,
  action: "create" | "update" | "delete",
  entries: AuditEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  await tx.auditLog.createMany({
    data: entries.map((entry) => ({ taskId, userId, action, ...entry })),
  });
}

/** Follow "depends on" edges to see whether adding one would close a loop. */
function createsCycle(
  taskId: string,
  dependsOnId: string,
  links: { taskId: string; dependsOnId: string }[],
): boolean {
  const graph = new Map<string, string[]>();
  for (const link of links) {
    const next = graph.get(link.taskId) ?? [];
    next.push(link.dependsOnId);
    graph.set(link.taskId, next);
  }

  const seen = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const next = graph.get(current);
    if (next) stack.push(...next);
  }
  return false;
}

/** GET /api/tasks — paginated, filterable, scoped to the viewer's role. */
tasks.get("/", validated("query", paginationSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("query");
  const plan = buildTaskQuery(input);

  if (!plan.validation.isValid) {
    throw new AppError(422, "INVALID_FILTER", "The filter could not be applied", {
      errors: plan.validation.errors,
      warnings: plan.validation.warnings,
    });
  }

  // Scope and filter are combined with AND — the count reuses the same object.
  const conditions: Prisma.TaskWhereInput[] = [taskScope(user), buildTaskWhere(plan)];
  if (input.projectId) conditions.push({ projectId: input.projectId });
  const where: Prisma.TaskWhereInput = { AND: conditions };

  const db = prisma();
  const [rows, total] = await Promise.all([
    db.task.findMany({ where, ...plan.query, include: taskInclude }),
    db.task.count({ where }),
  ]);

  return c.json(paginate(rows.map((row) => serializeTask(row, user)), total, input));
});

/** GET /api/tasks/:id */
tasks.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const task = await prisma().task.findFirst({
    where: { AND: [{ id }, taskScope(user)] },
    include: taskInclude,
  });
  if (!task) throw AppError.notFound(`Task ${id} was not found`);
  return c.json(serializeTask(task, user));
});

/** POST /api/tasks — PM only. Engineers act on assigned work, they do not plan it. */
tasks.post("/", validated("json", createTaskSchema), async (c) => {
  const user = c.get("user");
  if (!canCreateTask(user)) {
    throw AppError.forbidden("Only a project manager can create tasks");
  }

  const input = c.req.valid("json");
  const db = prisma();

  const project = await db.project.findFirst({
    where: { id: input.projectId, deletedAt: null },
    select: { id: true },
  });
  if (!project) throw AppError.badRequest("Unknown project", { projectId: input.projectId });

  // Duplicate ids are harmless input; keep one edge per prerequisite.
  const { dependencyIds: rawDependencyIds, deadlineDate, ...rest } = input;
  const dependencyIds = [...new Set(rawDependencyIds ?? [])];
  // `deadlineDate` arrives as `YYYY-MM-DD`; Prisma stores it as a Date (UTC midnight).
  const fields = {
    ...rest,
    ...(deadlineDate ? { deadlineDate: new Date(deadlineDate) } : {}),
  };

  if (dependencyIds.length > 0) {
    const prerequisites = await db.task.findMany({
      where: { id: { in: dependencyIds }, deletedAt: null },
      select: { id: true, projectId: true },
    });
    if (prerequisites.length !== dependencyIds.length) {
      throw AppError.badRequest("Unknown prerequisite task", { dependencyIds });
    }
    if (prerequisites.some((entry) => entry.projectId !== input.projectId)) {
      throw AppError.badRequest("Dependencies must be in the same project");
    }
  }

  // A brand-new task has no dependents, so it cannot close a cycle — no check needed.
  const task = await db.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        ...fields,
        ...(dependencyIds.length > 0
          ? { dependencies: { create: dependencyIds.map((dependsOnId) => ({ dependsOnId })) } }
          : {}),
      },
      include: taskInclude,
    });
    await writeAudit(tx, created.id, user.id, "create", createEntries(fields));
    return created;
  });
  return c.json(serializeTask(task, user), 201);
});

/** PATCH /api/tasks/:id — field allow-list + state-based transitions. */
tasks.patch("/:id", validated("json", updateTaskSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { expectedVersion, ...body } = c.req.valid("json");
  const db = prisma();

  const task = await db.task.findFirst({
    where: { AND: [{ id }, taskScope(user)] },
    include: {
      dependencies: { select: { dependsOn: { select: { status: true } } } },
    },
  });
  if (!task) throw AppError.notFound(`Task ${id} was not found`);

  const access = await projectAccessFor(user.id, task.projectId);
  if (!access || !canViewTask(user, task, access)) {
    throw AppError.notFound(`Task ${id} was not found`);
  }

  if (user.role === "client") throw AppError.forbidden("Clients cannot modify tasks");

  const provided = Object.keys(body).filter(
    (key) => body[key as keyof typeof body] !== undefined,
  );
  if (provided.length === 0) throw AppError.badRequest("No fields to update");
  const statusProvided = provided.includes("status");
  const otherFields = provided.filter((key) => key !== "status");

  if (!canEditTaskFields(user) && otherFields.length > 0) {
    throw AppError.forbidden("Engineers may only change task status");
  }

  if (statusProvided) {
    const dependenciesDone = task.dependencies.every(
      (link) => link.dependsOn.status === "done",
    );
    const decision = canTransitionStatus(
      user,
      task,
      body.status as TaskStatus,
      dependenciesDone,
    );
    if (!decision.allowed) throw AppError.forbidden(decision.reason);
  }

  if (body.projectId !== undefined) {
    const project = await db.project.findFirst({
      where: { id: body.projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw AppError.badRequest("Unknown project", { projectId: body.projectId });
  }

  if (body.assigneeId !== undefined && body.assigneeId !== null) {
    const assignee = await db.user.findFirst({
      where: { id: body.assigneeId, deletedAt: null },
      select: { role: true },
    });
    if (!assignee || assignee.role !== "engineer") {
      throw AppError.badRequest("Assignee must be an engineer", {
        assigneeId: body.assigneeId,
      });
    }
  }

  const data: Prisma.TaskUncheckedUpdateInput = {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.priority !== undefined ? { priority: body.priority } : {}),
    ...(body.assigneeId !== undefined ? { assigneeId: body.assigneeId } : {}),
    ...(body.clientVisible !== undefined ? { clientVisible: body.clientVisible } : {}),
    ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.deadlineDate !== undefined
      ? { deadlineDate: body.deadlineDate === null ? null : new Date(body.deadlineDate) }
      : {}),
    ...(body.deadlineTime !== undefined ? { deadlineTime: body.deadlineTime } : {}),
  };

  const entries = updateEntries(task, data);

  // The version guard is the whole concurrency control: one conditional UPDATE
  // means two racing writers cannot both match, so the loser is cleanly refused.
  const applied = await db.$transaction(async (tx) => {
    const result = await tx.task.updateMany({
      where: { id, deletedAt: null, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) return false;
    await writeAudit(tx, id, user.id, "update", entries);
    return true;
  });

  if (!applied) {
    // Distinguish "gone" from "changed": only a live, visible row is a conflict.
    const current = await db.task.findFirst({
      where: { AND: [{ id }, taskScope(user)] },
      select: { version: true },
    });
    if (!current) throw AppError.notFound(`Task ${id} was not found`);
    throw AppError.versionConflict("This task was changed by someone else", {
      expectedVersion,
      currentVersion: current.version,
    });
  }

  const updated = await db.task.findFirst({ where: { id }, include: taskInclude });
  if (!updated) throw AppError.notFound(`Task ${id} was not found`);
  return c.json(serializeTask(updated, user));
});

/**
 * DELETE /api/tasks/:id — PM only, soft delete.
 *
 * Nothing is ever truly deleted: the row keeps its dependencies and
 * attachments, `taskScope` hides it from every read, and the transition is
 * recorded in the audit trail. A hard delete would also orphan the audit rows
 * that point at the task.
 */
tasks.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!canDeleteTask(user)) {
    throw AppError.forbidden("Only a project manager can delete tasks");
  }

  const id = c.req.param("id");
  const db = prisma();
  const existing = await db.task.findFirst({
    where: { AND: [{ id }, taskScope(user)] },
    select: { id: true },
  });
  if (!existing) throw AppError.notFound(`Task ${id} was not found`);

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.task.update({
      where: { id },
      data: { deletedAt: now, version: { increment: 1 } },
    });
    await writeAudit(tx, id, user.id, "delete", [deleteEntry(now)]);
  });

  return c.body(null, 204);
});

/** GET /api/tasks/:id/audit — PM-only, append-only change history. */
tasks.get("/:id/audit", async (c) => {
  const user = c.get("user");
  if (user.role !== "pm") {
    throw AppError.forbidden("Only a project manager can read the audit trail");
  }

  const id = c.req.param("id");
  const db = prisma();
  const task = await db.task.findFirst({
    where: { AND: [{ id }, taskScope(user)] },
    select: { id: true },
  });
  if (!task) throw AppError.notFound(`Task ${id} was not found`);

  const rows = await db.auditLog.findMany({
    where: { taskId: id },
    orderBy: { timestamp: "asc" },
  });
  return c.json(rows);
});

/** POST /api/tasks/:id/dependencies — PM defines "this waits for that". */
tasks.post("/:id/dependencies", validated("json", dependencyInputSchema), async (c) => {
  const user = c.get("user");
  if (!canDefineDependency(user)) {
    throw AppError.forbidden("Only a project manager can define dependencies");
  }

  const id = c.req.param("id");
  const { dependsOnId } = c.req.valid("json");
  if (dependsOnId === id) {
    throw AppError.badRequest("A task cannot depend on itself");
  }

  const db = prisma();
  const [task, prerequisite] = await Promise.all([
    db.task.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, projectId: true },
    }),
    db.task.findFirst({
      where: { id: dependsOnId, deletedAt: null },
      select: { id: true, projectId: true },
    }),
  ]);

  if (!task) throw AppError.notFound(`Task ${id} was not found`);
  if (!prerequisite) {
    throw AppError.badRequest("Unknown prerequisite task", { dependsOnId });
  }
  if (task.projectId !== prerequisite.projectId) {
    throw AppError.badRequest("Dependencies must be in the same project");
  }

  // Soft-deleted tasks are not part of the live graph, so they cannot close a loop.
  const links = await db.taskDependency.findMany({
    where: {
      task: { projectId: task.projectId, deletedAt: null },
      dependsOn: { deletedAt: null },
    },
    select: { taskId: true, dependsOnId: true },
  });
  if (createsCycle(id, dependsOnId, links)) {
    throw AppError.badRequest("That dependency would create a cycle");
  }

  const existing = await db.taskDependency.findFirst({
    where: { taskId: id, dependsOnId },
  });
  if (existing) {
    throw new AppError(409, "DEPENDENCY_EXISTS", "That dependency already exists");
  }

  const created = await db.taskDependency.create({
    data: { taskId: id, dependsOnId },
    include: {
      dependsOn: { select: { id: true, title: true, status: true } },
    },
  });
  return c.json(created.dependsOn, 201);
});

/** DELETE /api/tasks/:id/dependencies/:dependsOnId */
tasks.delete("/:id/dependencies/:dependsOnId", async (c) => {
  const user = c.get("user");
  if (!canDefineDependency(user)) {
    throw AppError.forbidden("Only a project manager can define dependencies");
  }

  const id = c.req.param("id");
  const dependsOnId = c.req.param("dependsOnId");
  const db = prisma();
  const task = await db.task.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!task) throw AppError.notFound(`Task ${id} was not found`);

  const existing = await db.taskDependency.findFirst({
    where: { taskId: id, dependsOnId },
  });
  if (!existing) throw AppError.notFound("Dependency was not found");

  await db.taskDependency.delete({
    where: { taskId_dependsOnId: { taskId: id, dependsOnId } },
  });
  return c.body(null, 204);
});

/** GET /api/tasks/:id/attachments — internal work products only. */
tasks.get("/:id/attachments", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const task = await prisma().task.findFirst({
    where: { AND: [{ id }, taskScope(user)] },
    select: { id: true, projectId: true },
  });
  if (!task) throw AppError.notFound(`Task ${id} was not found`);

  const access = await projectAccessFor(user.id, task.projectId);
  if (!access || !canViewAttachment(user, access)) {
    throw AppError.forbidden("Attachments are internal");
  }

  const rows = await prisma().attachment.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "desc" },
  });
  return c.json(rows.map(serializeAttachment));
});

/** POST /api/tasks/:id/attachments — multipart; PM or the assigned engineer. */
tasks.post("/:id/attachments", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const db = prisma();

  const task = await db.task.findFirst({
    where: { AND: [{ id }, taskScope(user)] },
  });
  if (!task) throw AppError.notFound(`Task ${id} was not found`);
  if (!canUploadAttachment(user, task)) {
    throw AppError.forbidden("You cannot attach files to this task");
  }

  const form = await c.req.parseBody();
  const file = form["file"];
  if (!(file instanceof File)) {
    throw AppError.badRequest("Expected a multipart field named 'file'");
  }
  if (file.size === 0) throw AppError.badRequest("The uploaded file is empty");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw AppError.badRequest("Attachment exceeds the 10 MB limit");
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "attachment";
  const storedName = `${crypto.randomUUID()}-${safeName}`;
  await Bun.write(path.join(UPLOAD_DIR, storedName), file);

  const attachment = await db.attachment.create({
    data: {
      taskId: id,
      uploadedById: user.id,
      filename: file.name || safeName,
      // The storage path stays server-side; clients only ever see the API URL.
      url: storedName,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    },
  });

  return c.json(serializeAttachment(attachment), 201);
});
