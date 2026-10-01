# AGENTS.md

Instructions for AI agents collaborating on **Project Sovereign**.

This file is the shared source of truth for how to work in this repository.
Read it in full before making changes. If a rule here conflicts with an
instruction you were given directly by a human, **the human wins** — but say so
explicitly in your final report so this doc can be corrected.

---

## 1. What this repository is

A **Bun monorepo** with two applications in **one git repository**:

| Path             | Package name                 | Role                                  |
| ---------------- | ---------------------------- | ------------------------------------- |
| `apps/frontend/` | `@project-sovereign/frontend` | Next.js web client                    |
| `apps/backend/`  | `@project-sovereign/backend`  | Hono API server + Prisma data layer   |

Do not run `git init` inside `apps/*`, and do not add nested `.git` directories.
The Bun workspace and its single `bun.lock` are the source of truth for
dependency resolution.

## 2. Toolchain

- **Runtime, package manager, test runner, bundler: Bun** (`bun@1.4.2`).
- **Node.js** `>=20` declared as an engine floor only — nothing runs on Node directly.
- **TypeScript** strict mode everywhere, `--noEmit`.

### Frontend stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 ·
shadcn/ui on the **Radix** base (`radix-nova`) · TanStack Query 5 · Axios ·
Zustand 5 · React Hook Form + Zod · Biome 2.

### Backend stack

Bun runtime · Hono 4 · Prisma **7.10.0** (driver-adapter) · PostgreSQL ·
`@nodewave/prisma-ezfilter` · Zod 4.

### TypeScript configuration

