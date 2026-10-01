# Project Sovereign

A [Bun](https://bun.sh) monorepo with a Next.js frontend and a Hono/Prisma
backend, backed by PostgreSQL.

## Layout

```
project-sovereign/
├── apps/
│   ├── frontend/    # Next.js 16 · React 19 · Tailwind 4 · shadcn (Radix)
│   └── backend/     # Hono on Bun · Prisma 7 · PostgreSQL · prisma-ezfilter
├── docs/
│   └── AGENTS.md    # Conventions for AI agents and human collaborators
├── .husky/          # pre-commit (Biome) + commit-msg (Commitlint)
├── commitlint.config.mjs
├── package.json     # Bun workspace root
└── tsconfig.base.json   # shared TS policy — both apps extend this
```

## TypeScript

`tsconfig.base.json` at the repo root holds the shared compiler policy
(`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, and friends). Both
`apps/frontend` and `apps/backend` extend it, so a flag added there applies
everywhere. Each app then declares only what it cannot inherit — the frontend
adds `jsx`, `lib`, `plugins`, and the `.next/types` include; the backend adds
`types: ["bun"]`.

See [`docs/AGENTS.md`](./docs/AGENTS.md) for which overrides are mandatory and
why.

## Prerequisites

- **Bun** `>= 1.4.2`
- **Podman** (for the local PostgreSQL, and for the container stacks; the backend exits at boot if it cannot connect)
- **podman-compose** (only if you want to use the container stacks below; see [Containers](#containers))

## Getting started

```bash
bun install

bun run db:up           # start PostgreSQL in podman on 127.0.0.1:5432
                         # prints the matching DATABASE_URL

cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local

bun run db:generate     # generate the Prisma client
bun run db:migrate      # apply migrations
bun run db:seed         # optional sample data

bun run dev:backend     # :3001
bun run dev:frontend    # :3000
```

### Local database

`bun run db:up` starts a PostgreSQL 18 container (`project-sovereign-postgres`)
with a named volume (`project-sovereign-pgdata`), bound to `127.0.0.1:5432` so it
is not exposed beyond the host's loopback. It is idempotent — run it as often as
you like.

The container must be started with **both** `POSTGRES_DB` (so the database
exists) and a `-p` host mapping (or nothing can reach it from the host). A
container started with neither will be running and still unreachable, and the
backend will exit with `Database unreachable at startup`.

## Containers

The whole stack — PostgreSQL, backend and frontend — can run inside podman, so a
collaborator needs only podman and a clone. Nothing has to be installed on the
host.

```bash
podman-compose -f compose.dev.yaml up --build   # hot-reloading dev stack
```

Then open <http://localhost:3000>. Edit any file in `apps/frontend` or
`apps/backend` and save: the container picks it up without a restart. The
frontend runs `next dev` (Turbopack) and the backend runs `bun --watch`.

```bash
podman-compose -f compose.dev.yaml logs -f backend   # follow the backend
podman-compose -f compose.dev.yaml down              # stop, keep the database
podman-compose -f compose.dev.yaml down -v           # stop and delete the database
```

There is also a production-style stack that builds real images and serves
compiled artefacts instead of watching sources:

```bash
podman-compose -f compose.yaml up --build
```

The two stacks are **alternatives** — they bind the same ports, so only one can
run at a time. `compose.yaml` is for checking that a build works and that
migrations apply from scratch; `compose.dev.yaml` is for day-to-day work.

Things worth knowing:

- **Only one PostgreSQL can hold port 5432.** If you use `bun run db:up` on the
  host, stop it first: `podman stop project-sovereign-postgres`.
- **`podman compose` may not work.** On some setups it delegates to
  `docker-compose`, which needs a Docker socket that podman does not provide.
  `podman-compose` works. On this machine it came from `uv tool install
  podman-compose`, which puts it in `~/.local/bin` rather than on `PATH`.
- **Migrations apply automatically** when the backend boots, on both stacks. A
  fresh volume converges to the checked-in schema with no manual step. Set
  `SKIP_MIGRATIONS=1` to bypass it.
- **Images must use fully-qualified names.** Podman rejects short names, so the
  Dockerfiles say `docker.io/oven/bun:1.4.2-alpine` and
  `docker.io/library/postgres:18-alpine`.
- The dev stack deliberately runs as **root** so it can write to the bind-mounted
  source. That is fine for local testing and is not a hardened configuration.

## Scripts

| Command               | Description                                    |
| --------------------- | ---------------------------------------------- |
| `bun run dev:frontend`| Frontend dev server (Next.js, :3000)           |
| `bun run dev:backend` | Backend dev server (Hono on Bun, :3001)        |
| `bun run build`       | Build both workspaces                          |
| `bun run typecheck`   | Type-check both workspaces                     |
| `bun run lint`        | Biome (frontend)                               |
| `bun run test`        | `bun test` (backend)                           |
| `bun run db:up`       | Start local PostgreSQL in podman               |
| `bun run db:generate` | `prisma generate`                              |
| `bun run db:migrate`  | `prisma migrate dev`                           |
| `bun run db:seed`     | Idempotent sample data                         |
| `bun run db:reset`    | Drop and re-apply all migrations               |

Container stacks are run with `podman-compose`, not with `bun` — see [Containers](#containers).

## API

Base URL `http://localhost:3001/api`.

| Method   | Path            | Description                                       |
| -------- | --------------- | ------------------------------------------------- |
| `GET`    | `/health`       | Liveness probe                                    |
| `GET`    | `/tasks`        | Paginated list — `page`, `rows`, `orderKey`, `orderRule`, `status`, `search` |
| `POST`   | `/tasks`        | Create a task                                     |
| `GET`    | `/tasks/:id`    | Fetch one task                                    |
| `PATCH`  | `/tasks/:id`    | Update a task                                     |
| `DELETE` | `/tasks/:id`    | Delete a task                                     |

Lists return `{ data, meta: { page, rows, total, pageCount } }`.
Errors return `{ error: { code, message, details? } }`.

## Contributing

Read [`docs/AGENTS.md`](./docs/AGENTS.md) first. Commits must follow
Conventional Commits and are validated by Commitlint.
