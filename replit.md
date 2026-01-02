# PREGASQUAD MANAGER

## Overview

A full-stack beauty salon appointment management application built with React, Express, and TiDB Cloud (MySQL). The system provides scheduling capabilities with a visual calendar interface, service management, staff tracking, and business analytics/reporting. Authentication is handled via Replit Auth (OpenID Connect).

## Recent Changes (January 2026)

- **Multi-Language Support**: Added i18next with Arabic, French, and English translations. Language switcher component in header.
- **Twilio WhatsApp/SMS Integration**: Send appointment reminders and confirmations via SMS or WhatsApp. Uses TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER secrets.
- **Client Management**: Loyalty points tracking, VIP tiers (Bronze, Silver, Gold, VIP), birthday reminders, visit history, referral system.
- **Staff Performance Dashboard**: Interactive charts showing revenue, appointments, and commission per staff member.
- **Low Stock Alerts**: Dashboard shows products below their threshold; uses /api/products/low-stock endpoint.
- **Expense Categories**: Dynamic expense categories loaded from /api/expense-categories API.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack Query (React Query) for server state caching and synchronization
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **Forms**: React Hook Form with Zod validation
- **Charts**: Recharts for analytics dashboards

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **Build Tool**: esbuild for server bundling, Vite for client
- **API Design**: RESTful endpoints defined in `shared/routes.ts` with Zod schemas for type-safe request/response validation

### Data Storage
- **Database**: TiDB Cloud (MySQL-compatible) via Drizzle ORM with mysql2 driver
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit for schema management (`db:push` command)
- **Environment Variables**: TIDB_HOST, TIDB_PORT, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE

### Authentication
- **Provider**: Replit Auth (OpenID Connect)
- **Session Management**: Express-session with PostgreSQL store
- **Implementation**: Located in `server/replit_integrations/auth/`
- **User Storage**: Users table with profile information synced from Replit

### Project Structure
```
├── client/src/          # React frontend
│   ├── components/      # UI components (shadcn/ui)
│   ├── hooks/           # Custom React hooks
│   ├── pages/           # Route components
│   └── lib/             # Utilities and query client
├── server/              # Express backend
│   ├── routes.ts        # API route definitions
│   ├── storage.ts       # Database operations
│   └── replit_integrations/  # Auth integration
├── shared/              # Shared code between client/server
│   ├── schema.ts        # Drizzle database schema
│   └── routes.ts        # API route contracts with Zod
└── migrations/          # Database migrations
```

### Key Data Models
- **Appointments**: Date, time, duration, client, service, staff, pricing, payment status
- **Services**: Name, price, duration, category
- **Categories**: Service groupings
- **Staff**: Name and display color for calendar UI
- **Users/Sessions**: Replit Auth user profiles and session data

## External Dependencies

### Database
- **TiDB Cloud**: MySQL-compatible distributed database (requires TIDB_HOST, TIDB_PORT, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE)
- **Drizzle ORM**: Type-safe database queries and schema management with mysql2 driver

### Authentication
- **Replit Auth**: OpenID Connect provider (requires `ISSUER_URL`, `REPL_ID`, `SESSION_SECRET`)
- **Passport.js**: Authentication middleware with OpenID Connect strategy

### UI Libraries
- **Radix UI**: Headless accessible component primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Recharts**: Charting library for reports
- **date-fns**: Date manipulation utilities

### Development Tools
- **Vite**: Frontend dev server and bundler
- **esbuild**: Server bundling for production
- **TypeScript**: Type checking across the stack