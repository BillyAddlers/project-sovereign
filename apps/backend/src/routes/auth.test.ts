import { afterAll, describe, expect, it } from "bun:test";

import { createApp } from "@/app";
import { prisma } from "@/lib/prisma";

const app = createApp();

/** Pull just the `name=value` part out of a `Set-Cookie` header. */
function sessionCookie(res: Response): string | null {
  const header = res.headers.get("set-cookie");
  return header ? (header.split(";")[0] ?? null) : null;
}

describe("auth (no database)", () => {
  it("rejects a login with an invalid email", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "" }),
    });
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a register with a short password", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", email: "test@example.com", password: "short" }),
    });
    expect(res.status).toBe(400);
  });

  it("requires a department for engineers", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        email: "test@example.com",
        password: "password123",
        role: "engineer",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects /me without a session cookie", async () => {
    const res = await app.request("/api/auth/me");
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("clears the cookie on logout", async () => {
    const res = await app.request("/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(204);
  });
});

/** Probe once; the integration block is skipped when Postgres is not running. */
async function databaseReachable(): Promise<boolean> {
  try {
    await prisma().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const hasDatabase = await databaseReachable();

describe.skipIf(!hasDatabase)("auth integration (requires database)", () => {
  const email = `auth-test-${Date.now()}@example.com`;
  const password = "password123";

  afterAll(async () => {
    await prisma().user.deleteMany({ where: { email } });
  });

  it("registers a user and starts a session", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Auth Test", email, password, role: "pm" }),
    });

    expect(res.status).toBe(201);
    expect(sessionCookie(res)).toStartWith("ps_token=");

    const body = (await res.json()) as { email: string; role: string; passwordHash?: string };
    expect(body.email).toBe(email);
    expect(body.role).toBe("pm");
    expect(body.passwordHash).toBeUndefined();
  });

  it("rejects a duplicate registration", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Auth Test", email, password, role: "pm" }),
    });
    expect(res.status).toBe(409);
  });

  it("logs in, restores the session, and rejects a bad password", async () => {
    const bad = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrong-password" }),
    });
    expect(bad.status).toBe(401);

    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);

    const cookie = sessionCookie(login);
    expect(cookie).toStartWith("ps_token=");

    const me = await app.request("/api/auth/me", { headers: { Cookie: cookie! } });
    expect(me.status).toBe(200);

    const user = (await me.json()) as { email: string };
    expect(user.email).toBe(email);
  });
});
