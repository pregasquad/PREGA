# PREGASQUAD MANAGER

## Overview
Beauty Salon Appointment Management System built with React + Express + PostgreSQL.

## Tech Stack
- **Frontend**: React 18, Vite, TailwindCSS, Radix UI, TanStack Query
- **Backend**: Express.js, TypeScript, Socket.IO
- **Database**: MySQL/TiDB (mysql2 driver), Drizzle ORM (also supports PostgreSQL via DB_DIALECT env var)
- **File Storage**: Supabase Storage (avatars/photos)
- **Build**: Vite (frontend), esbuild (server), tsx (dev)
- **PWA**: Workbox service worker, offline-first with IndexedDB sync

## Project Structure
- `client/` - React frontend (entry: `client/index.html`, source: `client/src/`)
- `server/` - Express backend (entry: `server/index.ts`)
- `shared/` - Shared types and schemas (Drizzle schema in `shared/schema/postgres.ts`)
- `script/` - Build scripts
- `attached_assets/` - Static assets

## Scripts
- `npm run dev` - Development server (tsx, port 5000)
- `npm run build` - Production build (Vite + esbuild)
- `npm run start` - Production server (node dist/index.cjs)
- `npm run db:push` - Push schema to database

## Environment
- `DB_DIALECT` - Database dialect: `mysql` (default/production) or `postgres`
- `MYSQL_URL` - MySQL/TiDB connection string (used when DB_DIALECT=mysql)
- `DATABASE_URL` - PostgreSQL connection string (used when DB_DIALECT=postgres)
- `SUPABASE_URL` - Supabase project URL (for file/avatar storage)
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (optional, for admin operations)
- `SESSION_SECRET` - Express session secret (auto-generated if not set, set for production)
- Port 5000 for the application

## Architecture Notes
- **Baileys session persistence**: WhatsApp auth is saved to `baileys_sessions` DB table after every `creds.update`; restored on server startup — session survives Koyeb/ephemeral FS restarts without re-linking
- **Gemini AI cascade**: `server/gemini.ts` tries models in order: `gemini-2.0-flash-lite` → `gemini-2.0-flash` → `gemini-1.5-flash-8b` → `gemini-1.5-flash`; returns `null` (bot stays silent) if all fail
- **Staff relationships**: appointments and staff_deductions use `staffId` (integer) for staff association, with `staff`/`staffName` kept as display names for backward compatibility
- **Staff rename cascade**: `updateStaff` in storage.ts updates both staffId-linked records AND legacy NULL-staffId records matching old name
- **Frontend filtering**: Uses dual pattern `app.staffId === s.id || (!app.staffId && app.staff === s.name)` for backward compatibility
- **Photo storage**: Staff profile photos stored as base64 in database (`photo` column) to survive ephemeral filesystem
- **Database migrations**: Startup migrations in `server/db.ts` handle backfilling staffId and creating indexes

## Receipt Printing Architecture
- **QZ Tray integration** (`client/src/lib/qzPrint.ts`): Silent printing via QZ Tray desktop app with ESC/POS commands, auto cash drawer kick, auto-selects default printer on first connection
- **Fully automatic print** (`client/src/lib/printReceipt.ts`): `autoPrint()` sends receipt directly to thermal printer via QZ Tray - no popup windows, no print dialogs, completely silent
- **Remote print relay**: Socket.IO relay allows phone/tablet clients to print and open cash drawer through POS computer. POS auto-registers as print station when QZ connects; remote clients use `checkPrintStationAsync()` → `remotePrint()`/`remoteOpenDrawer()` fallback chain
- **Print fallback chain**: Local QZ Tray → Remote relay via Socket.IO → Browser print dialog
- **Cash drawer debounce**: 2s in-flight guard on local `openCashDrawer()` + 2s server-side rate limit on remote drawer commands; single drawer kick per receipt (pin 0 only)
- **QZ Tray requirement**: Users must install free QZ Tray desktop app (qz.io) on their POS computer for fully automatic silent printing + cash drawer

## WhatsApp Integration (Baileys)
- **Provider**: `@whiskeysockets/baileys` — free, open-source, no paid API required
- **Auth**: QR code scan (like WhatsApp Web), session persisted to `./baileys_auth/` folder on disk
- **Server module**: `server/baileys.ts` — exports `initBaileys`, `sendWhatsAppMessage`, `sendBookingConfirmation`, `sendAppointmentReminder`, `sendBotConfirmed`, `sendBotCancelled`, `sendBotModify`, `sendBotError`, `setIncomingMessageHandler`, `getStatus`, `getQRDataUrl`, `disconnect`, `reconnect`
- **Auto-start**: Baileys initializes non-blocking on server start; auto-reconnects on drop (except intentional logout)
- **WhatsApp Bot (Booking Confirmations)**:
  - On new booking: sends French confirmation message with 1/2/3 reply options
  - Client replies: `1` → confirmed, `2` → cancelled, `3` → modify requested
  - Bot replies with French messages for each action
  - `bookingStatus` column on appointments table: `pending` | `confirmed` | `cancelled` | `modify_requested`
  - Incoming message handler registered in `server/routes.ts` via `setIncomingMessageHandler`
