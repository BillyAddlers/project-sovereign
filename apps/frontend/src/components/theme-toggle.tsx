"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Light/dark only. Reads `resolvedTheme` (always a concrete light/dark), so it
 * works whether the stored value is "system" or explicit; a click always sets the
 * opposite explicit mode, which means "system" is never a pickable state. Gated
 * behind `mounted` so server and first client render match (no hydration mismatch).
 */
export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const dark = mounted && resolvedTheme === "dark";
  const name = dark ? "Dark" : "Light";
  const target = dark ? "light" : "dark";
  const Icon = dark ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={() => setTheme(target)}
      aria-label={`Theme: ${name}. Switch to ${dark ? "Light" : "Dark"}.`}
      className={cn(
        "inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3",
        "text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        collapsed && "lg:w-11 lg:justify-center lg:px-0",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className={cn("text-sm font-medium", collapsed && "lg:hidden")}>{name}</span>
    </button>
  );
}
