import { createApp } from "@/app";
import { env } from "@/lib/env";
import { disconnect, prisma } from "@/lib/prisma";

const app = createApp();

/**
 * Hono's `serve` is Bun's native server, so there is no @hono/node-server
 * adapter and no build step between editing and reloading.
 */
export default {
  port: env().PORT,
  fetch: app.fetch,
  // Drain in-flight requests, then close the Postgres pool.
  idleTimeout: 30,
};

/** Release the database pool and exit cleanly on SIGINT/SIGTERM. */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received — shutting down.`);
  await disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// Fail fast if the database is unreachable at boot.
prisma()
  .$queryRaw`SELECT 1`
  .then(() => console.log("Database connection OK"))
  .catch((error: unknown) => {
    console.error("Database unreachable at startup:", error);
    process.exit(1);
  });