- **Reminders**: French reminder messages sent via Baileys (replaces wawp); cancelled bookings are skipped
- **Routes**: `GET /api/whatsapp/qr`, `GET /api/whatsapp/status`, `POST /api/whatsapp/reconnect`, `POST /api/whatsapp/disconnect`; all `/api/notifications/*` routes use Baileys
- **Frontend page**: `client/src/pages/WhatsApp.tsx` — QR display, connection status, test send, broadcast
- **Navigation**: `/whatsapp` route + sidebar item (admin_settings permission)
- **Legacy providers**: `server/wawp.ts`, `server/whapi.ts`, `server/wsapi.ts`, `server/wozzapi.ts` kept as reference but no longer imported anywhere

## Recent Changes
- 2026-02-11: Redesigned Dashboard (Home.tsx) with premium SaaS fintech layout - glassmorphism 2x2 summary cards (Revenue, Appointments, Paid, Unpaid), financial overview section with dominant net profit display, Stripe-style employee performance list with avatar/commission/appointment stats, closing day checklist card, low stock alerts; full RTL Arabic support; iPhone-optimized mobile layout
- 2026-02-11: Added expense attachment upload feature - charges can now have file attachments (images/PDF, max 5MB); stored as base64 in `attachment` column (TEXT for Postgres, LONGTEXT for MySQL); preview modal with image display or PDF download; paperclip icon indicator on expense items with attachments
- 2026-02-11: Added automated WhatsApp appointment reminders - sends 2hr before appointments via WAWP API; scheduler runs every 5min; handles cross-midnight appointments; in-memory deduplication
- 2026-02-11: Added Closing Day push notification reminder - sends push 30min before closing time (scheduled every 5min, deduped per day); manual trigger via POST /api/push/closing-reminder (admin only); cash verification is manual tap-to-confirm with per-day localStorage persistence
- 2026-02-22: Fixed loyalty toggle discount order - loyalty now applies to base total first (matching recalcTotalWithDiscounts), then gift card recalculated on remainder; fixed deductions running outside mutation onSuccess (balance corruption if save fails); fixed client-change during edit not properly restoring old client balances; added toast for edit gift card failure
- 2026-02-22: Deep loyalty/gift card system overhaul - added server-side validation (balance checks, negative amount rejection), appointment discount storage (loyaltyDiscountAmount, loyaltyPointsRedeemed, giftCardDiscountAmount columns), delete-restores redeemed points/balance, centralized computeBaseTotal for consistent calculations, edit dialog reconstructs discounts from stored data, manual total override clears discounts, toggle buttons use base total for accurate recalculation
- 2026-02-22: Fixed critical loyalty points award bug - server was using `getClientByName(item.client)` but appointment.client stores "Name (Phone)" format causing exact match to fail; now uses `getClient(item.clientId)` for reliable ID-based lookup with fallback to name match for legacy data
- 2026-02-11: Added Auto-Lock Appointments feature - locks editing on past days and after closing time; controlled by `autoLockEnabled` in business_settings; `edit_past_appointments` permission allows exempt users; owner always exempt; visual lock banner shown on Planning page when active
- 2026-02-10: Payback deductions no longer affect salon account - netProfit is now salonPortion - expenses only; paid-back amounts removed from salon summary and staff commissions summary stat
- 2026-02-10: Deductions now subtract from commissions, not wallet; wallet = earnings since last payment minus pending deductions; "Paid" button uses wallet balance; netPayable (commission - deductions) shown on Staff Portal; per-staff Math.max(0) applied to netStaffPayable
- 2026-02-10: Fixed MySQL/TiDB schema - added missing `publicToken` column to staff table in `shared/schema/mysql.ts`, which was causing SQL parse errors on production (Koyeb/TiDB) when accessing staff portal routes
- 2026-02-10: Redesigned Salaries page with iOS liquid glass cards - individual staff cards with profile photos, earnings breakdown, wallet balance, service details; uses Shadcn Card components with glass-card styling
- 2026-02-10: Default language changed to Arabic; language switcher added to Staff Portal page; Share Portal Link button added to Staff cards
- 2026-02-10: Math audit - fixed netStaffPayable to sum per-staff Math.max(0, commission-deductions) instead of global Math.max; fixed backend getStaffPerformance and StaffPerformance page to use custom per-staff commissions (staffCommissions table) for consistent calculations across all pages
- 2026-02-10: Added Employee Wallet feature to Salaries page - tracks accumulated staff earnings since last payment, with "Paid" button to reset wallet; uses staff_payments table
- 2026-02-10: Deduction display logic updated - pending deductions carry over monthly until paid, paid-back deductions only show in the month they were cleared
- 2026-02-09: Added MySQL/TiDB staff_id backfill migration (ensureStaffIdBackfillMySQL) - adds staff_id columns if missing, backfills from staff name matching, creates indexes
- 2026-02-09: Migrated appointments/staff_deductions to use staffId (ID-based relationships) instead of name-only matching; cascade rename logic covers both linked and legacy records
- 2026-02-09: Import migration completed - database provisioned, schema pushed, workflow configured
- 2026-04-20: Added Tombola Lucky Wheel feature - spin wheel with 10 segments (-20%, 40/60/80 SAR off, Free Service, Better Next Time); 1% win chance / 99% Better Next Time; device-based 48h cooldown tracked in tombola_spins table (both MySQL and PostgreSQL); sidebar nav item "Lucky Wheel" (🌟) accessible to all users; glassmorphism/dark purple theme matching app style; includes PREGASQUAD logo + countdown timer + result overlay
- 2026-04-20: Performance fix - removed refreshKey from Salaries.tsx query keys (was forcing full refetch on every page visit showing 0s for 5s); now uses invalidateQueries for background refresh while keeping cached data visible
- 2026-02-08: Initial Replit setup, database created, schema pushed
