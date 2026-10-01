# Backend — `@project-sovereign/backend`

Hono 4 on Bun · TypeScript · Prisma 7 (driver adapter) · PostgreSQL ·
`@nodewave/prisma-ezfilter` · Zod 4.

## Scripts

```bash
bun run dev          # Hono on Bun, watch mode
bun run start        # run once
bun run build        # bundle to dist/ with `bun build`
bun run typecheck    # tsc --noEmit
bun run test         # bun test
bun run db:up        # start local PostgreSQL in podman (idempotent)
bun run db:generate  # prisma generate
bun run db:migrate   # prisma migrate dev
bun run db:deploy    # prisma migrate deploy (CI/production)
bun run db:seed      # idempotent sample data
bun run db:reset     # drop + re-apply all migrations
bun run db:studio    # prisma studio
```

## Configuration

Copy `.env.example` to `.env`. `DATABASE_URL` is required — the process exits
at boot if Postgres is unreachable.

## Local database

`bun run db:up` runs `scripts/db-up.sh`, which starts PostgreSQL 18 in podman:

| Setting     | Value                |
| ----------- | -------------------- |
| Container   | `project-sovereign-postgres` |
| Volume      | `project-sovereign-pgdata` (data survives `podman rm`) |
| Host port   | `127.0.0.1:5432`     |
| User        | `admin`              |
| Password    | `password`           |
| Database    | `project_sovereign`  |

It prints the matching `DATABASE_URL`. The script is idempotent, so re-running
it when the container is already up is a no-op.

**Two things the container must have**, or it will be `Up` yet unreachable and
the backend will exit with `Database unreachable at startup`:

1. `-p 127.0.0.1:5432:5432` — without a host mapping, `podman port` returns
   nothing and nothing listens on the host.
2. `POSTGRES_DB=project_sovereign` — the image only creates the database named
   by `POSTGRES_DB` (default `postgres`), so the name in your connection string
   must match or Postgres reports `database does not exist`.

There is no `psql` on this machine. To query directly:

```bash
podman exec project-sovereign-postgres psql -U admin -d project_sovereign
```

## Structure

```
prisma/
├── migrations/       # checked in — source of truth for schema changes
├── schema.prisma     # models; no `url` in the datasource (Prisma 7)
└── seed.ts           # idempotent, validated through the API schema
prisma7.config.ts    # Prisma 7 CLI config (schema, migrations, datasource url)
scripts/
└── db-up.sh          # starts the podman PostgreSQL container
src/
├── app.ts            # createApp() — middleware, routes, error handler
├── index.ts          # Bun entrypoint + graceful shutdown
├── lib/
│   ├── env.ts        # Zod-validated environment
│   ├── errors.ts     # AppError + the { error: {...} } envelope
│   ├── paginate.ts   # ezfilter wrapper → typed { data, meta }
│   ├── prisma.ts     # PrismaClient + PrismaPg driver adapter
│   ├── schemas.ts    # API contract (source of truth)
│   ├── validate.ts   # zValidator with our error envelope
│   └── validators.ts # ezfilter predicate → Prisma TaskWhereInput
└── routes/
    ├── health.ts
    └── tasks.ts
```

## Prisma 7 notes

- CLI config is `prisma7.config.ts`, not `package.json#prisma`.
- The datasource has no `url`; the connection comes from the `PrismaPg` driver
  adapter in `src/lib/prisma.ts`.
- The generated client lives in `src/generated/prisma` and is **gitignored** —
  run `bun run db:generate` after any schema change.
- Never run `bunx prisma`; it resolves `latest`, which is currently an 8.x
  release candidate. Use the `db:*` scripts.

## Testing

`bun test` covers the app's routing, the error envelope, and the ezfilter →
Prisma translation. These tests deliberately do **not** touch a live database, so
they pass whether or not PostgreSQL is running.

Database behaviour has been verified manually against the podman container
(filtering, search, pagination metadata, create/404 envelopes), but there is no
integration-test suite hitting a real database yet.
