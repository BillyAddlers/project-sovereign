import { z } from "zod";

/**
 * Server configuration, validated once at startup.
 *
 * Failing fast here is deliberate: a missing DATABASE_URL should crash the
 * process on boot rather than surface as a confusing 500 on the first request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((value) => value.startsWith("postgresql://"), {
      message: "DATABASE_URL must be a postgresql:// connection string",
    }),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  cached ??= envSchema.parse(process.env);
  return cached;
}
