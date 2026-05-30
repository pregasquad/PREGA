---
name: Fresh setup sequence
description: Exact steps to get PREGA SQUAD running after a fresh import/clone — install, DB migration, workflows.
---

## Steps (in order)

1. `pnpm install` — installs all workspace deps (node_modules will be missing on fresh clone)
2. `node scripts/apply-migrations.js` — creates all DB tables. Do NOT use `drizzle-kit push` or `push-force` — both fail with "Interactive prompts require a TTY terminal" because the Replit shell is non-TTY and drizzle-kit shows a conflict prompt.
3. Start two workflows:
   - `API Server`: `PORT=8080 pnpm --filter @workspace/api-server run dev` (console, port 8080)
   - `Manager App`: `PORT=24675 BASE_PATH=/ pnpm --filter @workspace/pregasquad-manager run dev` (webview, port 24675)
4. Register artifacts in platform: call `verifyAndReplaceArtifactToml` with the existing `artifacts/pregasquad-manager/.replit-artifact/artifact.toml` path — this makes `listArtifacts()` and `presentArtifact()` work.

**Why:** drizzle-kit's TTY check is hard-coded and cannot be bypassed with `yes |` or `--force`. The `scripts/apply-migrations.js` script reads `lib/db/drizzle/*.sql` and applies each statement via raw pg, skipping "already exists" errors.

**How to apply:** Every time this repo is freshly imported or the DB is empty, run step 1 then 2 before starting workflows.

## Required env vars
- `DATABASE_URL` — automatically provided by Replit's built-in Postgres (helium/heliumdb)
- API server reads `PORT` — must be set in workflow command (`PORT=8080 ...`)
- Frontend reads `PORT` and `BASE_PATH` — must be set (`PORT=24675 BASE_PATH=/ ...`)

## Artifacts
- pregasquad-manager id: `artifacts/pregasquad-manager` (from artifact.toml)
- api-server id: `3B4_FFSkEVBkAeYMFRJ2e` (from artifact.toml)
- After fresh import, `listArtifacts()` returns `[]` until you call `verifyAndReplaceArtifactToml`

## Known non-errors
- `[Baileys] Replit dev — skipping auto-connect` — intentional; WhatsApp only connects on Koyeb prod
- `/api/paypal/config` returns 503 — intentional when PAYPAL_CLIENT_ID/SECRET not set
- QZ Tray WebSocket failures — intentional; QZ Tray is a local desktop app for receipt printing
