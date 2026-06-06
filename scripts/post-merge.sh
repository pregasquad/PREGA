#!/bin/bash
set -e
pnpm install --frozen-lockfile

DRIZZLE_KIT=$(find /home/runner/workspace/node_modules/.pnpm -name "bin.cjs" -path "*/drizzle-kit*/bin.cjs" 2>/dev/null | head -1)
if [ -n "$DRIZZLE_KIT" ]; then
  cd /home/runner/workspace/lib/db && node "$DRIZZLE_KIT" push --force --config ./drizzle.config.ts || true
  cd /home/runner/workspace
fi

VITE_BIN=$(find /home/runner/workspace/node_modules/.pnpm -name "vite.js" -path "*/vite/bin/vite.js" 2>/dev/null | head -1)
if [ -n "$VITE_BIN" ]; then
  cd /home/runner/workspace/artifacts/pregasquad-manager && node "$VITE_BIN" build --config vite.config.ts
  cd /home/runner/workspace
fi

cd /home/runner/workspace/artifacts/api-server && node ./build.mjs
