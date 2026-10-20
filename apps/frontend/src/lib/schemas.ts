import { z } from "zod";

export const taskStatusSchema = z.enum(["todo", "in_progress", "done"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high"]);
export const userRoleSchema = z.enum(["pm", "engineer", "client"]);
export const departmentSchema = z.enum(["uiux", "frontend", "backend", "qa"]);

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

/** A task as returned by the backend. Client responses omit internal fields. */
export const taskSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(200),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  projectId: z.uuid(),
  clientVisible: z.boolean(),
  version: z.int().positive(),
  blocked: z.boolean(),
  dependencies: z.array(taskDependencyRefSchema),
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
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type DependencyRef = z.infer<typeof taskDependencyRefSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;

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
  status: taskStatusSchema.optional(),
  search: z.string().optional(),
  projectId: z.uuid().optional(),
});

export type TaskQuery = z.infer<typeof taskQuerySchema>;

/** Payload for `POST /api/tasks` — PM only. */
export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional(),
  priority: taskPrioritySchema.default("medium"),
  projectId: z.uuid("Choose a project for this task"),
  assigneeId: z.uuid().optional(),
  clientVisible: z.boolean().default(false),
  dependencyIds: z.array(z.uuid()).max(20).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * Payload for `PATCH /api/tasks/:id` — explicit and default-free.
 *
 * `createTaskSchema.partial()` would keep the create defaults, so a status-only
 * PATCH would silently reset priority/clientVisible. Mirrors the server schema.
 */
export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  priority: taskPrioritySchema.optional(),
  projectId: z.uuid().optional(),
  assigneeId: z.uuid().nullable().optional(),
  clientVisible: z.boolean().optional(),
  status: taskStatusSchema.optional(),
  /** The `version` last read; a stale value is rejected by the server with 409. */
  expectedVersion: z.int().positive(),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** One immutable audit entry, as returned by `GET /api/tasks/:id/audit`. */
export const auditLogSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  userId: z.uuid(),
  action: z.enum(["create", "update", "delete"]),
  changedColumn: z.string(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  timestamp: z.iso.datetime(),
});

export type AuditLog = z.infer<typeof auditLogSchema>;

export const dependencyInputSchema = z.object({ dependsOnId: z.uuid() });
export type DependencyInput = z.infer<typeof dependencyInputSchema>;

/** A project member, embedded in non-client project responses. */
export const projectMemberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: userRoleSchema,
  department: departmentSchema.nullable(),
});

/** A project as returned by `GET /api/projects`. Client responses omit `clientId`/`members`. */
export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  status: z.enum(["active", "archived"]),
  clientId: z.uuid().nullable().optional(),
  members: z.array(projectMemberSchema).optional(),
});

export type Project = z.infer<typeof projectSchema>;
export type ProjectMember = z.infer<typeof projectMemberSchema>;

export const projectListSchema = paginatedSchema(projectSchema);
export type ProjectList = z.infer<typeof projectListSchema>;

/** Payload for `POST /api/projects` — PM only. Mirrors the server schema. */
export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(["active", "archived"]).default("active"),
  clientId: z.uuid().nullable().optional(),
  memberIds: z.array(z.uuid()).max(50).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/** Payload for `PATCH /api/projects/:id` — explicit and default-free. */
export const updateProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(["active", "archived"]).optional(),
  clientId: z.uuid().nullable().optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** Aggregate metrics chosen by the backend, scoped to the viewer's role. */
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

/**
 * Auth contract — mirrors `apps/backend/src/lib/schemas.ts`. Keep the two in
 * sync or the client will accept payloads the server rejects (or vice versa).
 */
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

export const userListSchema = paginatedSchema(publicUserSchema);
export type UserList = z.infer<typeof userListSchema>;
