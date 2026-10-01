import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@/lib/env";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * A single Prisma client per process, wired to PostgreSQL through the `pg`
 * driver adapter.
 *
 * Prisma 7 requires a driver adapter — there is no built-in Rust query engine
 * fallback, and this is what makes the client work under Bun.
 */
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env().DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env().NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

let client: PrismaClient | null = null;

/** Lazily instantiate the client so importing this module never needs a DB. */
export function prisma(): PrismaClient {
  client ??= createPrismaClient();
  return client;
}

/** Close the pool during graceful shutdown. */
export async function disconnect(): Promise<void> {
  await client?.$disconnect();
  client = null;
}
