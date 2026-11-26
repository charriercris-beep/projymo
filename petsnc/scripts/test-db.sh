#!/usr/bin/env bash
# Lance PostgreSQL 16 jetable, applique le stub Supabase + les migrations, puis les tests RLS.
set -euo pipefail
cd "$(dirname "$0")/.."
BIN=/usr/lib/postgresql/16/bin
D=$(mktemp -d); chmod 777 "$D"; PORT=54331
run() { if [ "$(id -u)" = 0 ]; then su pgtest -c "$*"; else bash -c "$*"; fi; }
run "$BIN/initdb -D $D/data -A trust >/dev/null"
run "$BIN/pg_ctl -D $D/data -o '-p $PORT -k $D' -l $D/log -w start >/dev/null"
trap 'run "$BIN/pg_ctl -D '$D'/data -m immediate stop >/dev/null" || true' EXIT
P="psql -v ON_ERROR_STOP=1 -q -h $D -p $PORT -U pgtest -d postgres"
run "$P -f $PWD/supabase/tests/supabase-stub.sql"
for f in supabase/migrations/*.sql; do run "$P -f $PWD/$f"; done
run "$P -f $PWD/supabase/tests/rls_foundations.sql"
