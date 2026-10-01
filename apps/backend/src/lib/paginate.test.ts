import { describe, expect, it } from "bun:test";

import { buildTaskQuery, paginate, paginationSchema } from "@/lib/paginate";
import { buildTaskWhere } from "@/lib/validators";
import { AppError } from "@/lib/errors";

function parse(query: Record<string, string>) {
  return paginationSchema.parse(query);
}

describe("buildTaskQuery", () => {
  it("derives skip from the page number", () => {
    const plan = buildTaskQuery(parse({ page: "3", rows: "10" }));
    expect(plan.query.skip).toBe(20);
    expect(plan.query.take).toBe(10);
  });

  it("falls back to createdAt for a column that is not sortable", () => {
    const plan = buildTaskQuery(parse({ orderKey: "passwordHash", orderRule: "asc" }));
    expect(plan.query.orderBy).toEqual({ createdAt: "asc" });
  });

  it("honours an allow-listed sort column", () => {
    const plan = buildTaskQuery(parse({ orderKey: "title", orderRule: "asc" }));
    expect(plan.query.orderBy).toEqual({ title: "asc" });
  });

  it("never emits an include or select key", () => {
    const plan = buildTaskQuery(parse({}));
    expect(plan.query).not.toHaveProperty("include");
    expect(plan.query).not.toHaveProperty("select");
  });
});

describe("buildTaskWhere", () => {
  it("returns an empty predicate when nothing is filtered", () => {
    expect(buildTaskWhere(buildTaskQuery(parse({})))).toEqual({});
  });

  it("maps the status filter to a Prisma enum filter", () => {
    const plan = buildTaskQuery(parse({ status: "done" }));
    expect(buildTaskWhere(plan)).toEqual({ status: { in: ["done"] } });
  });

  it("maps a search term to a case-insensitive contains", () => {
    const plan = buildTaskQuery(parse({ search: "deploy" }));
    const where = buildTaskWhere(plan);
    expect(where.title).toMatchObject({ contains: "deploy", mode: "insensitive" });
  });

  it("throws a 400 for a status that is not a real enum member", () => {
    // Bypass paginationSchema to simulate a value reaching the builder unvalidated.
    const plan = { ...buildTaskQuery(parse({})), where: { status: "nonsense" } };
    expect(() => buildTaskWhere(plan)).toThrow(AppError);
  });
});

describe("paginate", () => {
  it("computes the page count from the total", () => {
    const result = paginate([1, 2, 3], 25, parse({ page: "1", rows: "10" }));
    expect(result.meta).toEqual({ page: 1, rows: 10, total: 25, pageCount: 3 });
  });

  it("never reports zero pages for an empty result set", () => {
    const result = paginate([], 0, parse({}));
    expect(result.meta.pageCount).toBe(1);
  });
});
