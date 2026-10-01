"use client";

import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, get } from "@/lib/api";
import { type TaskList, type TaskQuery, taskListSchema } from "@/lib/schemas";
import { useUiStore } from "@/store/ui-store";

/** Fetch a page of tasks straight from the backend through Axios. */
async function fetchTasks(query: TaskQuery): Promise<TaskList> {
  // The response is validated at runtime, so a backend contract change fails
  // loudly here instead of corrupting the UI with undefined fields.
  return taskListSchema.parse(await get<TaskList>("/tasks", query));
}

export function TaskListPanel() {
  const { filters } = useUiStore(useShallow((state) => ({ filters: state.filters })));

  const query: TaskQuery = {
    page: 1,
    rows: 20,
    orderKey: "createdAt",
    orderRule: "desc",
    ...(filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.search ? { search: filters.search } : {}),
  };

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["tasks", query],
    queryFn: () => fetchTasks(query),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tasks</CardTitle>
        <CardDescription>TanStack Query fetching over Axios, filtered by Zustand.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>

        {isPending ? <p className="text-muted-foreground text-sm">Loading tasks…</p> : null}

        {isError ? (
          <p role="alert" className="text-destructive text-sm">
            {error instanceof ApiError ? error.message : "Something went wrong."}
          </p>
        ) : null}

        {data ? (
          <>
            <ul className="space-y-2">
              {data.data.map((task) => (
                <li key={task.id} className="border-border rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{task.title}</span>
                    <span className="text-muted-foreground text-xs uppercase">{task.status}</span>
                  </div>
                  {task.description ? (
                    <p className="text-muted-foreground mt-1 text-sm">{task.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              Page {data.meta.page} of {data.meta.pageCount} · {data.meta.total} total
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