Both apps `extends` the root **`tsconfig.base.json`**, which owns the shared
policy: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`,
`moduleResolution: bundler`, `moduleDetection: force`, `noEmit`, `skipLibCheck`,
`esModuleInterop`, `resolveJsonModule`, `forceConsistentCasingInFileNames`, and
`allowImportingTsExtensions` (legal only because `noEmit` is set).

**Add a compiler flag to `tsconfig.base.json`, not to one app** — that is the
point of the shared base. Then re-run `bun run typecheck`; both apps pick it up
on the next pass.

#### What each app must override

`extends` replaces keys rather than merging them, so anything the base does not
declare has to be re-stated per app.

Frontend — all four are **required**:

- `lib: ["dom", "dom.iterable", "esnext"]` — the base declares `lib: ["ESNext"]`
  with **no DOM**. Omitting the override compiles cleanly until someone touches
  a browser global, then fails with `TS2584: Cannot find name 'document'` and
  friends. This is the single most important override; do not "clean it up".
- `jsx: "react-jsx"` — without it every `.tsx` file fails with
  `TS17004: Cannot use JSX unless the '--jsx' flag is provided`.
- `plugins: [{ "name": "next" }]` — Next's IDE plugin (route and segment-config
  validation, `'use client'` checks). Omitting it is silent, not fatal.
- `include: [".next/types/**/*.ts"]` — the generated `PageProps` / `LayoutProps`
  / `RouteContext` globals, and `typedRoutes` when enabled.

Backend — `types: ["bun"]` (keeps Bun's globals; without it, `process` and
friends come from the wrong place).

`paths` resolves relative to the file that declares it, so the frontend keeps
its own `@/*` mapping. If you ever move `paths` into the base, it will resolve
against the repo root and silently break every alias.

Next.js may rewrite `apps/frontend/tsconfig.json` during `next build` to
normalise it. It only ever touches the child config — never the base.

### Repo-root-only tooling

Biome is frontend-scoped (`apps/frontend/biome.json`). **Husky and Commitlint
live at the repo root** because git hooks are a repository-level concern and
there is only one git repo. Commitlint is enforced through `.husky/commit-msg`.

## 3. Hard rules

- Use `bun` for everything. Never `npm install`, `yarn`, or `pnpm`. Never hand-edit
  `bun.lock`.
- **Never `bunx prisma`.** `prisma@latest` is an 8.x release candidate; `bunx`
  will fetch it and pair an RC CLI with the pinned 7.10.0 client. Always use the
  workspace scripts (`bun run --cwd apps/backend db:generate`) or the local
  binary (`./node_modules/.bin/prisma`) from `apps/backend`.
- Shared dependencies go in the **root** `package.json` (currently `zod`, used by
  both apps). App-specific dependencies go in that app's `package.json`. Do not
  declare the same package in two places.
- Keep `"private": true` on every `package.json`.
- Do not upgrade Bun, Next.js, Prisma, or TypeScript without explicit instruction.

## 4. Commands

From the repo root:

```bash
bun install
bun run dev:frontend        # Next dev server :3000
bun run dev:backend         # Hono on Bun :3001 (watch mode)
bun run build               # both workspaces
bun run typecheck           # both workspaces
bun run lint                # frontend Biome
bun run test                # backend bun test
bun run db:up               # start local PostgreSQL in podman (idempotent)
bun run db:generate         # prisma generate
bun run db:migrate          # prisma migrate dev
bun run db:seed             # idempotent sample data
bun run db:reset            # drop + re-apply all migrations
```

In `apps/backend`: `bun run test`, `bun run db:push`, `bun run db:deploy`,
`bun run db:studio`. In `apps/frontend`: `bun run lint:fix`, `bun run format`.

Container stacks (see §12 — needs `podman-compose` on `PATH`):

```bash
export PATH="$HOME/.local/bin:$PATH"
podman-compose -f compose.dev.yaml up --build     # hot-reload dev stack
podman-compose -f compose.yaml up --build         # prod-image stack
podman-compose -f compose.dev.yaml logs -f backend
podman-compose -f compose.dev.yaml down -v
```

Do not leave either stack running when you finish a task. If you started
`project-sovereign-postgres` for local work, leave it running for the human;
if you used the compose stack, tear it down and free port 5432.

## 5. Backend: Prisma 7 specifics

Prisma 7 differs from 5/6 in ways that will break you if you assume otherwise:

- Config lives in **`prisma7.config.ts`**, not `package.json#prisma`. It imports
  `dotenv/config` so `.env` is loaded for CLI commands.
- The datasource block in `prisma/schema.prisma` has **no `url` field**. The
  connection is supplied at runtime by a **driver adapter**
  (`@prisma/adapter-pg` wrapping `pg`) in `src/lib/prisma.ts`.
- The generator is **`prisma-client`** (ESM) and emits to `src/generated/prisma`,
  which is **gitignored**. Import from `@/generated/prisma/client`.
  After any schema change run `bun run db:generate`, or typecheck will fail
  against a stale client.
- `prisma init` vendors ~60 agent-support markdown files into
  `.agents/skills/` (plus `.claude/` and `.windsurf/` symlinks). These are
  gitignored on purpose. Do not commit them.
- The server **exits at boot if the database is unreachable**, so the
  health endpoint only responds when Postgres is actually up. See §11.
- Migrations live in `prisma/migrations/`. Prefer `bun run db:migrate` over
  `db:push`; `db:push` leaves state that makes the next `migrate dev` demand a
  full reset.

### prisma-ezfilter (`src/lib/paginate.ts`, `src/lib/validators.ts`)

`BuildQueryFilter` is model-agnostic and returns a loosely typed object. Two
things to know:

1. Its predicate is nested under **`{ AND: [ ... ] }`**, not a flat object. A
   filter may contain several sibling conditions, so read `raw.AND` as an array.
2. It has no knowledge of Prisma enums and emits plain strings.
   `buildTaskWhere()` is the seam that validates those strings and returns a
   `Prisma.TaskWhereInput`. **Never pass ezfilter output straight to Prisma.**

`buildTaskQuery` deliberately cherry-picks only `skip`, `take`, and `orderBy`
and rebuilds `orderBy` from an allow-list (`SORTABLE_FIELDS`). Never spread
`built.query` directly into `findMany` — it would smuggle in unvetted
`include`/`select` keys. The `COUNT` query must reuse the identical `where`
object or `meta.total` will disagree with the page.

## 6. Frontend: gotchas

- `components.json` uses style `radix-nova`. The registry has **no `form`
  component** in this style — `shadcn add form` silently does nothing. The
  RHF + Zod form in `src/components/create-task-form.tsx` is hand-written;
  copy that pattern rather than expecting `ui/form.tsx` to exist.
- shadcn v4 pulls in the unified `radix-ui` package and a `cn` util package.
  Do not add individual `@radix-ui/react-*`, `clsx`, or `tailwind-merge`
  dependencies; they are redundant and were removed.
- `next-env.d.ts` is gitignored and regenerated by Next. The `typecheck` script
  runs `next typegen && tsc --noEmit` precisely so a fresh clone type-checks
  without a prior build. Do not drop the `next typegen` step.
- Biome ignores `src/components/ui/**` so regenerating shadcn components does
  not create formatting churn. Do not "fix" that by formatting generated files.
- Zod 4 removed `.flatten()`; use `z.flattenError(err)`.

## 7. The API contract is duplicated on purpose

`apps/backend/src/lib/schemas.ts` is the server's source of truth.
`apps/frontend/src/lib/schemas.ts` mirrors it so the client can validate before
sending. **They are separate copies, not a shared package** — change them
together in the same commit, or the client will accept payloads the server
rejects. If the contract grows beyond a handful of schemas, promote it to a
`packages/shared` workspace rather than widening the duplication.

Server responses always use the envelope `{ data, meta }` for lists and
`{ error: { code, message, details? } }` for failures. `src/lib/validate.ts`
wraps `zValidator` so every 400 matches that shape; use it instead of calling
`zValidator` directly.

## 8. Conventions

- **ESM everywhere** (`"type": "module"`). No `require()` / `module.exports`.
- **Formatting** (Biome): 2-space indent, double quotes, semicolons, trailing
  commas, 100-char lines. Run `bun run lint:fix` before declaring done.
- **Naming:** `kebab-case` files and directories, `PascalCase` types,
  `camelCase` functions and variables.
- **`verbatimModuleSyntax` is on** in both apps: type-only imports must use
  `import type`.
- **`noUncheckedIndexedAccess` is on** in both apps (inherited from the base):
  `arr[0]` is `T | undefined`. Narrow it.
- **Client state:** server data goes to TanStack Query. Zustand holds only
  ephemeral UI state. Do not mirror API responses into a store.
- **Validation:** Zod on both sides. The client validates for fast feedback; the
  server re-validates because a client check is never a security boundary.
- **Environment:** read config through `src/lib/env.ts` (backend) or
  `src/lib/env.ts` (frontend). Never read `process.env` ad hoc, and never
  commit `.env` — `.env.example` is the tracked template.
- **Comments** explain *why*, not *what*.

## 9. Git workflow

- **Branch:** `master` is the default and integration branch.
- **Upstream remote:** `git@github.com:BillyAddlers/project-sovereign.git`
- Push to `master` only when explicitly asked; otherwise branch
  `<type>/<short-description>`.
- **Conventional Commits** are enforced by commitlint via `.husky/commit-msg`.
  Valid types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`,
  `revert`, `style`, `test`.
- `.husky/pre-commit` runs Biome over **staged frontend files only**. If it
  blocks you, run `bun run --cwd apps/frontend lint:fix`.
- Do not amend, rebase, or force-push commits that are already pushed. Do not
  commit build output, `node_modules/`, `.env`, or `src/generated/`.
- Do not push unless explicitly asked in this session.

## 10. Definition of done

1. `bun run typecheck` — zero errors.
2. `bun run lint` — clean.
3. `bun run test` — passes (backend `bun test`; there is no frontend test
   runner configured, so do not claim frontend tests passed).
4. `bun run build` — succeeds.
5. `git status` shows only intended files.
6. Schema/doc changes reflected in this file and the relevant README.
7. If a Dockerfile or compose file changed: the stack was brought up on a
   **fresh volume** and the API was exercised (see §12), not merely built.

## 11. Local database

PostgreSQL runs in a **podman** container: `project-sovereign-postgres`,
published on `127.0.0.1:5432`, credentials `admin` / `password`, database
`project_sovereign`. Start it with `bun run db:up` (idempotent) rather than
`podman run` by hand — the container needs **both** `POSTGRES_DB` (or the
database does not exist) **and** a `-p 127.0.0.1:5432:5432` host mapping (or
nothing on the host can reach it). There is no `psql` on this machine; use
`podman exec project-sovereign-postgres psql -U admin -d project_sovereign`.

A container that is `Up` but unreachable produces `Database unreachable at
startup`, because the backend deliberately exits when Postgres is not reachable.

Migrations are the source of truth — use `bun run db:migrate`. `bun run db:push`
will make Prisma demand a schema reset on the next `migrate dev`, because it
leaves the database in a state no migration accounts for.

## 12. Containers

Two podman stacks exist, both rooted at the repo. They are **alternatives** —
they bind the same ports (5432, 3001, 3000), so only one can run at a time.
Neither is used by `bun run dev:*`.

| File                 | Build                        | Watches source | Use it to                        |
| -------------------- | ---------------------------- | -------------- | -------------------------------- |
| `compose.dev.yaml`   | `target: dev` in both Dockerfiles | yes       | day-to-day work and hot reload   |
| `compose.yaml`       | default (prod) targets       | no             | prove a build works, fresh-volume migration runs |

```bash
podman-compose -f compose.dev.yaml up --build
podman-compose -f compose.dev.yaml down        # keep the volume
podman-compose -f compose.dev.yaml down -v     # delete the volume
```

Run them with **`podman-compose`**, not `podman compose`. On this machine
`podman compose` delegates to `/usr/local/bin/docker-compose`, which needs a
Docker socket that does not exist. `podman-compose` (v1.6.0) came from
`uv tool install podman-compose`, so it lives in `~/.local/bin`, which is not on
`PATH` by default:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### Traps, all of which have already bitten this repo

- **Never bind-mount `node_modules`.** The host tree was installed for the host
  platform and Bun's store layout; it would shadow the image's own copy and
  produce unexplainable module-resolution failures. `compose.dev.yaml` uses
  *anonymous volumes* at each `node_modules` path instead — podman seeds them
  from the image, so the container's dependencies stay visible while source is
  bind-mounted. Do not "simplify" these into bind mounts.
- **A Dockerfile stage inherits nothing.** Each `FROM` starts clean, so a `dev`
  stage does **not** inherit the `ENTRYPOINT` from the `runtime` stage. The
  backend's `dev` target re-declares `ENTRYPOINT ["./scripts/docker-entrypoint.sh"]`
  deliberately: without it no migrations run, and a fresh volume fails at
  runtime with Prisma `P2021 TableDoesNotExist` even though `/api/health`
  answers 200 (it only checks connectivity, not schema).
- **`podman-compose up -d` does not always recreate a container after an image
  rebuild.** It reused a stale container with the previous entrypoint and the fix
  appeared not to work. Use `--force-recreate` after changing a Dockerfile.
- **Fully-qualified image names only.** Podman rejects short names, so the
  Dockerfiles pin `docker.io/oven/bun:1.4.2-alpine` and
  `docker.io/library/postgres:18-alpine`. Anonymous Docker Hub pulls are mostly
  denied on this machine.
- **Build context is the repo root, for both apps.** It is a Bun workspace with
  one lockfile; installing from `apps/*` alone would create a second, divergent
  `node_modules`. Both Dockerfiles must also copy `tsconfig.base.json`, because
  both apps extend it and `prisma generate` / `next build` fail without it.
- **`bun install --frozen-lockfile` without `--filter` on purpose.** A filtered
  install is smaller (448 MB vs 1.16 GB) but fragile: anything declared only at
  the repo root silently disappears, which is exactly how the frontend build
  broke on root-only `zod`. Correctness over size.
- **Dev containers run as root** so they can write to bind-mounted source. That
  is a testing convenience, not a hardened image. Do not reuse the `dev` targets
  for anything exposed to a network.
- **`src/generated` is gitignored**, so a fresh clone has no Prisma client. The
  dev backend runs `db:generate` before `bun run dev` for that reason. Keep it.
- **Port 5432 is contested** by `project-sovereign-postgres` (§11) and the
  compose `db` service. Stop one before starting the other:
  `podman stop project-sovereign-postgres`.
- Migrations apply on backend boot via `scripts/docker-entrypoint.sh`, which
  waits on `pg_isready` first and honours `SKIP_MIGRATIONS=1`. It is idempotent —
  a restart logs "No pending migrations to apply".
- `NEXT_PUBLIC_API_URL` is `http://localhost:3001` (the **host**-published
  port), because it is inlined into the client bundle for the browser. The
  backend reaches the database as `db:5432` (the compose service name) — the two
  are deliberately different hosts.

### What not to regress

If you change a Dockerfile or a compose file, re-verify the whole path, not just
that it builds: `up --build` on a **fresh volume** (`down -v` first), then
`GET /api/health` → 200, `POST /api/tasks` → 201, an invalid body → 400, and a
task created by `curl` visible in the rendered page. A backend that builds and
answers `/api/health` while its schema was never migrated looks perfectly
healthy from the outside.

## 13. Boundaries

- Do not add, remove, or rename a workspace without explicit instruction.
- Do not modify this file to make your own change look correct. If the doc is
  wrong, fix the doc *and* flag the correction in your report.
- If a request is ambiguous, ask one clarifying question, then proceed with the
  most reasonable interpretation.

## 14. Reporting back

State briefly: what changed and which app it belongs to · the exact commands you
ran and their real output · what you deliberately did **not** do · any open
question. **Never claim a command passed unless you actually ran it and saw it
pass.**
