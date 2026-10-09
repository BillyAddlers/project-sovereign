"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authApi } from "@/lib/auth-api";
import type { LoginInput, RegisterInput } from "@/lib/schemas";

/** Single cache key for the current session, shared across the app. */
export const sessionQueryKey = ["session"] as const;

/**
 * The current session, or an error if the visitor is not authenticated.
 *
 * `retry: false` matters: a 401 is a definitive answer, not a transient
 * failure, so the guard can redirect immediately instead of retrying.
 */
export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: authApi.me,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (user) => {
      queryClient.setQueryData(sessionQueryKey, user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (user) => {
      queryClient.setQueryData(sessionQueryKey, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    // Drop every cached response for the previous user so nothing leaks into
    // the next session.
    onSettled: () => {
      queryClient.clear();
    },
  });
}
