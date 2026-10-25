# AGENTS.md

Instructions for AI agents collaborating on **Project Sovereign**.

This file is the shared source of truth for how to work in this repository.
Read it in full before making changes. If a rule here conflicts with an
instruction you were given directly by a human, **the human wins** — but say so
explicitly in your final report so this doc can be corrected.

---

## 1. What this repository is

A **Bun monorepo** with two applications in **one git repository**:

| Path             | Package name                  | Role                                |
| ---------------- | ----------------------------- | ----------------------------------- |
| `apps/frontend/` | `@project-sovereign/frontend` | Next.js web client                  |
| `apps/backend/`  | `@project-sovereign/backend`  | Hono API server + Prisma data layer |

Do not run `git init` inside `apps/*`, and do not add nested `.git` directories.
The Bun workspace and its single `bun.lock` are the source of truth for
dependency resolution.

The product spec is [`docs/assessment-brief.md`](./assessment-brief.md) (a
readable transcription of `assessment-brief.docx`). Implementation decisions,
account list, and phase status live in [`TODO.md`](../TODO.md) — written in
Indonesian. As of this revision phases 0–4 are **done** (foundation, domain +
JWT auth, authorization, concurrency/audit, per-role UI); phase 5 (deployment)
and phase 6 (learning backlog) are open. Do not re-plan work that is already
implemented and tested.

Delivered surface: email/password auth, RBAC + ABAC, projects and membership,
tasks with status transitions and dependencies, client-visible masking,
attachments, optimistic locking, an append-only audit trail, and a per-role
dashboard/board UI.

## 2. Toolchain

- **Runtime, package manager, test runner, bundler: Bun** — pinned to `1.4.2`
  in `packageManager` and in both Dockerfiles. The host may have a newer Bun;
  that is not a reason to bump the pin.
- **Node.js** `>=20` declared as an engine floor only — nothing runs on Node directly.
- **TypeScript** strict mode everywhere, `--noEmit`.

### Frontend stack

Next.js 16.3 (App Router) · React 19.3 · TypeScript strict · Tailwind CSS 4 ·
shadcn/ui on the **Radix** base (`radix-nova`, `radix-ui` package) · TanStack
Query 5 · Axios 1.20 · Zustand 5 · React Hook Form 7 + Zod 4 · Biome 2.5.

### Backend stack

Bun runtime · Hono 4.13 · Prisma **7.10.0** (driver-adapter) · PostgreSQL ·
`@nodewave/prisma-ezfilter` 0.2 · Zod 4 · `jsonwebtoken` 9.

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

Frontend — all of these are **required**:

- `lib: ["dom", "dom.iterable", "esnext"]` — the base declares `lib: ["ESNext"]`
  with **no DOM**. Omitting the override compiles cleanly until someone touches
  a browser global, then fails with `TS2584: Cannot find name 'document'` and
  friends. This is the single most important override; do not "clean it up".
- `jsx: "react-jsx"` — without it every `.tsx` file fails with
  `TS17004: Cannot use JSX unless the '--jsx' flag is provided`.
- `plugins: [{ "name": "next" }]` — Next's IDE plugin (route and segment-config
  validation, `'use client'` checks). Omitting it is silent, not fatal.
- `include` — `next-env.d.ts`, `**/*.ts`, `**/*.tsx`, `**/*.mts`, and the
  generated `.next/types/**/*.ts` / `.next/dev/types/**/*.ts` (the `PageProps` /
  `LayoutProps` / `RouteContext` globals, and `typedRoutes` when enabled).
- `paths: { "@/*": ["./src/*"] }` — paths resolve relative to the file that
  declares them, so the frontend keeps its own `@/*` mapping. If you ever move
  `paths` into the base, it will resolve against the repo root and silently
  break every alias.
- `incremental: true` — enables the `.tsbuildinfo` cache.

Backend — `types: ["bun"]` (keeps Bun's globals; without it, `process` and
friends come from the wrong place) and its own `@/*` path mapping. It also
includes `prisma7.config.ts` and `prisma/**/*.ts` and excludes `src/generated`.

