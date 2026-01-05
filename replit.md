# PREGASQUAD MANAGER

## Overview

A full-stack beauty salon appointment management application built with React, Express, and PostgreSQL. The system provides scheduling capabilities with a visual calendar interface, service management, staff tracking, and business analytics/reporting. Authentication is handled via Replit Auth (OpenID Connect).

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
- **Internationalization**: react-i18next with French (default), English, and Arabic languages

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **Build Tool**: esbuild for server bundling, Vite for client
- **API Design**: RESTful endpoints defined in `shared/routes.ts` with Zod schemas for type-safe request/response validation

### Data Storage
- **Database**: PostgreSQL via Neon serverless with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit for schema management (`db:push` command)
- **Environment Variables**: DATABASE_URL (PostgreSQL connection string)

### Authentication
- **Provider**: Replit Auth (OpenID Connect)
- **Session Management**: Express-session with memory store
- **Implementation**: Located in `server/replit_integrations/auth/`
- **User Storage**: Users table with profile information synced from Replit

### Project Structure
```
├── client/src/          # React frontend
│   ├── components/      # UI components (shadcn/ui)
│   ├── hooks/           # Custom React hooks
│   ├── pages/           # Route components
│   ├── i18n/            # Internationalization config and translations
│   │   ├── config.ts    # i18next configuration
│   │   └── locales/     # Translation files (en.json, fr.json, ar.json)
│   └── lib/             # Utilities and query client
├── server/              # Express backend
│   ├── routes.ts        # API route definitions
│   ├── storage.ts       # Database operations
│   └── replit_integrations/  # Auth integration
├── shared/              # Shared code between client/server
│   ├── schema.ts        # Drizzle database schema (PostgreSQL)
│   └── routes.ts        # API route contracts with Zod
└── migrations/          # Database migrations
```

### Key Data Models
- **Appointments**: Date, time, duration, client, service, staff, pricing, payment status
- **Services**: Name, price, duration, category, commission percent
- **Categories**: Service groupings
- **Staff**: Name, display color, phone, email, base salary
- **Clients**: Name, phone, email, birthday, loyalty points
- **Charges**: Expenses and charges tracking
- **Users/Sessions**: Replit Auth user profiles and session data

## External Dependencies

### Database
- **PostgreSQL**: Neon serverless PostgreSQL (requires DATABASE_URL)
- **Drizzle ORM**: Type-safe database queries and schema management with pg driver

### Authentication
- **Replit Auth**: OpenID Connect provider (requires `REPL_ID`, `SESSION_SECRET`)
- **Passport.js**: Authentication middleware with OpenID Connect strategy

### UI Libraries
- **Radix UI**: Headless accessible component primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Recharts**: Charting library for reports
- **date-fns**: Date manipulation utilities

### Notifications (SendZen)
- **WhatsApp**: Appointment reminders and booking confirmations via SendZen API
- **Endpoints**:
  - `POST /api/notifications/send` - Send custom WhatsApp message
  - `POST /api/notifications/appointment-reminder` - Send appointment reminder
  - `POST /api/notifications/booking-confirmation` - Send booking confirmation
- **Implementation**: `server/sendzen.ts`
- **Required Secrets**: `SENDZEN_API_KEY`, `SENDZEN_FROM_NUMBER`

### Development Tools
- **Vite**: Frontend dev server and bundler
- **esbuild**: Server bundling for production
- **TypeScript**: Type checking across the stack

## Development Commands
- `npm run dev` - Start development server on port 5000
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:push` - Push schema changes to database

## Recent Changes (January 2026)
- Configured for Replit environment with PostgreSQL database
- Migrated database from TiDB/MySQL to PostgreSQL using Neon serverless
- Updated Drizzle ORM configuration for PostgreSQL dialect
- Updated schema from mysql-core to pg-core
- Added multi-language support (French, English, Arabic) with RTL handling for Arabic
- Created LanguageSwitcher component with flag icons and persistent language preference
- Translations organized in client/src/i18n/locales/ with keys following {feature}.{key} pattern
- Added language switcher and full i18n support to Home page
- Schedule times now run from 00:00 to 23:30 (full 24-hour day)
- Added Quick Booking feature from client profiles:
  - One-click "Quick Book" button in client table
  - Shows client's frequent/past services for quick selection
  - Pre-fills client info (name, phone) automatically
  - Available from both client list and client detail dialog
- **Comprehensive Responsive Design Overhaul**:
  - Progressive padding using Tailwind breakpoints (p-2 → md:p-4 → lg:p-6)
  - Tiered typography scaling (text-xl → md:text-2xl → lg:text-3xl)
  - Breakpoint-aware grid layouts for mobile/tablet/desktop
  - Updated pages: Services, Clients, Inventory, Charges, Salaries, Reports, StaffPerformance
  - Smart scrolling in AppLayout: locked for Planning page, native scroll for other pages
  - Live time indicator updates every 30 seconds with smooth scrolling animation
