#!/bin/sh
set -e

npx prisma migrate deploy
node src/server.js
