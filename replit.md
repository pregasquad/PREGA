# PREGASQUAD MANAGER

## Overview
Beauty Salon Appointment Management System built with a full-stack TypeScript architecture. Manages appointments, staff, services, products, and business settings for a beauty salon.

## Architecture
- **Frontend**: React 18 with Vite, TailwindCSS, Radix UI components, React Query
- **Backend**: Express.js with TypeScript (tsx)
- **Database**: PostgreSQL via Drizzle ORM (supports MySQL/TiDB as alternate)
- **Real-time**: Socket.IO for live updates
- **PWA**: Service worker with Workbox for offline support

## Project Structure
```
client/          - React frontend (Vite dev server in middleware mode)
server/          - Express backend API
  db.ts          - Database connection and initialization
  routes.ts      - API route definitions
  vite.ts        - Vite dev server middleware setup
  static.ts      - Production static file serving
shared/
  schema/        - Drizzle ORM schemas (postgres.ts, mysql.ts)
  schema.ts      - Re-exports postgres schema
script/
  build.ts       - Production build script (esbuild + vite)
attached_assets/ - Static assets and screenshots
```

## Key Configuration
- **Port**: 5000 (both dev and production)
- **Host**: 0.0.0.0
- **Database**: PostgreSQL via DATABASE_URL environment variable
- **Dev command**: `npm run dev` (runs tsx server/index.ts)
- **Build**: `npm run build` (tsx script/build.ts)
- **Production**: `npm run start` (node dist/index.cjs)

## Recent Changes
- 2026-02-07: Initial Replit setup - PostgreSQL database created, schema pushed, workflow configured
