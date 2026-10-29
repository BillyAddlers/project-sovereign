"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateProject } from "@/hooks/use-tasks";
import { ApiError } from "@/lib/api";
import { createProjectSchema } from "@/lib/schemas";

type FormInput = z.input<typeof createProjectSchema>;
type FormOutput = z.output<typeof createProjectSchema>;

/** PM-only project creation. Name is required; description is optional. */
export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const createProject = useCreateProject();

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: "", description: "" },
    mode: "onBlur",
  });

  const submit = (values: FormOutput) => {
    createProject.mutate(
      // An empty description should store as "unset", not an empty string.
      { ...values, description: values.description?.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Project created");
          form.reset();
          setOpen(false);
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not create the project."),
      },
    );
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button>New project</Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content className="glass-panel glass-float fixed top-1/2 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl p-6 outline-none">
          <DialogPrimitive.Title className="text-lg font-semibold">
            New project
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
            Give the project a name. You can add tasks and members afterwards.
          </DialogPrimitive.Description>

          <form className="mt-5 space-y-4" noValidate onSubmit={form.handleSubmit(submit)}>
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                placeholder="Mobile app revamp"
                aria-invalid={Boolean(form.formState.errors.name)}
                {...form.register("name")}
              />
              {form.formState.errors.name ? (
                <p role="alert" className="text-destructive text-sm">
                  {form.formState.errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                rows={3}
                placeholder="Optional context for the team"
                {...form.register("description")}
              />
            </div>

            {createProject.error ? (
              <p role="alert" className="text-destructive text-sm">
                {createProject.error instanceof ApiError
                  ? createProject.error.message
                  : "Could not create the project."}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button type="submit" disabled={createProject.isPending}>
                {createProject.isPending ? "Creating…" : "Create project"}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
