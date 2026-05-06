# PREGASQUAD MANAGER

A comprehensive beauty salon management system for scheduling appointments, managing staff, tracking inventory, handling finances, and running a loyalty/rewards program.

## Run & Operate
- `npm run dev` — Development server (tsx, port 5000)
- `npm run build` — Production build (Vite + esbuild → dist/)
- `npm run start` — Production server (node dist/index.cjs)
- `npm run db:push` — Push schema changes to database
- **Required env vars**: `DB_DIALECT`, `MYSQL_URL` (or `DATABASE_URL` for Postgres), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SESSION_SECRET`
- **Optional env vars**: `GEMINI_API_KEY` (AI recommendations), `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (push notifications)

## Stack
- **Frontend**: React 18, Vite 7, TypeScript, TailwindCSS 3, shadcn/ui (Radix), TanStack Query, Wouter, PWA (Workbox)
- **Backend**: Node.js 20, Express, TypeScript, Socket.IO
- **Database**: Drizzle ORM — MySQL/TiDB (primary, `DB_DIALECT=mysql`) or PostgreSQL (`DB_DIALECT=postgres`)
- **Build**: Vite (frontend), tsx (dev), esbuild (production server bundle)
- **Runtime**: Node 20

## Where things live
- `client/` — React frontend (entry: `client/index.html`, source: `client/src/`)
- `server/` — Express backend (entry: `server/index.ts`)
- `server/replit_integrations/` — Auth (OIDC/PIN) and object storage integrations
- `shared/schema/` — Drizzle schemas: `postgres.ts` and `mysql.ts`
- `script/` — Build scripts (build.ts, build-electron.ts)

## Architecture decisions
- **Dual DB support**: MySQL/TiDB for production (Koyeb/TiDB Cloud), PostgreSQL for Replit dev — switched via `DB_DIALECT` env var
- **PIN-based auth**: Primary auth is bcrypt-hashed PINs with role-based permissions (Owner/Manager/Receptionist); Replit OIDC auth is layered on top for developer access
- **Offline-first**: IndexedDB mirrors server data for offline use; service worker (Workbox) caches assets; startup migrations auto-run via `ensure*` functions in `server/db.ts`
- **WhatsApp via Baileys**: Free WhatsApp messaging (no paid API); session persisted to `baileys_sessions` DB table for ephemeral-FS resilience
- **Photo storage**: Staff photos stored as base64 in DB (not filesystem) for ephemeral-FS resilience

## Product
- Appointment scheduling with calendar/planning view
- Staff management, salary tracking, commissions, and employee wallet
- Inventory management with expiry tracking and low-stock alerts
- Financial tracking (revenue, expenses, net profit)
- Client loyalty points and gift card system
- Lucky Wheel (Tombola) promotional feature
- WhatsApp bot for appointment confirmations and reminders
- Remote thermal receipt printing via QZ Tray + Socket.IO relay
- Staff self-service portal (public token URL)
- PWA installable on mobile devices

## User preferences
- Default language: Arabic
- Production DB: MySQL/TiDB Cloud (`DB_DIALECT=mysql`)
- App runs on port 5000

## Gotchas
- QZ Tray WebSocket errors in browser console are expected in non-POS environments — the app falls back gracefully
- `drizzle.config.ts` throws if DB URL is missing — always set `MYSQL_URL` or `DATABASE_URL`
- Startup runs many `ensure*` migration functions — safe to re-run, idempotent
- Baileys (WhatsApp) session is restored from DB on startup; QR re-scan only needed if session is wiped

## Pointers
- DB schema: `shared/schema/mysql.ts` (production), `shared/schema/postgres.ts` (dev)
- Auth middleware: `server/replit_integrations/auth/replitAuth.ts`
- All API routes: `server/routes.ts`
