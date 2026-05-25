#!/bin/sh
set -e

docker compose down --remove-orphans
docker compose up -d --build

echo "NoOr started with production Compose."
echo "Check status with: docker compose ps"
echo "View logs with: docker compose logs -f app"
