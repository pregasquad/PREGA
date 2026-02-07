# PREGASQUAD Manager

## Overview
Beauty Salon Appointment Management System built with Express + React (Vite) full-stack architecture. Uses PostgreSQL via Drizzle ORM.

## Project Architecture
- **Frontend**: React 18 with Vite, Radix UI components, TanStack Query, Tailwind CSS
- **Backend**: Express.js server with TypeScript (tsx)
- **Database**: PostgreSQL with Drizzle ORM (schema in `shared/schema/postgres.ts`)
- **Build**: esbuild for server bundling, Vite for client bundling
- **PWA**: Service worker support via vite-plugin-pwa

## Project Structure
```
client/          - React frontend (Vite dev server in middleware mode)
server/          - Express backend
  index.ts       - Server entry point (port 5000)
  routes.ts      - API routes
  db.ts          - Database connection and initialization
  vite.ts        - Vite dev server middleware setup
shared/          - Shared types and schemas
  schema/        - Drizzle ORM schemas (postgres.ts, mysql.ts)
script/          - Build scripts
attached_assets/ - Static assets
```

## Key Commands
- `npm run dev` - Start development server (port 5000)
- `npm run build` - Build for production (client + server)
- `npm run start` - Start production server
- `npm run db:push` - Push schema changes to database

## Environment
- Node.js 20
- PostgreSQL via DATABASE_URL
- Port 5000 for the combined Express + Vite server

## Recent Changes
- 2026-02-07: Initial Replit setup - database created, dependencies installed, schema pushed
