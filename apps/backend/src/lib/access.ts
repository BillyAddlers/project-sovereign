import { prisma } from "@/lib/prisma";
import type { ProjectAccess } from "@/lib/permissions";

/**
 * Load the facts a permission decision needs for one project.
 *
 * Returns null when the project is missing or soft-deleted; callers map that
 * to 404 (never to a leaky "exists but forbidden").
 */
export async function projectAccessFor(
  userId: string,
  projectId: string,
): Promise<ProjectAccess | null> {
  const project = await prisma().project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      clientId: true,
      members: { where: { userId }, select: { userId: true } },
      // Engineers must see projects where they hold an assigned task, even if
      // they were never added as a member.
      tasks: {
        where: { assigneeId: userId, deletedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!project) return null;

  return {
    isMember: project.members.length > 0,
    isClient: project.clientId === userId,
    hasAssignedTask: project.tasks.length > 0,
  };
}
