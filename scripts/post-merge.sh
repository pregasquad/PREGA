#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
VITE_BIN=$(find /home/runner/workspace/node_modules/.pnpm -name "vite.js" -path "*/vite/bin/vite.js" 2>/dev/null | head -1)
if [ -n "$VITE_BIN" ]; then
  cd /home/runner/workspace/artifacts/pregasquad-manager && node "$VITE_BIN" build --config vite.config.ts
fi
