import { z } from "zod";

/**
 * The public API contract.
 *
 * These schemas are the server's source of truth. `apps/frontend/src/lib/schemas.ts`
 * mirrors them for client-side validation — the two must be changed together, or
 * the client will accept payloads the server rejects (or vice versa).
 */

export const taskStatusSchema = z.enum(["todo", "in_progress", "done"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high"]);

export const taskSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(200),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Task = z.infer<typeof taskSchema>;

export const paginatedSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    meta: z.object({
      page: z.int().positive(),
      rows: z.int().positive(),
      total: z.int().nonnegative(),
      pageCount: z.int().nonnegative(),
    }),
  });

export const taskListSchema = paginatedSchema(taskSchema);
export type TaskList = z.infer<typeof taskListSchema>;

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional(),
  priority: taskPrioritySchema.default("medium"),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Query params for `GET /api/tasks` (kept in sync with `paginationSchema`). */
export const taskQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  rows: z.coerce.number().int().positive().max(100).default(20),
  orderKey: z.string().default("createdAt"),
  orderRule: z.enum(["asc", "desc"]).default("desc"),
  status: taskStatusSchema.optional(),
  search: z.string().optional(),
});

export type TaskQuery = z.infer<typeof taskQuerySchema>;
