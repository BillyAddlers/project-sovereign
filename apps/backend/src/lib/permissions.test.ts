import { describe, expect, it } from "bun:test";

import {
  canCreateTask,
  canDefineDependency,
  canDeleteTask,
  canEditTaskFields,
  canTransitionStatus,
  canUploadAttachment,
  canViewAttachment,
  canViewProject,
  canViewTask,
  type Actor,
  type ProjectAccess,
  type TaskLike,
} from "@/lib/permissions";

const pm: Actor = { id: "pm-id", role: "pm" };
const engineer: Actor = { id: "eng-id", role: "engineer" };
const otherEngineer: Actor = { id: "eng-other", role: "engineer" };
const client: Actor = { id: "client-id", role: "client" };

const member: ProjectAccess = { isMember: true, isClient: false };
const outsider: ProjectAccess = { isMember: false, isClient: false };
const owner: ProjectAccess = { isMember: false, isClient: true };

const task = (overrides: Partial<TaskLike> = {}): TaskLike => ({
  id: "task-1",
  projectId: "project-1",
  assigneeId: "eng-id",
  status: "todo",
  clientVisible: true,
  ...overrides,
});

describe("read access", () => {
  it("PM can view every project and task", () => {
    expect(canViewProject(pm, outsider)).toBe(true);
    expect(canViewTask(pm, task({ clientVisible: false }), outsider)).toBe(true);
  });

  it("engineers only see projects they are members of", () => {
    expect(canViewProject(engineer, member)).toBe(true);
    expect(canViewProject(engineer, outsider)).toBe(false);
    expect(canViewTask(engineer, task(), member)).toBe(true);
    expect(canViewTask(engineer, task(), outsider)).toBe(false);
  });

  it("clients only see their own project and client-visible tasks", () => {
    expect(canViewTask(client, task({ clientVisible: true }), owner)).toBe(true);
    expect(canViewTask(client, task({ clientVisible: false }), owner)).toBe(false);
    expect(canViewTask(client, task({ clientVisible: true }), member)).toBe(false);
  });

  it("clients never receive attachments", () => {
    expect(canViewAttachment(client, owner)).toBe(false);
    expect(canViewAttachment(engineer, member)).toBe(true);
    expect(canViewAttachment(engineer, outsider)).toBe(false);
    expect(canViewAttachment(pm, outsider)).toBe(true);
  });
});

describe("write access", () => {
  it("only PM creates, edits fields, deletes, and defines dependencies", () => {
    expect(canCreateTask(pm)).toBe(true);
    expect(canCreateTask(engineer)).toBe(false);
    expect(canCreateTask(client)).toBe(false);

    expect(canEditTaskFields(pm)).toBe(true);
    expect(canEditTaskFields(engineer)).toBe(false);
    expect(canEditTaskFields(client)).toBe(false);

    expect(canDeleteTask(pm)).toBe(true);
    expect(canDeleteTask(engineer)).toBe(false);

    expect(canDefineDependency(pm)).toBe(true);
    expect(canDefineDependency(engineer)).toBe(false);
  });

  it("engineers may only attach files to their assigned task", () => {
    expect(canUploadAttachment(engineer, task())).toBe(true);
    expect(canUploadAttachment(otherEngineer, task())).toBe(false);
    expect(canUploadAttachment(pm, task({ assigneeId: null }))).toBe(true);
    expect(canUploadAttachment(client, task())).toBe(false);
  });
});

describe("state-based transitions", () => {
  it("PM can never move a task into done", () => {
    expect(canTransitionStatus(pm, task({ status: "in_progress" }), "done", true).allowed).toBe(
      false,
    );
    expect(canTransitionStatus(pm, task({ status: "todo" }), "done", true).allowed).toBe(false);
  });

  it("starting a task requires every dependency to be done", () => {
    expect(canTransitionStatus(pm, task(), "in_progress", true).allowed).toBe(true);
    expect(canTransitionStatus(pm, task(), "in_progress", false).allowed).toBe(false);
    expect(canTransitionStatus(engineer, task(), "in_progress", true).allowed).toBe(true);
    expect(canTransitionStatus(engineer, task(), "in_progress", false).allowed).toBe(false);
  });

  it("the assignee can complete an in-progress task", () => {
    expect(
      canTransitionStatus(engineer, task({ status: "in_progress" }), "done", true).allowed,
    ).toBe(true);
  });

  it("engineers cannot touch tasks assigned to someone else", () => {
    const decision = canTransitionStatus(otherEngineer, task(), "in_progress", true);
    expect(decision.allowed).toBe(false);
  });

  it("engineers cannot skip todo -> done", () => {
    expect(canTransitionStatus(engineer, task({ status: "todo" }), "done", true).allowed).toBe(
      false,
    );
  });

  it("clients never transition status", () => {
    expect(canTransitionStatus(client, task(), "in_progress", true).allowed).toBe(false);
  });

  it("setting the current status is a no-op", () => {
    expect(canTransitionStatus(engineer, task({ status: "todo" }), "todo", false).allowed).toBe(
      true,
    );
  });
});
