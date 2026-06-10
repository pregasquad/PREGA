#!/bin/bash
set -e

# Install if node_modules are missing (pnpm hoists to workspace root)
if [ ! -d "/home/runner/workspace/node_modules" ]; then
  echo "Installing dependencies..."
  pnpm install
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
