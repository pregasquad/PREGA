# PREGASQUAD Manager

## Overview
Beauty Salon Appointment Management System built with Express + React (Vite). Full-stack TypeScript application with PostgreSQL database.

## Project Architecture
- **Frontend**: React 18 with Vite, TailwindCSS, Radix UI components, wouter routing
- **Backend**: Express.js with TypeScript (tsx)
- **Database**: PostgreSQL via Neon serverless driver + Drizzle ORM
- **Schema**: `shared/schema/postgres.ts` (primary), `shared/schema/mysql.ts` (alternate)
- **ORM Config**: `drizzle.config.ts`
- **Build**: Custom build script at `script/build.ts` (esbuild for server, Vite for client)

## Directory Structure
```
client/src/       - React frontend source
server/           - Express backend source
shared/schema/    - Drizzle ORM schema definitions
attached_assets/  - Static assets and images
script/           - Build scripts
```

## Key Commands
- `npm run dev` - Start development server (tsx server/index.ts, port 5000)
- `npm run build` - Build for production (Vite + esbuild)
- `npm run start` - Start production server (node dist/index.cjs)
- `npm run db:push` - Push schema changes to database

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (required)
- `DB_DIALECT` - Database dialect: 'postgres' (default) or 'mysql'
- `NODE_ENV` - Environment: 'development' or 'production'

## Recent Changes
- 2026-02-07: Initial Replit environment setup, PostgreSQL database created, schema pushed
