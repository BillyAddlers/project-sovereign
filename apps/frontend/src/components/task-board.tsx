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
  const allTasks = tasksQuery.data?.data ?? [];
  const engineers = engineersQuery.data?.data ?? [];
  const error = projectsQuery.error ?? tasksQuery.error;

  // Workers only receive their own tasks; the server is the single source of truth.
  const grouped = useMemo(() => {
    const rows = tasksQuery.data?.data ?? [];
    return columns.map((column) => ({
      ...column,
      tasks: rows.filter((task) => task.status === column.status),
    }));
  }, [tasksQuery.data]);

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
          ) : null}

          <input
            className="border-input bg-background h-9 w-44 rounded-md border px-3 text-sm"
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

      {showCreate && user?.role === "pm" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Create a task</CardTitle>
            <CardDescription>Only a PM plans work and assigns an executor.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateTaskForm defaultProjectId={projectId} onCreated={() => setShowCreate(false)} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {grouped.map((column) => (
          <section key={column.status} className="space-y-4">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">{column.title}</h2>
                <p className="text-muted-foreground text-sm">{column.description}</p>
              </div>
              <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-sm font-medium tabular-nums">
                {column.tasks.length}
              </span>
            </div>

            {tasksQuery.isPending && projectId ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : null}

            <div className="space-y-4">
              {column.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  role={user?.role ?? "client"}
                  userId={user?.id ?? ""}
                  allTasks={allTasks}
                  engineers={engineers}
                />
              ))}
            </div>

            {!tasksQuery.isPending && column.tasks.length === 0 ? (
              <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
                {user?.role === "engineer" ? "No tasks assigned to you" : "No tasks"}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