Next.js may rewrite `apps/frontend/tsconfig.json` during `next build` to
normalise it. It only ever touches the child config — never the base.

### Repo-root-only tooling

Biome is frontend-scoped (`apps/frontend/biome.json`). **Husky and Commitlint
live at the repo root** because git hooks are a repository-level concern and
there is only one git repo. Commitlint is enforced through `.husky/commit-msg`.

Biome config in force: 2-space indent, double quotes, semicolons, trailing
commas, 100-char lines, organize-imports enabled, `noExplicitAny: error`,
`useExhaustiveDependencies: warn`, and `src/components/ui/**` excluded so
regenerating shadcn components does not create formatting churn.

## 3. Hard rules

- Use `bun` for everything. Never `npm install`, `yarn`, or `pnpm`. Never hand-edit
  `bun.lock`.
- **Never `bunx prisma`.** `prisma@latest` resolves to a different major than
  the pinned 7.10.0; `bunx` would pair a mismatched CLI with the client.
  Always use the workspace scripts (`bun run --cwd apps/backend db:generate`)
  or the local binary (`./node_modules/.bin/prisma`) from `apps/backend`.
- Shared dependencies go in the **root** `package.json` (currently `zod`, used by
  both apps). App-specific dependencies go in that app's `package.json`. Do not
  declare the same package in two places.
- Keep `"private": true` on every `package.json`.
- Do not upgrade Bun, Next.js, Prisma, or TypeScript without explicit instruction.
- Prefer **Podman over Docker** for local work. Use the root scripts for the
  database (`bun run db:up`) and `podman-compose` for the full stacks — not
  `podman compose`, which delegates to an external provider that is not
  installed here.
- Never commit `.env`, `node_modules/`, build output, `src/generated/`,
  `apps/backend/uploads/`, or the vendored Prisma agent files.

## 4. Commands

From the repo root:

```bash
bun install
bun run dev:frontend        # Next dev server :3000
bun run dev:backend         # Hono on Bun :3001 (watch mode)
bun run build               # both workspaces
bun run typecheck           # frontend `next typegen && tsc --noEmit`, backend `tsc --noEmit`
bun run lint                # frontend Biome only (the backend has no lint script)
bun run test                # backend bun test only (see §11 — needs a migrated DB)
bun run db:up               # start local PostgreSQL in podman (idempotent)
bun run db:generate         # prisma generate
bun run db:migrate          # prisma migrate dev
bun run db:seed             # idempotent sample data + demo accounts
bun run db:reset            # drop + re-apply all migrations
bun run db:studio           # Prisma Studio
bun run clean               # remove .next and dist
```

`bun run lint` is `bun run --filter '*' lint`; the backend workspace has no
`lint` script, so only the frontend is checked. Do not claim the backend was
linted — its gate is `typecheck` plus `bun test`.

In `apps/backend`: `bun run test`, `bun run db:push`, `bun run db:deploy`,
`bun run db:studio`. In `apps/frontend`: `bun run lint:fix`, `bun run format`.

Container stacks (see §15 — needs `podman-compose` on `PATH`):

```bash
podman-compose -f compose.dev.yaml up --build     # hot-reload dev stack
podman-compose -f compose.yaml up --build         # prod-image stack
podman-compose -f compose.dev.yaml logs -f backend
podman-compose -f compose.dev.yaml down -v        # also deletes the volume
```

Do not leave either stack running when you finish a task. If you started
`project-sovereign-postgres` for local work, leave it running for the human;
if you used the compose stack, tear it down and free port 5432.

## 5. Backend layout

`src/index.ts` owns the process: it validates env, **pings PostgreSQL once and
exits non-zero if the database is unreachable**, serves via Bun's native Hono
adapter, and closes the Prisma pool on SIGINT/SIGTERM. `src/app.ts` exports
`createApp()` separately so tests can mount the app without binding a port.
Every route module is registered there under `/api/*`.

