import { Hono } from "hono";

import type { Prisma } from "@/generated/prisma/client";
import { projectAccessFor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { paginate, paginationSchema } from "@/lib/paginate";
import { canViewStats } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { projectScope } from "@/lib/scope";
import { validated } from "@/lib/validate";
import { requireAuth } from "@/middleware/auth";
import type { AppEnv } from "@/types";

export const projects = new Hono<AppEnv>();

// Session required for every project route; rows are scoped by role below.
projects.use("*", requireAuth);

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
    }),
    db.project.count({ where }),
  ]);

  return c.json(paginate(rows, total, input));
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
