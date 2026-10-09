"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { useSession } from "@/hooks/use-session";

/**
 * Client-side session gate.
 *
 * Renders its children only once `/api/auth/me` confirms a session; otherwise
 * it replaces the current entry with `/login`. A server-side guard is possible
 * in Fase 4 when per-role layouts arrive, but this keeps Fase 1 dependency-free
 * (no `jose`, no edge middleware).
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { data, isPending, isError } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isError) router.replace("/login");
  }, [isError, router]);

  if (isPending) {
    return (
      <div className="text-muted-foreground flex min-h-[60vh] items-center justify-center text-sm">
        Loading your session…
      </div>
    );
  }

  if (isError || !data) return null;

  return <>{children}</>;
}
