#!/bin/sh
set -e

./node_modules/.bin/prisma migrate deploy
node src/server.js
