import { Hono } from "hono";

import { paginate, paginationSchema } from "@/lib/paginate";
import { prisma } from "@/lib/prisma";
import { validated } from "@/lib/validate";

export const projects = new Hono();

/** GET /api/projects — paginated list. Role-scoped filtering arrives in Fase 2;
 *  the deletedAt filter arrives with soft delete in Fase 3. */
projects.get("/", validated("query", paginationSchema), async (c) => {
  const input = c.req.valid("query");
  const db = prisma();

  const [rows, total] = await Promise.all([
    db.project.findMany({
      skip: (input.page - 1) * input.rows,
      take: input.rows,
      orderBy: { createdAt: input.orderRule },
    }),
    db.project.count(),
  ]);

  return c.json(paginate(rows, total, input));
});
