import { z } from "zod";

import { AppError } from "@/lib/errors";
import type { Prisma, TaskStatus } from "@/generated/prisma/client";
import type { QueryPlan } from "@/lib/paginate";

export { createTaskSchema, taskQuerySchema } from "@/lib/schemas";
export type { CreateTaskInput, TaskQuery } from "@/lib/schemas";

const STATUSES = ["todo", "in_progress", "done"] as const satisfies readonly TaskStatus[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalise the filter shapes ezfilter emits into a plain string list. */
function toStringList(value: unknown): string[] | null {
  const direct = z.union([z.string(), z.array(z.string())]).safeParse(value);
  if (direct.success) {
    return typeof direct.data === "string" ? [direct.data] : direct.data;
  }

  const wrapped = z
    .object({
      equals: z.union([z.string(), z.array(z.string())]).optional(),
      in: z.array(z.string()).optional(),
    })
    .safeParse(value);

  if (!wrapped.success) return null;

  const inner = wrapped.data.equals ?? wrapped.data.in;
  if (inner === undefined) return null;
  return typeof inner === "string" ? [inner] : inner;
}

const titleFilterSchema = z.union([
  z.object({ equals: z.string() }),
  z.object({ contains: z.string(), mode: z.string().optional() }),
  z.object({ in: z.array(z.string()) }),
]);

/** Map a title filter onto Prisma's StringFilter, preserving the search mode. */
function toTitleFilter(value: unknown): Prisma.StringFilter | undefined {
  if (typeof value === "string") return { equals: value };

  const parsed = titleFilterSchema.safeParse(value);
  if (!parsed.success) return undefined;

  const data = parsed.data;
  if ("contains" in data) {
    return { contains: data.contains, mode: "insensitive" };
  }
  if ("equals" in data) return { equals: data.equals };
  return { in: data.in };
}

function convertCondition(condition: Record<string, unknown>): Prisma.TaskWhereInput {
  const out: Prisma.TaskWhereInput = {};

  for (const [key, value] of Object.entries(condition)) {
    if (key === "status") {
      const requested = toStringList(value);
      if (requested === null) continue;

      const invalid = requested.filter((entry) => !STATUSES.includes(entry as TaskStatus));
      if (invalid.length > 0) {
        throw AppError.badRequest(`Unsupported status: ${invalid.join(", ")}`, {
          allowed: STATUSES,
        });
      }

      out.status = { in: requested as TaskStatus[] };
      continue;
    }

    if (key === "title") {
      const filter = toTitleFilter(value);
      if (filter) out.title = filter;
    }
  }

  return out;
}

/**
 * Convert the predicate produced by prisma-ezfilter into a Prisma
 * `TaskWhereInput`.
 *
 * ezfilter is model-agnostic: it emits plain strings, nests conditions under
 * `AND`, and has no knowledge of Prisma enums. This is the seam that turns
 * that into something the query engine accepts — an unrecognised `status`
 * becomes a 400 here rather than a database error.
 *
 * The same object is reused for the COUNT query, so `meta.total` can never
 * disagree with the rows on the page.
 */
export function buildTaskWhere(plan: QueryPlan): Prisma.TaskWhereInput {
  const raw = plan.where;
  const conditions = Array.isArray(raw["AND"]) ? (raw["AND"] as unknown[]) : [raw];

  const parts: Prisma.TaskWhereInput[] = [];
  for (const condition of conditions) {
    if (!isRecord(condition)) continue;
    const part = convertCondition(condition);
    if (Object.keys(part).length > 0) parts.push(part);
  }

  const first = parts[0];
  if (parts.length === 0) return {};
  if (parts.length === 1 && first) return first;
  return { AND: parts };
}
