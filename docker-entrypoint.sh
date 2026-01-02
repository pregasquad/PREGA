#!/bin/sh
set -e

echo "Running database migrations..."
npx drizzle-kit push --force

echo "Starting application..."
exec node dist/index.cjs
