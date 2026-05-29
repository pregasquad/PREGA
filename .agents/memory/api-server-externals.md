---
name: API server esbuild externals
description: Packages that must be in the externals array of artifacts/api-server/build.mjs.
---

# API server esbuild externals

The api-server uses esbuild to bundle. Some packages cannot be bundled and must be in `external`.

**Why:** Some packages use native binaries (baileys), some use path traversal to load sibling files (google-cloud), and `zod/v4` is a subpath export that esbuild resolves differently.

**Externals in build.mjs:**
- `@whiskeysockets/baileys` — WhatsApp bot library with native binary deps
- `zod/v4` — Zod v4 subpath export; bundling it causes resolution issues
- `@google-cloud/*` — installed at runtime, not bundled
- `*.node` — native modules
- `better-sqlite3`, `sqlite3`, `canvas`, `bcrypt` — native/OS-specific

**Dynamic imports in routes.ts:** The file at `src/routes/routes.ts` uses `await import("../db")` (dynamic imports of the db module). These were originally `./db` but the file lives in `src/routes/`, so they must be `../db`. The copy script may reset this — always verify after copying.
