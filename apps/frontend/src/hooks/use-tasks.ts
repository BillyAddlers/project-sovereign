"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api";
import * as resources from "@/lib/resources";
import type { CreateTaskInput, TaskQuery, UpdateTaskInput } from "@/lib/schemas";

export const queryKeys = {
  tasks: (query: TaskQuery) => ["tasks", query] as const,
  task: (id: string) => ["task", id] as const,
  projects: ["projects"] as const,
  stats: (projectId: string) => ["project-stats", projectId] as const,
  engineers: ["engineers"] as const,
};

export function useTasks(query: TaskQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tasks(query),
    queryFn: () => resources.fetchTasks(query),
    enabled,
  });
}

export function useProjects() {
  return useQuery({ queryKey: queryKeys.projects, queryFn: resources.fetchProjects });
}

export function useProjectStats(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.stats(projectId ?? "none"),
    queryFn: () => resources.fetchProjectStats(projectId as string),
    enabled: Boolean(projectId),
  });
}

export function useEngineers(enabled = true) {
  return useQuery({
    queryKey: queryKeys.engineers,
    queryFn: resources.fetchEngineers,
    enabled,
    staleTime: 5 * 60_000,
  });
}

function useInvalidateTaskWork() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["task"] });
    void queryClient.invalidateQueries({ queryKey: ["project-stats"] });
  };
}

export function useCreateTask() {
  const invalidate = useInvalidateTaskWork();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => resources.createTask(input),
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateTaskWork();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      resources.updateTask(id, input),
    onSuccess: invalidate,
    // A version conflict means our copy is stale — refetch so the UI heals
    // itself rather than retrying a write that can never be accepted.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) invalidate();
    },
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateTaskWork();
  return useMutation({
    mutationFn: (id: string) => resources.deleteTask(id),
    onSuccess: invalidate,
  });
}

export function useAddDependency() {
  const invalidate = useInvalidateTaskWork();
  return useMutation({
    mutationFn: ({ taskId, dependsOnId }: { taskId: string; dependsOnId: string }) =>
      resources.addDependency(taskId, dependsOnId),
    onSuccess: invalidate,
  });
}

export function useRemoveDependency() {
  const invalidate = useInvalidateTaskWork();
  return useMutation({
    mutationFn: ({ taskId, dependsOnId }: { taskId: string; dependsOnId: string }) =>
      resources.removeDependency(taskId, dependsOnId),
    onSuccess: invalidate,
  });
}

export function useUploadAttachment() {
  const invalidate = useInvalidateTaskWork();
  return useMutation({
    mutationFn: ({ taskId, file }: { taskId: string; file: File }) =>
      resources.uploadAttachment(taskId, file),
    onSuccess: invalidate,
  });
}
