import { del, get, patch, post, upload } from "@/lib/api";
import {
  type Attachment,
  attachmentSchema,
  type CreateProjectInput,
  type CreateTaskInput,
  type DependencyRef,
  type Project,
  type ProjectList,
  type ProjectStats,
  projectListSchema,
  projectSchema,
  projectStatsSchema,
  type Task,
  type TaskList,
  type TaskQuery,
  taskDependencyRefSchema,
  taskListSchema,
  taskSchema,
  type UpdateTaskInput,
  type UserList,
  userListSchema,
} from "@/lib/schemas";

/** Every response is parsed at the boundary, so a contract drift fails loudly. */

export async function fetchTasks(query: TaskQuery): Promise<TaskList> {
  return taskListSchema.parse(await get<TaskList>("/tasks", { ...query }));
}

export async function fetchTask(id: string): Promise<Task> {
  return taskSchema.parse(await get<Task>(`/tasks/${id}`));
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  return taskSchema.parse(await post<Task, CreateTaskInput>("/tasks", input));
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  return taskSchema.parse(await patch<Task, UpdateTaskInput>(`/tasks/${id}`, input));
}

export async function deleteTask(id: string): Promise<void> {
  await del(`/tasks/${id}`);
}

export async function fetchProjects(): Promise<ProjectList> {
  return projectListSchema.parse(await get<ProjectList>("/projects", { page: 1, rows: 100 }));
}

export async function fetchProjectStats(projectId: string): Promise<ProjectStats> {
  return projectStatsSchema.parse(await get<ProjectStats>(`/projects/${projectId}/stats`));
}

/** PM-only project creation. */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  return projectSchema.parse(await post<Project, CreateProjectInput>("/projects", input));
}

/** PM-only directory used by the assignee picker. */
export async function fetchEngineers(): Promise<UserList> {
  return userListSchema.parse(await get<UserList>("/users", { page: 1, rows: 100 }));
}

export async function addDependency(taskId: string, dependsOnId: string): Promise<DependencyRef> {
  return taskDependencyRefSchema.parse(
    await post<DependencyRef, { dependsOnId: string }>(`/tasks/${taskId}/dependencies`, {
      dependsOnId,
    }),
  );
}

export async function removeDependency(taskId: string, dependsOnId: string): Promise<void> {
  await del(`/tasks/${taskId}/dependencies/${dependsOnId}`);
}

export async function uploadAttachment(taskId: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file);
  return attachmentSchema.parse(await upload<Attachment>(`/tasks/${taskId}/attachments`, form));
}
