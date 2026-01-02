# PREGASQUAD MANAGER

## Overview

A full-stack beauty salon appointment management application built with React, Express, and TiDB Cloud (MySQL). The system provides scheduling capabilities with a visual calendar interface, service management, staff tracking, and business analytics/reporting. Authentication is handled via Replit Auth (OpenID Connect).

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

### Internationalization (i18n)
- **i18next**: Multi-language support with Arabic (default), French, and English
- **Translation files**: Located in `client/src/i18n/locales/`
- **Language Switcher**: Available in header and booking page

## Recent Changes

### January 2026
- Added multi-language support (Arabic, French, English) with language switcher
- Created public booking page at `/booking` for clients
- Added client management with loyalty points tracking and VIP tiers
- Implemented staff performance dashboard with charts
- Added low stock inventory alerts on dashboard
- Expense categories now loaded from database API

## SMS & WhatsApp Notifications

### YCloud Integration
- **Provider**: YCloud (https://www.ycloud.com/)
- **Implementation**: `server/notifications.ts`
- **Secrets Required**:
  - `YCLOUD_API_KEY` - Get from YCloud dashboard (required)
  - `YCLOUD_WHATSAPP_NUMBER` - Your WhatsApp Business number (optional, for WhatsApp)
- **Optional Environment Variables**:
  - `YCLOUD_WHATSAPP_TEMPLATE` - Template name for WhatsApp messages (default: "booking_confirmation")
  - `YCLOUD_WHATSAPP_TEMPLATE_LANG` - Template language code (default: "ar")
- **Behavior**: If WhatsApp is configured, tries WhatsApp first, falls back to SMS
- **Trigger**: Confirmation sent automatically when booking includes phone number
- **Phone Format**: Supports Moroccan numbers (06XXXXXXXX) - auto-converts to +212 format
- **API Endpoints**:
  - SMS: https://api.ycloud.com/v2/sms
  - WhatsApp: https://api.ycloud.com/v2/whatsapp/messages
- **WhatsApp Template**: Must be pre-approved in YCloud. Template should have 4 body parameters: client name, service, date, time

### Twilio WhatsApp Integration
- **Provider**: Twilio (managed via Replit integration)
- **Implementation**: `server/notifications.ts`
- **Setup**: Configured via Replit's Twilio connector (no manual secrets needed)
- **Behavior**: WhatsApp via Twilio is tried first, falls back to YCloud SMS if Twilio fails
- **Phone Format**: Supports Moroccan numbers (06XXXXXXXX) - auto-converts to +212 format