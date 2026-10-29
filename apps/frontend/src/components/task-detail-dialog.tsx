"use client";

import { Dialog as DialogPrimitive } from "radix-ui";

import { BlockedBadge, ClientVisibleBadge, StatusBadge } from "@/components/task-badges";
import { TaskEditPanel } from "@/components/task-edit-panel";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import type { PublicUser, Task } from "@/lib/schemas";

interface TaskDetailDialogProps {
  task: Task;
  engineers: PublicUser[];
  allTasks: Task[];
  projectName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Big task modal: every detail of the task in one card, with a read-only summary
 * (status, badges, attachments) plus the full editable form.
 */
export function TaskDetailDialog({
  task,
  engineers,
  allTasks,
  projectName,
  open,
  onOpenChange,
}: TaskDetailDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content className="glass-panel glass-float fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[min(94vw,44rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl p-6 outline-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate text-xl font-semibold">
                {task.title}
              </DialogPrimitive.Title>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={task.status} />
                {task.blocked ? <BlockedBadge /> : null}
                {task.clientVisible ? <ClientVisibleBadge /> : null}
                {projectName ? (
                  <span className="text-muted-foreground inline-flex items-center rounded-full border border-white/50 bg-white/40 px-2.5 py-1 text-xs font-medium backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.05]">
                    {projectName}
                  </span>
                ) : null}
              </div>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm">
                Close
              </Button>
            </DialogPrimitive.Close>
          </div>

          {task.description ? (
            <p className="text-muted-foreground mt-4 text-sm">{task.description}</p>
          ) : null}

          {task.attachments && task.attachments.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">Attachments</h3>
              <ul className="mt-1 space-y-1 text-sm">
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
            </div>
          ) : null}

          <div className="mt-5 border-t border-border pt-5">
            <h3 className="mb-3 font-semibold">Edit task</h3>
            <TaskEditPanel
              task={task}
              engineers={engineers}
              allTasks={allTasks}
              onClose={() => onOpenChange(false)}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
