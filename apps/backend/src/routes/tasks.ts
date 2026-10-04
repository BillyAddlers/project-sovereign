import { Hono } from "hono";

import { AppError } from "@/lib/errors";
import { buildTaskQuery, paginate, paginationSchema } from "@/lib/paginate";
import { prisma } from "@/lib/prisma";
import { createTaskSchema, updateTaskSchema } from "@/lib/schemas";
import { validated } from "@/lib/validate";
import { buildTaskWhere } from "@/lib/validators";

export const tasks = new Hono();

/** GET /api/tasks — paginated, filterable list powered by prisma-ezfilter. */
tasks.get("/", validated("query", paginationSchema), async (c) => {
  const input = c.req.valid("query");
  const plan = buildTaskQuery(input);

  if (!plan.validation.isValid) {
    throw new AppError(422, "INVALID_FILTER", "The filter could not be applied", {
      errors: plan.validation.errors,
      warnings: plan.validation.warnings,
    });
  }

  // ezfilter builds the predicate; buildTaskWhere validates and types it, and
  // the SAME object is reused for the COUNT so meta.total matches the page.
  const where = buildTaskWhere(plan);
  const db = prisma();

  const [rows, total] = await Promise.all([
    db.task.findMany({ where, ...plan.query }),
    db.task.count({ where }),
  ]);

  return c.json(paginate(rows, total, input));
});

/** GET /api/tasks/:id */
tasks.get("/:id", async (c) => {
  const id = c.req.param("id");
  const task = await prisma().task.findUnique({ where: { id } });
  if (!task) throw AppError.notFound(`Task ${id} was not found`);
  return c.json(task);
});

/** POST /api/tasks — the same Zod schema the frontend form uses. */
tasks.post("/", validated("json", createTaskSchema), async (c) => {
  const data = c.req.valid("json");
  const task = await prisma().task.create({ data });
  return c.json(task, 201);
});

/** PATCH /api/tasks/:id — the only way a task's status changes. */
tasks.patch("/:id", validated("json", updateTaskSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");

  const existing = await prisma().task.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound(`Task ${id} was not found`);

  return c.json(await prisma().task.update({ where: { id }, data }));
});

/** DELETE /api/tasks/:id */
tasks.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await prisma().task.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound(`Task ${id} was not found`);

  await prisma().task.delete({ where: { id } });
  return c.body(null, 204);
});
