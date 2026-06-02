---
name: esbuild-plugin-pino symlink
description: esbuild-plugin-pino must be symlinked from pnpm store into api-server node_modules after fresh installs.
---

# Problem
`pnpm install` does not hoist `esbuild-plugin-pino` into `artifacts/api-server/node_modules`, so `build.mjs` fails with "Cannot find module 'esbuild-plugin-pino'".

# Fix
```bash
ln -sf $(pnpm -g root)/esbuild-plugin-pino artifacts/api-server/node_modules/esbuild-plugin-pino
# or find it in the pnpm store:
ln -sf $(find /root/.local/share/pnpm -name "esbuild-plugin-pino" -type d | head -1) artifacts/api-server/node_modules/esbuild-plugin-pino
```

**Why:** The package is a devDependency of the root workspace but pnpm workspace hoisting rules don't always surface it inside the nested artifact package's node_modules on Replit's NixOS environment.
