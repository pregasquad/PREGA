# PREGASQUAD MANAGER

## Overview
Beauty Salon Appointment Management System built with React + Express + PostgreSQL.

## Tech Stack
- **Frontend**: React 18, Vite, TailwindCSS, Radix UI, TanStack Query
- **Backend**: Express.js, TypeScript, Socket.IO
- **Database**: PostgreSQL (Neon serverless driver), Drizzle ORM
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

## Recent Changes
- 2026-02-08: Initial Replit setup, database created, schema pushed
