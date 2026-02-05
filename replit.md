# PREGASQUAD MANAGER

## Overview
PREGASQUAD MANAGER is a comprehensive full-stack application designed to streamline beauty salon operations. Its primary purpose is to manage appointments, services, staff, and clients, providing a visual calendar, secure authentication, and multi-language support. The system aims to enhance client experience, optimize salon efficiency, and offer valuable business insights through features like loyalty programs, package deals, and detailed analytics.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### General
The application is built with a clear separation of concerns between its frontend and backend. It leverages modern web technologies to deliver a responsive, intuitive, and feature-rich user experience. A key architectural decision is the dual-dialect database support for flexibility between development and production environments. The system also features robust offline capabilities and secure authentication.

### Frontend
- **Framework**: React 18 with TypeScript.
- **UI/UX**: Modern glassmorphism design with an iOS liquid glass aesthetic, warm orange palette, full dark mode, responsive design, and smooth CSS animations. Utilizes `shadcn/ui` (built on Radix UI) and Tailwind CSS for styling.
- **State Management**: TanStack Query for server state.
- **Routing**: Wouter.
- **Forms**: React Hook Form with Zod validation.
- **Charting**: Recharts.
- **Internationalization**: `react-i18next` (French, English, Arabic).
- **Key Features**: Elegant login, "First Login" setup, comprehensive admin settings, quick booking, live time indicator, and a home dashboard.

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ESM modules.
- **API Design**: RESTful endpoints with Zod schemas for type-safe validation.

### Data Storage
- **ORM**: Drizzle ORM, supporting both PostgreSQL (development) and MySQL (production).
- **Schema Management**: Drizzle Kit for migrations.
- **Key Models**: Appointments, Services, Categories, Staff, Clients, Charges, Users/Sessions, BusinessSettings.

### Authentication & Authorization
- **Provider**: Replit Auth (OpenID Connect).
- **Session Management**: Express-session.
- **Security**: bcryptjs for PIN hashing, role-based access control (Owner, Manager, Receptionist), and `AdminLock` for sensitive operations.

### Offline & PWA Capabilities
- **Database Bypass (Partial Offline)**: Enables user authentication even when the primary database is unavailable, using local JSON storage for admin roles. Features automatic detection, offline PIN authentication, and data synchronization when connection is restored.
- **Full PWA Offline Mode**:
  - **Installability**: Via "Add to Home Screen".
  - **Service Worker**: Workbox for asset caching (static assets, API responses, images/fonts).
  - **Full Offline CRUD**: All data operations (Appointments, Services, Categories, Staff, Clients) work offline with automatic synchronization upon reconnect.
  - **IndexedDB**: Stores offline data and a sync queue for pending changes.
  - **Sync Service**: Manages automatic data sync with retry logic and conflict resolution.
  - **Notifications**: Web push support for appointment reminders.

### Core Features
- **Planning Page**: Dynamic time slot generation based on business hours, working days, and a live time indicator.
- **Multi-Service Appointments**: Allows booking multiple services within a single appointment, with calculated total duration and price.
- **Public Booking Page**: Public-facing `/booking` route with an iOS liquid glass design, multi-service selection, visitor counter, and automatic staff assignment based on specialization. Supports category-based appointment splitting for multi-specialist bookings.
- **Client Portal (My Bookings)**: Clients can view and cancel upcoming appointments using their phone number, respecting configurable cancellation windows.
- **Loyalty & Rewards**:
  - **Loyalty Points**: Earn points per currency spent, automatically redeemable for discounts.
  - **Gift Cards**: Redeemable gift cards with unique codes and balance tracking.
  - **Referral Program**: Rewards for referrers and referees.
- **Package Deals**: Service bundles with discounted pricing, validity tracking, and usage per client.
- **Waitlist System**: Allows clients to join a waitlist for full slots, with real-time notifications and auto-expiry.
- **Booking History Page**: Dedicated page for managing and filtering all bookings, including quick staff assignment and highlighting unassigned bookings.
- **Staff Management**: Weekly schedules, break management, time-off requests, and performance goals with revenue/appointment targets and bonus systems.

## External Dependencies

### Database
- **Drizzle ORM**: For database interactions.
- **PostgreSQL**: Development database.
- **MySQL**: Production database.

### Authentication
- **Replit Auth**: Primary authentication provider.
- **Passport.js**: Authentication middleware.

### UI/Utilities
- **Radix UI**: Headless component primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Recharts**: Charting library.
- **date-fns**: Date manipulation.

### Notifications
- **Wawp.net**: For WhatsApp-based appointment reminders, booking confirmations, and bulk client broadcasts.