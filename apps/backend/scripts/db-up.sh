#!/usr/bin/env bash
# Start the local PostgreSQL used for development.
#
# Idempotent: if the container is already running, this is a no-op.
set -euo pipefail

CONTAINER="project-sovereign-postgres"
IMAGE="docker.io/library/postgres:latest"
VOLUME="project-sovereign-pgdata"
PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-admin}"
DB_PASSWORD="${POSTGRES_PASSWORD:-password}"
DB_NAME="${POSTGRES_DB:-project_sovereign}"

if podman container exists "$CONTAINER"; then
  if [ "$(podman inspect -f '{{.State.Running}}' "$CONTAINER")" = "true" ]; then
    echo "$CONTAINER is already running on 127.0.0.1:${PORT}."
    exit 0
  fi
  podman rm "$CONTAINER" >/dev/null
fi

echo "Starting $CONTAINER on 127.0.0.1:${PORT} (db: $DB_NAME)..."
podman run -d \
  --name "$CONTAINER" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \
  -e POSTGRES_DB="$DB_NAME" \
  -p "127.0.0.1:${PORT}:5432" \
  -v "${VOLUME}:/var/lib/postgresql/data" \
  -e PGDATA=/var/lib/postgresql/data \
  "$IMAGE" >/dev/null

# Postgres initialises the cluster asynchronously; wait for it to accept queries.
for _ in $(seq 1 30); do
  if podman exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    echo "$CONTAINER is ready."
    echo "DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${PORT}/${DB_NAME}?schema=public"
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for $CONTAINER to become ready." >&2
exit 1