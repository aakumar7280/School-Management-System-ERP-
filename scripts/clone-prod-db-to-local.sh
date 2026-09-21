#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOCAL_POSTGRES_CONTAINER="school-erp-postgres"
LOCAL_DB_USER="postgres"
LOCAL_DB_NAME="school_erp"

if [[ -z "${PROD_DATABASE_URL:-}" ]]; then
  echo "ERROR: PROD_DATABASE_URL is not set."
  echo "Usage example:"
  echo "  PROD_DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require' npm run db:clone:prod:local"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is required but not found in PATH."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: docker daemon is not running."
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$LOCAL_POSTGRES_CONTAINER"; then
  echo "Local postgres container is not running. Starting docker compose postgres service..."
  docker compose up -d postgres
fi

echo "Resetting local database schema..."
docker exec "$LOCAL_POSTGRES_CONTAINER" \
  psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

echo "Cloning production data into local database. This may take a few minutes..."
docker run --rm -e PROD_DATABASE_URL="$PROD_DATABASE_URL" postgres:16 \
  sh -c 'pg_dump --no-owner --no-privileges --format=plain "$PROD_DATABASE_URL"' \
  | docker exec -i "$LOCAL_POSTGRES_CONTAINER" \
      psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" -v ON_ERROR_STOP=1

echo "Refreshing Prisma client..."
npm run db:generate >/dev/null

echo "Done. Local database now mirrors production at clone time."
echo "Next steps:"
echo "  1) npm run dev:api"
echo "  2) npm run dev:web"
