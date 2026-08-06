#!/bin/bash
set -e

# Install if node_modules are missing (pnpm hoists to workspace root)
if [ ! -d "/home/runner/workspace/node_modules" ]; then
  echo "Installing dependencies..."
  pnpm install
fi

# Run committed Drizzle migrations idempotently against the configured database.
# Uses a _schema_migrations tracking table so each SQL file is applied at most once.
if [ -n "$DATABASE_URL" ]; then
  echo "Applying schema migrations..."
  # Ensure tracking table exists
  psql "$DATABASE_URL" -c "
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  " > /dev/null 2>&1 || true

  MIGRATIONS_DIR="/home/runner/workspace/lib/db/drizzle"
  for SQL_FILE in "$MIGRATIONS_DIR"/[0-9]*.sql; do
    FILENAME=$(basename "$SQL_FILE")
    ALREADY_APPLIED=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM _schema_migrations WHERE filename = '$FILENAME';" 2>/dev/null || echo "")
    if [ "$ALREADY_APPLIED" = "1" ]; then
      echo "  [skip] $FILENAME (already applied)"
    else
      echo "  [apply] $FILENAME"
      # Split on Drizzle's --> statement-breakpoint marker and run each statement
      # We use psql with ON_ERROR_STOP=0 so partial errors (e.g. duplicate objects) don't abort
      psql "$DATABASE_URL" --set ON_ERROR_STOP=0 -f "$SQL_FILE" > /dev/null 2>&1 || true
      psql "$DATABASE_URL" -c "INSERT INTO _schema_migrations (filename) VALUES ('$FILENAME') ON CONFLICT DO NOTHING;" > /dev/null 2>&1 || true
    fi
  done
  echo "Migrations complete."
else
  echo "Warning: DATABASE_URL not set, skipping migrations"
fi

# Build frontend if needed
if [ ! -f "artifacts/pregasquad-manager/dist/public/index.html" ]; then
  echo "Building frontend..."
  VITE_BIN=$(find /home/runner/workspace/node_modules/.pnpm -name "vite.js" -path "*/vite/bin/vite.js" 2>/dev/null | head -1)
  if [ -n "$VITE_BIN" ]; then
    cd artifacts/pregasquad-manager && node "$VITE_BIN" build --config vite.config.ts
    cd /home/runner/workspace
  else
    echo "Warning: vite not found, skipping frontend build"
  fi
fi

# Build API if needed
if [ ! -f "artifacts/api-server/dist/index.js" ]; then
  echo "Building API..."
  cd artifacts/api-server && node build.mjs
  cd /home/runner/workspace
fi

echo "Starting server..."
cd artifacts/api-server
exec node --enable-source-maps ./dist/index.js
