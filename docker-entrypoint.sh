#!/bin/sh
set -e

echo "=== Environment Check ==="
# Koyeb uses DATABASE_URL by default for its managed databases
# We need to ensure we map DATABASE_URL to TIDB_DATABASE_URL if that's what the app expects
if [ -n "$DATABASE_URL" ] && [ -z "$TIDB_DATABASE_URL" ]; then
    echo "Mapping DATABASE_URL to TIDB_DATABASE_URL"
    export TIDB_DATABASE_URL="$DATABASE_URL"
fi

if [ -z "$TIDB_DATABASE_URL" ]; then
    echo "ERROR: TIDB_DATABASE_URL (or DATABASE_URL) is not set!"
    echo "Please add DATABASE_URL environment variable in Koyeb"
    exit 1
fi

echo "DATABASE_URL is set (hidden for security)"

if [ -z "$SESSION_SECRET" ]; then
    echo "WARNING: SESSION_SECRET not set, using default"
    export SESSION_SECRET="default-secret-change-me"
fi

echo "=== Starting application ==="
exec node dist/index.cjs
