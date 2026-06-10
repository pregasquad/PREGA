---
name: Server file layout
description: Canonical locations for all source files in this project
---

## Canonical paths
- **API server source**: `artifacts/api-server/src/`
  - Main routes: `artifacts/api-server/src/routes/routes.ts`
  - Auth middleware: `artifacts/api-server/src/replit_integrations/auth/replitAuth.ts`
  - DB/migrations: `artifacts/api-server/src/db.ts`
  - Storage layer: `artifacts/api-server/src/storage.ts`
  - Build script: `artifacts/api-server/build.mjs`
- **Frontend source**: `artifacts/pregasquad-manager/src/`
  - Pages: `artifacts/pregasquad-manager/src/pages/`
  - Shared lib: `artifacts/pregasquad-manager/src/lib/`
- **Old backup (IGNORE)**: `.migration-backup/client/` — stale, not served
- **No** `server/` directory at root (legacy, gone)

**Why:** The project was migrated to a pnpm workspaces / artifacts layout. Any grep for routes/auth in root `server/` will find nothing.
