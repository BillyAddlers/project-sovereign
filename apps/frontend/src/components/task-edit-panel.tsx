"use client";

import { useState } from "react";
import { toast } from "sonner";

import { DependencyPicker } from "@/components/dependency-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAddDependency, useRemoveDependency, useUpdateTask } from "@/hooks/use-tasks";
import { ApiError } from "@/lib/api";
import { type PublicUser, type Task, type TaskPriority, updateTaskSchema } from "@/lib/schemas";

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

interface TaskEditPanelProps {
  task: Task;
  engineers: PublicUser[];
  allTasks: Task[];
  onClose: () => void;
}

/** PM-only editor: descriptive fields, assignment, visibility, dependencies. */
export function TaskEditPanel({ task, engineers, allTasks, onClose }: TaskEditPanelProps) {
  const update = useUpdateTask();
  const addDependency = useAddDependency();
  const removeDependency = useRemoveDependency();

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? "");
  const [clientVisible, setClientVisible] = useState(task.clientVisible);

  const dependencyCandidates = allTasks.filter(
    (candidate) => candidate.projectId === task.projectId && candidate.id !== task.id,
  );

  const save = () => {
    const parsed = updateTaskSchema.safeParse({
      title: title.trim(),
      description: description.trim(),
      priority,
      assigneeId: assigneeId || null,
      clientVisible,
      expectedVersion: task.version,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    update.mutate(
      { id: task.id, input: parsed.data },
      {
        onSuccess: () => {
          toast.success("Task updated");
          onClose();
        },
        onError: (error) => toast.error(message(error)),
      },
    );
  };

  return (
    <div className="bg-muted/40 mt-3 space-y-4 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`title-${task.id}`}>Title</Label>
          <Input
            id={`title-${task.id}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`priority-${task.id}`}>Priority</Label>
          <select
            id={`priority-${task.id}`}
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            value={priority}
            onChange={(event) => setPriority(event.target.value as TaskPriority)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`assignee-${task.id}`}>Assignee</Label>
        <select
          id={`assignee-${task.id}`}
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
        >
          <option value="">Unassigned</option>
          {engineers.map((engineer) => (
            <option key={engineer.id} value={engineer.id}>
              {engineer.name}
              {engineer.department ? ` · ${engineer.department}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`description-${task.id}`}>Description</Label>
        <Textarea
          id={`description-${task.id}`}
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={clientVisible}
          onChange={(event) => setClientVisible(event.target.checked)}
        />
        Client-visible
      </label>

      <DependencyPicker
        candidates={dependencyCandidates}
        selected={task.dependencies}
        onAdd={(dependsOnId) =>
          addDependency.mutate(
            { taskId: task.id, dependsOnId },
            {
              onSuccess: () => toast.success("Dependency added"),
              onError: (error) => toast.error(message(error)),
            },
          )
        }
        onRemove={(dependsOnId) =>
          removeDependency.mutate(
            { taskId: task.id, dependsOnId },
            {
              onSuccess: () => toast.success("Dependency removed"),
              onError: (error) => toast.error(message(error)),
            },
          )
        }
        disabled={addDependency.isPending || removeDependency.isPending}
        hint="This task cannot start until these are done."
      />

      <div className="flex gap-2">
        <Button size="sm" disabled={update.isPending} onClick={save}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
