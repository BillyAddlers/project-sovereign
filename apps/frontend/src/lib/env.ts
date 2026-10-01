/**
 * Runtime configuration for the browser bundle.
 *
 * Anything read here is inlined at build time by Next.js, so these values are
 * public by definition. Never put a secret in a `NEXT_PUBLIC_*` variable.
 */
export const env = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
} as const;

export type Env = typeof env;