| Concern                 | Where                                              |
| ----------------------- | -------------------------------------------------- |
| Routes                  | `src/routes/{auth,tasks,projects,attachments,users,health}.ts` |
| Session middleware      | `src/middleware/auth.ts` (`requireAuth`)            |
| Hono env typing         | `src/types.ts` (`AppEnv`, sets `c.get("user")`)     |
| Error envelope          | `src/lib/errors.ts` (`AppError`)                    |
| Env schema              | `src/lib/env.ts`                                    |
| Prisma singleton        | `src/lib/prisma.ts` (driver adapter)                |
| Request validation      | `src/lib/validate.ts` (`validated`)                 |
| API contract            | `src/lib/schemas.ts`                                |
| Pagination + filters    | `src/lib/paginate.ts`, `src/lib/validators.ts`      |
| Authorization decisions | `src/lib/permissions.ts`                            |
| Row-level scoping       | `src/lib/scope.ts`                                  |
| Permission context load | `src/lib/access.ts` (`projectAccessFor`)            |
| Response masking        | `src/lib/serialize.ts`                              |
| Audit-row construction  | `src/lib/audit.ts`                                  |
| Passwords/JWT/cookies   | `src/lib/auth.ts`                                   |

Rules for adding an endpoint:

- Put it in the existing router for the resource; authenticated routers install
  `router.use("*", requireAuth)` once.
- Validate `json` / `query` / `param` with `validated(...)`; never call
  `zValidator` directly, or a 400 will not use the shared envelope.
- Throw `AppError` (or `AppError.badRequest(...)` etc.); `app.onError` is the
  only place that renders errors. Do not hand-build error JSON in a handler.
- Load the permission facts first (`projectAccessFor`), ask `permissions.ts`,
  then apply the query through `scope.ts`. Do not inline role `if`-chains.
- Serialize through `src/lib/serialize.ts`; do not return a raw Prisma row.
- A row outside the actor's scope is **404**, not 403 — do not confirm existence.

## 6. Auth and authorization

### Session

- Transport is an **httpOnly cookie named `ps_token`** (`SameSite=Lax`, `path=/`,
  `secure` only when `NODE_ENV=production`, 7-day max age). There is no bearer
  token and no client-readable storage.
- Tokens are JWTs signed with `JWT_SECRET` (schema requires ≥32 chars). Claims
  are `sub`, `role`, and optional `department`.
- `requireAuth` verifies the token **and** re-reads the user with
  `deletedAt: null`. A deleted user's otherwise-valid token stops working.
- Passwords are hashed with **argon2id** via `Bun.password`; there is no extra
  crypto dependency.
- Routes: `POST /api/auth/register` (open; engineers must supply a department),
  `POST /api/auth/login` (one generic failure message — no account
  enumeration), `POST /api/auth/logout` (clears the cookie only), `GET
  /api/auth/me`.
- Logout does **not** revoke the JWT; it stays cryptographically valid until it
  expires. There is no refresh token or denylist. Cross-site deployment
  (phase 5) will need `SameSite=None; Secure` and the frontend origin in
  `CORS_ORIGIN`.

### Authorization model

Role alone is never enough; the decision also depends on project relationship
and task state.

| Actor    | Reads                                                             | Writes                                                                                     |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| PM       | all live projects and tasks, audit trail, engineer directory      | create/edit/delete tasks and projects, assign, set `clientVisible`, define dependencies, manage members — but **cannot move any task into `done`** |
| Engineer | projects they are a member of; **only tasks assigned to them**   | status on a task assigned to them only, forward only (`todo → in_progress → done`); upload attachments to an assigned task |
| Client   | own project (`Project.clientId`), `clientVisible` tasks, stats    | nothing                                                                                    |

Additional invariants:

- Starting a task (`→ in_progress`) is refused while any live prerequisite is
  not `done`. `blocked` is derived from that on every response — there is no
  `blocked` enum value or column.
- PM cannot complete work; the assignee is the only actor who may enter `done`.
- `taskScope` in `src/lib/scope.ts` is the only source of row visibility
  (`pm`: all live; `engineer`: `assigneeId = actor.id`; `client`: own project **and**
  `clientVisible`). `projectScope` mirrors it. A missing scope is a bug, not a
  fallback — never write an unscoped query on a user-facing route.
