# syntax=docker/dockerfile:1

# Frontend image. Build context is the repo root: this is a Bun workspace with one
# shared lockfile, so installing from apps/frontend alone would produce a second,
# divergent node_modules.

# --- deps ---------------------------------------------------------------------
FROM docker.io/oven/bun:1.4.2-alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/

# Unfiltered on purpose. This app imports `zod`, which is declared only in the root
# workspace, so a --filter install drops it. It also costs nothing here: only
# .next/standalone reaches the runtime stage, and Next prunes node_modules itself.
RUN bun install --frozen-lockfile

# --- build --------------------------------------------------------------------
FROM docker.io/oven/bun:1.4.2-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
# `next` is linked into the workspace's own node_modules/.bin by Bun, not the root.
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/frontend ./apps/frontend
COPY apps/backend/package.json ./apps/backend/

# apps/frontend/tsconfig.json extends the shared root base; Next fails to parse it
# if that file is absent.

# Public by definition: Next inlines NEXT_PUBLIC_* into the client bundle at build
# time, so changing it requires a rebuild, not a restart.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/apps/frontend
RUN bun run build

# Fail early and legibly if the standalone output is missing, rather than
# producing a broken runtime image that only fails when it boots.
RUN test -f .next/standalone/apps/frontend/server.js

# --- runtime ------------------------------------------------------------------
FROM docker.io/oven/bun:1.4.2-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache libc6-compat
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# 0.0.0.0 is required: the standalone server binds localhost by default, which is
# unreachable from outside the container.
ENV HOSTNAME=0.0.0.0

# Only .next/static and public are not already bundled into standalone.
COPY --from=build --chown=nextjs:nextjs /app/apps/frontend/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build --chown=nextjs:nextjs /app/apps/frontend/public ./apps/frontend/public

USER nextjs
EXPOSE 3000

WORKDIR /app/apps/frontend
CMD ["bun", "run", "server.js"]

# --- dev ----------------------------------------------------------------------
# Target for `compose.dev.yaml`. Source is bind-mounted over the copy below and
# .next lives in an anonymous volume, so recompiles are fast and never leave
# root-owned artefacts on the host.
FROM docker.io/oven/bun:1.4.2-alpine AS dev
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/frontend ./apps/frontend
COPY apps/backend/package.json ./apps/backend/

# Inlined at build time; also set as an env var in compose.dev.yaml so a value
# change does not require a rebuild.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

# `next dev` (Turbopack) recompiles on change. node_modules is deliberately not
# part of the bind mount — watching it would thrash the compiler.
WORKDIR /app/apps/frontend
EXPOSE 3000
CMD ["bun", "run", "dev"]
