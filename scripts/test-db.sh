#!/usr/bin/env bash
# Applies supabase/migrations to a throwaway local Postgres (with a shim of Supabase's
# auth schema) and runs the SQL tests in supabase/tests. Needs Postgres 15+ binaries.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"

cleanup() {
  [ -n "${KEEP_PG_LOG:-}" ] && cat "$WORK/log" 2>/dev/null >&2 || true
  "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# initdb refuses to run as root; use the postgres user when we are root.
run() { if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
if [ "$(id -u)" = "0" ]; then chown postgres "$WORK"; fi

run "'$PGBIN/initdb' -D '$WORK/data' -A trust -U postgres >/dev/null"
run "'$PGBIN/pg_ctl' -D '$WORK/data' -o '-p $PORT -k $WORK -c listen_addresses=' -l '$WORK/log' -w start >/dev/null"

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$ROOT/supabase/tests/auth_shim.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "apply $(basename "$f")"
  "${PSQL[@]}" -f "$f" >/dev/null
done
for f in "$ROOT"/supabase/tests/[0-9]*_test.sql; do
  echo "test  $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
