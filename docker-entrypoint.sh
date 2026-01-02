#!/bin/sh
set -e

echo "=== Environment Check ==="
if [ -z "$DATABASE_URL" ] && [ -z "$TIDB_HOST" ]; then
    echo "ERROR: DATABASE_URL or TIDB_HOST is not set!"
    echo "Please add DATABASE_URL environment variable in Koyeb"
    exit 1
fi

if [ -n "$DATABASE_URL" ]; then
    echo "DATABASE_URL is set (hidden for security)"
else
    echo "TIDB_HOST is set: $TIDB_HOST"
fi

if [ -z "$SESSION_SECRET" ]; then
    echo "WARNING: SESSION_SECRET not set, using default"
    export SESSION_SECRET="default-secret-change-me"
fi

echo "=== Starting application ==="
exec node dist/index.cjs
