import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { z, ZodError } from "zod";

import { AppError, type ErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { health } from "@/routes/health";
import { projects } from "@/routes/projects";
import { tasks } from "@/routes/tasks";

/**
 * Build the Hono application.
 *
 * Exported separately from `index.ts` so tests can mount the app without
 * binding a port.
 */
export function createApp() {
  const app = new Hono();

  app.use("*", logger());
  app.use("*", prettyJSON());
  app.use(
    "/api/*",
    cors({
      origin: env().CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    }),
  );

  app.route("/api/health", health);
  app.route("/api/tasks", tasks);
  app.route("/api/projects", projects);

  app.notFound((c) => {
    const body: ErrorBody = {
      error: { code: "NOT_FOUND", message: `No route for ${c.req.method} ${c.req.path}` },
    };
    return c.json(body, 404);
  });

  // Single place where every thrown error becomes the frontend's error envelope.
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(err.toBody(), err.status);
    }

    if (err instanceof HTTPException) {
      return c.json(
        { error: { code: "HTTP_ERROR", message: err.message } } satisfies ErrorBody,
        err.status,
      );
    }

    if (err instanceof ZodError) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: z.flattenError(err),
          },
        } satisfies ErrorBody,
        400,
      );
    }

    console.error("Unhandled error:", err);
    return c.json(
      {
        error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
      } satisfies ErrorBody,
      500,
    );
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
