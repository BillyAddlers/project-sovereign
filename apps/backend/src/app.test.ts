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

  it("rejects a non-numeric page before touching the database", async () => {
    const res = await app.request("/api/tasks?page=abc");
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an empty title on create", async () => {
    const res = await app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a rows value above the maximum page size", async () => {
    const res = await app.request("/api/tasks?rows=5000");
    expect(res.status).toBe(400);
  });
});
