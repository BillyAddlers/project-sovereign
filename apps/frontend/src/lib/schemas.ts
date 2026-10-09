import { z } from "zod";

/** A task as returned by the backend. */
export const taskSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(200),
  description: z.string().nullable(),
  status: z.enum(["todo", "in_progress", "done"]),
  priority: z.enum(["low", "medium", "high"]),
  projectId: z.uuid(),
  assigneeId: z.uuid().nullable(),
  clientVisible: z.boolean(),
  version: z.int().positive(),
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
  projectId: z.uuid("Choose a project for this task"),
  assigneeId: z.uuid().optional(),
  clientVisible: z.boolean().default(false),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Payload for `PATCH /api/tasks/:id` — mirrors the backend update schema. */
export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(["todo", "in_progress", "done"]).optional(),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** A project as returned by `GET /api/projects`. */
export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  status: z.enum(["active", "archived"]),
});

export type Project = z.infer<typeof projectSchema>;

export const projectListSchema = paginatedSchema(projectSchema);
export type ProjectList = z.infer<typeof projectListSchema>;

/**
 * Auth contract — mirrors `apps/backend/src/lib/schemas.ts`. Keep the two in
 * sync or the client will accept payloads the server rejects (or vice versa).
 */
export const userRoleSchema = z.enum(["pm", "engineer", "client"]);
export const departmentSchema = z.enum(["uiux", "frontend", "backend"]);

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    email: z.email().toLowerCase(),
    password: z.string().min(8, "Password must be at least 8 characters").max(200),
    role: userRoleSchema.default("engineer"),
    department: departmentSchema.optional(),
  })
  .refine((value) => value.role !== "engineer" || value.department, {
    message: "Department is required for engineers",
    path: ["department"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** The user shape the backend returns — never includes `passwordHash`. */
export const publicUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: userRoleSchema,
  department: departmentSchema.nullable(),
  avatarUrl: z.string().nullable(),
});

export type PublicUser = z.infer<typeof publicUserSchema>;
