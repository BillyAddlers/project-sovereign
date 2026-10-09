import { Hono } from "hono";

import {
  clearAuthCookie,
  hashPassword,
  setAuthCookie,
  signToken,
  toPublicUser,
  verifyPassword,
} from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { loginSchema, registerSchema } from "@/lib/schemas";
import { validated } from "@/lib/validate";
import { requireAuth } from "@/middleware/auth";
import type { AppEnv } from "@/types";

export const auth = new Hono<AppEnv>();

/** POST /api/auth/register — create an account and start a session. */
auth.post("/register", validated("json", registerSchema), async (c) => {
  const input = c.req.valid("json");

  const existing = await prisma().user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError(409, "EMAIL_TAKEN", "That email is already registered");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma().user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      department: input.department ?? null,
    },
  });

  setAuthCookie(
    c,
    signToken({
      sub: user.id,
      role: user.role,
      department: user.department ?? undefined,
    }),
  );
  return c.json(toPublicUser(user), 201);
});

/** POST /api/auth/login — exchange credentials for a session cookie. */
auth.post("/login", validated("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const user = await prisma().user.findFirst({ where: { email, deletedAt: null } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  // One generic message for both failure modes — no account enumeration.
  if (!user || !valid) throw AppError.unauthorized("Invalid email or password");

  setAuthCookie(
    c,
    signToken({
      sub: user.id,
      role: user.role,
      department: user.department ?? undefined,
    }),
  );
  return c.json(toPublicUser(user));
});

/** POST /api/auth/logout — clear the cookie. The JWT itself stays valid until expiry. */
auth.post("/logout", (c) => {
  clearAuthCookie(c);
  return c.body(null, 204);
});

/** GET /api/auth/me — the current session's user, for restoring the client. */
auth.get("/me", requireAuth, (c) => c.json(c.get("user")));
