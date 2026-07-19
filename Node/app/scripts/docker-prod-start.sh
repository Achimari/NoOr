#!/bin/sh
set -e

docker compose down --remove-orphans
COMPOSE_PARALLEL_LIMIT=1 docker compose --progress plain build app
docker compose up -d --no-build

echo "NoOr started with production Compose."
echo "Check status with: docker compose ps"
echo "View logs with: docker compose logs -f app"
