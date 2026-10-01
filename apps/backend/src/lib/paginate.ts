import { BuildQueryFilter } from "@nodewave/prisma-ezfilter";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";

/** Query string schema for the paginated list endpoints. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  rows: z.coerce.number().int().positive().max(100).default(20),
  orderKey: z.string().min(1).default("createdAt"),
  orderRule: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().trim().min(1).optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

/** The slice of a Prisma `findMany` call this codebase is willing to forward. */
export interface FindManyPlan {
  skip: number;
  take: number;
  orderBy: Prisma.TaskOrderByWithRelationInput;
}

export interface QueryPlan {
  query: FindManyPlan;
  /** Raw predicate ezfilter built; run it through `buildTaskWhere` before use. */
  where: Record<string, unknown>;
  validation: { isValid: boolean; errors: unknown[]; warnings: unknown[] };
}

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    rows: number;
    total: number;
    pageCount: number;
  };
}

/** Fields that clients may sort by — user input is never passed to orderBy raw. */
const SORTABLE_FIELDS = ["createdAt", "updatedAt", "title", "status", "priority"] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

function resolveSortField(candidate: string): SortableField {
  return (SORTABLE_FIELDS as readonly string[]).includes(candidate)
    ? (candidate as SortableField)
    : "createdAt";
}

/**
 * Translate validated query params into the shape `@nodewave/prisma-ezfilter`
 * expects, then run its builder.
 *
 * ezfilter produces a loosely typed, model-agnostic object. Rather than
 * spreading it straight into `findMany` (which would smuggle in `include` and
 * `select` we never vetted), we cherry-pick the three keys we trust and derive
 * a fully typed `TaskOrderByWithRelationInput`.
 */
export function buildTaskQuery(input: PaginationInput): QueryPlan {
  const orderKey = resolveSortField(input.orderKey);

  const builder = new BuildQueryFilter({ maxPageSize: 100, defaultPageSize: 20 });

  const built = builder.build({
    page: input.page,
    rows: input.rows,
    orderKey,
    orderRule: input.orderRule,
    filters: input.status ? { status: input.status } : undefined,
    searchFilters: input.search ? { title: input.search } : undefined,
  });

  const raw = built.query as { skip?: unknown; take?: unknown };

  return {
    query: {
      skip: typeof raw.skip === "number" ? raw.skip : (input.page - 1) * input.rows,
      take: typeof raw.take === "number" ? raw.take : input.rows,
      orderBy: { [orderKey]: input.orderRule },
    },
    where: (built.query.where ?? {}) as Record<string, unknown>,
    validation: {
      isValid: built.validation.isValid,
      errors: [...built.validation.errors],
      warnings: [...built.validation.warnings],
    },
  };
}

/** Assemble the `{ data, meta }` envelope the frontend parses. */
export function paginate<T>(data: T[], total: number, input: PaginationInput): Paginated<T> {
  return {
    data,
    meta: {
      page: input.page,
      rows: input.rows,
      total,
      pageCount: Math.max(1, Math.ceil(total / input.rows)),
    },
  };
}
