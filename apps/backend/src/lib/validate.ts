import { zValidator } from "@hono/zod-validator";
import type { z } from "zod";
import { z as zod } from "zod";

import type { ErrorBody } from "@/lib/errors";

/**
 * `zValidator` with the failure shape aligned to our error envelope.
 *
 * Without this, a schema failure would return Hono's default
 * `{ success: false, error }`, which the frontend's Axios interceptor cannot
 * parse — every 400 would surface as a generic message.
 */
export function validated<T extends z.ZodType>(target: "json" | "query" | "param", schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const body: ErrorBody = {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: zod.flattenError(result.error),
        },
      };
      return c.json(body, 400);
    }
  });
}
