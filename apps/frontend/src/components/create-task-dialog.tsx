"use client";

import { Dialog as DialogPrimitive } from "radix-ui";

import { CreateTaskForm } from "@/components/create-task-form";
import { Button } from "@/components/ui/button";

interface CreateTaskDialogProps {
  defaultProjectId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Screen-centered modal wrapping the PM create-task form. */
export function CreateTaskDialog({ defaultProjectId, open, onOpenChange }: CreateTaskDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content className="glass-panel glass-float fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[min(94vw,40rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl p-6 outline-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-xl font-semibold">
                New task
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
                Only a PM plans work and assigns an executor.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm">
                Close
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="mt-5">
            <CreateTaskForm
              defaultProjectId={defaultProjectId}
              onCreated={() => onOpenChange(false)}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
