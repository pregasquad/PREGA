#!/bin/sh
set -e

echo "=== Environment Check ==="
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL is not set!"
    echo "Please add DATABASE_URL environment variable in Koyeb"
    exit 1
fi
echo "DATABASE_URL is set (hidden for security)"

if [ -z "$SESSION_SECRET" ]; then
    echo "WARNING: SESSION_SECRET not set, using default"
    export SESSION_SECRET="default-secret-change-me"
fi

echo "=== Running database migrations ==="
npx drizzle-kit push --force || {
    echo "Migration failed, but continuing..."
}

echo "=== Starting application ==="
exec node dist/index.cjs
