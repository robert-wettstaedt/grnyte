#!/usr/bin/env bash
# Mutation-test the `server` vitest project, which needs a database.
#
# One throwaway Postgres per Stryker worker, because the workers run concurrently and the DB-backed
# suites tear down by fixture name: sharing one would have them deleting each other's rows. The
# recipe is CI's (ci/shim.sql, migrate, ci/seed.sql) and the env block below is CI's env block, all
# dummy values, so this needs no .env and holds no secrets.
#
# Usage: stryker/server.sh ['src/lib/**/*.remote.ts'], defaulting to the configured scope.
set -euo pipefail

MUTATE="${1:-}"
WORKERS="${STRYKER_WORKERS:-2}"
BASE_PORT="${STRYKER_DB_BASE_PORT:-54330}"
IMAGE=postgres:16

cleanup() {
  for i in $(seq 0 $((WORKERS - 1))); do
    docker rm -f "grnyte-stryker-db-$i" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

for i in $(seq 0 $((WORKERS - 1))); do
  port=$((BASE_PORT + i))
  docker rm -f "grnyte-stryker-db-$i" >/dev/null 2>&1 || true
  docker run --rm -d --name "grnyte-stryker-db-$i" -p "$port:5432" \
    -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
done

# psql runs inside the container: a host-port psql wedges on this machine, and this way nothing has
# to be installed. `npm run migrate` connects over TCP from node, which does not.
for i in $(seq 0 $((WORKERS - 1))); do
  port=$((BASE_PORT + i))
  # Over TCP, always. The entrypoint runs a temporary server for initdb that answers on the unix
  # socket, so a socket check passes and the next command then hits the restart. That server never
  # listens on TCP, which makes `-h 127.0.0.1` the only honest readiness signal.
  until docker exec "grnyte-stryker-db-$i" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; do sleep 0.5; done
  docker exec -i "grnyte-stryker-db-$i" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -q < ci/shim.sql
  DATABASE_URL="postgres://postgres:postgres@127.0.0.1:$port/postgres" npm run migrate >/dev/null
  docker exec -i "grnyte-stryker-db-$i" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -q < ci/seed.sql
done

# CI's env block verbatim, minus DATABASE_URL: vitest.stryker-server.config.ts derives that per
# worker from STRYKER_MUTATOR_WORKER, which is the whole point of the exercise.
export NEXTCLOUD_URL=http://foobar
export NEXTCLOUD_USER_NAME=foobar
export NEXTCLOUD_USER_PASSWORD=foobar
export PUBLIC_TOPO_EMAIL=foobar
export PUBLIC_REPORT_EMAIL=foobar
export PUBLIC_ORIGIN=https://ci.example.com
export PUBLIC_STATUS_URL=https://status.ci.example.com
export PUBLIC_APPLICATION_NAME=foobar
export PUBLIC_SUPABASE_URL=foobar
export PUBLIC_SUPABASE_ANON_KEY=foobar
export PUBLIC_ZERO_URL=foobar
export PUBLIC_BUNNY_STREAM_LIBRARY_ID=foobar
export PUBLIC_BUNNY_STREAM_HOSTNAME=foobar
export SUPABASE_SERVICE_ROLE_KEY=foobar
export SUPABASE_JWT_SECRET=ci-dummy-jwt-secret-at-least-32-characters-long
export RESEND_SENDER_EMAIL=foobar
export RESEND_API_KEY=foobar
export BUNNY_STREAM_API_KEY=foobar
export CRON_API_KEY=foobar
export STRYKER_DB_BASE_PORT="$BASE_PORT"
export STRYKER_PROJECT=server

npx stryker run stryker/config.mjs --concurrency "$WORKERS" \
  ${MUTATE:+--mutate "$MUTATE"} ${STRYKER_EXTRA_ARGS:-}
