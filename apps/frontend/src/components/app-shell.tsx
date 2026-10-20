"use client";

import {
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useLogout, useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/board", label: "Task Board", icon: ListTodo },
] as const;

const roleLabel: Record<string, string> = {
  pm: "Project Manager",
  engineer: "Engineer",
  client: "Client",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user } = useSession();
  const logout = useLogout();
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const [mobileOpen, setMobileOpen] = useState(false);

  // The drawer is navigation, so every link closes it.
  const closeMobile = () => setMobileOpen(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const initials = user?.name
    ? user.name
        .split(/\s+/)
        .map((part) => part.charAt(0))
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  const signOut = () => logout.mutate(undefined, { onSettled: () => router.replace("/login") });

  return (
    <div className="min-h-screen">
      <button
        type="button"
        aria-label="Close navigation"
        aria-hidden={!mobileOpen}
        className={cn(
          "fixed inset-0 z-30 bg-black/40 transition-opacity duration-200 lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        aria-label="Main navigation"
        className={cn(
          "bg-card fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r transition-[width,translate] duration-200",
          collapsed ? "lg:w-16" : "lg:w-56",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center gap-2 border-b px-3",
            collapsed && "lg:justify-center lg:px-0",
          )}
        >
          <Link
            href="/"
            className={cn("flex min-w-0 flex-1 items-center gap-2", collapsed && "lg:hidden")}
            onClick={closeMobile}
          >
            <span className={cn("truncate font-semibold tracking-tight", collapsed && "lg:hidden")}>
              Project Sovereign
            </span>
          </Link>

          <button
            type="button"
            className="text-muted-foreground hover:text-foreground hidden shrink-0 rounded-md p-1 lg:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleSidebar}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>

          <button
            type="button"
            className="text-muted-foreground hover:text-foreground shrink-0 rounded-md p-1 lg:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                onClick={closeMobile}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                  collapsed && "lg:mx-auto lg:size-9 lg:justify-center lg:p-0",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div
          className={cn(
            "border-t p-2",
            collapsed && "lg:flex lg:flex-col lg:items-center lg:justify-center lg:gap-2 lg:p-1",
          )}
        >
          {user ? (
            <div
              className={cn(
                "mb-2 flex items-center gap-2.5 rounded-lg px-1.5 py-1.5",
                collapsed && "lg:mb-0 lg:justify-center lg:px-0 lg:py-0",
              )}
            >
              <span className="bg-accent/30 text-foreground grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold">
                {initials}
              </span>
              <div className={cn("min-w-0 text-sm", collapsed && "lg:hidden")}>
                <div className="truncate font-medium">{user.name}</div>
                <div className="text-muted-foreground truncate text-xs">
                  {roleLabel[user.role] ?? user.role}
                  {user.department ? ` · ${user.department}` : ""}
                </div>
              </div>
            </div>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("w-full justify-center gap-2", collapsed && "lg:size-8 lg:p-0")}
            disabled={logout.isPending}
            onClick={signOut}
            title={collapsed ? "Sign out" : undefined}
          >
            <LogOut className="size-4" />
            <span className={cn(collapsed && "lg:hidden")}>
              {logout.isPending ? "Signing out…" : "Sign out"}
            </span>
          </Button>
        </div>
      </aside>

      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200",
          collapsed ? "lg:pl-16" : "lg:pl-56",
        )}
      >
        <header className="bg-card/80 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-3 backdrop-blur lg:hidden">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground rounded-md p-1.5"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <span className="font-semibold tracking-tight">Project Sovereign</span>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
