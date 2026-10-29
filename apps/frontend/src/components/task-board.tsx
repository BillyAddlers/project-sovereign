"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CreateTaskDialog } from "@/components/create-task-dialog";
import { TaskCard } from "@/components/task-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import { useEngineers, useProjects, useTasks, useUpdateTask } from "@/hooks/use-tasks";
import { ApiError } from "@/lib/api";
import type { Task } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";

const columns = [
  { status: "todo", title: "To do", description: "Ready, or waiting on prerequisites" },
  { status: "in_progress", title: "In progress", description: "Being worked on now" },
  { status: "done", title: "Done", description: "Completed by the assignee" },
] as const;

type DeadlineFilter = "all" | "overdue" | "soon" | "has" | "none";

const DEADLINE_OPTIONS: { value: DeadlineFilter; label: string }[] = [
  { value: "all", label: "Any deadline" },
  { value: "overdue", label: "Overdue" },
  { value: "soon", label: "Due soon (7 days)" },
  { value: "has", label: "Has deadline" },
  { value: "none", label: "No deadline" },
];

const SOON_MS = 7 * 24 * 60 * 60 * 1000;

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

function deadlineAt(task: Task): number | null {
  if (!task.deadlineDate) return null;
  return new Date(`${task.deadlineDate}T${task.deadlineTime ?? "23:59"}:00`).getTime();
}

/** Overdue / due-soon consider unfinished work; has / none are about presence. */
function matchesDeadline(task: Task, filter: DeadlineFilter): boolean {
  if (filter === "all") return true;
  const at = deadlineAt(task);
  if (filter === "none") return at === null;
  if (at === null) return false;
  if (filter === "has") return true;
  const now = Date.now();
  if (filter === "overdue") return task.status !== "done" && at < now;
  return task.status !== "done" && at >= now && at <= now + SOON_MS;
}

/** Can this task legally move to `status`? Mirrors the card's forward-only rules. */
function canMoveTo(
  task: Task,
  status: Task["status"],
  role: "pm" | "engineer" | "client",
  userId: string,
): boolean {
  const isPm = role === "pm";
  const assigned = task.assigneeId === userId;
  if (task.status === "todo" && status === "in_progress") {
    return !task.blocked && (isPm || (role === "engineer" && assigned));
  }
  if (task.status === "in_progress" && status === "done") {
    return role === "engineer" && assigned;
  }
  return false;
}

