import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/lib/permissions";

/**
 * Relations every task response needs: the assignee (for PM/engineer), the
 * prerequisites (to derive `blocked`), and attachment metadata.
 */
export const taskInclude = {
  assignee: {
    select: { id: true, name: true, department: true, avatarUrl: true },
  },
  dependencies: {
    select: {
      dependsOn: {
        select: { id: true, title: true, status: true, clientVisible: true },
      },
    },
  },
  attachments: {
    select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
  },
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

type AttachmentRow = TaskWithRelations["attachments"][number];

/** Attachments are addressed through the API, never by their storage path. */
export function serializeAttachment(attachment: AttachmentRow) {
  return {
    id: attachment.id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    createdAt: attachment.createdAt,
    downloadUrl: `/api/attachments/${attachment.id}/download`,
  };
}

/**
 * Shape a task for the actor who asked for it.
 *
 * `blocked` is derived, never stored: a task with at least one unfinished
 * prerequisite cannot be started. Clients get a deliberately thinner shape —
 * no assignee identity, no internal attachments, and no hidden prerequisite
 * titles (a client-visible task may depend on internal-only work).
 */
export function serializeTask(task: TaskWithRelations, actor: Actor) {
  const dependencies = task.dependencies.map((link) => link.dependsOn);
  const blocked = dependencies.some((dependency) => dependency.status !== "done");

  const base = {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    projectId: task.projectId,
    clientVisible: task.clientVisible,
    version: task.version,
    blocked,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };

  if (actor.role === "client") {
    return {
      ...base,
      dependencies: dependencies
        .filter((dependency) => dependency.clientVisible)
        .map(({ id, title, status }) => ({ id, title, status })),
    };
  }

  return {
    ...base,
    dependencies: dependencies.map(({ id, title, status }) => ({ id, title, status })),
    assigneeId: task.assigneeId,
    assignee: task.assignee,
    attachments: task.attachments.map(serializeAttachment),
  };
}

/** Member identities every non-client project response needs. */
export const projectInclude = {
  members: {
    select: {
      user: { select: { id: true, name: true, role: true, department: true } },
    },
  },
} satisfies Prisma.ProjectInclude;

export type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

/**
 * Shape a project for the actor who asked for it.
 *
 * Clients are isolated to their own project and receive only the metadata the
 * brief allows — no client identity and no member names/departments, masked at
 * the API rather than hidden in the UI.
 */
export function serializeProject(project: ProjectWithRelations, actor: Actor) {
  const base = {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
  };

  if (actor.role === "client") return base;

  return {
    ...base,
    clientId: project.clientId,
    members: project.members.map((member) => ({
      id: member.user.id,
      name: member.user.name,
      role: member.user.role,
      department: member.user.department,
    })),
  };
}
