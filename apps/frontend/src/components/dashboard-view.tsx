"use client";

import { useEffect, useMemo, useState } from "react";

import { BlockedBadge, PriorityBadge, StatusBadge } from "@/components/task-badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import { useProjectStats, useProjects, useTasks } from "@/hooks/use-tasks";
import { ApiError } from "@/lib/api";
import type { Task, TaskPriority } from "@/lib/schemas";

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

const priorityOrder: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
const statusOrder = { in_progress: 0, todo: 1, done: 2 } as const;

/** Blocked first, then in-progress, then by priority — the work that needs eyes. */
function sortForGlance(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? -1 : 1;
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

export function DashboardView() {
  const { data: user } = useSession();
  const projectsQuery = useProjects();
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    if (projectId) return;
    const first = projectsQuery.data?.data[0];
    if (first) setProjectId(first.id);
  }, [projectId, projectsQuery.data]);

  const statsQuery = useProjectStats(projectId || undefined);
  const tasksQuery = useTasks(
    {
      page: 1,
      rows: 100,
      orderKey: "createdAt",
      orderRule: "desc",
      projectId: projectId || undefined,
    },
    Boolean(projectId),
  );

  const stats = statsQuery.data;
  const tasks = useMemo(() => sortForGlance(tasksQuery.data?.data ?? []), [tasksQuery.data]);
  const glance = tasks.slice(0, 6);

  const loading = projectsQuery.isPending || statsQuery.isPending || tasksQuery.isPending;
  const error = projectsQuery.error ?? statsQuery.error ?? tasksQuery.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {user?.role === "client"
              ? "Aggregate metrics for your project — only client-visible work is included."
              : user?.role === "engineer"
                ? "Project health for the projects you work on."
                : "Plan work and track project health at a glance."}
          </p>
        </div>

        {projectsQuery.data && projectsQuery.data.data.length > 1 ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Project</span>
            <select
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              {projectsQuery.data.data.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {projectsQuery.isPending ? (
        <p className="text-muted-foreground text-sm">Loading projects…</p>
      ) : null}
      {projectsQuery.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(projectsQuery.error)}
        </p>
      ) : null}

      {!projectsQuery.isPending && projectsQuery.data?.data.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No projects yet.
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(error)}
        </p>
      ) : null}

      {loading && projectId ? (
        <p className="text-muted-foreground text-sm">Loading metrics…</p>
      ) : null}

      {stats ? (
        <section
          aria-label="Project progress"
          className="bg-primary text-primary-foreground dark:bg-secondary dark:text-secondary-foreground rounded-xl p-6 ring-1 ring-primary/20 sm:p-8"
        >
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] xl:items-end">
            <div>
              <div className="flex items-baseline text-[64px] leading-none font-bold tracking-tight tabular-nums lg:text-[84px]">
                {stats.percentComplete}
                <span className="ml-1 text-[26px] font-semibold opacity-70 lg:text-[34px]">%</span>
              </div>
              <p className="text-primary-foreground/75 dark:text-secondary-foreground/75 mt-3 text-sm">
                {stats.byStatus.done} of {stats.total} tasks done
              </p>
              <p className="text-primary-foreground/75 dark:text-secondary-foreground/75 flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className={
                    stats.blockedCount > 0
                      ? "bg-accent size-1.5 rounded-full"
                      : "bg-primary-foreground/30 dark:bg-secondary-foreground/30 size-1.5 rounded-full"
                  }
                />
                {stats.blockedCount > 0 ? (
                  <>
                    <span className="text-primary-foreground dark:text-secondary-foreground font-semibold tabular-nums">
                      {stats.blockedCount}
                    </span>
                    blocked, waiting on dependencies
                  </>
                ) : (
                  "Nothing blocked"
                )}
              </p>
            </div>

            <div className="space-y-4">
              <div className="bg-primary-foreground/15 dark:bg-secondary-foreground/15 h-4 w-full overflow-hidden rounded-full">
                <div
                  className="bg-accent h-full rounded-full transition-[width]"
                  style={{ width: `${stats.percentComplete}%` }}
                />
              </div>

              <dl className="border-primary-foreground/20 dark:border-secondary-foreground/20 grid grid-cols-3 gap-3 border-t pt-4">
                {(
                  [
                    ["To do", stats.byStatus.todo],
                    ["In progress", stats.byStatus.in_progress],
                    ["Done", stats.byStatus.done],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-primary-foreground/70 dark:text-secondary-foreground/70 text-xs">
                      {label}
                    </dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Tasks at a glance</CardTitle>
          <CardDescription>
            {user?.role === "client"
              ? "Only tasks marked client-visible."
              : "Blocked work first, then in progress."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tasksQuery.isPending && projectId ? (
            <p className="text-muted-foreground text-sm">Loading tasks…</p>
          ) : null}
          {tasksQuery.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(tasksQuery.error)}
            </p>
          ) : null}
          {!tasksQuery.isPending && tasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">No tasks in this project yet.</p>
          ) : null}
          <ul className="divide-border divide-y">
            {glance.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-center gap-2 py-3 text-base first:pt-0 last:pb-0"
              >
                <span className="w-full text-base font-semibold sm:w-auto">{task.title}</span>
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                {task.blocked ? <BlockedBadge /> : null}
                {task.assignee ? (
                  <span className="text-muted-foreground ml-auto text-sm">
                    {task.assignee.name}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
