-- TiDB Migration: Add new feature tables
-- Run this on your TiDB Cloud database

-- 1. Packages (Service Bundles)
CREATE TABLE IF NOT EXISTS packages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  services JSON NOT NULL DEFAULT '[]',
  original_price DOUBLE NOT NULL,
  discounted_price DOUBLE NOT NULL,
  valid_from TEXT,
  valid_until TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  max_uses_per_client INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. Package Purchases
CREATE TABLE IF NOT EXISTS package_purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  package_id INT NOT NULL,
  client_id INT NOT NULL,
  appointment_id INT,
  purchase_date TEXT NOT NULL,
  used_count INT NOT NULL DEFAULT 0,
  max_uses INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. Waitlist
CREATE TABLE IF NOT EXISTS waitlist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  requested_date TEXT NOT NULL,
  requested_time TEXT,
  service_ids JSON DEFAULT '[]',
  services_description TEXT,
  staff_id INT,
  staff_name TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  notified_at TIMESTAMP NULL,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Gift Cards
CREATE TABLE IF NOT EXISTS gift_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  initial_balance DOUBLE NOT NULL,
  current_balance DOUBLE NOT NULL,
  purchased_by INT,
  recipient_name VARCHAR(255),
  recipient_phone VARCHAR(50),
  expires_at TIMESTAMP NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 5. Gift Card Transactions
CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gift_card_id INT NOT NULL,
  appointment_id INT,
  amount DOUBLE NOT NULL,
  type VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 6. Referrals
CREATE TABLE IF NOT EXISTS referrals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  referrer_id INT NOT NULL,
  referee_id INT NOT NULL,
  referrer_points_awarded INT NOT NULL DEFAULT 0,
  referee_points_awarded INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 7. Staff Schedules (Weekly working hours)
CREATE TABLE IF NOT EXISTS staff_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  day_of_week INT NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 8. Staff Breaks
CREATE TABLE IF NOT EXISTS staff_breaks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  date TEXT NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 9. Staff Time Off
CREATE TABLE IF NOT EXISTS staff_time_off (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 10. Staff Goals (Performance targets)
CREATE TABLE IF NOT EXISTS staff_goals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  period VARCHAR(7) NOT NULL,
  revenue_target DOUBLE NOT NULL DEFAULT 0,
  appointments_target INT NOT NULL DEFAULT 0,
  commission_target DOUBLE NOT NULL DEFAULT 0,
  actual_revenue DOUBLE NOT NULL DEFAULT 0,
  actual_appointments INT NOT NULL DEFAULT 0,
  actual_commission DOUBLE NOT NULL DEFAULT 0,
  bonus_percentage DOUBLE NOT NULL DEFAULT 5,
  bonus_amount DOUBLE NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Done! All new feature tables created.
