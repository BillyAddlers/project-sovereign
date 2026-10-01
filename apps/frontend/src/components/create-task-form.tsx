"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, post } from "@/lib/api";
import { type CreateTaskInput, createTaskSchema, type Task } from "@/lib/schemas";

// Zod's `.default()` means the *input* type has optional fields while the
// *output* type does not. React Hook Form needs the input type to register
// fields, and the output type for the submitted value.
type FormInput = z.input<typeof createTaskSchema>;
type FormOutput = z.output<typeof createTaskSchema>;

/**
 * React Hook Form bound to a Zod schema through `zodResolver`.
 *
 * The resolver is the single source of truth for validation: Zod runs on the
 * client for instant feedback and again on the server, so the rules cannot
 * drift apart.
 */
export function CreateTaskForm() {
  const queryClient = useQueryClient();
  const titleId = useId();
  const descriptionId = useId();
  const priorityId = useId();

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createTaskSchema),
    // `values` on the input keeps RHF in sync when the schema default changes.
    defaultValues: { title: "", description: "", priority: "medium" },
    mode: "onBlur",
  });

  const createTask = useMutation({
    mutationFn: (values: CreateTaskInput) => post<Task>("/tasks", values),
    onSuccess: () => {
      toast.success("Task created");
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Could not create the task.");
    },
  });

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={form.handleSubmit((values) => createTask.mutate(values))}
    >
      <div className="space-y-2">
        <Label htmlFor={titleId}>Title</Label>
        <Input
          id={titleId}
          placeholder="Ship the monorepo"
          aria-invalid={Boolean(form.formState.errors.title)}
          {...form.register("title")}
        />
        {form.formState.errors.title ? (
          <p role="alert" className="text-destructive text-sm">
            {form.formState.errors.title.message}
          </p>
        ) : null}
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

      <div className="space-y-2">
        <Label htmlFor={priorityId}>Priority</Label>
        <select
          id={priorityId}
          className="border-input h-8 w-full rounded-md border bg-transparent px-2 text-sm"
          {...form.register("priority")}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        {form.formState.errors.priority ? (
          <p role="alert" className="text-destructive text-sm">
            {form.formState.errors.priority.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={createTask.isPending}>
        {createTask.isPending ? "Creating…" : "Create task"}
      </Button>
    </form>
  );
}
