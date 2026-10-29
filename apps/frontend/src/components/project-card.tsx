"use client";

import { useProjectStats } from "@/hooks/use-tasks";
import type { Project } from "@/lib/schemas";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  project: Project;
  selected: boolean;
  onSelect: () => void;
}

/** One project: its own glass card with a live progress bar and status counts. */
export function ProjectCard({ project, selected, onSelect }: ProjectCardProps) {
  const statsQuery = useProjectStats(project.id);
  const stats = statsQuery.data;

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`View details for ${project.name}`}
      onClick={onSelect}
      className={cn(
        "glass glass-lift w-full cursor-pointer rounded-xl p-5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{project.name}</div>
          {project.description ? (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{project.description}</p>
          ) : null}
        </div>
        {stats ? (
          <span className="text-primary shrink-0 text-lg font-bold tabular-nums">
            {stats.percentComplete}%
          </span>
        ) : statsQuery.isPending ? (
          <span className="text-muted-foreground shrink-0 text-sm">…</span>
        ) : null}
      </div>

      <div className="bg-primary/15 mt-4 h-2 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width]"
          style={{ width: `${stats?.percentComplete ?? 0}%` }}
        />
      </div>

      <dl className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <div className="flex items-baseline gap-1">
          <dt>To do</dt>
          <dd className="text-foreground font-semibold tabular-nums">
            {stats?.byStatus.todo ?? "–"}
          </dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt>In progress</dt>
          <dd className="text-foreground font-semibold tabular-nums">
            {stats?.byStatus.in_progress ?? "–"}
          </dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt>Done</dt>
          <dd className="text-foreground font-semibold tabular-nums">
            {stats?.byStatus.done ?? "–"}
          </dd>
        </div>
        {stats && stats.blockedCount > 0 ? (
          <div className="flex items-baseline gap-1">
            <dt>Blocked</dt>
            <dd className="text-destructive font-semibold tabular-nums">{stats.blockedCount}</dd>
          </div>
        ) : null}
      </dl>
    </button>
  );
}
