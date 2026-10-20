import { describe, expect, it } from "bun:test";

import {
  auditValue,
  createEntries,
  deleteEntry,
  type TaskSnapshot,
  updateEntries,
} from "@/lib/audit";

const before: TaskSnapshot = {
  title: "Design the API",
  description: null,
  priority: "medium",
  assigneeId: "eng-1",
  clientVisible: false,
  projectId: "project-1",
  status: "todo",
};

describe("auditValue", () => {
  it("keeps text, encodes booleans, and treats unset as null", () => {
    expect(auditValue("done")).toBe("done");
    expect(auditValue(true)).toBe("true");
    expect(auditValue(false)).toBe("false");
    expect(auditValue(null)).toBeNull();
    expect(auditValue(undefined)).toBeNull();
  });

  it("stores dates as ISO strings", () => {
    const at = new Date("2026-10-20T10:00:00.000Z");
    expect(auditValue(at)).toBe("2026-10-20T10:00:00.000Z");
  });
});

describe("updateEntries", () => {
  it("records only the fields present in the patch", () => {
    const entries = updateEntries(before, { status: "in_progress" });
    expect(entries).toEqual([
      { changedColumn: "status", oldValue: "todo", newValue: "in_progress" },
    ]);
  });

  it("ignores fields re-sent with the same value", () => {
    expect(updateEntries(before, { title: before.title })).toEqual([]);
  });

  it("records clearing a nullable field as a null transition", () => {
    expect(updateEntries(before, { assigneeId: null })).toEqual([
      { changedColumn: "assigneeId", oldValue: "eng-1", newValue: null },
    ]);
  });

  it("emits one entry per changed column in a stable order", () => {
    const entries = updateEntries(before, {
      status: "done",
      title: "Ship it",
      clientVisible: true,
    });
    expect(entries.map((entry) => entry.changedColumn)).toEqual([
      "title",
      "clientVisible",
      "status",
    ]);
    expect(entries[1]).toEqual({
      changedColumn: "clientVisible",
      oldValue: "false",
      newValue: "true",
    });
  });
});

describe("createEntries", () => {
  it("logs every persisted value with an empty old side", () => {
    const entries = createEntries({
      title: "New task",
      description: undefined,
      priority: "high",
      clientVisible: false,
      projectId: "project-1",
    });
    expect(entries).toEqual([
      { changedColumn: "title", oldValue: null, newValue: "New task" },
      { changedColumn: "priority", oldValue: null, newValue: "high" },
      { changedColumn: "clientVisible", oldValue: null, newValue: "false" },
      { changedColumn: "projectId", oldValue: null, newValue: "project-1" },
    ]);
  });
});

describe("deleteEntry", () => {
  it("represents soft delete as a single deletedAt transition", () => {
    const at = new Date("2026-10-20T10:00:00.000Z");
    expect(deleteEntry(at)).toEqual({
      changedColumn: "deletedAt",
      oldValue: null,
      newValue: "2026-10-20T10:00:00.000Z",
    });
  });
});
