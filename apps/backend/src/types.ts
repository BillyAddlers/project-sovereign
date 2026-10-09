import type { PublicUser } from "@/lib/schemas";

/**
 * Hono environment shared by routers that need the authenticated user.
 *
 * `requireAuth` populates `c.get("user")`; downstream handlers can rely on it
 * being present.
 */
export type AppEnv = {
  Variables: {
    user: PublicUser;
  };
};