- `canViewAttachment` denies clients entirely. On a task the client can see,
  the attachment **list** returns 403; attachment **download** returns 404 so a
  client cannot confirm existence.
- Client serialization strips `assignee`, `assigneeId`, `attachments`, hidden
  dependency titles, and on projects strips `clientId` and `members`. This
  masking is server-side; CSS hiding is not a boundary.
- Project deletion is a soft delete and is refused with `409 PROJECT_NOT_EMPTY`
  while live tasks remain (task scope does not join `project.deletedAt`, so
  hiding a populated project would leak its tasks).
- `GET /api/users` is PM-only and returns engineers only (assignee picker).
- Dependency rules: same project, no self-edge, no cycle (soft-deleted rows are
  excluded from the graph), duplicate edge → `409 DEPENDENCY_EXISTS`.
- `department` is display/picker data, **not** an authorization axis. The brief's
  cross-department rule is modelled as task dependencies; do not add
  department-based permission rules without a decision entry and tests.

## 7. Concurrency, audit, soft delete, attachments

### Optimistic locking

`PATCH /api/tasks/:id` **requires** `expectedVersion`. The write is a single
conditional `updateMany({ where: { id, deletedAt: null, version: expectedVersion },
data: { ...fields, version: { increment: 1 } } })` inside a transaction — a
read-then-write design was deliberately rejected (TOCTOU). Zero rows updated
means either the task vanished (→ 404) or someone else won (→ `409
VERSION_CONFLICT` with `expectedVersion` and `currentVersion` in `details`).
Never drop the version guard or perform the update in two statements.

### Audit trail

- `AuditLog` is **append-only**: there is no update or delete endpoint, and no
  route may mutate it.
- Rows are written in the same transaction as the mutation, so a rolled-back
  write leaves no trail and a committed write always has one.
- Tracked fields: `title`, `description`, `priority`, `assigneeId`,
  `clientVisible`, `projectId`, `status`. Updates log one row per genuinely
  changed field; create logs one row per tracked field present in the request
  (`oldValue: null`); delete logs one `deletedAt` row.
- Values are stored as text (`"true"`/`"false"`, enum wire values, ISO dates,
  `null` for unset). Dependency edges are relations, not tracked fields —
  they are not audited.
- Reading the trail is `GET /api/tasks/:id/audit`, PM-only.

### Soft delete

Task deletion writes `deletedAt` and increments `version`; it never removes the
row. Every read filters `deletedAt: null`, and soft-deleted prerequisites no
longer block dependents. Audit rows FK to the task, so a hard delete would
destroy history. Project deletion is also soft and is guarded as described in
§6.

### Attachments

- Multipart field name is **`file`**; size limit **10 MB**; empty files rejected.
- Stored on disk under `apps/backend/uploads/` with a UUID-prefixed, sanitized
  name. `Attachment.url` holds the server-side stored name and is never exposed;
  the API returns `/api/attachments/:id/download`.
- Metadata is in the database; `GET /api/attachments/:id/download` streams the
  file with a sanitized `Content-Disposition` after a permission check.
- `uploads/` is gitignored. Tests delete the files they create.

## 8. API contract, validation, pagination

`apps/backend/src/lib/schemas.ts` is the server's source of truth.
`apps/frontend/src/lib/schemas.ts` mirrors it so the client can validate before
sending. **They are separate copies, not a shared package** — change them
together in the same commit, or the client will accept payloads the server
rejects. The mirror currently covers tasks, projects, stats, auth, users,
attachments, dependencies, and audit entries. If the contract grows beyond a
handful of schemas, promote it to `packages/shared` rather than widening the
duplication (needs explicit approval — §16).

Responses:

- Lists: `{ data, meta: { page, rows, total, pageCount } }`.
- Everything else: the resource object, or `{ error: { code, message, details? } }`.
- Errors always use the envelope, including 400s. `src/lib/validate.ts` wraps
  `zValidator`; use it instead of calling `zValidator` directly.
