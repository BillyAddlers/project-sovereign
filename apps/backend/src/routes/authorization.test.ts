import { afterAll, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createApp } from "@/app";
import { signToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Project, Task, User } from "@/generated/prisma/client";

const app = createApp();

/** Sign a session cookie directly — these tests exercise authorization, not login. */
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

/**
 * The task PATCH contract requires `expectedVersion`. These tests exercise
 * permissions, not concurrency, so read the current version and send it — a
 * fresh version is always "correct" here. Concurrency is covered separately in
 * `concurrency.test.ts`, which sends deliberately stale versions.
 */
async function patch(user: User, taskId: string, body: unknown): Promise<Response> {
  const current = await prisma().task.findUnique({
    where: { id: taskId },
    select: { version: true },
  });
  return app.request(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: headersFor(user),
    body: JSON.stringify({
      ...(body as Record<string, unknown>),
      expectedVersion: current?.version ?? 1,
    }),
  });
}

interface Fixtures {
  pm: User;
  engineer: User;
  other: User;
  client: User;
  project: Project;
  foreign: Project;
  tDone: Task;
  tOpen: Task;
  tBlocked: Task;
  tReady: Task;
  tOther: Task;
  tComplete: Task;
  tStart: Task;
  tDepA: Task;
  tDepB: Task;
  tForeign: Task;
}

async function createFixtures(): Promise<Fixtures> {
  const db = prisma();
  const stamp = crypto.randomUUID();

  // A failed earlier run must not poison the next one: purge any leftover
  // fixtures (all of them live under @test.local) in FK order.
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
    await db.attachment.deleteMany({
      where: { task: { projectId: { in: staleProjectIds } } },
    });
    await db.taskDependency.deleteMany({
      where: { task: { projectId: { in: staleProjectIds } } },
    });
    // Audit rows point at tasks and users, so they go before either.
    await db.auditLog.deleteMany({
      where: { task: { projectId: { in: staleProjectIds } } },
    });
    await db.task.deleteMany({ where: { projectId: { in: staleProjectIds } } });
    await db.projectMember.deleteMany({
      where: {
        OR: [
          { userId: { in: staleUserIds } },
          { projectId: { in: staleProjectIds } },
        ],
      },
    });
    await db.project.deleteMany({ where: { id: { in: staleProjectIds } } });
    await db.user.deleteMany({ where: { id: { in: staleUserIds } } });
  }

  const mkUser = (
    role: "pm" | "engineer" | "client",
    department?: "frontend" | "backend",
    label: string = role,
  ) =>
    db.user.create({
      data: {
        email: `authz-${label}-${stamp}@test.local`,
        passwordHash: "x",
        name: `${label} ${stamp}`,
        role,
        department: department ?? null,
      },
    });

  const pm = await mkUser("pm");
  const engineer = await mkUser("engineer", "frontend", "engineer");
  const other = await mkUser("engineer", "backend", "other");
  const client = await mkUser("client");

  const project = await db.project.create({
    data: {
      name: `Authz ${stamp}`,
      clientId: client.id,
      members: {
        create: [{ userId: pm.id }, { userId: engineer.id }, { userId: other.id }],
      },
    },
  });
  const foreign = await db.project.create({ data: { name: `Foreign ${stamp}` } });

  const task = (title: string, data: Record<string, unknown> = {}) =>
    db.task.create({ data: { title, projectId: project.id, ...data } });

  const tDone = await task(`Done ${stamp}`, {
    status: "done",
    assigneeId: engineer.id,
    clientVisible: true,
  });
  const tOpen = await task(`Open ${stamp}`, {
    status: "in_progress",
    assigneeId: engineer.id,
    clientVisible: true,
  });
  const tBlocked = await task(`Blocked ${stamp}`, {
    status: "todo",
    assigneeId: engineer.id,
    clientVisible: false,
  });
  const tReady = await task(`Ready ${stamp}`, {
    status: "todo",
    assigneeId: engineer.id,
    clientVisible: true,
  });
  const tOther = await task(`Other ${stamp}`, {
    status: "todo",
    assigneeId: other.id,
    clientVisible: false,
  });
  const tComplete = await task(`Complete ${stamp}`, {
    status: "in_progress",
    assigneeId: engineer.id,
    clientVisible: true,
  });
  const tStart = await task(`Start ${stamp}`, {
    status: "todo",
    assigneeId: engineer.id,
    clientVisible: false,
  });
  const tDepA = await task(`DepA ${stamp}`, {
    status: "todo",
    assigneeId: engineer.id,
    clientVisible: false,
  });
  const tDepB = await task(`DepB ${stamp}`, {
    status: "todo",
    assigneeId: engineer.id,
    clientVisible: false,
  });
  const tForeign = await db.task.create({
    data: {
      title: `ForeignTask ${stamp}`,
      projectId: foreign.id,
      status: "todo",
      assigneeId: other.id,
      clientVisible: true,
    },
  });

  await db.taskDependency.create({
    data: { taskId: tBlocked.id, dependsOnId: tOpen.id },
  });

  return {
    pm,
    engineer,
    other,
    client,
    project,
    foreign,
    tDone,
    tOpen,
    tBlocked,
    tReady,
    tOther,
    tComplete,
    tStart,
    tDepA,
    tDepB,
    tForeign,
  };
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

