# PREGA SQUAD - Salon Management System

PREGA SQUAD is an all-in-one salon management platform built to simplify and modernize how beauty salons operate day to day. From scheduling appointments and managing staff to tracking inventory, handling finances, and rewarding loyal clients — everything is in one place.

The app features a beautiful, modern interface inspired by iOS Liquid Glass design with a cyan/teal color palette, full dark mode support, and seamless responsiveness across desktop, tablet, and mobile devices. It works as a Progressive Web App (PWA), meaning it can be installed on any phone or computer and continues to work even without an internet connection — syncing all changes automatically when you're back online.

Whether you're a solo stylist or running a team of professionals, PREGA SQUAD gives you the tools to stay organized, serve your clients better, and grow your business with real data and insights.

### Highlights
- Schedule and manage appointments with a visual drag-and-drop calendar
- Let clients book online through a public booking page
- Track client history, loyalty points, gift cards, and referrals
- Manage staff schedules, commissions, goals, and performance
- Monitor inventory with low-stock and expiry date alerts
- Analyze revenue, expenses, and salon profitability
- Works offline — install on your phone and use anywhere
- Available in French, English, and Arabic with full RTL support

## Features

### Appointment Management
- Visual planning calendar with drag-and-drop support
- Multi-service appointments with calculated total duration and price
- Live time indicator on the planning grid
- Staff-based scheduling with color-coded columns

### Public Booking Page
- Client-facing booking interface with service selection
- Automatic staff assignment based on specialization
- Category-based appointment splitting for multi-specialist bookings
- Waitlist system for fully booked time slots

### Client Management
- Client database with contact info, notes, and birthday tracking
- Appointment history and spending analytics
- VIP/Gold/Silver/Bronze tiers based on total spending
- Quick booking from client profiles

### Loyalty & Rewards
- Loyalty points earned per currency spent, redeemable for discounts
- Gift cards with unique codes and balance tracking
- Referral program with rewards for referrers and referees
- Package deals with discounted pricing and usage tracking

### Inventory Management
- Product stock tracking with low-stock alerts
- Automatic stock deduction when linked services are booked
- Expiry date tracking with configurable warning periods
- Push notifications for low stock and expiring products
- Color-coded visual indicators (expired, expiring soon, OK)

### Staff Management
- Weekly schedule configuration per staff member
- Break management and time-off requests
- Performance goals with revenue/appointment targets
- Commission tracking per service with bonus calculations

### Financial Tools
- Salary calculations with commissions, deductions, and bonuses
- Expense tracking by category (rent, utilities, products, etc.)
- Revenue reports with staff performance comparison
- Data export to CSV for backup and analysis

### AI Service Recommendations
- Timing suggestions based on client booking frequency
- Popular service pairings based on co-occurrence analysis
- Upsell recommendations for complementary services

### Multi-Language Support
- French, English, and Arabic
- Full RTL support for Arabic

### PWA & Offline Support
- Installable as a mobile app (Add to Home Screen)
- Full offline CRUD with automatic sync on reconnect
- Push notifications for appointments and inventory alerts
- Service worker caching for fast load times

### Security
- Role-based access control (Owner, Manager, Receptionist)
- PIN-based authentication with bcrypt hashing
- PIN reset via business phone verification

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** with shadcn/ui components
- **TanStack Query** for server state management
- **React Hook Form** + **Zod** for form validation
- **Recharts** for analytics charts
- **Wouter** for routing
- **react-i18next** for internationalization
- **Workbox** for service worker and offline caching

### Backend
- **Node.js** with **Express**
- **TypeScript** with ESM modules
- **Drizzle ORM** with PostgreSQL and MySQL support
- **web-push** for push notifications
- **bcryptjs** for password hashing

### Database
- **PostgreSQL** (primary)
- **MySQL/TiDB** (alternative)
- Automatic schema migrations on startup

## Getting Started

### Prerequisites
- Node.js 20.x
- PostgreSQL database

### Environment Variables
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `VAPID_PUBLIC_KEY` | Web push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web push VAPID private key |

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5000`.

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
client/                  # Frontend React application
  src/
    components/          # Reusable UI components
    pages/               # Page components
    hooks/               # Custom React hooks
    i18n/                # Translation files (en, fr, ar)
    lib/                 # Utility functions
server/                  # Backend Express server
  routes.ts              # API endpoints
  storage.ts             # Database operations
  push.ts                # Push notification logic
  db.ts                  # Database connection and migrations
shared/                  # Shared types and schemas
  schema/
    postgres.ts          # PostgreSQL schema definitions
    mysql.ts             # MySQL schema definitions
```

## License

MIT
