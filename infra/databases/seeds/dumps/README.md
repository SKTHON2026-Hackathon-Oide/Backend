# Preprocessed database snapshot

`skthon-preprocessed-20260911.dump` is a PostgreSQL custom-format snapshot of
the local `skthon` PostGIS database, captured on 2026-09-11. It contains both
schema and data, and is ready to restore as a seed database.

## Restore

Start the local database first, then restore into an empty target database:

```bash
cd backend
docker compose --env-file infra/databases/.env -f infra/databases/docker-compose.yml up -d
docker exec -i skthon-postgis sh -lc 'pg_restore \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --clean --if-exists --no-owner --no-privileges' \
  < infra/databases/seeds/dumps/skthon-preprocessed-20260911.dump
```

`--clean` drops objects that already exist in the target database. Use a fresh
database if existing local data must be preserved.

## Integrity

```bash
shasum -a 256 -c skthon-preprocessed-20260911.dump.sha256
```

The dump was produced with PostgreSQL 17.11 / `pg_dump` 17.11 and includes the
2026-09-11 space-analysis context and building-registry cache migrations. It
also includes the 2025 Q1 through 2026 Q2 commercial-area floating-population snapshot: 9,892
observations across 1,650 commercial areas. It also includes the REB vacancy
source schema, 69 statistical-area polygons, 173 reporting areas, and 1,384
quarterly observations. All 100 canonical business categories have one active
`hackathon-v1` analysis profile with versioned AI-heuristic audience, time,
space, access, operating, and risk criteria.
