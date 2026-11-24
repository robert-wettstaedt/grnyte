#!/bin/bash
# The CI test job's database and env (.github/workflows/ci.yml) on a throwaway postgres:16 at :25432,
# so a worktree can run the DB tests without the shared dev DB.
# Usage: ci/local.sh up | test [vitest args...] | run <command...> | down
set -euo pipefail
cd "$(dirname "$0")/.."

export NEXTCLOUD_URL=http://foobar PUBLIC_TOPO_EMAIL=foobar PUBLIC_REPORT_EMAIL=foobar
export PUBLIC_ORIGIN=https://ci.example.com PUBLIC_STATUS_URL=https://status.ci.example.com
export RESEND_SENDER_EMAIL=foobar RESEND_API_KEY=foobar PUBLIC_APPLICATION_NAME=foobar
export PUBLIC_SUPABASE_URL=foobar PUBLIC_SUPABASE_PUBLISHABLE_KEY=foobar SUPABASE_SECRET_KEY=foobar
export SUPABASE_JWT_SECRET=ci-dummy-jwt-secret-at-least-32-characters-long
export DATABASE_URL=postgres://postgres:postgres@localhost:25432/postgres
export NEXTCLOUD_USER_NAME=foobar NEXTCLOUD_USER_PASSWORD=foobar BUNNY_STREAM_API_KEY=foobar
export BUNNY_STREAM_READ_ONLY_KEY=foobar PUBLIC_BUNNY_STREAM_LIBRARY_ID=foobar
export PUBLIC_BUNNY_STREAM_HOSTNAME=foobar CRON_API_KEY=foobar PUBLIC_ZERO_URL=foobar
# CI has no .env, but the checkout's .env fills any name left unset here: blank the ones that change a test.
export SUPABASE_JWT_JWKS_URL=

DB=grnyte-ci-local

case "${1:-}" in
  up)
    docker rm -f "$DB" >/dev/null 2>&1 || true
    docker run -d --name "$DB" -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:25432:5432 postgres:16 >/dev/null
    until docker exec "$DB" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
    sleep 2
    docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q < ci/shim.sql
    npm run migrate
    docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q < ci/seed.sql
    echo "$DB ready"
    ;;
  test)
    shift
    eval "$(node -e "const k=require('web-push').generateVAPIDKeys();console.log('export PUBLIC_VAPID_KEY='+k.publicKey+' PRIVATE_VAPID_KEY='+k.privateKey)")"
    npx vitest run "$@"
    ;;
  run)
    shift
    "$@"
    ;;
  down)
    docker rm -f "$DB" >/dev/null
    ;;
  *)
    echo "usage: $0 up | test [vitest args...] | run <command...> | down" >&2
    exit 2
    ;;
esac
