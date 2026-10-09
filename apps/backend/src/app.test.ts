import { describe, expect, it } from "bun:test";

import { createApp } from "@/app";

const app = createApp();

describe("health", () => {
  it("reports ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("project-sovereign-backend");
  });
});

describe("error envelope", () => {
  it("returns a structured 404 for unknown routes", async () => {
    const res = await app.request("/api/does-not-exist");
    expect(res.status).toBe(404);

    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("rejects unauthenticated task access before validation", async () => {
    const res = await app.request("/api/tasks?page=abc");
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects an unauthenticated create before parsing the body", async () => {
    const res = await app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects unauthenticated project access", async () => {
    const res = await app.request("/api/projects");
    expect(res.status).toBe(401);
  });
});
