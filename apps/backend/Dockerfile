# syntax=docker/dockerfile:1

# Backend image. Build context is the repo root, because this is a Bun workspace
# with a single shared lockfile — installing from apps/backend alone would create a
# second, divergent node_modules.

# --- deps ---------------------------------------------------------------------
FROM docker.io/oven/bun:1.4.2-alpine AS deps
WORKDIR /app

# Manifests only, so the install layer is reused whenever sources change.
COPY package.json bun.lock ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

# Plain install, matching the frontend Dockerfile. A --filter install is much
# smaller, but it is fragile here: the workspace graph has to stay acyclic and any
# package that is only declared at the root silently disappears, which is exactly
# how the frontend build broke on `zod`. Extra size is not worth that fragility.
RUN bun install --frozen-lockfile

# --- build --------------------------------------------------------------------
FROM docker.io/oven/bun:1.4.2-alpine AS build
WORKDIR /app

# Prisma's query engine needs OpenSSL; Alpine ships none by default.
RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
# Bun links each workspace's binaries into that package's own node_modules/.bin,
# not the root one — `prisma` and `next` live here. Copying only the root
# node_modules yields "prisma: not found".
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/backend ./apps/backend
COPY apps/frontend/package.json ./apps/frontend/

# Prisma reads apps/backend/tsconfig.json, which extends the shared root base.
# Without this file `prisma generate` fails on a missing '../../tsconfig.base.json'.
WORKDIR /app/apps/backend
# The Prisma client is generated into src/generated (gitignored), so it has to be
# built here rather than copied from the host.
RUN bun run db:generate

# --- runtime ------------------------------------------------------------------
FROM docker.io/oven/bun:1.4.2-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl ca-certificates

# Non-root runtime. node_modules is owned by root in the build stage, so only the
# directories written to at runtime are chowned.
RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=build --chown=app:app /app/apps/backend ./apps/backend

WORKDIR /app/apps/backend
USER app

EXPOSE 3001

# The entrypoint applies migrations before serving, so a fresh volume converges to
# the checked-in schema without a manual step.
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
CMD ["bun", "run", "start"]

# --- dev ----------------------------------------------------------------------
# Target for `compose.dev.yaml`. Source is bind-mounted over the copy below, and
# anonymous volumes keep the container's node_modules visible at those paths, so
# the host's node_modules (different platform, different Bun store layout) never
# shadows them.
FROM docker.io/oven/bun:1.4.2-alpine AS dev
WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/backend ./apps/backend
COPY apps/frontend/package.json ./apps/frontend/

# `bun --watch` restarts on change. The entrypoint is repeated here because a
# stage inherits nothing from `runtime`: without it no migrations are applied and
# a fresh volume fails at runtime with P2021 TableDoesNotExist. db:generate runs
# because src/generated is gitignored and may be absent on a fresh clone.
WORKDIR /app/apps/backend
EXPOSE 3001
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
CMD ["sh", "-c", "bun run db:generate && exec bun run dev"]
