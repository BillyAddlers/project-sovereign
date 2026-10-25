import type { TaskStatus } from "@/generated/prisma/client";
import type { PublicUser } from "@/lib/schemas";

/**
 * Authorization is a decision, not an if-chain scattered across routes.
 *
 * Every rule the assessment brief specifies lives here as a pure function of
 * (actor, resource, context). Routes load the context from the database and
 * ask these functions; tests exercise the matrix without a database.
 */

export type Actor = Pick<PublicUser, "id" | "role">;

/** What a task needs to expose for permission decisions. */
export interface TaskLike {
  id: string;
  projectId: string;
  assigneeId: string | null;
  status: TaskStatus;
  clientVisible: boolean;
}

/** Project facts a decision needs, loaded once per request. */
export interface ProjectAccess {
  isMember: boolean;
  isClient: boolean;
}

export type Decision = { allowed: true } | { allowed: false; reason: string };

const allow = (): Decision => ({ allowed: true });
const deny = (reason: string): Decision => ({ allowed: false, reason });

// ── Reading ─────────────────────────────────────────────────────────────────

export function canViewProject(actor: Actor, access: ProjectAccess): boolean {
  switch (actor.role) {
    case "pm":
      return true;
    case "engineer":
      return access.isMember;
    case "client":
      return access.isClient;
  }
}

export function canViewTask(actor: Actor, task: TaskLike, access: ProjectAccess): boolean {
  switch (actor.role) {
    case "pm":
      return true;
    case "engineer":
      // Per-user isolation: an engineer only sees tasks assigned to them.
      return task.assigneeId === actor.id;
    case "client":
      // Multi-tenant isolation + the Client-Visible flag, enforced server-side.
      return access.isClient && task.clientVisible;
  }
}

export function canViewStats(actor: Actor, access: ProjectAccess): boolean {
  return canViewProject(actor, access);
}

export function canViewAttachment(actor: Actor, access: ProjectAccess): boolean {
  // Attachments are internal work products; clients never receive them.
  if (actor.role === "client") return false;
  return canViewProject(actor, access);
}

// ── Writing ─────────────────────────────────────────────────────────────────

export function canCreateTask(actor: Actor): boolean {
  return actor.role === "pm";
}

export function canEditTaskFields(actor: Actor): boolean {
  return actor.role === "pm";
}

export function canDeleteTask(actor: Actor): boolean {
  return actor.role === "pm";
}

export function canDefineDependency(actor: Actor): boolean {
  return actor.role === "pm";
}

export function canUploadAttachment(actor: Actor, task: TaskLike): boolean {
  if (actor.role === "pm") return true;
  // Engineers act only on the task they are assigned to.
  return actor.role === "engineer" && task.assigneeId === actor.id;
}

// ── Project writes ──────────────────────────────────────────────────────────

// Only a PM plans work, so only a PM creates, edits, deletes, or staffs a
// project. Reads are governed by `canViewProject` / `projectScope`.

export function canCreateProject(actor: Actor): boolean {
  return actor.role === "pm";
}

export function canEditProject(actor: Actor): boolean {
  return actor.role === "pm";
}

export function canDeleteProject(actor: Actor): boolean {
  return actor.role === "pm";
}

export function canManageProjectMembers(actor: Actor): boolean {
  return actor.role === "pm";
}

// ── State-based transitions ─────────────────────────────────────────────────

/**
 * Who may move a task to `next`.
 *
 * PM            — anything except entering `done`; the executor completes work.
 * Engineer      — only the assignee, only forward `todo -> in_progress -> done`.
 * Client        — never.
 *
 * Starting a task (`-> in_progress`) is blocked for everyone until every
 * prerequisite task is done. That is the dependency rule from the brief.
 */
export function canTransitionStatus(
  actor: Actor,
  task: TaskLike,
  next: TaskStatus,
  dependenciesDone: boolean,
): Decision {
  if (actor.role === "client") return deny("Clients cannot change task status");
  if (task.status === next) return allow();

  if (next === "in_progress" && !dependenciesDone) {
    return deny("This task is blocked by unfinished dependencies");
  }

  if (actor.role === "pm") {
    if (next === "done") return deny("Only the assignee can complete a task");
    return allow();
  }

  if (task.assigneeId !== actor.id) {
    return deny("Only the assignee can change this task's status");
  }

  const forward =
    (task.status === "todo" && next === "in_progress") ||
    (task.status === "in_progress" && next === "done");
  if (!forward) {
    return deny(`Engineers may only move a task forward (current: ${task.status})`);
  }

  return allow();
}
