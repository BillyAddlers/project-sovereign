import { Hono } from "hono";

import type { Prisma } from "@/generated/prisma/client";
import { toPublicUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { paginate, paginationSchema } from "@/lib/paginate";
import { prisma } from "@/lib/prisma";
import { validated } from "@/lib/validate";
import { requireAuth } from "@/middleware/auth";
import type { AppEnv } from "@/types";

export const users = new Hono<AppEnv>();

users.use("*", requireAuth);

/**
 * GET /api/users — engineer directory used by the PM's assignee picker.
 * Only a PM plans work, so only a PM may list the people work can be given to.
 */
users.get("/", validated("query", paginationSchema), async (c) => {
  const user = c.get("user");
  if (user.role !== "pm") {
    throw AppError.forbidden("Only a project manager can list users");
  }

  const input = c.req.valid("query");
  const where: Prisma.UserWhereInput = { deletedAt: null, role: "engineer" };
  const db = prisma();

  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      skip: (input.page - 1) * input.rows,
      take: input.rows,
      orderBy: { name: "asc" },
    }),
    db.user.count({ where }),
  ]);

  return c.json(paginate(rows.map(toPublicUser), total, input));
});
