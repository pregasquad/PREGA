# PREGASQUAD MANAGER

## Overview
Beauty Salon Appointment Management System built with React + Express + PostgreSQL.

## Tech Stack
- **Frontend**: React 18, Vite, TailwindCSS, Radix UI, TanStack Query
- **Backend**: Express.js, TypeScript, Socket.IO
- **Database**: PostgreSQL (pg driver), Drizzle ORM
- **Build**: Vite (frontend), esbuild (server), tsx (dev)

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
- `DATABASE_URL` - PostgreSQL connection string (auto-configured by Replit)
- Port 5000 for the application

## Architecture Notes
- **Staff relationships**: appointments and staff_deductions use `staffId` (integer) for staff association, with `staff`/`staffName` kept as display names for backward compatibility
- **Staff rename cascade**: `updateStaff` in storage.ts updates both staffId-linked records AND legacy NULL-staffId records matching old name
- **Frontend filtering**: Uses dual pattern `app.staffId === s.id || (!app.staffId && app.staff === s.name)` for backward compatibility
- **Photo storage**: Staff profile photos stored as base64 in database (`photo` column) to survive ephemeral filesystem
- **Database migrations**: Startup migrations in `server/db.ts` handle backfilling staffId and creating indexes

## Recent Changes
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
- 2026-02-08: Initial Replit setup, database created, schema pushed
