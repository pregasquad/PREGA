#!/bin/sh
set -e

echo "=== Environment Check ==="
if [ -z "$TIDB_HOST" ]; then
    echo "ERROR: TIDB_HOST is not set!"
    echo "Please add TIDB_HOST environment variable in Koyeb"
    exit 1
fi
echo "TIDB_HOST is set: $TIDB_HOST"

if [ -z "$TIDB_PASSWORD" ]; then
    echo "ERROR: TIDB_PASSWORD is not set!"
    exit 1
fi
echo "TIDB_PASSWORD is set (hidden for security)"

if [ -z "$SESSION_SECRET" ]; then
    echo "WARNING: SESSION_SECRET not set, using default"
    export SESSION_SECRET="default-secret-change-me"
fi

echo "=== Starting application ==="
exec node dist/index.cjs