- `AppError` supports 400/401/403/404/409/422/500 with stable codes such as
  `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
  `VERSION_CONFLICT`, `INVALID_FILTER`, `PROJECT_NOT_EMPTY`,
  `DEPENDENCY_EXISTS`, `EMAIL_TAKEN`.

Pagination (`GET /api/tasks`, `/api/projects`, `/api/users`):
`page`, `rows` (max 100), `orderKey`, `orderRule`, `search`, `status`,
`projectId`. `/api/users` accepts the shared schema but only uses
`page`/`rows`. Only `SORTABLE_FIELDS` (`createdAt`, `updatedAt`, `title`,
`status`, `priority`) may reach `orderBy`; unknown keys fall back to
`createdAt`. The `total` count must reuse the identical `where` object as the
page query.

`@nodewave/prisma-ezfilter` is model-agnostic: it nests its predicate under
`{ AND: [...] }`, emits plain strings, and knows nothing about Prisma enums.
`buildTaskWhere()` is the seam that validates those strings and returns a
typed `Prisma.TaskWhereInput`; an unusable filter becomes `422 INVALID_FILTER`,
and a query-string schema failure is `400 VALIDATION_ERROR` — never a raw
database error. `buildTaskQuery` deliberately cherry-picks only `skip`, `take`, and
`orderBy` — never spread `built.query` into `findMany`, and **never pass
ezfilter output straight to Prisma**.

Zod 4 notes:

- Use the Zod 4 top-level formats, e.g. `z.uuid()`.
- `error.flatten()` is deprecated; use `z.flattenError(err)`.
- `.partial()` retains `.default()`. That is why `updateTaskSchema` and
  `updateProjectSchema` list every field explicitly, with no defaults: a PATCH
  carrying `{ status }` must not silently also send `priority`/`clientVisible`.

The frontend parses resource responses at the boundary in
`src/lib/resources.ts` (tasks, projects, stats, users, attachments,
dependencies). Add a schema there rather than trusting an `as` cast; auth calls
in `src/lib/auth-api.ts` are typed wrappers over the shared schemas.

## 9. Frontend

Structure:

```
src/app/
├── layout.tsx              # fonts, Providers, Toaster
├── login/page.tsx          # RHF + Zod login, demo-account panel
└── (app)/
    ├── layout.tsx          # AuthGuard + AppShell, wraps every protected page
    ├── page.tsx            # DashboardView (stats + at-a-glance tasks)
    └── board/page.tsx      # TaskBoard (three columns, per-role actions)
