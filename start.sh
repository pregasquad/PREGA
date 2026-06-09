#!/bin/bash
set -e

# Only install if workspace symlinks are missing
if [ ! -d "artifacts/api-server/node_modules" ] || [ ! -d "artifacts/pregasquad-manager/node_modules" ]; then
  echo "Installing dependencies..."
  pnpm install
fi

# Build frontend if needed
if [ ! -f "artifacts/pregasquad-manager/dist/public/index.html" ]; then
  echo "Building frontend..."
  VITE_BIN=$(find /home/runner/workspace/node_modules/.pnpm -name "vite.js" -path "*/bin/vite.js" 2>/dev/null | head -1)
  cd artifacts/pregasquad-manager && node "$VITE_BIN" build --config vite.config.ts
  cd /home/runner/workspace
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
