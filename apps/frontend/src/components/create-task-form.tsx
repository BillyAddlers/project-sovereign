"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { DependencyPicker } from "@/components/dependency-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateTask, useEngineers, useProjects, useTasks } from "@/hooks/use-tasks";
import { ApiError } from "@/lib/api";
import { type CreateTaskInput, createTaskSchema, type Task } from "@/lib/schemas";

type FormInput = z.input<typeof createTaskSchema>;
type FormOutput = z.output<typeof createTaskSchema>;

/** PM-only create form. Engineers act on assigned work; they do not plan it. */
export function CreateTaskForm({
  defaultProjectId,
  onCreated,
}: {
  defaultProjectId?: string;
  onCreated?: () => void;
}) {
  const projectsQuery = useProjects();
  const engineersQuery = useEngineers(true);
  const createTask = useCreateTask();
  const titleId = useId();
  const descriptionId = useId();
  const projectIdId = useId();
  const assigneeIdId = useId();
  const priorityId = useId();
  const clientVisibleId = useId();

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      projectId: defaultProjectId ?? "",
      clientVisible: false,
      dependencyIds: [],
    },
    mode: "onBlur",
  });

  const projectId = form.watch("projectId");
  const projectTasksQuery = useTasks(
    {
      page: 1,
      rows: 100,
      orderKey: "createdAt",
      orderRule: "asc",
      projectId: projectId || undefined,
    },
    Boolean(projectId),
  );
  const dependencyIds = form.watch("dependencyIds") ?? [];
  const candidates = projectTasksQuery.data?.data ?? [];
  const selectedDependencies = dependencyIds
    .map((id) => candidates.find((task) => task.id === id))
    .filter((task): task is Task => Boolean(task));

  const submit = (values: CreateTaskInput) => {
    createTask.mutate(values, {
      onSuccess: () => {
        toast.success("Task created");
        form.reset();
        onCreated?.();
      },
      onError: (error) => {
        toast.error(error instanceof ApiError ? error.message : "Could not create the task.");
      },
    });
  };

  return (
    <form className="space-y-4" noValidate onSubmit={form.handleSubmit(submit)}>
      <div className="space-y-2">
        <Label htmlFor={titleId}>Title</Label>
        <Input
          id={titleId}
          placeholder="Ship the release candidate"
          aria-invalid={Boolean(form.formState.errors.title)}
          {...form.register("title")}
        />
        {form.formState.errors.title ? (
          <p role="alert" className="text-destructive text-sm">
            {form.formState.errors.title.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={projectIdId}>Project</Label>
          <select
            id={projectIdId}
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            disabled={projectsQuery.isPending}
            aria-invalid={Boolean(form.formState.errors.projectId)}
            {...form.register("projectId", {
              // Prerequisites must live in the same project — drop the selection.
              onChange: () => form.setValue("dependencyIds", []),
            })}
          >
            <option value="" disabled>
              {projectsQuery.isPending ? "Loading projects…" : "Select a project"}
            </option>
            {projectsQuery.data?.data.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {form.formState.errors.projectId ? (
            <p role="alert" className="text-destructive text-sm">
              {form.formState.errors.projectId.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={assigneeIdId}>Assignee</Label>
          <select
            id={assigneeIdId}
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            disabled={engineersQuery.isPending}
            {...form.register("assigneeId", {
              setValueAs: (value: string) => (value === "" ? undefined : value),
            })}
          >
            <option value="">Unassigned</option>
            {engineersQuery.data?.data.map((engineer) => (
              <option key={engineer.id} value={engineer.id}>
                {engineer.name}
                {engineer.department ? ` · ${engineer.department}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={priorityId}>Priority</Label>
          <select
            id={priorityId}
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            {...form.register("priority")}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="flex items-end pb-2">
          <label htmlFor={clientVisibleId} className="flex items-center gap-2 text-sm">
            <input
              id={clientVisibleId}
              type="checkbox"
              className="accent-primary size-4"
              {...form.register("clientVisible")}
            />
            Visible to the client
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={descriptionId}>Description</Label>
        <Textarea
          id={descriptionId}
          rows={3}
          placeholder="Optional details"
          aria-invalid={Boolean(form.formState.errors.description)}
          {...form.register("description")}
        />
        {form.formState.errors.description ? (
          <p role="alert" className="text-destructive text-sm">
            {form.formState.errors.description.message}
          </p>
        ) : null}
      </div>

      <DependencyPicker
        candidates={candidates}
        selected={selectedDependencies}
        onAdd={(id) =>
          form.setValue("dependencyIds", [...dependencyIds, id], { shouldValidate: true })
        }
        onRemove={(id) =>
          form.setValue(
            "dependencyIds",
            dependencyIds.filter((value) => value !== id),
            { shouldValidate: true },
          )
        }
        disabled={projectTasksQuery.isPending}
        hint="The new task starts blocked until these are done."
      />

      <Button type="submit" disabled={createTask.isPending}>
        {createTask.isPending ? "Creating…" : "Create task"}
      </Button>
    </form>
  );
}
