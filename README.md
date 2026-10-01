# Project Sovereign

An operational backbone for managing deliverables of high-value projects.

It is a [Bun](https://bun.sh) monorepo: a Next.js frontend and a Hono/Prisma
backend over PostgreSQL. The delivered slice so far is a task resource — enough
end-to-end wiring (schema, API, validation, UI, containers, docs) to build the
rest on top of.

## Stack

| Workspace       | Built with                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/frontend` | Next.js 16 (App Router) · React 19 · Tailwind 4 · shadcn/ui on Radix · TanStack Query 5 + Axios · Zustand 5 · React Hook Form + Zod · Biome |
| `apps/backend`  | Hono on Bun · Prisma 7.10 (driver adapter) · PostgreSQL · `@nodewave/prisma-ezfilter` · Zod                                                 |
| Root            | Bun workspace · TypeScript 5.9 · Husky · Commitlint                                                                                         |

Versions are pinned deliberately. Treat them as fixed unless someone says
otherwise.

## Layout

```
project-sovereign/
├── apps/
│   ├── frontend/     # Next.js web client
│   └── backend/      # Hono API server + Prisma data layer
├── docs/
│   └── AGENTS.md     # Conventions and gotchas — read this before changing anything
├── .husky/           # pre-commit (Biome) + commit-msg (Commitlint)
├── compose.yaml      # Container stack, production-style images
├── compose.dev.yaml  # Container stack, live hot reload
├── tsconfig.base.json # shared TypeScript policy — both apps extend this
└── package.json      # Bun workspace root
```

## Running it

### With containers (nothing to install but podman)

```bash
export PATH="$HOME/.local/bin:$PATH"      # if podman-compose landed there
podman-compose -f compose.dev.yaml up --build
```

Then open <http://localhost:3000>. The database, API and UI all come up
together, migrations are applied automatically, and edits to `apps/*` reload
live — the frontend through `next dev`, the backend through `bun --watch`.

```bash
podman-compose -f compose.dev.yaml logs -f backend   # follow one service
podman-compose -f compose.dev.yaml down              # stop, keep the data
podman-compose -f compose.dev.yaml down -v           # stop and delete the data
```

`compose.yaml` is the alternative: it builds real images and serves compiled
artefacts. Use it to confirm a build works and that migrations apply from
scratch. The two bind the same ports, so only one can run at a time.

### On the host

Needs Bun and podman (for PostgreSQL only).

```bash
bun install
bun run db:up                          # PostgreSQL on 127.0.0.1:5432
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
bun run db:generate && bun run db:migrate
bun run dev:backend                    # :3001
bun run dev:frontend                   # :3000
```

### A few things that will save you time

- **Only one PostgreSQL can hold port 5432.** If a compose stack is running, or
  you are switching between it and `bun run db:up`, stop one first.
- **`podman compose` may not work** — on some setups it delegates to
  `docker-compose`, which needs a Docker socket podman does not provide. Use
  `podman-compose`.
- **Migrations apply on backend boot** in both container stacks, so a fresh
  volume needs no manual step. `SKIP_MIGRATIONS=1` bypasses it. On the host you
  run them yourself.
- **The backend exits if it cannot reach PostgreSQL** rather than starting and
  failing later. That is intentional.
- **The backend must generate its Prisma client before typechecking.** Run
  `bun run db:generate` after any schema change.
- **A healthy `/api/health` does not mean the schema exists.** It only proves
  the database is reachable. If writes fail, check whether migrations ran.

## Commands

From the repo root:

| Command                | Does                                    |
| ---------------------- | --------------------------------------- |
| `bun run dev:backend`  | API on :3001, reloads on change         |
| `bun run dev:frontend` | UI on :3000                             |
| `bun run build`        | Build both workspaces                   |
| `bun run typecheck`    | Type-check both workspaces              |
| `bun run lint`         | Lint and format-check (frontend)        |
| `bun run test`         | Run tests (backend only)                |
| `bun run clean`        | Remove build output                     |
| `bun run db:up`        | Start local PostgreSQL (idempotent)     |
| `bun run db:generate`  | Generate the Prisma client              |
| `bun run db:migrate`   | Apply migrations (`migrate dev`)        |
| `bun run db:seed`      | Sample data, safe to re-run             |
| `bun run db:reset`     | Drop everything and re-apply migrations |
| `bun run db:studio`    | Prisma Studio                           |

Per app, run from its directory:

| `apps/frontend`            | `apps/backend`        |
| -------------------------- | --------------------- |
| `dev` `build` `start`      | `dev` `start` `build` |
| `typecheck`                | `typecheck`           |
| `lint` `lint:fix` `format` | `test`                |
| `clean`                    | `db:*` `clean`        |

There is **no frontend test runner** configured. `bun run test` covers the
backend; do not report frontend tests as passing.

## API

Base URL `http://localhost:3001/api`. Tasks are paginated, filterable and
sortable.

| Method   | Path         | Does                                                               |
| -------- | ------------ | ------------------------------------------------------------------ |
| `GET`    | `/health`    | Liveness                                                           |
| `GET`    | `/tasks`     | List — `page`, `rows`, `status`, `search`, `orderKey`, `orderRule` |
| `POST`   | `/tasks`     | Create                                                             |
| `GET`    | `/tasks/:id` | Fetch one                                                          |
| `PATCH`  | `/tasks/:id` | Update                                                             |
| `DELETE` | `/tasks/:id` | Delete                                                             |

Lists return `{ data, meta: { page, rows, total, pageCount } }`. Failures
always return `{ error: { code, message, details? } }`, including 400s — the
envelope is uniform so the client has one shape to handle.

## Working on this repo

The short version; [`docs/AGENTS.md`](./docs/AGENTS.md) has the reasoning and
the traps in full.

**Tooling**

- Use `bun` for everything. Never `npm`, `yarn` or `pnpm`, and never hand-edit
  `bun.lock`.
- **Never `bunx prisma`.** It fetches a newer release candidate and pairs it
  with the pinned client. Use the workspace scripts.
- Do not upgrade Bun, Next.js, Prisma or TypeScript without asking.
- Packages used by both apps live in the root `package.json`; app-specific
  packages live in that app's. Not both.

**Before you call something done**

```bash
bun run typecheck && bun run lint && bun run test && bun run build
```

If you touched a Dockerfile or compose file, also bring the stack up on a
**fresh volume** and exercise the API. Building an image is not the same as it
working.

**Conventions**

- ESM only. Type-only imports use `import type`.
- Strict TypeScript is inherited from `tsconfig.base.json`. Add compiler flags
  there, not in one app — both extend it, and `extends` replaces keys rather
  than merging them.
- Server data belongs in TanStack Query. Zustand holds ephemeral UI state only.
  Do not mirror API responses into a store.
- Zod validates on both sides. The client for fast feedback, the server because
  a client check is never a boundary.
- Never commit `.env`, `node_modules`, build output or generated clients.
- Comments explain *why*, not *what*.
- The API contract is deliberately duplicated — the backend's `schemas.ts` is
  the source of truth and the frontend mirrors it. Change both in one commit.

## Before you push

- Commits follow Conventional Commits; Commitlint enforces it through a hook.
- The pre-commit hook lints staged frontend files. If it blocks you, run
  `bun run --cwd apps/frontend lint:fix`.
- Ask before pushing, and before pushing to `master` specifically.
- Do not amend, rebase or force-push anything already pushed.

## Notes

- The local PostgreSQL image is `postgres:latest`, while the compose stacks pin
  `postgres:18-alpine`. Version drift between them is expected; do not rely on
  a specific minor version locally.
- Container images use fully-qualified names (`docker.io/oven/bun:...`) because
  podman rejects short ones.
- Dev containers run as root so they can write to bind-mounted source. That is a
  convenience for local work, not a hardened configuration.
- `.env` files are yours. Copy the `.env.example` templates and keep the real
  ones out of git.