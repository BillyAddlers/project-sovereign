import { z } from "zod";

/** A task as returned by the backend. */
export const taskSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(200),
  description: z.string().nullable(),
  status: z.enum(["todo", "in_progress", "done"]),
  priority: z.enum(["low", "medium", "high"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Task = z.infer<typeof taskSchema>;

/** Envelope produced by the paginated list endpoints. */
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

/** Query parameters accepted by `GET /api/tasks`. */
export const taskQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  rows: z.coerce.number().int().positive().max(100).default(20),
  orderKey: z.string().default("createdAt"),
  orderRule: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  search: z.string().optional(),
});

export type TaskQuery = z.infer<typeof taskQuerySchema>;

/** Payload for `POST /api/tasks`. */
export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
