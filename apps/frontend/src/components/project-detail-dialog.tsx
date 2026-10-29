"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";

import { CreateTaskForm } from "@/components/create-task-form";
import { BlockedBadge, PriorityBadge, StatusBadge } from "@/components/task-badges";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { useProjectStats, useTasks } from "@/hooks/use-tasks";
import { ApiError } from "@/lib/api";
import type { Project } from "@/lib/schemas";

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

interface ProjectDetailDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Project detail: big progress + status counts + task list + PM add-task form. */
export function ProjectDetailDialog({ project, open, onOpenChange }: ProjectDetailDialogProps) {
  const { data: user } = useSession();
  const isPm = user?.role === "pm";
  const [showAdd, setShowAdd] = useState(false);

  const statsQuery = useProjectStats(project.id);
  const tasksQuery = useTasks(
    { page: 1, rows: 100, orderKey: "createdAt", orderRule: "asc", projectId: project.id },
    open,
  );
  const stats = statsQuery.data;
  const tasks = tasksQuery.data?.data ?? [];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content className="glass-panel glass-float fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[min(94vw,44rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl p-6 outline-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate text-xl font-semibold">
                {project.name}
              </DialogPrimitive.Title>
              {project.description ? (
                <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
                  {project.description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  Project progress and tasks.
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm">
                Close
              </Button>
            </DialogPrimitive.Close>
          </div>

          {stats ? (
            <div className="mt-5">
              <div className="text-primary flex items-baseline text-[48px] leading-none font-bold tracking-tight tabular-nums">
                {stats.percentComplete}
                <span className="ml-1 text-[22px] font-semibold opacity-70">%</span>
              </div>
              <p className="text-muted-foreground mt-2 text-sm">
                {stats.byStatus.done} of {stats.total} tasks done
                {stats.blockedCount > 0 ? ` · ${stats.blockedCount} blocked` : ""}
              </p>
              <div className="bg-primary/15 mt-4 h-4 w-full overflow-hidden rounded-full">
                <div
                  className="bg-accent h-full rounded-full transition-[width]"
                  style={{ width: `${stats.percentComplete}%` }}
                />
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4">
                {(
                  [
                    ["To do", stats.byStatus.todo],
                    ["In progress", stats.byStatus.in_progress],
                    ["Done", stats.byStatus.done],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground text-xs">{label}</dt>
                    <dd className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : statsQuery.isPending ? (
            <p className="text-muted-foreground mt-5 text-sm">Loading metrics…</p>
          ) : statsQuery.isError ? (
            <p role="alert" className="text-destructive mt-5 text-sm">
              {errorMessage(statsQuery.error)}
            </p>
          ) : null}

          <div className="mt-6 flex items-center justify-between">
            <h3 className="font-semibold">Tasks</h3>
            {isPm ? (
              <Button size="sm" variant="outline" onClick={() => setShowAdd((value) => !value)}>
                {showAdd ? "Hide form" : "Add task"}
              </Button>
            ) : null}
          </div>

          {showAdd && isPm ? (
            <div className="mt-3">
              <CreateTaskForm lockedProjectId={project.id} onCreated={() => setShowAdd(false)} />
            </div>
          ) : null}

          {tasksQuery.isPending ? (
            <p className="text-muted-foreground mt-3 text-sm">Loading tasks…</p>
          ) : null}
          {tasksQuery.isError ? (
            <p role="alert" className="text-destructive mt-3 text-sm">
              {errorMessage(tasksQuery.error)}
            </p>
          ) : null}
          {!tasksQuery.isPending && tasks.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">No tasks in this project yet.</p>
          ) : null}
          <ul className="divide-border mt-2 divide-y">
            {tasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <span className="font-medium">{task.title}</span>
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                {task.blocked ? <BlockedBadge /> : null}
                {task.deadlineDate ? (
                  <span className="text-muted-foreground text-xs">
                    Due {task.deadlineDate}
                    {task.deadlineTime ? ` ${task.deadlineTime}` : ""}
                  </span>
                ) : null}
                {task.assignee ? (
                  <span className="text-muted-foreground ml-auto text-sm">
                    {task.assignee.name}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
