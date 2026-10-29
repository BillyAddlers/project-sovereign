"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  BlockedBadge,
  ClientVisibleBadge,
  PriorityBadge,
  StatusBadge,
} from "@/components/task-badges";
import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { Button } from "@/components/ui/button";
import { useDeleteTask, useUpdateTask, useUploadAttachment } from "@/hooks/use-tasks";
import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import type { PublicUser, Task } from "@/lib/schemas";
import { cn } from "@/lib/utils";

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

const statusWord: Record<Task["status"], string> = {
  todo: "to do",
  in_progress: "in progress",
  done: "done",
};

/** Format a `YYYY-MM-DD` (+ optional `HH:MM`) deadline for display. */
function formatDeadline(date: string, time: string | null): string {
  const day = new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return time ? `${day} · ${time}` : day;
}

interface TaskCardProps {
  task: Task;
  role: "pm" | "engineer" | "client";
  userId: string;
  allTasks: Task[];
  engineers: PublicUser[];
  /** Shown as a chip so mixed-project ("All") views stay unambiguous. */
  projectName?: string;
  /** Lifts the dragged task to the board so its columns can accept the drop. */
  onDragStart?: (task: Task) => void;
  onDragEnd?: () => void;
}

export function TaskCard({
  task,
  role,
  userId,
  allTasks,
  engineers,
  projectName,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const attach = useUploadAttachment();
  const fileInput = useRef<HTMLInputElement>(null);

  const isPm = role === "pm";
  const assignedToMe = task.assigneeId === userId;
  const canAttach = isPm || (role === "engineer" && assignedToMe);
  const unfinishedDependencies = task.dependencies.filter(
    (dependency) => dependency.status !== "done",
  );
  // A deadline with no time is due end-of-day; overdue only once it has passed
  // and the task is not finished.
  const deadlineAt = task.deadlineDate
    ? new Date(`${task.deadlineDate}T${task.deadlineTime ?? "23:59"}:00`)
    : null;
  const overdue =
    deadlineAt !== null && task.status !== "done" && deadlineAt.getTime() < Date.now();

  // Start / Complete buttons (the keyboard-accessible path); a drag takes the
  // same forward step, and blocked work can't start.
  const canStart = task.status === "todo" && (isPm || (role === "engineer" && assignedToMe));
  const canComplete = task.status === "in_progress" && role === "engineer" && assignedToMe;
  const nextStatus: "in_progress" | "done" | null =
    canStart && !task.blocked ? "in_progress" : canComplete ? "done" : null;

  const transition = (status: "in_progress" | "done") => {
    update.mutate(
      { id: task.id, input: { status, expectedVersion: task.version } },
      {
        onSuccess: () => toast.success(status === "done" ? "Task completed" : "Task started"),
        onError: (error) => toast.error(message(error)),
      },
    );
  };

  return (
    <article
      className={cn(
        "glass-deep glass-lift space-y-4 rounded-xl p-5",
        nextStatus ? "cursor-grab active:cursor-grabbing" : "",
      )}
      draggable={Boolean(nextStatus)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart?.(task);
      }}
      onDragEnd={() => onDragEnd?.()}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base leading-snug font-semibold md:text-lg">{task.title}</h3>
        <StatusBadge status={task.status} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {projectName ? (
          <span className="text-muted-foreground inline-flex items-center rounded-full border border-white/50 bg-white/40 px-2.5 py-1 text-xs font-medium backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.05]">
            {projectName}
          </span>
        ) : null}
        <PriorityBadge priority={task.priority} />
        {task.blocked ? <BlockedBadge /> : null}
        {task.clientVisible && isPm ? <ClientVisibleBadge /> : null}
        {task.deadlineDate ? (
          <span
            className={
              overdue
                ? "bg-destructive/10 text-destructive inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                : "bg-accent/15 text-foreground inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
            }
          >
            {overdue ? "Overdue · " : "Due "}
            {formatDeadline(task.deadlineDate, task.deadlineTime)}
          </span>
        ) : null}
      </div>

      {task.description ? (
        <p className="text-muted-foreground line-clamp-3 text-sm">{task.description}</p>
      ) : null}

      {task.dependencies.length > 0 ? (
        <p
          className={
            task.blocked ? "text-destructive text-sm font-medium" : "text-muted-foreground text-sm"
          }
        >
          {task.blocked ? "Blocked by: " : "Prerequisites: "}
          {task.dependencies
            .map((dependency) => `${dependency.title} (${statusWord[dependency.status]})`)
            .join(", ")}
        </p>
      ) : null}

      <div className="text-muted-foreground flex items-center justify-between gap-2 text-sm">
        <span>{task.assignee ? task.assignee.name : "Unassigned"}</span>
        {task.attachments && task.attachments.length > 0 ? (
          <span>{task.attachments.length} file(s)</span>
        ) : null}
      </div>

      {task.attachments && task.attachments.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {task.attachments.map((attachment) => (
            <li key={attachment.id}>
              <a
                className="text-primary underline-offset-2 hover:underline"
                href={`${env.apiBaseUrl}${attachment.downloadUrl}`}
                target="_blank"
                rel="noreferrer"
              >
                {attachment.filename}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {role !== "client" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {canStart ? (
              <Button
                variant="outline"
                disabled={task.blocked || update.isPending}
                title={task.blocked ? "Complete the prerequisites first" : undefined}
                onClick={() => transition("in_progress")}
              >
                Start
              </Button>
            ) : null}
            {canComplete ? (
              <Button disabled={update.isPending} onClick={() => transition("done")}>
                Complete
              </Button>
            ) : null}

            {canAttach ? (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.txt,.csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    attach.mutate(
                      { taskId: task.id, file },
                      {
                        onSuccess: () => toast.success("Attachment uploaded"),
                        onError: (error) => toast.error(message(error)),
                      },
                    );
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                />
                <Button
                  variant="ghost"
                  disabled={attach.isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  {attach.isPending ? "Uploading…" : "Attach"}
                </Button>
              </>
            ) : null}

            {isPm ? (
              <>
                <Button variant="ghost" onClick={() => setEditing((value) => !value)}>
                  {editing ? "Close" : "Edit"}
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={remove.isPending}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              </>
            ) : null}
          </div>

          {task.blocked && unfinishedDependencies.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              Finish the prerequisites before this task can be started.
            </p>
          ) : null}
        </div>
      ) : null}

      {isPm ? (
        <TaskDetailDialog
          task={task}
          engineers={engineers}
          allTasks={allTasks}
          projectName={projectName}
          open={editing}
          onOpenChange={setEditing}
        />
      ) : null}

      {isPm ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete "${task.title}"?`}
          message="This removes the task from the board. This cannot be undone."
          confirmLabel="Delete"
          pending={remove.isPending}
          onConfirm={() =>
            remove.mutate(task.id, {
              onSuccess: () => {
                toast.success("Task deleted");
                setConfirmDelete(false);
              },
              onError: (error) => {
                toast.error(message(error));
                setConfirmDelete(false);
              },
            })
          }
        />
      ) : null}
    </article>
  );
}
