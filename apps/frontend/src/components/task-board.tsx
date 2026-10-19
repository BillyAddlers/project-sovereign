"use client";

import { useEffect, useMemo, useState } from "react";

import { CreateTaskForm } from "@/components/create-task-form";
import { TaskCard } from "@/components/task-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import { useEngineers, useProjects, useTasks } from "@/hooks/use-tasks";
import { ApiError } from "@/lib/api";
import { useUiStore } from "@/store/ui-store";

const columns = [
  { status: "todo", title: "To do", description: "Ready, or waiting on prerequisites" },
  { status: "in_progress", title: "In progress", description: "Being worked on now" },
  { status: "done", title: "Done", description: "Completed by the assignee" },
] as const;

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

export function TaskBoard() {
  const { data: user } = useSession();
  const projectsQuery = useProjects();
  const [projectId, setProjectId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const search = useUiStore((state) => state.filters.search);
  const setSearch = useUiStore((state) => state.setSearch);

  useEffect(() => {
    if (projectId) return;
    const first = projectsQuery.data?.data[0];
    if (first) setProjectId(first.id);
  }, [projectId, projectsQuery.data]);

  const tasksQuery = useTasks(
    {
      page: 1,
      rows: 100,
      orderKey: "createdAt",
      orderRule: "asc",
      projectId: projectId || undefined,
      search: search || undefined,
    },
    Boolean(projectId),
  );
  const engineersQuery = useEngineers(user?.role === "pm");

  const projects = projectsQuery.data?.data ?? [];
  const tasks = tasksQuery.data?.data ?? [];
  const engineers = engineersQuery.data?.data ?? [];
  const project = projects.find((entry) => entry.id === projectId);
  const error = projectsQuery.error ?? tasksQuery.error;

  const grouped = useMemo(
    () =>
      columns.map((column) => ({
        ...column,
        tasks: tasks.filter((task) => task.status === column.status),
      })),
    [tasks],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Task board</h1>
          <p className="text-muted-foreground text-sm">
            {user?.role === "client"
              ? "Read-only: only client-visible tasks from your project."
              : "Dependency-aware board — blocked tasks cannot be started."}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {projects.length > 1 ? (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Project</span>
              <select
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                {projects.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
          ) : project ? (
            <span className="text-muted-foreground text-sm">{project.name}</span>
          ) : null}

          <input
            className="border-input bg-background h-9 w-44 rounded-md border px-3 text-sm"
            placeholder="Search tasks…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {user?.role === "pm" ? (
            <Button size="sm" onClick={() => setShowCreate((value) => !value)}>
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
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No projects available.
          </CardContent>
        </Card>
      ) : null}

      {showCreate && user?.role === "pm" ? (
        <Card>
          <CardHeader>
            <CardTitle>Create a task</CardTitle>
            <CardDescription>Only a PM plans work and assigns an executor.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateTaskForm defaultProjectId={projectId} onCreated={() => setShowCreate(false)} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {grouped.map((column) => (
          <section key={column.status} className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">{column.title}</h2>
                <p className="text-muted-foreground text-xs">{column.description}</p>
              </div>
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium tabular-nums">
                {column.tasks.length}
              </span>
            </div>

            {tasksQuery.isPending && projectId ? (
              <p className="text-muted-foreground text-xs">Loading…</p>
            ) : null}

            <div className="space-y-3">
              {column.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  role={user?.role ?? "client"}
                  userId={user?.id ?? ""}
                  allTasks={tasks}
                  engineers={engineers}
                />
              ))}
            </div>

            {!tasksQuery.isPending && column.tasks.length === 0 ? (
              <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-xs">
                No tasks
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
