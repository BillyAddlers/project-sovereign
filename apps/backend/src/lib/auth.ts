import jwt from "jsonwebtoken";
import { env } from "@/lib/env";

/**
 * Cookie the JWT travels in.
 *
 * httpOnly: client JavaScript cannot read it, which is the whole point —
 * an XSS bug can ride along on authenticated requests but cannot exfiltrate
 * the token itself.
 */

export const AUTH_COOKIE = "ps_token";

/** Claims embedded in every token. Kept minimal on purpose. */
export interface AuthClaims {
  sub: string; // user id
  role: "pm" | "engineer" | "client";
  deparment?: "uiux" | "frontend" | "backend";
}

export async function hashPassword(plain: string): Promise<string> {
  // argon2id via Bun's native implementation — no extra dependency.
  return Bun.password.hash(plain, "argon2id");
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return Bun.password.verify(plain, hash);
}

export function signToken(claims: AuthClaims): string {
  return jwt.sign(claims, env().JWT_SECRET, { expiresIn: "7d" });
}

/** Returns null instead of throwing — callers decide what a bad token means. */
export function verifyToken(token: string): AuthClaims | null {
  try {
    return jwt.verify(token, env().JWT_SECRET) as AuthClaims;
  } catch {
    return null;
  }
}
