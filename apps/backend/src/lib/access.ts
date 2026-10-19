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
    },
  });

  if (!project) return null;

  return {
    isMember: project.members.length > 0,
    isClient: project.clientId === userId,
  };
}
