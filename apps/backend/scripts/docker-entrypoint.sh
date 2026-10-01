#!/bin/sh
# Container entrypoint for the backend.
#
# Applies checked-in Prisma migrations before serving so a fresh volume converges
# to the current schema with no manual step. `migrate deploy` is the correct
# command here — never `migrate dev` (it is interactive) and never `db push`
# (it leaves schema state no migration accounts for, which then forces a reset).
set -eu

# The compose healthcheck already gates on pg_isready, but this keeps the image
# usable under `podman run` without --health-cmd, and covers the window where the
# cluster accepts connections a moment before it accepts queries.
if command -v pg_isready >/dev/null 2>&1; then
  attempts=0
  until pg_isready -h "${DB_HOST:-db}" -p 5432 \
        -U "${POSTGRES_USER:-admin}" -d "${POSTGRES_DB:-project_sovereign}" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 30 ]; then
      echo "backend: database not ready after 60s" >&2
      exit 1
    fi
    echo "backend: waiting for database..."
    sleep 2
  done
fi

# The Prisma CLI needs the URL; docker-entrypoint runs with the compose
# environment, so DATABASE_URL is already exported.
if [ "${SKIP_MIGRATIONS:-0}" = "1" ]; then
  echo "backend: SKIP_MIGRATIONS=1, not applying migrations"
else
  echo "backend: applying migrations"
  bun run prisma migrate deploy
fi

echo "backend: starting"
exec "$@"
