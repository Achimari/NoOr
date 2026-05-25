#!/bin/sh
set -e

docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans
docker volume rm app_postgres_data 2>/dev/null || true

echo "PostgreSQL data volume cleared. Run 'npm run docker:start' to start again."
