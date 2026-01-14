# PREGASQUAD MANAGER

## Overview

PREGASQUAD MANAGER is a full-stack beauty salon appointment management application. It offers comprehensive features for scheduling, service and staff management, client tracking, and business analytics. The system provides a visual calendar interface, secure authentication via Replit Auth, and multi-language support. Its core purpose is to streamline salon operations, enhance client experience, and provide valuable business insights.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query for server state
- **UI Components**: shadcn/ui built on Radix UI
- **Styling**: Tailwind CSS with CSS variables
- **Forms**: React Hook Form with Zod validation
- **Charts**: Recharts
- **Internationalization**: react-i18next (French, English, Arabic)
- **Design Philosophy**: Modern glassmorphism with an iOS liquid glass aesthetic, featuring a warm orange color palette and full dark mode support. Includes responsive design for various devices and smooth page transitions with CSS animations.
- **Key Features**: Elegant login screen, "First Login" setup for new users, comprehensive admin settings (business info, user management, data export), quick booking from client profiles, live time indicator, and a home dashboard with quick stats.

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **Build Tool**: esbuild for server, Vite for client
- **API Design**: RESTful endpoints with Zod schemas for type-safe validation.

### Data Storage
- **Database**: Dual-dialect architecture using Drizzle ORM
  - **PostgreSQL**: For Replit development (via `DATABASE_URL`)
  - **MySQL**: For production (via `MYSQL_URL` and `DB_DIALECT=mysql`)
- **Schema**: Defined in `shared/schema-postgres.ts` and `shared/schema-mysql.ts`, with `shared/schema.ts` for dialect selection.
- **Migrations**: Drizzle Kit (`db:push` command).
- **Key Models**: Appointments, Services, Categories, Staff, Clients, Charges, Users/Sessions, BusinessSettings.

### Authentication
- **Provider**: Replit Auth (OpenID Connect).
- **Session Management**: Express-session.
- **Security**: bcryptjs for PIN hashing, role-based access control with `admin_roles` table (Owner, Manager, Receptionist tiers), and an `AdminLock` component for sensitive pages.

### Project Structure
- `client/`: React frontend (components, hooks, pages, i18n, lib)
- `server/`: Express backend (routes, storage, Replit integrations)
- `shared/`: Code shared between client/server (schema, API route contracts)
- `migrations/`: Database migrations

## External Dependencies

### Database
- **Drizzle ORM**: Type-safe database queries.
- **PostgreSQL**: Primary development database.
- **MySQL (TiDB Cloud/Koyeb)**: Production database.

### Authentication
- **Replit Auth**: OpenID Connect provider.
- **Passport.js**: Authentication middleware.

### UI Libraries
- **Radix UI**: Headless accessible component primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Recharts**: Charting library.
- **date-fns**: Date manipulation utilities.

### Multi-Service Appointments
- **Feature**: Appointments can now have multiple services in a single booking
- **Storage**: `servicesJson` column stores array of service objects (name, price, duration)
- **Computed Fields**: Total duration, price, and service names are calculated from the array
- **Backward Compatibility**: Existing single-service appointments continue to work via the `service` field
- **Stock Validation**: All services are checked for linked product availability before booking

### Public Booking Page
- **Route**: `/booking` - Public-facing appointment booking page
- **Design**: iOS liquid glass aesthetic with glassmorphism effects, gradient backgrounds, and smooth animations
- **Multi-Service Support**: Clients can select multiple services, shown as removable pills with total calculation
- **Public API Endpoints** (rate-limited, sanitized responses):
  - `GET /api/public/services` - Service list (id, name, category, duration, price only)
  - `GET /api/public/staff` - Staff list (id, name, color only)
  - `GET /api/public/appointments` - Availability check (minimal appointment data)
  - `POST /api/public/appointments` - Create booking (strict input validation, forced unpaid status, multi-service support)
- **Security**: Rate limiting (10 req/min per IP), input validation with Zod, sanitized responses

### Notifications
- **SendZen API**: For WhatsApp appointment reminders and booking confirmations.
  - Endpoints: `/api/notifications/send`, `/api/notifications/appointment-reminder`, `/api/notifications/booking-confirmation`.

### Development Tools
- **Vite**: Frontend dev server and bundler.
- **esbuild**: Server bundling.
- **TypeScript**: Type checking.