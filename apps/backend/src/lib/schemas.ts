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
export const userRoleSchema = z.enum(["pm", "engineer", "client"]);
export const departmentSchema = z.enum(["uiux", "frontend", "backend", "qa"]);

/** A prerequisite, as embedded in every task response. */
export const taskDependencyRefSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: taskStatusSchema,
});

export const attachmentSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
  downloadUrl: z.string(),
});

export const taskSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(200),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  projectId: z.uuid(),
  clientVisible: z.boolean(),
  version: z.int().positive(),
  /** Derived, never stored: at least one prerequisite is unfinished. */
  blocked: z.boolean(),
  dependencies: z.array(taskDependencyRefSchema),
  // Present for PM/engineer; deliberately absent from the Client shape.
  assigneeId: z.uuid().nullable().optional(),
  assignee: z
    .object({
      id: z.uuid(),
      name: z.string(),
      department: departmentSchema.nullable(),
      avatarUrl: z.string().nullable(),
    })
    .nullable()
    .optional(),
  attachments: z.array(attachmentSchema).optional(),
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
  projectId: z.uuid(),
  assigneeId: z.uuid().optional(),
  clientVisible: z.boolean().default(false),
  /** Prerequisites chosen at creation time; the task starts blocked until done. */
  dependencyIds: z.array(z.uuid()).max(20).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * PATCH body — every field explicit and optional, with NO defaults.
 *
 * `.partial()` on `createTaskSchema` would keep its `.default()` values, so a
 * PATCH that only sends `status` would silently reset `priority` and
 * `clientVisible`. Status lives only here: a new task starts as `todo`.
 */
export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  priority: taskPrioritySchema.optional(),
  projectId: z.uuid().optional(),
  assigneeId: z.uuid().nullable().optional(),
  clientVisible: z.boolean().optional(),
  status: taskStatusSchema.optional(),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** Body for `POST /api/tasks/:id/dependencies`. */
export const dependencyInputSchema = z.object({
  dependsOnId: z.uuid(),
});

export type DependencyInput = z.infer<typeof dependencyInputSchema>;

/** A project member, as embedded in non-client project responses. */
export const projectMemberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: userRoleSchema,
  department: departmentSchema.nullable(),
});

export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  status: z.enum(["active", "archived"]),
  // Present for PM/engineer; deliberately absent from the Client shape.
  clientId: z.uuid().nullable().optional(),
  members: z.array(projectMemberSchema).optional(),
});

export type Project = z.infer<typeof projectSchema>;

export const projectListSchema = paginatedSchema(projectSchema);
export type ProjectList = z.infer<typeof projectListSchema>;

/** Body for `POST /api/projects` — PM only. */
export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(["active", "archived"]).default("active"),
  clientId: z.uuid().nullable().optional(),
  /** Team members; clients are never members and are rejected explicitly. */
  memberIds: z.array(z.uuid()).max(50).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * PATCH body — every field explicit and optional, with NO defaults.
 *
 * Same reason as `updateTaskSchema`: a `.partial()` would keep the create
 * defaults, so renaming a project would silently reset its status.
 */
export const updateProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(["active", "archived"]).optional(),
  clientId: z.uuid().nullable().optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** Body for `POST /api/projects/:id/members`. */
export const projectMemberInputSchema = z.object({
  userId: z.uuid(),
});

export type ProjectMemberInput = z.infer<typeof projectMemberInputSchema>;

/** Aggregate metrics for a project — the Client Guest's only read surface. */
export const projectStatsSchema = z.object({
  total: z.int().nonnegative(),
  byStatus: z.object({
    todo: z.int().nonnegative(),
    in_progress: z.int().nonnegative(),
    done: z.int().nonnegative(),
  }),
  percentComplete: z.int().min(0).max(100),
  blockedCount: z.int().nonnegative(),
});

export type ProjectStats = z.infer<typeof projectStatsSchema>;

/** Query params for `GET /api/tasks` (kept in sync with `paginationSchema`). */
export const taskQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  rows: z.coerce.number().int().positive().max(100).default(20),
  orderKey: z.string().default("createdAt"),
  orderRule: z.enum(["asc", "desc"]).default("desc"),
  status: taskStatusSchema.optional(),
  search: z.string().optional(),
  projectId: z.uuid().optional(),
});

export type TaskQuery = z.infer<typeof taskQuerySchema>;

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
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** The user shape safe to return to the client — never includes `passwordHash`. */
export const publicUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: userRoleSchema,
  department: departmentSchema.nullable(),
  avatarUrl: z.string().nullable(),
});

export type PublicUser = z.infer<typeof publicUserSchema>;
