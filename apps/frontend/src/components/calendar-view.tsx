"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useTasks } from "@/hooks/use-tasks";
import type { Task } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Zero-padded `YYYY-MM-DD`, matching the `deadlineDate` wire format. */
function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function CalendarView() {
  const router = useRouter();
  const tasksQuery = useTasks(
    { page: 1, rows: 100, orderKey: "createdAt", orderRule: "desc" },
    true,
  );

  const today = new Date();
  const [view, setView] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));

  const tasks = tasksQuery.data?.data ?? [];
  const withDeadline = useMemo(() => tasks.filter((task) => task.deadlineDate), [tasks]);

  const byDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of withDeadline) {
      const key = task.deadlineDate as string;
      const existing = map.get(key);
      if (existing) existing.push(task);
      else map.set(key, [task]);
    }
    return map;
  }, [withDeadline]);

  const firstOfMonth = new Date(view.year, view.month, 1);
  const startWeekday = firstOfMonth.getDay();
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());
  // A fixed 6×7 grid keyed by real (possibly out-of-month) dates, so every cell
  // has a stable, unique key instead of an array index.
  const grid = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(view.year, view.month, index - startWeekday + 1);
    const key = iso(date.getFullYear(), date.getMonth(), date.getDate());
    return {
      key,
      day: date.getDate(),
      inMonth: date.getMonth() === view.month,
      isToday: key === todayIso,
    };
  });

  const monthLabel = firstOfMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const shift = (delta: number) => {
    setView((current) => {
      const d = new Date(current.year, current.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground text-sm">Task deadlines for the month.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous month"
            onClick={() => shift(-1)}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-36 text-center font-semibold">{monthLabel}</span>
          <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRightIcon />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView({ year: today.getFullYear(), month: today.getMonth() })}
          >
            Today
          </Button>
        </div>
      </div>

      {tasksQuery.isPending ? (
        <p className="text-muted-foreground text-sm">Loading tasks…</p>
      ) : null}
      {tasksQuery.isError ? (
        <p role="alert" className="text-destructive text-sm">
          Could not load tasks.
        </p>
      ) : null}

      {!tasksQuery.isPending && !tasksQuery.isError && withDeadline.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-12 text-center text-sm">
          No tasks have a deadline yet. Add one from a task card to see it here.
        </div>
      ) : null}

      {withDeadline.length > 0 || !tasksQuery.isPending ? (
        <div className="glass overflow-hidden rounded-xl">
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="text-muted-foreground border-b border-border px-2 py-2 text-center text-xs font-medium"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((cell) => {
              const dayTasks = cell.inMonth ? (byDate.get(cell.key) ?? []) : [];
              return (
                <div
                  key={cell.key}
                  className={cn(
                    "min-h-24 border-r border-t border-border/40 p-2 last:border-r-0",
                    cell.isToday && "bg-primary/5",
                  )}
                >
                  {cell.inMonth ? (
                    <>
                      <div
                        className={cn(
                          "text-xs font-semibold",
                          cell.isToday ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {cell.day}
                      </div>
                      <ul className="mt-1 space-y-1">
                        {dayTasks.map((task) => (
                          <li key={task.id}>
                            <button
                              type="button"
                              onClick={() => router.push("/board")}
                              title={`${task.title}${task.deadlineTime ? ` · ${task.deadlineTime}` : ""}`}
                              className="bg-primary/10 text-primary block w-full truncate rounded-md px-1.5 py-1 text-left text-xs hover:bg-primary/15"
                            >
                              {task.deadlineTime ? `${task.deadlineTime} ` : ""}
                              {task.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