describe.skipIf(!hasDatabase)("authorization", () => {
  if (!fixtures) return;
  const f = fixtures;

  afterAll(async () => {
    const db = prisma();
    const userIds = [f.pm.id, f.engineer.id, f.other.id, f.client.id];
    // Include projects created during the tests: they are linked to these users
    // through clientId or membership, so nothing is left behind.
    const ownedProjects = await db.project.findMany({
      where: {
        OR: [
          { clientId: { in: userIds } },
          { members: { some: { userId: { in: userIds } } } },
        ],
      },
      select: { id: true },
    });
    const projectIds = [
      ...new Set([f.project.id, f.foreign.id, ...ownedProjects.map((project) => project.id)]),
    ];

    const attachmentRows = await db.attachment.findMany({
      where: { task: { projectId: { in: projectIds } } },
      select: { url: true },
    });
    for (const attachment of attachmentRows) {
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

  it("rejects task creation by an engineer", async () => {
    const res = await app.request("/api/tasks", {
      method: "POST",
      headers: headersFor(f.engineer),
      body: JSON.stringify({ title: "Nope", projectId: f.project.id, priority: "medium" }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("prevents the PM from completing a task", async () => {
    const res = await patch(f.pm, f.tReady.id, { status: "done" });
    expect(res.status).toBe(403);
  });

  it("lets the PM edit descriptive fields", async () => {
    const res = await patch(f.pm, f.tStart.id, { title: "Renamed by PM" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string };
    expect(body.title).toBe("Renamed by PM");
  });

  it("prevents an engineer from editing descriptive fields", async () => {
    const res = await patch(f.engineer, f.tStart.id, { title: "Not allowed" });
    expect(res.status).toBe(403);
  });

  it("hides a task assigned to someone else from an engineer", async () => {
    const res = await patch(f.engineer, f.tOther.id, { status: "in_progress" });
    expect(res.status).toBe(404);
  });

  it("prevents starting a task with an unfinished dependency", async () => {
    const res = await patch(f.engineer, f.tBlocked.id, { status: "in_progress" });
    expect(res.status).toBe(403);
  });

  it("lets the assignee start and complete their own tasks", async () => {
    const start = await patch(f.engineer, f.tStart.id, { status: "in_progress" });
    expect(start.status).toBe(200);
    const started = (await start.json()) as { status: string; blocked: boolean };
    expect(started.status).toBe("in_progress");
    expect(started.blocked).toBe(false);

    const done = await patch(f.engineer, f.tComplete.id, { status: "done" });
    expect(done.status).toBe(200);
  });

  it("lets the assignee upload and download an attachment, and hides it from clients", async () => {
    const form = new FormData();
    form.append("file", new File(["hello attachment"], "note.txt", { type: "text/plain" }));

    const upload = await app.request(`/api/tasks/${f.tStart.id}/attachments`, {
      method: "POST",
      headers: { Cookie: cookieFor(f.engineer) },
      body: form,
    });
    expect(upload.status).toBe(201);
    const created = (await upload.json()) as {
      id: string;
      downloadUrl: string;
      size: number;
    };
    expect(created.size).toBe("hello attachment".length);
    expect(created.downloadUrl).toBe(`/api/attachments/${created.id}/download`);

    const download = await app.request(created.downloadUrl, {
      headers: { Cookie: cookieFor(f.engineer) },
    });
    expect(download.status).toBe(200);
    expect(await download.text()).toBe("hello attachment");

    // The client must not learn that an internal attachment exists.
    const clientDownload = await app.request(created.downloadUrl, {
      headers: { Cookie: cookieFor(f.client) },
    });
    expect(clientDownload.status).toBe(404);

    // An engineer cannot attach to a task assigned to someone else — the task
    // is not visible to them, so it reads as missing rather than forbidden.
    const deniedForm = new FormData();
    deniedForm.append("file", new File(["nope"], "nope.txt", { type: "text/plain" }));
    const denied = await app.request(`/api/tasks/${f.tOther.id}/attachments`, {
      method: "POST",
      headers: { Cookie: cookieFor(f.engineer) },
      body: deniedForm,
    });
    expect(denied.status).toBe(404);
  });

  it("lets the PM list engineers but not the engineers themselves", async () => {
    const ok = await app.request("/api/users?rows=100", { headers: headersFor(f.pm) });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { data: Array<{ role: string }> };
    expect(body.data.every((row) => row.role === "engineer")).toBe(true);

    const denied = await app.request("/api/users", { headers: headersFor(f.engineer) });
    expect(denied.status).toBe(403);
  });

  it("allows PM dependencies but rejects cycles", async () => {
    const created = await app.request(`/api/tasks/${f.tDepA.id}/dependencies`, {
      method: "POST",
      headers: headersFor(f.pm),
      body: JSON.stringify({ dependsOnId: f.tDepB.id }),
    });
    expect(created.status).toBe(201);

    const cycle = await app.request(`/api/tasks/${f.tDepB.id}/dependencies`, {
      method: "POST",
      headers: headersFor(f.pm),
      body: JSON.stringify({ dependsOnId: f.tDepA.id }),
    });
    expect(cycle.status).toBe(400);
  });

  it("gives clients only client-visible tasks, without internal identities", async () => {
    const res = await app.request("/api/tasks?rows=100", { headers: headersFor(f.client) });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: Array<Record<string, unknown>> };
    const ids = body.data.map((row) => row["id"] as string).sort();
    expect(ids).toEqual([f.tDone.id, f.tOpen.id, f.tReady.id, f.tComplete.id].sort());

    for (const row of body.data) {
      expect(row["assignee"]).toBeUndefined();
      expect(row["assigneeId"]).toBeUndefined();
      expect(row["attachments"]).toBeUndefined();
    }
  });

  it("prevents clients from modifying tasks", async () => {
    const res = await patch(f.client, f.tReady.id, { status: "in_progress" });
    expect(res.status).toBe(403);
  });

  it("computes client stats only from client-visible tasks", async () => {
    const res = await app.request(`/api/projects/${f.project.id}/stats`, {
      headers: headersFor(f.client),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      total: number;
      byStatus: { done: number };
      percentComplete: number;
    };
    expect(body.total).toBe(4);
    expect(body.byStatus.done).toBe(2);
    expect(body.percentComplete).toBe(50);
  });

  it("computes PM stats across every task and reports blocked work", async () => {
    const res = await app.request(`/api/projects/${f.project.id}/stats`, {
      headers: headersFor(f.pm),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { total: number; blockedCount: number };
    expect(body.total).toBe(9);
    expect(body.blockedCount).toBe(2);
  });

  it("scopes the engineer's list to their assigned tasks", async () => {
    const res = await app.request("/api/tasks?rows=100", { headers: headersFor(f.engineer) });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: Array<{ id: string }> };
    const ids = body.data.map((row) => row.id);
    expect(ids).toContain(f.tStart.id);
    expect(ids).not.toContain(f.tOther.id);
    expect(ids).not.toContain(f.tForeign.id);
  });

  it("shows the PM tasks from projects they do not belong to", async () => {
    const res = await app.request("/api/tasks?rows=100", { headers: headersFor(f.pm) });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: Array<{ id: string }> };
    expect(body.data.map((row) => row.id)).toContain(f.tForeign.id);
  });

  it("creates a task together with its prerequisites (deduplicated)", async () => {
    const res = await app.request("/api/tasks", {
      method: "POST",
      headers: headersFor(f.pm),
      body: JSON.stringify({
        title: `Created with deps ${crypto.randomUUID()}`,
        projectId: f.project.id,
        priority: "low",
        dependencyIds: [f.tDone.id, f.tReady.id, f.tReady.id],
      }),
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as {
      dependencies: Array<{ id: string }>;
      blocked: boolean;
    };
    expect(body.dependencies.map((dependency) => dependency.id).sort()).toEqual(
      [f.tDone.id, f.tReady.id].sort(),
    );
    // tReady is still todo, so the new task starts blocked.
    expect(body.blocked).toBe(true);
  });

  it("rejects a prerequisite from another project", async () => {
    const res = await app.request("/api/tasks", {
      method: "POST",
      headers: headersFor(f.pm),
      body: JSON.stringify({
        title: `Bad dependency ${crypto.randomUUID()}`,
        projectId: f.project.id,
        priority: "low",
        dependencyIds: [f.tForeign.id],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("lets the PM create a project with a client and members", async () => {
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: headersFor(f.pm),
      body: JSON.stringify({
        name: `Created ${crypto.randomUUID()}`,
        description: "fresh",
        clientId: f.client.id,
        memberIds: [f.engineer.id, f.other.id, f.other.id],
      }),
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as {
      status: string;
      clientId: string;
      members: Array<{ id: string }>;
    };
    expect(body.status).toBe("active");
    expect(body.clientId).toBe(f.client.id);
    expect(body.members.map((member) => member.id).sort()).toEqual(
      [f.engineer.id, f.other.id].sort(),
    );
  });

  it("rejects project creation by an engineer", async () => {
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: headersFor(f.engineer),
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects a client id that is not a client-role user", async () => {
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: headersFor(f.pm),
      body: JSON.stringify({ name: "Bad client", clientId: f.engineer.id }),
    });
    expect(res.status).toBe(400);
  });

  it("masks the client id and members from the Client project shape", async () => {
    const res = await app.request(`/api/projects/${f.project.id}`, {
      headers: headersFor(f.client),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.name).toBe(f.project.name);
    expect(body.clientId).toBeUndefined();
    expect(body.members).toBeUndefined();
  });

  it("scopes project detail to members and hides foreign projects", async () => {
    const member = await app.request(`/api/projects/${f.project.id}`, {
      headers: headersFor(f.engineer),
    });
    expect(member.status).toBe(200);

    const foreign = await app.request(`/api/projects/${f.foreign.id}`, {
      headers: headersFor(f.engineer),
    });
    expect(foreign.status).toBe(404);
  });

  it("prevents an engineer from editing a project or its members", async () => {
    const edit = await app.request(`/api/projects/${f.project.id}`, {
      method: "PATCH",
      headers: headersFor(f.engineer),
      body: JSON.stringify({ name: "Hijacked" }),
    });
    expect(edit.status).toBe(403);

    const staff = await app.request(`/api/projects/${f.project.id}/members`, {
      method: "POST",
      headers: headersFor(f.engineer),
      body: JSON.stringify({ userId: f.pm.id }),
    });
    expect(staff.status).toBe(403);
  });

  it("lets the PM rename a project and manage its members", async () => {
    const rename = await app.request(`/api/projects/${f.project.id}`, {
      method: "PATCH",
      headers: headersFor(f.pm),
      body: JSON.stringify({ name: `Renamed ${crypto.randomUUID()}` }),
    });
    expect(rename.status).toBe(200);
    const renamed = (await rename.json()) as { name: string };
    expect(renamed.name.startsWith("Renamed ")).toBe(true);

    const remove = await app.request(`/api/projects/${f.project.id}/members/${f.other.id}`, {
      method: "DELETE",
      headers: headersFor(f.pm),
    });
    expect(remove.status).toBe(204);

    const add = await app.request(`/api/projects/${f.project.id}/members`, {
      method: "POST",
      headers: headersFor(f.pm),
      body: JSON.stringify({ userId: f.other.id }),
    });
    expect(add.status).toBe(204);
  });

  it("refuses to delete a project that still has tasks", async () => {
    const res = await app.request(`/api/projects/${f.project.id}`, {
      method: "DELETE",
      headers: headersFor(f.pm),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PROJECT_NOT_EMPTY");
  });

  it("soft-deletes an empty project so it disappears from reads", async () => {
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: headersFor(f.pm),
      body: JSON.stringify({ name: `Deletable ${crypto.randomUUID()}`, clientId: f.client.id }),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const deleted = await app.request(`/api/projects/${id}`, {
      method: "DELETE",
      headers: headersFor(f.pm),
    });
    expect(deleted.status).toBe(204);

    const gone = await app.request(`/api/projects/${id}`, { headers: headersFor(f.pm) });
    expect(gone.status).toBe(404);
  });
});
