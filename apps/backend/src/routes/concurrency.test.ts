import { afterAll, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createApp } from "@/app";
import type { Project, Task, User } from "@/generated/prisma/client";
import { signToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const app = createApp();

/** Sign a session cookie directly — these tests exercise concurrency, not login. */
function cookieFor(user: User): string {
  const token = signToken({
    sub: user.id,
    role: user.role,
    department: user.department ?? undefined,
  });
  return `ps_token=${token}`;
}

function headersFor(user: User): Record<string, string> {
  return { Cookie: cookieFor(user), "Content-Type": "application/json" };
}

async function patch(user: User, id: string, body: Record<string, unknown>): Promise<Response> {
  return app.request(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: headersFor(user),
    body: JSON.stringify(body),
  });
}

interface Fixtures {
  stamp: string;
  pm: User;
  engineer: User;
  client: User;
  project: Project;
}

async function createFixtures(): Promise<Fixtures> {
  const db = prisma();
  const stamp = crypto.randomUUID();

  // A failed earlier run must not poison the next one: purge leftovers under
  // @test.local in FK order (audit rows before the tasks/users they point at).
  const staleUsers = await db.user.findMany({
    where: { email: { endsWith: "@test.local" } },
    select: { id: true },
  });
  const staleUserIds = staleUsers.map((user) => user.id);
  if (staleUserIds.length > 0) {
    const staleProjects = await db.project.findMany({
      where: {
        OR: [
          { clientId: { in: staleUserIds } },
          { members: { some: { userId: { in: staleUserIds } } } },
        ],
      },
      select: { id: true },
    });
    const staleProjectIds = staleProjects.map((project) => project.id);
    await db.attachment.deleteMany({ where: { task: { projectId: { in: staleProjectIds } } } });
    await db.taskDependency.deleteMany({
      where: { task: { projectId: { in: staleProjectIds } } },
    });
    await db.auditLog.deleteMany({ where: { task: { projectId: { in: staleProjectIds } } } });
    await db.task.deleteMany({ where: { projectId: { in: staleProjectIds } } });
    await db.projectMember.deleteMany({
      where: { OR: [{ userId: { in: staleUserIds } }, { projectId: { in: staleProjectIds } }] },
    });
    await db.project.deleteMany({ where: { id: { in: staleProjectIds } } });
    await db.user.deleteMany({ where: { id: { in: staleUserIds } } });
  }

  const mkUser = (role: "pm" | "engineer" | "client", department?: "frontend", label = role) =>
    db.user.create({
      data: {
        email: `conc-${label}-${stamp}@test.local`,
        passwordHash: "x",
        name: `${label} ${stamp}`,
        role,
        department: department ?? null,
      },
    });

  const pm = await mkUser("pm");
  const engineer = await mkUser("engineer", "frontend");
  const client = await mkUser("client");

  const project = await db.project.create({
    data: {
      name: `Concurrency ${stamp}`,
      clientId: client.id,
      members: { create: [{ userId: pm.id }, { userId: engineer.id }] },
    },
  });

  return { stamp, pm, engineer, client, project };
}

