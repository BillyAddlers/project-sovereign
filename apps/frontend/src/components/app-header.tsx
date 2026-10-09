"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useLogout, useSession } from "@/hooks/use-session";

/** Session-aware header: who is signed in, and the way out. */
export function AppHeader() {
  const { data: user } = useSession();
  const logout = useLogout();
  const router = useRouter();

  return (
    <header className="flex items-center justify-between gap-4 border-b pb-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Project Sovereign</h1>
        <p className="text-muted-foreground text-sm">
          {user ? (
            <>
              Signed in as <span className="text-foreground font-medium">{user.name}</span> (
              {user.role})
            </>
          ) : (
            "Frontend workspace."
          )}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={logout.isPending}
        onClick={() =>
          logout.mutate(undefined, {
            onSettled: () => router.replace("/login"),
          })
        }
      >
        {logout.isPending ? "Signing out…" : "Sign out"}
      </Button>
    </header>
  );
}
