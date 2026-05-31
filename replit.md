# PREGA SQUAD Manager

A comprehensive salon management system for PREGA SQUAD beauty salon. Handles appointments, staff, clients, inventory, salaries, WhatsApp automation, and more.

## Run & Operate

- `PORT=5000 pnpm --filter @workspace/api-server run dev` — run the API server (serves frontend + API on port 5000)
- `pnpm --filter @workspace/pregasquad-manager run build` — rebuild the React frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned by Replit)

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- Frontend: React 19, Vite, Tailwind CSS v4, Radix UI / shadcn, TanStack Query, Wouter
- API: Express 5, Socket.io
- DB: PostgreSQL + Drizzle ORM
- Auth: Replit Auth (openid-client + passport)
- Build: esbuild (API), Vite (frontend)
- WhatsApp: @whiskeysockets/baileys
- AI: Google Gemini (via AI_INTEGRATIONS_GEMINI_API_KEY or GEMINI_API_KEY)

## Where things live

- `artifacts/api-server/` — Express backend, serves both API and built frontend
- `artifacts/pregasquad-manager/` — React frontend (Vite)
- `lib/db/` — Drizzle schema + migrations (`drizzle/` folder)
- `lib/api-spec/` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/` — Generated React hooks
- `lib/api-zod/` — Generated Zod schemas

## Architecture decisions

- The API server (`artifacts/api-server`) serves the built React frontend statically. `static.ts` falls back to `pregasquad-manager/dist/public` if its own `dist/public` doesn't exist — this survives server rebuilds that wipe `dist/`.
- DB migrations are in `lib/db/drizzle/`. Apply with: `cd lib/db && /path/to/drizzle-kit push --force --config ./drizzle.config.ts` or run the SQL files directly against PostgreSQL.
- WhatsApp (Baileys) auto-connect is disabled in Replit dev mode; connect manually via the UI when needed.
- Auth uses PIN-based sessions for staff, plus optional Replit OIDC for owner login.

## Optional secrets (configure in Replit Secrets tab)

- `GEMINI_API_KEY` — Google Gemini AI (for WhatsApp bot + recommendations)
- `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` — PayPal payments
- `SENDZEN_API_KEY` / `SENDZEN_FROM_NUMBER` — SMS via SendZen
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — Web push notifications
- `GOOGLE_CLOUD_*` — Google Cloud Storage (for file uploads)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The API server build (`build.mjs`) wipes `dist/` on every rebuild. The frontend is served from `pregasquad-manager/dist/public` via the fallback path in `static.ts`.
- Always rebuild the frontend (`pnpm --filter @workspace/pregasquad-manager run build`) after frontend changes before the API server can serve the updated files.
- `drizzle-kit push` requires a TTY; use `--force` flag or apply SQL migration files directly.
- Express 5 does not support bare `*` in routes — use `*splat` instead.