async function databaseReachable(): Promise<boolean> {
  try {
    await prisma().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const hasDatabase = await databaseReachable();
const fixtures = hasDatabase ? await createFixtures() : null;

describe.skipIf(!hasDatabase)("concurrency and audit trail", () => {
  if (!fixtures) return;
  const f = fixtures;

  const mkTask = (
    label: string,
    data: Partial<Pick<Task, "assigneeId" | "clientVisible" | "status">> = {},
  ): Promise<Task> =>
    prisma().task.create({
      data: {
        title: `${label} ${f.stamp}`,
        projectId: f.project.id,
        assigneeId: f.engineer.id,
        clientVisible: true,
        ...data,
      },
    });

  afterAll(async () => {
    const db = prisma();
    const userIds = [f.pm.id, f.engineer.id, f.client.id];
    const ownedProjects = await db.project.findMany({
      where: {
        OR: [{ clientId: { in: userIds } }, { members: { some: { userId: { in: userIds } } } }],
      },
      select: { id: true },
    });
    const projectIds = [...new Set([f.project.id, ...ownedProjects.map((project) => project.id)])];

    const attachments = await db.attachment.findMany({
      where: { task: { projectId: { in: projectIds } } },
      select: { url: true },
    });
    for (const attachment of attachments) {
      await rm(path.join(process.cwd(), "uploads", attachment.url), { force: true });
    }

    await db.attachment.deleteMany({ where: { task: { projectId: { in: projectIds } } } });
    await db.taskDependency.deleteMany({ where: { task: { projectId: { in: projectIds } } } });
    await db.auditLog.deleteMany({ where: { task: { projectId: { in: projectIds } } } });
    await db.task.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("lets exactly one of two same-version writes win and refuses the other", async () => {
    const task = await mkTask("race");
    const [a, b] = await Promise.all([
      patch(f.pm, task.id, { title: `A ${f.stamp}`, expectedVersion: task.version }),
      patch(f.pm, task.id, { title: `B ${f.stamp}`, expectedVersion: task.version }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);

    const loser = a.status === 409 ? a : b;
    const body = (await loser.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VERSION_CONFLICT");

    // Only the winner bumped the row and wrote the trail.
    const fresh = await prisma().task.findUnique({ where: { id: task.id } });
    expect(fresh?.version).toBe(task.version + 1);
    const trail = await prisma().auditLog.findMany({
      where: { taskId: task.id, changedColumn: "title", action: "update" },
    });
    expect(trail.length).toBe(1);
  });

  it("refuses a stale version and reports the current one", async () => {
    const task = await mkTask("stale");
    const first = await patch(f.pm, task.id, { title: "first", expectedVersion: task.version });
    expect(first.status).toBe(200);

    const stale = await patch(f.pm, task.id, { title: "second", expectedVersion: task.version });
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as {
      error: { details: { expectedVersion: number; currentVersion: number } };
    };
    expect(body.error.details.expectedVersion).toBe(task.version);
    expect(body.error.details.currentVersion).toBe(task.version + 1);
  });

  it("rejects a PATCH that omits expectedVersion", async () => {
    const task = await mkTask("no-version");
    const res = await patch(f.pm, task.id, { title: "no version" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("bumps the version once and logs one row per changed column", async () => {
    const task = await mkTask("bump");
    const res = await patch(f.pm, task.id, {
      title: "Renamed",
      priority: "high",
      expectedVersion: task.version,
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { version: number };
    expect(updated.version).toBe(task.version + 1);

    const rows = await prisma().auditLog.findMany({
      where: { taskId: task.id, action: "update" },
      orderBy: { changedColumn: "asc" },
    });
    expect(rows.map((row) => row.changedColumn)).toEqual(["priority", "title"]);
    expect(rows.find((row) => row.changedColumn === "priority")?.newValue).toBe("high");
  });

  it("records a create entry for every value it persisted", async () => {
    const res = await app.request("/api/tasks", {
      method: "POST",
      headers: headersFor(f.pm),
      body: JSON.stringify({
        title: `audited ${f.stamp}`,
        projectId: f.project.id,
        priority: "high",
        clientVisible: true,
        assigneeId: f.engineer.id,
      }),
    });
    expect(res.status).toBe(201);
    const task = (await res.json()) as { id: string };

    const rows = await prisma().auditLog.findMany({ where: { taskId: task.id } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.action === "create")).toBe(true);
    expect(rows.map((row) => row.changedColumn)).toContain("title");
    expect(rows.find((row) => row.changedColumn === "title")?.oldValue).toBeNull();
  });

  it("soft-deletes a task, hides it from reads, and logs the transition", async () => {
    const task = await mkTask("deletable");
    const res = await app.request(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: headersFor(f.pm),
    });
    expect(res.status).toBe(204);

    const gone = await app.request(`/api/tasks/${task.id}`, { headers: headersFor(f.pm) });
    expect(gone.status).toBe(404);

    const list = await app.request(`/api/tasks?rows=100&projectId=${f.project.id}`, {
      headers: headersFor(f.pm),
    });
    const body = (await list.json()) as { data: Array<{ id: string }> };
    expect(body.data.some((row) => row.id === task.id)).toBe(false);

    // The row survives — only `deletedAt` changed — and the trail proves it.
    const row = await prisma().task.findUnique({ where: { id: task.id } });
    expect(row?.deletedAt).not.toBeNull();
    const trail = await prisma().auditLog.findMany({
      where: { taskId: task.id, action: "delete" },
    });
    expect(trail.map((entry) => entry.changedColumn)).toEqual(["deletedAt"]);
  });

  it("unblocks a dependent when its prerequisite is soft-deleted", async () => {
    const prerequisite = await mkTask("prerequisite");
    const dependent = await mkTask("dependent");
    await prisma().taskDependency.create({
      data: { taskId: dependent.id, dependsOnId: prerequisite.id },
    });

    const blocked = await app.request(`/api/tasks/${dependent.id}`, {
      headers: headersFor(f.engineer),
    });
    expect(((await blocked.json()) as { blocked: boolean }).blocked).toBe(true);

    const del = await app.request(`/api/tasks/${prerequisite.id}`, {
      method: "DELETE",
      headers: headersFor(f.pm),
    });
    expect(del.status).toBe(204);

    const unblocked = await app.request(`/api/tasks/${dependent.id}`, {
      headers: headersFor(f.engineer),
    });
    expect(((await unblocked.json()) as { blocked: boolean }).blocked).toBe(false);
  });

  it("exposes the audit trail to the PM only", async () => {
    const task = await mkTask("audit-access");
    const seed = await patch(f.pm, task.id, {
      title: `audited ${f.stamp}`,
      expectedVersion: task.version,
    });
    expect(seed.status).toBe(200);

    const denied = await app.request(`/api/tasks/${task.id}/audit`, {
      headers: headersFor(f.engineer),
    });
    expect(denied.status).toBe(403);

    const ok = await app.request(`/api/tasks/${task.id}/audit`, { headers: headersFor(f.pm) });
    expect(ok.status).toBe(200);
    const rows = (await ok.json()) as Array<{ changedColumn: string }>;
    expect(rows.length).toBeGreaterThan(0);
  });
});
