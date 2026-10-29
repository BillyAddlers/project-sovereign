import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/lib/permissions";

/**
 * Row-level visibility per role.
 *
 * These `where` fragments are the only way routes decide which rows a user may
 * read. Keeping them here means list, detail, and count queries can never drift
 * apart — and a missing scope is a compile-time omission, not a silent leak.
 */
export function taskScope(actor: Actor): Prisma.TaskWhereInput {
  switch (actor.role) {
    case "pm":
      return { deletedAt: null };
    case "engineer":
      // Per-user isolation: an engineer's tenant is their assigned tasks.
      return { deletedAt: null, assigneeId: actor.id };
    case "client":
      // "Only tasks explicitly flagged as Client-Visible" + own project only.
      return {
        deletedAt: null,
        clientVisible: true,
        project: { clientId: actor.id },
      };
  }
}

export function projectScope(actor: Actor): Prisma.ProjectWhereInput {
  switch (actor.role) {
    case "pm":
      return { deletedAt: null };
    case "engineer":
      return {
        deletedAt: null,
        // Visible if the engineer is a member OR holds an assigned task here:
        // they can't be expected to join every project they contribute to.
        OR: [
          { members: { some: { userId: actor.id } } },
          { tasks: { some: { assigneeId: actor.id, deletedAt: null } } },
        ],
      };
    case "client":
      return { deletedAt: null, clientId: actor.id };
  }
}
