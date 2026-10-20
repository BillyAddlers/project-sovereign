/**
 * Audit-trail construction, kept pure so the "what changed?" decision is
 * unit-testable without a database.
 *
 * The API is append-only: these helpers build the rows, and no route ever
 * updates or deletes an `AuditLog`. That is what makes the trail immutable —
 * together with soft delete, which guarantees the row a log entry points at
 * still exists when the log is read back.
 */

/** Task columns whose changes are recorded. Order is the audit-row order. */
export const TRACKED_TASK_FIELDS = [
  "title",
  "description",
  "priority",
  "assigneeId",
  "clientVisible",
  "projectId",
  "status",
] as const;

export type TaskField = (typeof TRACKED_TASK_FIELDS)[number];

/** The slice of a task the diff needs — satisfied by a Prisma `Task` row. */
export interface TaskSnapshot {
  title: string;
  description: string | null;
  priority: string;
  assigneeId: string | null;
  clientVisible: boolean;
  projectId: string;
  status: string;
}

export interface AuditEntry {
  changedColumn: string;
  oldValue: string | null;
  newValue: string | null;
}

/**
 * Values are stored as text. `null` means "unset", which is deliberately
 * distinct from the string `"null"`; booleans become `"true"`/`"false"` and
 * enums keep their wire value.
 */
export function auditValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Diff a patch against the row it targets. Only fields actually present in
 * `patch` are considered, and only genuine differences produce an entry — a
 * PATCH that re-sends an unchanged value logs nothing.
 */
export function updateEntries(before: TaskSnapshot, patch: Record<string, unknown>): AuditEntry[] {
  const entries: AuditEntry[] = [];
  for (const field of TRACKED_TASK_FIELDS) {
    if (!(field in patch)) continue;
    const next = patch[field];
    if (next === undefined) continue;
    const previous = before[field];
    if (previous === next) continue;
    entries.push({
      changedColumn: field,
      oldValue: auditValue(previous),
      newValue: auditValue(next),
    });
  }
  return entries;
}

/** Every value a create actually persisted, from nothing (`oldValue: null`). */
export function createEntries(values: Record<string, unknown>): AuditEntry[] {
  return TRACKED_TASK_FIELDS.filter((field) => values[field] !== undefined).map((field) => ({
    changedColumn: field,
    oldValue: null,
    newValue: auditValue(values[field]),
  }));
}

/** Soft delete is a single recorded transition, not a field diff. */
export function deleteEntry(at: Date): AuditEntry {
  return { changedColumn: "deletedAt", oldValue: null, newValue: at.toISOString() };
}
