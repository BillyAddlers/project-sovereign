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

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-4xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className="text-muted-foreground pt-0 text-sm">{hint}</CardContent>
      ) : null}
    </Card>
  );
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
  const project = projectsQuery.data?.data.find((entry) => entry.id === projectId);

  const loading = projectsQuery.isPending || statsQuery.isPending || tasksQuery.isPending;
  const error = projectsQuery.error ?? statsQuery.error ?? tasksQuery.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
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
        ) : project ? (
          <span className="text-muted-foreground text-sm">{project.name}</span>
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
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total tasks" value={stats.total} />
            <StatCard
              label="Complete"
              value={`${stats.percentComplete}%`}
              hint={`${stats.byStatus.done} of ${stats.total} done`}
            />
            <StatCard label="In progress" value={stats.byStatus.in_progress} />
            <StatCard label="Blocked" value={stats.blockedCount} hint="Waiting on dependencies" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Progress</CardTitle>
              <CardDescription>Done versus total tasks in this project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted h-3 w-full overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-[width]"
                  style={{ width: `${stats.percentComplete}%` }}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {(["todo", "in_progress", "done"] as const).map((status) => (
                  <div
                    key={status}
                    className="bg-muted/50 flex items-center justify-between rounded-md px-3 py-3 text-sm"
                  >
                    <StatusBadge status={status} />
                    <span className="text-base font-medium tabular-nums">
                      {stats.byStatus[status]}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tasks at a glance</CardTitle>
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
          <ul className="space-y-2">
            {glance.map((task) => (
              <li
                key={task.id}
                className="border-border flex flex-wrap items-center gap-2 rounded-md border p-4 text-base"
              >
                <span className="font-medium">{task.title}</span>
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
