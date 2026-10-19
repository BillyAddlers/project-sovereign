import type { TaskPriority, TaskStatus } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const badgeBase = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium";

const statusStyles: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

const priorityStyles: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-accent/20 text-foreground",
  high: "bg-destructive/10 text-destructive",
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span className={cn(badgeBase, statusStyles[status], className)}>{statusLabels[status]}</span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <span className={cn(badgeBase, "capitalize", priorityStyles[priority], className)}>
      {priority}
    </span>
  );
}

export function BlockedBadge({ className }: { className?: string }) {
  return (
    <span className={cn(badgeBase, "bg-destructive/10 text-destructive", className)}>Blocked</span>
  );
}

export function ClientVisibleBadge({ className }: { className?: string }) {
  return (
    <span className={cn(badgeBase, "bg-accent/20 text-foreground", className)}>Client-visible</span>
  );
}
