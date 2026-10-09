import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";

import { AUTH_COOKIE, toPublicUser, verifyToken } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type { AppEnv } from "@/types";

/**
 * Reject the request unless it carries a valid session cookie for a live user.
 *
 * The token proves identity; the database lookup is what makes a deleted or
 * soft-deleted user's token stop working before it expires.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, AUTH_COOKIE);
  const claims = token ? verifyToken(token) : null;
  if (!claims) throw AppError.unauthorized();

  const user = await prisma().user.findFirst({
    where: { id: claims.sub, deletedAt: null },
  });
  if (!user) throw AppError.unauthorized();

  c.set("user", toPublicUser(user));
  await next();
};
