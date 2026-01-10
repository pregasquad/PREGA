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
- **Database**: Dual-dialect architecture with Drizzle ORM
  - **PostgreSQL (Replit)**: Uses `DATABASE_URL` for Replit development
  - **MySQL (Koyeb/TiDB)**: Uses `MYSQL_URL` with `DB_DIALECT=mysql` for production
- **Schema Location**: 
  - `shared/schema-postgres.ts` - PostgreSQL schema (pg-core)
  - `shared/schema-mysql.ts` - MySQL schema (mysql-core)  
  - `shared/schema.ts` - Auto-selects schema based on DB_DIALECT
- **Migrations**: Drizzle Kit for schema management (`db:push` command)
- **MySQL Fix**: All create/update methods in `server/storage.ts` handle drizzle-orm's ResultSetHeader object format for proper insertId extraction

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
- **BusinessSettings**: Business name, logo, address, contact info, currency, working hours/days

## External Dependencies

### Database
- **Dual-dialect support**: PostgreSQL (Replit) and MySQL (TiDB Cloud/Koyeb)
- **Environment variables**: 
  - `DATABASE_URL` - PostgreSQL connection for Replit
  - `MYSQL_URL` - MySQL connection for TiDB Cloud production
  - `DB_DIALECT` - Set to "mysql" for MySQL mode
- **Drizzle ORM**: Type-safe database queries with dialect-specific drivers

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
- **First Login Interface**: Users must login before accessing the application
  - Welcome screen with PREGA SQUAD branding
  - User selection dropdown with all configured admin users
  - PIN authentication using bcrypt-secured PINs from admin_roles table
  - "Setup First User" button when no users exist (for initial setup)
  - Public booking page (/booking) accessible without login
  - Session stored in sessionStorage for persistence during browser session
- **Business Settings Feature**: Configurable salon settings (business name, address, contact, currency, working hours/days)
  - Admin Settings page now has Business tab as the first tab
  - API endpoints: GET/PATCH /api/business-settings
  - Default values: "PREGA SQUAD", MAD currency (DH symbol), 09:00-19:00 hours, Mon-Sat working days
  - Working days stored as JSON array of day numbers (0=Sunday through 6=Saturday)
- **Dual-dialect Database Architecture**: Supports both PostgreSQL (Replit) and MySQL (TiDB/Koyeb)
- **MySQL Compatibility Fix**: All storage.ts methods correctly extract insertId from drizzle-orm ResultSetHeader
- **Error Handling**: All create/update operations validate results and throw descriptive errors
- **WhatsApp SendZen**: Fixed template language code from ar_SA to ar for Arabic templates
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
- **Live Time Indicator Redesign**:
  - Added paintbrush icon in orange gradient circle at the start of the live line
  - Icon stays sticky in time column when horizontally scrolling
  - Full RTL support for Arabic language (icon on right, gradient reversed)
  - Pulsing animation for visual emphasis
- **Database Connection Performance**:
  - Added connection pool warmup on server startup (5 pre-established connections)
  - First request response time improved from ~964ms to ~142ms (7x faster)
  - Configured pool limits (10 max connections) for optimal performance
  - Works on both Replit and Koyeb deployment platforms
- **Mobile UI Improvements**:
  - Logo now visible in mobile header (appears alongside hamburger menu)
  - Uses `md:hidden` class to only show on mobile devices
- **Currency Display Precision**:
  - Added `formatCurrency()` helper function for consistent currency display
  - All monetary values display with up to 2 decimal places
  - Removed Math.round() from commission calculations to preserve precision
  - Updated Salaries, Reports, and StaffPerformance pages
- **Admin Roles & Permissions System**:
  - Three-tier role system: Owner (full access), Manager (most features), Receptionist (appointments/clients only)
  - `admin_roles` table with bcrypt-hashed PINs for secure authentication
  - Predefined permission sets per role with customization support
  - AdminLock component protects sensitive pages requiring PIN authentication
  - PINs never exposed in API responses (masked as "****")
- **Admin Settings Page** (`/admin-settings`):
  - User management: Create, edit, delete admin users with role assignments
  - Data export functionality: CSV export for appointments, clients, services, staff, inventory, expenses
  - Export files compatible with Excel/Google Sheets for backup and analysis
- **Security Enhancements**:
  - bcryptjs for secure PIN hashing and comparison
  - All admin API endpoints validate and sanitize input
  - Role-based navigation: sidebar only shows permitted sections
- **Custom Spinning Logo Loading Indicator**:
  - SpinningLogo component (`client/src/components/ui/spinning-logo.tsx`) displays PREGA SQUAD logo with spin animation
  - Replaces all Loader2 icons across the app (Planning, Clients, Inventory, StaffPerformance, AdminSettings, App.tsx)
  - Logo stored at `client/public/prega_logo.png`
  - Sizes: sm (8), md (12), lg (16), xl (24) with 1.5s animation duration
- **Mobile/iPhone Performance Optimizations**:
  - Code splitting with React.lazy() for admin pages (Home, Services, Reports, Inventory, Salaries, Clients, StaffPerformance, AdminSettings)
  - Smart data caching with staleTime: Services/Staff/Categories (5 min), Clients/Products (1 min), Appointments (30 sec)
  - Reduced polling intervals - relies on Socket.IO for real-time updates with 2-3 minute fallback
  - Vite bundle optimization with manual chunks for vendor libraries (react, radix-ui, recharts)
  - Throttled visibility change handlers to prevent excessive refetches
  - refetchOnWindowFocus disabled for Socket-managed data
