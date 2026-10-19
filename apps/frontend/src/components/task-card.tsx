"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  BlockedBadge,
  ClientVisibleBadge,
  PriorityBadge,
  StatusBadge,
} from "@/components/task-badges";
import { TaskEditPanel } from "@/components/task-edit-panel";
import { Button } from "@/components/ui/button";
import { useDeleteTask, useUpdateTask, useUploadAttachment } from "@/hooks/use-tasks";
import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import type { PublicUser, Task } from "@/lib/schemas";

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

interface TaskCardProps {
  task: Task;
  role: "pm" | "engineer" | "client";
  userId: string;
  allTasks: Task[];
  engineers: PublicUser[];
}

export function TaskCard({ task, role, userId, allTasks, engineers }: TaskCardProps) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const attach = useUploadAttachment();
  const fileInput = useRef<HTMLInputElement>(null);

  const isPm = role === "pm";
  const assignedToMe = task.assigneeId === userId;
  const canStart =
    task.status === "todo" && !task.blocked && (isPm || (role === "engineer" && assignedToMe));
  const canComplete = task.status === "in_progress" && role === "engineer" && assignedToMe;
  const canAttach = isPm || (role === "engineer" && assignedToMe);

  const transition = (status: "in_progress" | "done") => {
    update.mutate(
      { id: task.id, input: { status } },
      {
        onSuccess: () => toast.success(status === "done" ? "Task completed" : "Task started"),
        onError: (error) => toast.error(message(error)),
      },
    );
  };

  return (
    <article className="bg-card space-y-3 rounded-lg border p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm leading-snug font-semibold">{task.title}</h3>
        <StatusBadge status={task.status} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        {task.blocked ? <BlockedBadge /> : null}
        {task.clientVisible && isPm ? <ClientVisibleBadge /> : null}
      </div>

      {task.description ? (
        <p className="text-muted-foreground line-clamp-2 text-xs">{task.description}</p>
      ) : null}

      {task.dependencies.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          <span className="text-foreground font-medium">Waiting for:</span>{" "}
          {task.dependencies.map((dependency) => dependency.title).join(", ")}
        </p>
      ) : null}

      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span>{task.assignee ? task.assignee.name : "Unassigned"}</span>
        {task.attachments && task.attachments.length > 0 ? (
          <span>{task.attachments.length} file(s)</span>
        ) : null}
      </div>

      {task.attachments && task.attachments.length > 0 ? (
        <ul className="space-y-1 text-xs">
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
        <div className="flex flex-wrap items-center gap-2">
          {canStart ? (
            <Button
              size="sm"
              variant="outline"
              disabled={update.isPending}
              onClick={() => transition("in_progress")}
            >
              Start
            </Button>
          ) : null}
          {canComplete ? (
            <Button size="sm" disabled={update.isPending} onClick={() => transition("done")}>
              Complete
            </Button>
          ) : null}

          {canAttach ? (
            <>
              <input
                ref={fileInput}
                type="file"
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
                size="sm"
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
              <Button size="sm" variant="ghost" onClick={() => setEditing((value) => !value)}>
                {editing ? "Close" : "Edit"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (!window.confirm(`Delete "${task.title}"?`)) return;
                  remove.mutate(task.id, {
                    onSuccess: () => toast.success("Task deleted"),
                    onError: (error) => toast.error(message(error)),
                  });
                }}
              >
                Delete
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {editing && isPm ? (
        <TaskEditPanel
          task={task}
          engineers={engineers}
          allTasks={allTasks}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </article>
  );
}
