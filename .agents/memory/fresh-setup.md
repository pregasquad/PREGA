---
name: Fresh setup sequence
description: Exact steps to get PREGA SQUAD running after a fresh import/clone — install, DB migration, workflows.
---

## Steps (in order)

1. `pnpm install` — installs all workspace deps (node_modules will be missing on fresh clone)
2. `node scripts/apply-migrations.js` — creates all DB tables. Do NOT use `drizzle-kit push` or `push-force` — both fail with "Interactive prompts require a TTY terminal".
3. Register artifacts so presentArtifact works: call `verifyAndReplaceArtifactToml` with the existing `artifacts/pregasquad-manager/.replit-artifact/artifact.toml` (both paths the same).
4. Start two workflows (use `configureWorkflow`):
   - **Frontend**: name=`Start application`, command=`PORT=5000 BASE_PATH=/ pnpm --filter @workspace/pregasquad-manager run dev`, waitForPort=5000, outputType=`webview`
   - **API**: name=`API Server`, command=`PORT=8080 pnpm --filter @workspace/api-server run dev`, waitForPort=8080, outputType=`console`

**Why PORT 5000 for frontend (not 24675):** The Replit platform holds port 24675 at the kernel/networking level (it's the external-80 mapped port). Vite cannot bind to it — it throws "Port 24675 is already in use". Port 5000 is free and the Replit proxy routes the external URL to it correctly via the artifact.toml `localPort = 5000` setting.

**Why:** drizzle-kit's TTY check is hard-coded and cannot be bypassed with `yes |` or `--force`. The `scripts/apply-migrations.js` script reads `lib/db/drizzle/*.sql` and applies each statement via raw pg, skipping "already exists" errors.

**How to apply:** Every time this repo is freshly imported or the DB is empty, run steps 1-2 before starting workflows.

## Workflow table

| Name | Command | waitForPort | outputType |
|---|---|---|---|
| `Start application` | `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/pregasquad-manager run dev` | 5000 | webview |
| `API Server` | `PORT=8080 pnpm --filter @workspace/api-server run dev` | 8080 | console |

## Required env vars
- `DATABASE_URL` — automatically provided by Replit's built-in Postgres (helium/heliumdb)
- API server reads `PORT` — must be set in workflow command (`PORT=8080 ...`)
- Frontend reads `PORT` and `BASE_PATH` — must be set (`PORT=5000 BASE_PATH=/ ...`)

## Artifacts
- pregasquad-manager id: `artifacts/pregasquad-manager` (from artifact.toml)
- api-server id: `3B4_FFSkEVBkAeYMFRJ2e` (from artifact.toml)
- After fresh import, `listArtifacts()` returns `[]` until you call `verifyAndReplaceArtifactToml`
- The artifact-managed workflow `artifacts/pregasquad-manager: web` will ALWAYS fail because it tries port 24675 (platform-held) — ignore it, `Start application` handles the frontend.

## Known non-errors
- `artifacts/pregasquad-manager: web` workflow fails — expected, platform holds port 24675; `Start application` serves the frontend on 5000
- `[Baileys] Replit dev — skipping auto-connect` — intentional; WhatsApp only connects on Koyeb prod
- `/api/paypal/config` returns 503 — intentional when PAYPAL_CLIENT_ID/SECRET not set
- QZ Tray WebSocket failures — intentional; QZ Tray is a local desktop app for receipt printing
