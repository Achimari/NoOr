#!/bin/sh
set -e

docker compose -f docker-compose.yml -f docker-compose.dev.yml down --volumes --remove-orphans --rmi local
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
