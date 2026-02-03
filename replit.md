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

### Offline Mode / Database Bypass
- **Purpose**: Allows the app to function for user authentication even when the database is unavailable
- **Implementation**: 
  - `server/offline-storage.ts`: JSON-based local storage for admin roles
  - `server/db.ts`: Database connection status tracking with `isDatabaseOffline()`, `checkDatabaseConnection()`
  - `client/src/lib/databaseStatus.ts`: Centralized database status tracking module with `isEffectivelyOffline()`, `setDatabaseOffline()`, `initDatabaseStatusCheck()`
- **Features**:
  - Automatic offline mode detection when DATABASE_URL is not set or database is unreachable
  - Database status initialized at app startup and polled every 10 seconds
  - Detects database unavailability even when internet is available (e.g., DB down but network up)
  - Auth-critical fetch failures (5xx errors, network errors) automatically trigger offline mode
  - First user can create account via `/api/admin-roles/offline-setup` endpoint when no users exist
  - PIN-based authentication works in offline mode using locally stored credentials
  - Offline mode indicator shown in login screen
  - Data sync endpoint `/api/sync/offline-data` to transfer offline-created users to database when connection is restored
- **Limitations**: 
  - Only admin roles/authentication works in offline mode
  - Full app features (appointments, services, etc.) require database connection
- **Security**: Offline setup only allows first user creation; subsequent users require authenticated access

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

### Planning Page & Business Hours
- **Dynamic Time Slots**: Time slots in the planning calendar are generated from business settings (opening/closing times)
- **generateTimeSlots Function**: Creates 30-minute intervals between opening and closing times, handles overnight hours (e.g., 09:00-01:00)
- **Working Days**: Visual indicator shown when viewing a non-working day (doesn't block booking, just shows "Off Day" message)
- **Live Time Line**: Current time indicator that works correctly with dynamic hours, including overnight windows
- **Business Settings Integration**: Fetches `openingTime`, `closingTime`, and `workingDays` from `/api/business-settings`

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
- **Visitor Counter**: Displays total visitor count on the booking page, tracked via `page_views` table with atomic upserts
- **Auto Staff Assignment**: When booking, the system automatically assigns staff based on their category specializations
- **Category-Based Appointment Splitting**: If services are from different categories (e.g., Hair + Nails), the system creates separate appointments:
  - Each appointment is assigned to a specialist for that category
  - Appointments are scheduled sequentially (e.g., Hair at 14:00, Nails at 14:30)
  - Confirmation shows all created appointments with their assigned staff
- **Public API Endpoints** (rate-limited, sanitized responses):
  - `GET /api/public/services` - Service list (id, name, category, duration, price only)
  - `GET /api/public/staff` - Staff list (id, name, color only)
  - `GET /api/public/appointments` - Availability check (minimal appointment data)
  - `POST /api/public/appointments` - Create booking (strict input validation, forced unpaid status, multi-service support, auto-split by category)
  - `GET /api/public/page-views` - Get visitor count for a page
  - `POST /api/public/page-views` - Increment and return visitor count for a page
- **Security**: Rate limiting (10 req/min per IP), input validation with Zod, sanitized responses

### Loyalty & Rewards System
- **Loyalty Points**: Clients earn points per DH spent, redeemable for discounts
- **Use Points Toggle**: Clients have a `usePoints` boolean field that can be enabled from Client Details > Loyalty tab
- **Automatic Points Application**: When creating an appointment and selecting a client with `usePoints` enabled and available points, the system automatically calculates and applies a discount (0.1 DH per point) to the total. After the appointment is created, the points are deducted and `usePoints` is disabled automatically.
- **Gift Cards**: Generate unique 8-character codes, track balance, manage expiry. Gift cards are redeemed in the Client section, crediting the client's `giftCardBalance`. When creating an appointment, if the client has `useGiftCardBalance` enabled and a balance > 0, the system automatically applies the balance as a discount (capped at appointment total). After the appointment is saved, the balance is deducted and `useGiftCardBalance` is disabled.
- **Referral Program**: Reward referrers and referees with bonus points
- **Settings**: Configurable points-per-DH, points value, bonus amounts
- **Tables**: `gift_cards`, `referrals`, `clients.usePoints`, `clients.giftCardBalance`, `clients.useGiftCardBalance`
- **Routes**: `/api/gift-cards`, `/api/referrals`, `/api/clients/:id/use-points`, `/api/clients/:id/loyalty`, `/api/clients/:id/gift-card-balance`, `/api/clients/:id/use-gift-card-balance`

### Package Deals (Service Bundles)
- **Feature**: Bundle multiple services at discounted prices
- **Pricing**: Shows original vs discounted price with savings percentage
- **Validity**: Date range for package availability
- **Usage Tracking**: Track purchases and usage per client
- **Tables**: `packages`, `package_purchases`
- **Routes**: `/api/packages`, `/api/package-purchases`

### Waitlist System
- **Feature**: Clients can join waitlist when time slots are full
- **Real-time Updates**: Socket.IO events for instant notifications
- **Auto-expiry**: Entries expire 24 hours after requested date
- **Status Flow**: waiting → notified → booked (or expired)
- **Integration**: Collapsible section in Planning page, "Join Waitlist" button in Booking
- **Table**: `waitlist`
- **Routes**: `/api/waitlist`

### Booking History Page
- **Route**: `/booking-history` - Dedicated page for viewing and managing all bookings
- **Location**: `client/src/pages/BookingHistory.tsx`
- **Navigation**: Listed in sidebar under "Historique" with History icon
- **Features**:
  - Searchable table of all appointments
  - Filter by status (all, unassigned, assigned, paid, unpaid)
  - Filter by staff member
  - Quick staff assignment dropdown in each row
  - Badge showing count of unassigned bookings
  - Unassigned bookings highlighted in orange
  - Responsive table design
- **Sorting**: Prioritizes unassigned bookings, then sorts by date (newest first)

### Staff Schedule & Availability
- **Weekly Schedule**: Set working hours per day for each staff member
- **Breaks**: Schedule breaks that block bookings
- **Time Off**: Request and approve/reject time-off requests
- **Availability Check**: Public endpoint for booking integration
- **Tables**: `staff_schedules`, `staff_breaks`, `staff_time_off`
- **Routes**: `/api/staff/:id/schedule`, `/api/staff/:id/breaks`, `/api/staff/:id/time-off`

### Staff Performance Goals
- **Monthly Targets**: Set revenue and appointment targets per staff
- **Bonus System**: Configurable bonus percentage when both targets are met
- **Auto-calculation**: Calculate actuals from completed appointments
- **Status Tracking**: Active/achieved/missed status with visual progress bars
- **Table**: `staff_goals`
- **Routes**: `/api/staff/:id/goals`, `/api/staff/goals/summary`

### Notifications
- **Wozzapi**: For WhatsApp appointment reminders, booking confirmations, and bulk broadcasts.
  - Environment Variables: `WOZZAPI_TOKEN`, `WOZZAPI_SESSION_ID`
  - Endpoints:
    - `POST /api/notifications/send` - Send custom WhatsApp message
    - `POST /api/notifications/appointment-reminder` - Send appointment reminder
    - `POST /api/notifications/booking-confirmation` - Send booking confirmation
    - `POST /api/notifications/broadcast` - Bulk WhatsApp broadcast to clients
    - `GET /api/notifications/status` - Check Wozzapi connection status
  - Features: Text messages, media messages, appointment reminders, booking confirmations, waitlist notifications, gift card notifications

### Development Tools
- **Vite**: Frontend dev server and bundler.
- **esbuild**: Server bundling.
- **TypeScript**: Type checking.