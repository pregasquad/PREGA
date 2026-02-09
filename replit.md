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
- 2026-02-09: Migrated appointments/staff_deductions to use staffId (ID-based relationships) instead of name-only matching; cascade rename logic covers both linked and legacy records
- 2026-02-09: Import migration completed - database provisioned, schema pushed, workflow configured
- 2026-02-08: Initial Replit setup, database created, schema pushed
