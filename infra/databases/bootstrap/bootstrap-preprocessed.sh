#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

# Homebrew can leave the default Node binary pointing at a removed shared
# library after an upgrade. Prefer an explicitly supplied Node bin directory;
# otherwise fall back to the installed Node 24 LTS location when available.
if [[ -n "${SKTHON_NODE_BIN_DIR:-}" ]]; then
  export PATH="$SKTHON_NODE_BIN_DIR:$PATH"
elif [[ -x /opt/homebrew/opt/node@24/bin/node ]]; then
  export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
elif [[ -x /opt/homebrew/opt/node@22/bin/node ]]; then
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
elif ! node --version >/dev/null 2>&1; then
  for node_bin_dir in /opt/homebrew/opt/node@24/bin /opt/homebrew/opt/node@22/bin; do
    if [[ -x "$node_bin_dir/node" ]]; then
      export PATH="$node_bin_dir:$PATH"
      break
    fi
  done
fi

# The backend .env is also used by TypeORM's data source. Loading it here keeps
# the migration and psql phases pointed at the same database.
if [[ -f "$BACKEND_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$BACKEND_DIR/.env"
  set +a
fi

DB_HOST="${SKTHON_DB_HOST:-${DB_HOST:-localhost}}"
DB_PORT="${SKTHON_DB_PORT:-${DB_PORT:-5432}}"
DB_USERNAME="${SKTHON_DB_USERNAME:-${DB_USERNAME:-skthon}}"
DB_DATABASE="${SKTHON_DB_DATABASE:-${DB_DATABASE:-skthon}}"
DB_PASSWORD="${SKTHON_DB_PASSWORD:-${DB_PASSWORD:-${POSTGRES_PASSWORD:-}}}"

cd "$BACKEND_DIR"

echo '== applying TypeORM migrations =='
npm run migration:run

echo '== loading source data and derived features =='
if command -v psql >/dev/null 2>&1; then
  PGPASSWORD="$DB_PASSWORD" psql \
    --quiet \
    --host "$DB_HOST" \
    --port "$DB_PORT" \
    --username "$DB_USERNAME" \
    --dbname "$DB_DATABASE" \
    --file "$SCRIPT_DIR/preprocess-seed.sql"
elif command -v docker >/dev/null 2>&1; then
  # The development image already contains psql, even when the host does not.
  docker exec "${SKTHON_POSTGIS_CONTAINER:-skthon-postgis}" \
    test -f /opt/skthon/infra/databases/bootstrap/preprocess-seed.sql
  docker exec -i "${SKTHON_POSTGIS_CONTAINER:-skthon-postgis}" \
    psql \
    --quiet \
    --username "$DB_USERNAME" \
    --dbname "$DB_DATABASE" \
    --file /opt/skthon/infra/databases/bootstrap/preprocess-seed.sql
else
  echo 'psql is required (install PostgreSQL client or provide Docker).' >&2
  exit 1
fi

echo '== all preprocessing steps completed =='
