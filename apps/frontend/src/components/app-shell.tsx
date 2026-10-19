"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useLogout, useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Dashboard" },
  { href: "/board", label: "Task Board" },
];

const roleLabel: Record<string, string> = {
  pm: "Product Manager",
  engineer: "Engineer",
  client: "Client",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user } = useSession();
  const logout = useLogout();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card/80 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg text-xs font-bold">
                PS
              </span>
              Project Sovereign
            </Link>

            <nav className="flex items-center gap-1">
              {navigation.map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-[15px] font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="hidden text-right text-sm sm:block">
                <div className="font-medium">{user.name}</div>
                <div className="text-muted-foreground">
                  {roleLabel[user.role] ?? user.role}
                  {user.department ? ` · ${user.department}` : ""}
                </div>
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={logout.isPending}
              onClick={() =>
                logout.mutate(undefined, {
                  onSettled: () => router.replace("/login"),
                })
              }
            >
              {logout.isPending ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
