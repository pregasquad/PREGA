# PREGA SQUAD Manager

A full-stack salon management system for PREGA SQUAD beauty salon — handles bookings, staff, inventory, clients, commissions, WhatsApp automation, and more.

## Quick Start (fresh import / first run)

Run these steps **in order** whenever you import or clone this repo:

```bash
# 1. Install all dependencies
pnpm install

# 2. Push the database schema (creates all tables)
#    drizzle-kit push requires a TTY — apply migrations directly instead:
node scripts/apply-migrations.js

# 3. Start the API server (port 8080)
#    In workflow: PORT=8080 pnpm --filter @workspace/api-server run dev

# 4. Start the frontend (port 24675)
#    In workflow: PORT=24675 BASE_PATH=/ pnpm --filter @workspace/pregasquad-manager run dev
```

## Workflows to configure

| Workflow name | Command | Port | Output type |
|---|---|---|---|
| `API Server` | `PORT=8080 pnpm --filter @workspace/api-server run dev` | 8080 | console |
| `Start application` | `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/pregasquad-manager run dev` | 5000 | webview |

> **Important:** Use port **5000** for the frontend, NOT 24675. The Replit platform holds port 24675 at the kernel level (it's the external port-80 mapping) — Vite cannot bind to it and will fail with "Port already in use".

## Run & Operate

- `pnpm install` — install all workspace dependencies (required first)
- `node scripts/apply-migrations.js` — create all DB tables from SQL migrations (use instead of drizzle-kit push, which requires TTY)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Required env: `DATABASE_URL` — Postgres connection string (auto-provided by Replit DB)

## Stack

- **Monorepo:** pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend:** React 19 + Vite, Tailwind CSS 4, Radix UI, TanStack Query, wouter, i18next (fr/ar/en)
- **Backend:** Express 5, Socket.io, esbuild bundle
- **DB:** PostgreSQL + Drizzle ORM (`lib/db`)
- **Integrations:** WhatsApp (Baileys), Google Gemini AI, PayPal, QZ Tray printing

## Where things live

| Path | What |
|---|---|
| `artifacts/pregasquad-manager/` | React + Vite frontend |
| `artifacts/api-server/` | Express backend |
| `artifacts/api-server/src/routes/routes.ts` | All API routes (~6600 lines) |
| `artifacts/api-server/src/storage.ts` | DB access layer |
| `lib/db/src/schema/` | Drizzle schema (source of truth) |
| `lib/db/drizzle/` | Generated SQL migrations |
| `scripts/apply-migrations.js` | Non-TTY migration runner |
| `artifacts/pregasquad-manager/src/pages/` | All frontend pages |
| `artifacts/pregasquad-manager/src/i18n/locales/` | FR / AR / EN translations |

## Architecture decisions

- **drizzle-kit push won't work in Replit shell** (no TTY) — use `node scripts/apply-migrations.js` which reads `lib/db/drizzle/*.sql` and applies them via raw SQL. The post-merge script does this automatically.
- **API server must have `PORT=8080`** set explicitly in the workflow command — it throws if PORT is missing.
- **Frontend must have `PORT=24675 BASE_PATH=/`** — Vite throws on missing PORT or BASE_PATH.
- **Booking page** is public (`/booking`) — no auth required. Admin dashboard (`/`) requires a PIN.
- **WhatsApp bot** auto-connect is disabled in Replit dev (`[Baileys] Replit dev — skipping auto-connect`) — it runs on the Koyeb production server instead.
- **PayPal 503** on `/api/paypal/config` is normal when PayPal env vars aren't set — the booking page handles it gracefully.

## Product

- **Public booking page** (`/booking`): clients book appointments, pick services/staff/time, optional PayPal payment
- **Admin dashboard** (`/`): PIN-protected; manage appointments, staff, services, clients, inventory, reports, WhatsApp bot, loyalty/tombola, commissions, planning, charges
- **Staff portal** (`/staff`): staff-facing view for their own schedule and performance

## User preferences

- Build and run the app without asking — set up workflows, push DB schema, and start both services automatically.
- drizzle-kit push is broken in this environment (no TTY) — always use `scripts/apply-migrations.js` instead.

## Gotchas

- **Always `pnpm install` before starting workflows** — node_modules may be missing after a fresh clone.
- **DB push needs the apply-migrations script** — `drizzle-kit push` and `push-force` both fail without a TTY terminal (interactive prompts).
- **Two workflows required** — both API Server and Manager App must be running; the frontend calls the API at `/api/*`.
- **Fresh DB first login**: enter any master password to create the first admin user.
- **Socket.io** runs on port 8080 (same as API) — no separate port needed.