```

- The session gate is **client-side** (`AuthGuard` + `useSession`, `retry:
  false`). There is no `middleware.ts` and no `jose`; a 401 replaces the route
  with `/login`. Do not describe this as a security boundary — the server
  re-checks every request.
- Server data lives in TanStack Query (`src/hooks/use-tasks.ts`,
  `use-session.ts`). Query keys are centralised in `queryKeys`; task mutations
  invalidate the `tasks`, `task`, and `project-stats` queries, and logout clears
  the whole cache so the next user cannot see the previous one's data.
- Zustand (`src/store/ui-store.ts`) holds only the search/status filters and
  sidebar state. Never mirror API responses into it.
- `src/lib/api.ts` is the only Axios instance: base `${NEXT_PUBLIC_BE_URL}/api`,
  `withCredentials: true`, central error-envelope unwrapping into `ApiError`.
  It deliberately sets **no default `Content-Type`** — a JSON default makes
  Axios stringify `FormData`, so uploads would never arrive as multipart. Use
  the `upload()` helper for files.
- Forms are React Hook Form + Zod. `create-task-form.tsx` is the reference
  pattern and types the form as `z.input` (fields with defaults) → `z.output`
  (submitted value). There is **no `ui/form.tsx`** in the `radix-nova` registry;
  `shadcn add form` silently does nothing. Copy the hand-written pattern.
- `src/components/ui/**` is generated by shadcn and ignored by Biome. Edit it
  only when you must, and do not reformat it. Do not add individual
  `@radix-ui/react-*`, `clsx`, or `tailwind-merge` dependencies — shadcn v4
  already pulls the unified `radix-ui` and `cn` packages.
- `next.config.ts` sets `output: "standalone"` (the runtime image copies that
  tree) and `allowedDevOrigins: ["127.0.0.1"]` (the dev server otherwise rejects
  the HMR websocket when the page is opened via `127.0.0.1`). Do not remove
  either without testing the container path.
- `NEXT_PUBLIC_BE_URL` is inlined at build time; changing it requires a rebuild.
  Copy `.env.example` to `.env.local` on the host.
- `next-env.d.ts` and `apps/frontend/AGENTS.md` are generated by Next.
  `CLAUDE.md` is committed as `@AGENTS.md` so other agents read the same block.
  The committed `AGENTS.md` block is intentional; changing or deleting it only
  recreates the uncommitted diff.
- The login page hardcodes the seeded demo accounts and password `password123`.
  If `prisma/seed.ts` changes, update that panel too.

## 10. Prisma 7 specifics

Prisma 7 differs from 5/6 in ways that will break you if you assume otherwise:

- Config lives in **`prisma7.config.ts`**, not `package.json#prisma`. It imports
  `dotenv/config` so `.env` is loaded for CLI commands.
- The datasource block in `prisma/schema.prisma` has **no `url` field**. The
  connection is supplied at runtime by a **driver adapter** (`@prisma/adapter-pg`
  wrapping `pg`) in `src/lib/prisma.ts`.
- The generator is **`prisma-client`** (ESM) and emits to `src/generated/prisma`,
  which is **gitignored**. Import from `@/generated/prisma/client`.
  After any schema change run `bun run db:generate`, or typecheck will fail
  against a stale client.
- `prisma init` vendored agent-support markdown files into `.agents/skills/`
  (plus `.claude/` and `.windsurf/` symlinks) and a `skills-lock.json`. These are
  gitignored on purpose. Do not commit them.
- The server **exits at boot if the database is unreachable**, so the health
  endpoint only responds when Postgres is actually up. `/api/health` proves
  connectivity only — never that the schema was migrated.
- Migrations live in `prisma/migrations/` (`20261001082345_init`,
  `20261004174035`, `20261009140949_add_qa_department`). Prefer
  `bun run db:migrate` over `db:push`; `db:push` leaves state that makes the
  next `migrate dev` demand a full reset. Containers use `prisma migrate deploy`
  via `scripts/docker-entrypoint.sh`.

Schema (all ids are UUIDs; every model has `created_at`/`updated_at` where it
makes sense):

- `User`: `email` unique, `passwordHash`, `role` (`pm` | `engineer` | `client`),
  optional `department` (`uiux` | `frontend` | `backend` | `qa`), `avatarUrl`,
  `deletedAt`.
- `Project`: `name`, `description`, `status` (`active` | `archived`), optional
  `clientId`, `deletedAt`.
- `ProjectMember`: composite `(projectId, userId)`; a client owns a project and
  is never a member.
- `Task`: `title`, `description`, `status` (`todo` | `in_progress` | `done`),
  `priority` (`low` | `medium` | `high`), `projectId`, optional `assigneeId`,
  `clientVisible`, `deletedAt`, `version` (locking).
- `TaskDependency`: composite `(taskId, dependsOnId)`.
- `AuditLog`: `taskId`, `userId`, `action` (`create` | `update` | `delete`),
  `changedColumn`, `oldValue`, `newValue`, `timestamp`.
- `Attachment`: `taskId`, `uploadedById`, `filename`, `url` (stored name),
  `mimeType`, `size`.

Seed data (`bun run db:seed`, idempotent) creates one project with a dependency
chain and five accounts, all with password `password123`:
`pm@demo.local`, `qa@demo.local`, `frontend@demo.local`, `backend@demo.local`,
`client@demo.local`.

## 11. Tests

- Runner: **`bun test`**, configured by `apps/backend/bunfig.toml`, which
  preloads `test/setup.ts` (inert env defaults so the app can be constructed
  without a real `.env`).
- Tests are colocated with their subject: `src/lib/*.test.ts` and
  `src/routes/*.test.ts`. Current suite: **80 tests across 7 files**.
- **Pure, database-free:** `permissions.test.ts`, `audit.test.ts`,
  `paginate.test.ts`, and `app.test.ts` (health, 404 envelope, unauthenticated
  401s). Permission-matrix changes belong here.
- **Database-backed integration tests:** `authorization.test.ts` and
  `concurrency.test.ts` always hit the database; `auth.test.ts` includes a
  no-database block plus an integration block that probes `SELECT 1` and skips
  itself when Postgres is unreachable. They mount the real app with
  `app.request()`, sign cookies directly, and mutate the real local database.
  The authorization/concurrency suites purge `@test.local` fixture rows and the
  files they upload, in FK order; `auth.test.ts` deletes the account it creates.
- Therefore a fresh machine needs `bun run db:up` **and migrations applied**
  (`bun run db:migrate`) before `bun run test`. Without a database the auth
  integration block skips but authorization/concurrency fail; with an unmigrated
  database the failure is `P2021 TableDoesNotExist`. Never point the tests at a
  database with data you care about.
- There is **no frontend test runner**. `bun run test` covers the backend only;
  never report frontend tests as passing.
- Add a test next to the code for any permission rule, state transition,
  locking behavior, masking rule, or filter conversion. Do not add tests for
  wiring or tautologies.

## 12. Git workflow

- **Branch:** `master` is the default and integration branch.
- **Upstream remote:** `git@github.com:BillyAddlers/project-sovereign.git`
- Push to `master` only when explicitly asked; otherwise branch
  `<type>/<short-description>`.
- **Conventional Commits** are enforced by commitlint via `.husky/commit-msg`.
  Valid types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`,
  `revert`, `style`, `test`. Header ≤100 chars; subject case is not enforced.
- `.husky/pre-commit` runs Biome over **staged frontend files only**. If it
  blocks you, run `bun run --cwd apps/frontend lint:fix`.
- Do not amend, rebase, or force-push commits that are already pushed. Do not
  commit build output, `node_modules/`, `.env`, `uploads/`, or `src/generated/`.
- Do not push unless explicitly asked in this session.

## 13. Definition of done

1. `bun run typecheck` — zero errors in both workspaces.
2. `bun run lint` — clean (frontend Biome; the backend has no linter).
3. `bun run test` — passes, with PostgreSQL up and migrated. Backend only.
4. `bun run build` — succeeds.
5. `git status` shows only intended files.
6. Schema/doc changes reflected in this file and the relevant README/TODO
   decision log.
7. If a Dockerfile or compose file changed: the stack was brought up on a
   **fresh volume** and the API was exercised (see §15), not merely built.

A docs-only change does not need steps 3–4 re-run unless the doc claims a
command works; say which commands you actually ran.

## 14. Local database

PostgreSQL runs in a **podman** container: `project-sovereign-postgres`,
published on `127.0.0.1:5432`, credentials `admin` / `password`, database
`project_sovereign`, data in the `project-sovereign-pgdata` volume. Start it with
`bun run db:up` (idempotent) rather than `podman run` by hand — the container
needs **both** `POSTGRES_DB` (or the database does not exist) **and** a
`-p 127.0.0.1:5432:5432` host mapping (or nothing on the host can reach it).

This host has `psql` at `/usr/bin/psql`, so either works:

```bash
psql postgresql://admin:password@localhost:5432/project_sovereign
podman exec -it project-sovereign-postgres psql -U admin -d project_sovereign
```

A container that is `Up` but unreachable produces `Database unreachable at
startup`, because the backend deliberately exits when Postgres is not reachable.

Migrations are the source of truth — use `bun run db:migrate`. `bun run db:push`
will make Prisma demand a schema reset on the next `migrate dev`, because it
leaves the database in a state no migration accounts for. After a schema change:
`db:migrate` (generate + apply), then `db:seed`.

If the host ever occupies 5432, use the escape hatch `POSTGRES_PORT=5433 bun run
db:up` and set `DATABASE_URL` in `apps/backend/.env` to match. That path is
documented but unverified on this machine.

## 15. Containers

Two podman stacks exist, both rooted at the repo. They are **alternatives** —
they bind the same ports (5432, 3001, 3000), so only one can run at a time.
Neither is used by `bun run dev:*`.

| File               | Build                             | Watches source | Use it to                              |
| ------------------ | --------------------------------- | -------------- | -------------------------------------- |
| `compose.dev.yaml` | `target: dev` in both Dockerfiles | yes            | day-to-day work and hot reload         |
| `compose.yaml`     | default (prod) targets            | no             | prove a build works, fresh-volume runs |

```bash
podman-compose -f compose.dev.yaml up --build
podman-compose -f compose.dev.yaml down        # keep the volume
podman-compose -f compose.dev.yaml down -v     # delete the volume
```

Run them with **`podman-compose`** (v1.6.0, installed at `/usr/bin`), not
`podman compose`. On this machine `podman compose` delegates to an external
provider that is not installed, while `podman-compose` is on `PATH`. If a future
host lacks it, `uv tool install podman-compose` puts it in `~/.local/bin`; add
that directory to `PATH` in that case only.

`compose.dev.yaml` supplies a throwaway `JWT_SECRET`; `src/lib/env.ts` requires
one (≥32 chars) and the backend refuses to boot without it. Override it with
`JWT_SECRET=...` if needed, and never reuse it outside isolated development. The
dev database is published on `${POSTGRES_PORT:-5432}`, so
`POSTGRES_PORT=5433 podman-compose -f compose.dev.yaml up --build` avoids the
`db:up` container. Host-side Prisma/psql must then use port 5433 as well.

### Traps, all of which have already bitten this repo

- **Never bind-mount `node_modules`.** The host tree was installed for the host
  platform and Bun's store layout; it would shadow the image's own copy and
  produce unexplainable module-resolution failures. `compose.dev.yaml` uses
  _anonymous volumes_ at each `node_modules` path instead — podman seeds them
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
- **Port 5432 is contested** by `project-sovereign-postgres` (§14) and the
  compose `db` service. Stop one before starting the other:
  `podman stop project-sovereign-postgres`.
- Migrations apply on backend boot via `scripts/docker-entrypoint.sh`, which
  waits on `pg_isready` first and honours `SKIP_MIGRATIONS=1`. It is idempotent —
  a restart logs "No pending migrations to apply".
- `NEXT_PUBLIC_BE_URL` is `http://127.0.0.1:3001` (the **host**-published
  port), because it is inlined into the client bundle for the browser. It must
  match the browser's page origin (`http://127.0.0.1:3000`) so the backend's
  `CORS_ORIGIN` accepts it. The backend reaches the database as `db:5432` (the
  compose service name) — the two are deliberately different hosts.

### What not to regress

If you change a Dockerfile or a compose file, re-verify the whole path, not just
that it builds: `up --build` on a **fresh volume** (`down -v` first), then
`GET /api/health` → 200, register → 201 and login → 200 with a `ps_token` cookie,
`POST /api/tasks` as PM → 201, an invalid body → 400, an engineer mutating a
task they do not own → 403, and a task created by `curl` visible in the rendered
page. A backend that builds and answers `/api/health` while its schema was never
migrated looks perfectly healthy from the outside.

## 16. Boundaries

- Do not add, remove, or rename a workspace without explicit instruction.
- Do not modify this file to make your own change look correct. If the doc is
  wrong, fix the doc _and_ flag the correction in your report.
- Promoting the duplicated API contract into `packages/shared` requires explicit
  approval.
- If a request is ambiguous, ask one clarifying question, then proceed with the
  most reasonable interpretation.

## 17. Reporting back

State briefly: what changed and which app it belongs to · the exact commands you
ran and their real output · what you deliberately did **not** do · any open
question. **Never claim a command passed unless you actually ran it and saw it
pass.**
