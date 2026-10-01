"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { type ReactNode, useState } from "react";

import { ApiError } from "@/lib/api";

/**
 * One QueryClient per browser session.
 *
 * `useState` with an initialiser (rather than a module-level singleton) matters
 * here: a module-level client would be shared across server requests and leak
 * one user's cache into another's response.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Never retry a request the server actively rejected.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    // `attribute="class"` matches the `dark` custom variant in globals.css
    // (`&:is(.dark *)`). Without this provider, sonner's `useTheme()` returned a
    // stub and fell back to resolving the theme from `window.matchMedia`, a
    // server/client branch. ThemeProvider resolves it once, server-side.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