export function TaskBoard() {
  const { data: user } = useSession();
  const projectsQuery = useProjects();
  const [activeProject, setActiveProject] = useState<"all" | string>("all");
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const search = useUiStore((state) => state.filters.search);
  const setSearch = useUiStore((state) => state.setSearch);
  const [dragTask, setDragTask] = useState<Task | null>(null);
  const [dropTarget, setDropTarget] = useState<Task["status"] | null>(null);
  const update = useUpdateTask();

  // Fetch the role-visible set once (server scopes it); project + deadline are
  // filtered here so both dropdowns switch instantly without a refetch.
  const tasksQuery = useTasks(
    {
      page: 1,
      rows: 100,
      orderKey: "createdAt",
      orderRule: "asc",
      search: search || undefined,
    },
    true,
  );
  const engineersQuery = useEngineers(user?.role === "pm");

  const projects = projectsQuery.data?.data ?? [];
  const projectNameById = useMemo(
    () => new Map(projects.map((entry) => [entry.id, entry.name])),
    [projects],
  );
  const allTasks = tasksQuery.data?.data ?? [];
  const engineers = engineersQuery.data?.data ?? [];
  const error = projectsQuery.error ?? tasksQuery.error;

  const filtersActive = activeProject !== "all" || deadlineFilter !== "all" || Boolean(search);

  const visibleTasks = useMemo(
    () =>
      allTasks.filter(
        (task) =>
          (activeProject === "all" || task.projectId === activeProject) &&
          matchesDeadline(task, deadlineFilter),
      ),
    [allTasks, activeProject, deadlineFilter],
  );

  const grouped = useMemo(
    () =>
      columns.map((column) => ({
        ...column,
        tasks: visibleTasks.filter((task) => task.status === column.status),
      })),
    [visibleTasks],
  );

  const role = user?.role ?? "client";
  const userId = user?.id ?? "";

  const advance = (task: Task, status: Task["status"]) => {
    update.mutate(
      { id: task.id, input: { status, expectedVersion: task.version } },
      {
        onSuccess: () => toast.success(status === "done" ? "Task completed" : "Task started"),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Task board</h1>
          <p className="text-muted-foreground text-sm">
            {user?.role === "client"
              ? "Read-only: only client-visible tasks from your project."
              : user?.role === "engineer"
                ? "Your assigned tasks."
                : "Dependency-aware board — blocked tasks cannot be started."}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Project</span>
            <select
              className="border-input h-9 rounded-md border bg-white/60 px-3 text-sm dark:bg-white/[0.07]"
              value={activeProject}
              onChange={(event) => setActiveProject(event.target.value)}
            >
              <option value="all">All projects</option>
              {projects.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Deadline</span>
            <select
              className="border-input h-9 rounded-md border bg-white/60 px-3 text-sm dark:bg-white/[0.07]"
              value={deadlineFilter}
              onChange={(event) => setDeadlineFilter(event.target.value as DeadlineFilter)}
            >
              {DEADLINE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <input
            className="border-input h-9 w-44 rounded-md border bg-white/60 px-3 text-sm dark:bg-white/[0.07] backdrop-blur-sm"
            placeholder="Search tasks…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {user?.role === "pm" ? (
            <Button onClick={() => setShowCreate((value) => !value)}>
              {showCreate ? "Close" : "New task"}
            </Button>
          ) : null}
        </div>
      </div>

      {projectsQuery.isPending ? (
        <p className="text-muted-foreground text-sm">Loading projects…</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(error)}
        </p>
      ) : null}
      {!projectsQuery.isPending && projects.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            No projects available.
          </CardContent>
        </Card>
      ) : null}

      {user?.role === "pm" ? (
        <CreateTaskDialog
          defaultProjectId={activeProject === "all" ? projects[0]?.id : activeProject}
          open={showCreate}
          onOpenChange={setShowCreate}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {grouped.map((column) => {
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: kanban column doubles as a drag-and-drop target
            <section
              key={column.status}
              className={cn(
                "space-y-4 rounded-xl transition-colors",
                dropTarget === column.status
                  ? "bg-primary/5 ring-2 ring-inset ring-primary/40"
                  : "",
              )}
              onDragOver={(event) => {
                if (dragTask && canMoveTo(dragTask, column.status, role, userId)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTarget(column.status);
                } else {
                  event.dataTransfer.dropEffect = "none";
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDropTarget((current) => (current === column.status ? null : current));
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragTask && canMoveTo(dragTask, column.status, role, userId)) {
                  advance(dragTask, column.status);
                }
                setDragTask(null);
                setDropTarget(null);
              }}
            >
              {dropTarget === column.status && dragTask ? (
                <div className="rounded-lg border-2 border-dashed border-primary/60 bg-primary/10 p-3 text-center text-sm font-medium text-primary">
                  Drop here
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">{column.title}</h2>
                  <p className="text-muted-foreground text-sm">{column.description}</p>
                </div>
                <span className="text-muted-foreground rounded-full border border-white/50 bg-white/50 px-2.5 py-1 text-sm font-medium tabular-nums backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.06]">
                  {column.tasks.length}
                </span>
              </div>

              {tasksQuery.isPending ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : null}

              <div className="space-y-4">
                {column.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    role={role}
                    userId={userId}
                    allTasks={allTasks}
                    engineers={engineers}
                    projectName={projectNameById.get(task.projectId)}
                    onDragStart={setDragTask}
                    onDragEnd={() => {
                      setDragTask(null);
                      setDropTarget(null);
                    }}
                  />
                ))}
              </div>

              {!tasksQuery.isPending && column.tasks.length === 0 ? (
                <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
                  {filtersActive
                    ? "No matching tasks"
                    : user?.role === "engineer"
                      ? "No tasks assigned to you"
                      : "No tasks"}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
