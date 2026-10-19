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

async function patch(user: User, taskId: string, body: unknown): Promise<Response> {
  return app.request(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: headersFor(user),
    body: JSON.stringify(body),
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
    const projectIds = [f.project.id, f.foreign.id];
    const userIds = [f.pm.id, f.engineer.id, f.other.id, f.client.id];

    const attachmentRows = await db.attachment.findMany({
      where: { task: { projectId: { in: projectIds } } },
      select: { url: true },
    });
    for (const attachment of attachmentRows) {
      await rm(path.join(process.cwd(), "uploads", attachment.url), { force: true });
    }

    await db.attachment.deleteMany({ where: { task: { projectId: { in: projectIds } } } });
    await db.taskDependency.deleteMany({ where: { task: { projectId: { in: projectIds } } } });
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

  it("prevents an engineer from moving a task assigned to someone else", async () => {
    const res = await patch(f.engineer, f.tOther.id, { status: "in_progress" });
    expect(res.status).toBe(403);
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

    // An engineer cannot attach to a task assigned to someone else.
    const deniedForm = new FormData();
    deniedForm.append("file", new File(["nope"], "nope.txt", { type: "text/plain" }));
    const denied = await app.request(`/api/tasks/${f.tOther.id}/attachments`, {
      method: "POST",
      headers: { Cookie: cookieFor(f.engineer) },
      body: deniedForm,
    });
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

  it("scopes the engineer's list to their member projects", async () => {
    const res = await app.request("/api/tasks?rows=100", { headers: headersFor(f.engineer) });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: Array<{ id: string }> };
    const ids = body.data.map((row) => row.id);
    expect(ids).toContain(f.tStart.id);
    expect(ids).not.toContain(f.tForeign.id);
  });

  it("shows the PM tasks from projects they do not belong to", async () => {
    const res = await app.request("/api/tasks?rows=100", { headers: headersFor(f.pm) });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: Array<{ id: string }> };
    expect(body.data.map((row) => row.id)).toContain(f.tForeign.id);
  });
});
