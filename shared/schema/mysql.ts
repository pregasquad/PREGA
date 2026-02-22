import { mysqlTable, text, longtext, int, boolean, timestamp, varchar, serial, double, index, json } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const sessions = mysqlTable(
  "sessions",
  {
    sid: varchar("sid", { length: 255 }).primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).unique(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  profileImageUrl: varchar("profile_image_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const clients = mysqlTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  birthday: text("birthday"),
  notes: text("notes"),
  loyaltyPoints: int("loyalty_points").notNull().default(0),
  loyaltyEnrolled: boolean("loyalty_enrolled").notNull().default(false),
  usePoints: boolean("use_points").notNull().default(false),
  giftCardBalance: double("gift_card_balance").notNull().default(0),
  useGiftCardBalance: boolean("use_gift_card_balance").notNull().default(false),
  totalVisits: int("total_visits").notNull().default(0),
  totalSpent: double("total_spent").notNull().default(0),
  referredBy: int("referred_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const products = mysqlTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  quantity: int("quantity").notNull().default(0),
  lowStockThreshold: int("low_stock_threshold").notNull().default(5),
  expiryDate: text("expiry_date"),
  expiryWarningDays: int("expiry_warning_days").notNull().default(30),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true }).extend({
  name: z.string().min(1, "Product name is required"),
  quantity: z.number().int().min(0, "Quantity must be non-negative").optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  expiryDate: z.string().optional().nullable(),
  expiryWarningDays: z.number().int().min(1).optional(),
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true, loyaltyPoints: true, totalVisits: true, totalSpent: true, giftCardBalance: true }).extend({
  name: z.string().min(1, "Client name is required"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  birthday: z.string().optional(),
  notes: z.string().optional(),
  referredBy: z.number().int().optional(),
  loyaltyEnrolled: z.boolean().optional(),
  usePoints: z.boolean().optional(),
  useGiftCardBalance: z.boolean().optional(),
});
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

export const appointments = mysqlTable("appointments", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  duration: int("duration").notNull(),
  client: text("client").notNull(),
  clientId: int("client_id"),
  phone: text("phone"),
  service: text("service"),
  servicesJson: text("services_json"),
  staff: text("staff").notNull(),
  staffId: int("staff_id"),
  price: double("price").notNull(),
  total: double("total").notNull(),
  paid: boolean("paid").default(false).notNull(),
  loyaltyPointsEarned: int("loyalty_points_earned").default(0),
  loyaltyDiscountAmount: double("loyalty_discount_amount").default(0),
  loyaltyPointsRedeemed: int("loyalty_points_redeemed").default(0),
  giftCardDiscountAmount: double("gift_card_discount_amount").default(0),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const services = mysqlTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: double("price").notNull(),
  duration: int("duration").notNull(),
  category: text("category").notNull(),
  linkedProductId: int("linked_product_id"),
  linkedProductIds: json("linked_product_ids").$type<number[]>().default([]),
  commissionPercent: double("commission_percent").notNull().default(50),
  loyaltyPointsMultiplier: int("loyalty_points_multiplier").notNull().default(1),
  isStartingPrice: boolean("is_starting_price").notNull().default(false),
});

export const categories = mysqlTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
});

export const staff = mysqlTable("staff", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  phone: text("phone"),
  email: text("email"),
  baseSalary: double("base_salary").notNull().default(0),
  photoUrl: text("photo_url"),
  categories: text("categories"),
  publicToken: text("public_token"),
});

export const expenseCategories = mysqlTable("expense_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  color: varchar("color", { length: 50 }).notNull().default("#6b7280"),
});

export const charges = mysqlTable("charges", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  amount: double("amount").notNull(),
  date: text("date").notNull(),
  categoryId: int("category_id"),
  attachment: longtext("attachment"),
  attachmentName: varchar("attachment_name", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChargeSchema = createInsertSchema(charges).omit({ id: true, createdAt: true }).extend({
  type: z.string().min(1, "Type is required"),
  name: z.string().min(1, "Name is required"),
  amount: z.number().min(0, "Amount must be non-negative"),
  date: z.string().min(1, "Date is required"),
  categoryId: z.number().int().optional(),
  attachment: z.string().nullable().optional(),
  attachmentName: z.string().nullable().optional(),
});
export type Charge = typeof charges.$inferSelect;
export type InsertCharge = z.infer<typeof insertChargeSchema>;

export const staffDeductions = mysqlTable("staff_deductions", {
  id: serial("id").primaryKey(),
  staffName: text("staff_name").notNull(),
  staffId: int("staff_id"),
  type: text("type").notNull(),
  description: text("description").notNull(),
  amount: double("amount").notNull(),
  date: text("date").notNull(),
  cleared: boolean("cleared").notNull().default(false),
  clearedAt: timestamp("cleared_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStaffDeductionSchema = createInsertSchema(staffDeductions).omit({ id: true, createdAt: true }).extend({
  staffName: z.string().min(1, "Staff name is required"),
  type: z.enum(["advance", "loan", "penalty", "other"]),
  description: z.string().min(1, "Description is required"),
  amount: z.number().min(0, "Amount must be non-negative"),
  date: z.string().min(1, "Date is required"),
});
export type StaffDeduction = typeof staffDeductions.$inferSelect;
export type InsertStaffDeduction = z.infer<typeof insertStaffDeductionSchema>;

export const loyaltyRedemptions = mysqlTable("loyalty_redemptions", {
  id: serial("id").primaryKey(),
  clientId: int("client_id").notNull(),
  pointsUsed: int("points_used").notNull(),
  rewardDescription: text("reward_description").notNull(),
  date: text("date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLoyaltyRedemptionSchema = createInsertSchema(loyaltyRedemptions).omit({ id: true, createdAt: true }).extend({
  clientId: z.number().int(),
  pointsUsed: z.number().int().min(1),
  rewardDescription: z.string().min(1),
  date: z.string().min(1),
});
export type LoyaltyRedemption = typeof loyaltyRedemptions.$inferSelect;
export type InsertLoyaltyRedemption = z.infer<typeof insertLoyaltyRedemptionSchema>;

const serviceItemSchema = z.object({
  name: z.string().min(1),
  price: z.number().min(0),
  duration: z.number().int().min(1),
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true }).extend({
  service: z.string().optional().nullable(),
  servicesJson: z.array(serviceItemSchema).optional().nullable(),
});
export const insertServiceSchema = createInsertSchema(services).omit({ id: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertExpenseCategorySchema = createInsertSchema(expenseCategories).omit({ id: true });
export const insertStaffSchema = createInsertSchema(staff).omit({ id: true }).extend({
  name: z.string().min(1, "Staff name is required"),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Must be valid hex color"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  baseSalary: z.number().min(0).optional(),
  photoUrl: z.string().optional().or(z.literal("")).nullable(),
  categories: z.string().optional(),
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type InsertExpenseCategory = z.infer<typeof insertExpenseCategorySchema>;
export type Staff = typeof staff.$inferSelect;
export type InsertStaff = z.infer<typeof insertStaffSchema>;

export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true });
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;

export const adminRoles = mysqlTable("admin_roles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  role: varchar("role", { length: 50 }).notNull().default("receptionist"),
  pin: varchar("pin", { length: 255 }),
  photoUrl: text("photo_url"),
  permissions: json("permissions").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAdminRoleSchema = createInsertSchema(adminRoles).omit({ id: true, createdAt: true }).extend({
  name: z.string().min(1, "Name is required"),
  role: z.enum(["owner", "manager", "receptionist"]),
  pin: z.string().min(4).optional(),
  photoUrl: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});
export type AdminRole = typeof adminRoles.$inferSelect;
export type InsertAdminRole = z.infer<typeof insertAdminRoleSchema>;

export const ROLE_PERMISSIONS = {
  owner: [
    "view_home",
    "view_planning", "manage_appointments", "edit_cardboard",
    "view_clients", "manage_clients",
    "view_services", "manage_services",
    "view_inventory", "manage_inventory",
    "view_expenses", "manage_expenses",
    "view_salaries", "manage_salaries",
    "view_reports",
    "view_staff", "view_staff_performance",
    "manage_staff",
    "admin_settings",
    "export_data",
    "view_packages", "manage_packages",
    "view_loyalty", "manage_loyalty",
    "view_gift_cards", "manage_gift_cards",
    "manage_staff_goals",
    "manage_waitlist"
  ],
  manager: [
    "view_home",
    "view_planning", "manage_appointments", "edit_cardboard",
    "view_clients", "manage_clients", 
    "view_services", "manage_services",
    "view_inventory", "manage_inventory",
    "view_expenses", "manage_expenses",
    "view_salaries",
    "view_reports",
    "view_staff_performance",
    "export_data",
    "view_packages",
    "view_loyalty",
    "view_gift_cards"
  ],
  receptionist: [
    "view_home",
    "view_planning", "manage_appointments",
    "view_clients",
    "view_services"
  ]
} as const;

export const businessSettings = mysqlTable("business_settings", {
  id: serial("id").primaryKey(),
  businessName: varchar("business_name", { length: 255 }).notNull().default("PREGA SQUAD"),
  logo: text("logo"),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  currency: varchar("currency", { length: 10 }).notNull().default("MAD"),
  currencySymbol: varchar("currency_symbol", { length: 10 }).notNull().default("DH"),
  openingTime: varchar("opening_time", { length: 10 }).notNull().default("09:00"),
  closingTime: varchar("closing_time", { length: 10 }).notNull().default("19:00"),
  workingDays: json("working_days").$type<number[]>().notNull().default([1, 2, 3, 4, 5, 6]),
  loyaltyEnabled: boolean("loyalty_enabled").notNull().default(true),
  loyaltyPointsPerDh: int("loyalty_points_per_dh").notNull().default(1),
  loyaltyPointsValue: double("loyalty_points_value").notNull().default(0.1),
  referralBonusPoints: int("referral_bonus_points").notNull().default(100),
  referralBonusReferee: int("referral_bonus_referee").notNull().default(50),
  cancellationHours: int("cancellation_hours").notNull().default(24),
  autoLockEnabled: boolean("auto_lock_enabled").notNull().default(false),
  planningShortcuts: json("planning_shortcuts").$type<string[]>().notNull().default(["Soin Visage", "Soin Corps", "Massage", "Manucure", "Pédicure", "Épilation", "Coiffure", "Maquillage"]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const giftCards = mysqlTable("gift_cards", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  initialBalance: double("initial_balance").notNull(),
  currentBalance: double("current_balance").notNull(),
  purchasedBy: int("purchased_by"),
  recipientName: varchar("recipient_name", { length: 255 }),
  recipientPhone: varchar("recipient_phone", { length: 50 }),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGiftCardSchema = createInsertSchema(giftCards).omit({ id: true, createdAt: true }).extend({
  code: z.string().min(1),
  initialBalance: z.number().min(1),
  currentBalance: z.number().min(0),
});
export type GiftCard = typeof giftCards.$inferSelect;
export type InsertGiftCard = z.infer<typeof insertGiftCardSchema>;

export const giftCardTransactions = mysqlTable("gift_card_transactions", {
  id: serial("id").primaryKey(),
  giftCardId: int("gift_card_id").notNull(),
  appointmentId: int("appointment_id"),
  amount: double("amount").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const referrals = mysqlTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: int("referrer_id").notNull(),
  refereeId: int("referee_id").notNull(),
  referrerPointsAwarded: int("referrer_points_awarded").notNull().default(0),
  refereePointsAwarded: int("referee_points_awarded").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertReferralSchema = createInsertSchema(referrals).omit({ id: true, createdAt: true });
export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = z.infer<typeof insertReferralSchema>;

export const insertBusinessSettingsSchema = createInsertSchema(businessSettings).omit({ id: true, updatedAt: true });
export type BusinessSettings = typeof businessSettings.$inferSelect;
export type InsertBusinessSettings = z.infer<typeof insertBusinessSettingsSchema>;

export const staffCommissions = mysqlTable("staff_commissions", {
  id: serial("id").primaryKey(),
  staffId: int("staff_id").notNull(),
  serviceId: int("service_id").notNull(),
  percentage: double("percentage").notNull().default(50),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStaffCommissionSchema = createInsertSchema(staffCommissions).omit({ id: true, createdAt: true, updatedAt: true }).extend({
  staffId: z.number().int(),
  serviceId: z.number().int(),
  percentage: z.number().min(0).max(100),
});
export type StaffCommission = typeof staffCommissions.$inferSelect;
export type InsertStaffCommission = z.infer<typeof insertStaffCommissionSchema>;

export const pageViews = mysqlTable("page_views", {
  id: serial("id").primaryKey(),
  pagePath: varchar("page_path", { length: 255 }).notNull().unique(),
  viewCount: int("view_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PageView = typeof pageViews.$inferSelect;

export const packages = mysqlTable("packages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  services: json("services").$type<number[]>().notNull().default([]),
  originalPrice: double("original_price").notNull(),
  discountedPrice: double("discounted_price").notNull(),
  validFrom: text("valid_from"),
  validUntil: text("valid_until"),
  isActive: boolean("is_active").notNull().default(true),
  maxUsesPerClient: int("max_uses_per_client").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPackageSchema = createInsertSchema(packages).omit({ id: true, createdAt: true }).extend({
  name: z.string().min(1, "Package name is required"),
  description: z.string().optional(),
  services: z.array(z.number().int()).min(1, "At least one service is required"),
  originalPrice: z.number().min(0),
  discountedPrice: z.number().min(0),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  isActive: z.boolean().optional(),
  maxUsesPerClient: z.number().int().min(1).optional(),
});
export type Package = typeof packages.$inferSelect;
export type InsertPackage = z.infer<typeof insertPackageSchema>;

export const packagePurchases = mysqlTable("package_purchases", {
  id: serial("id").primaryKey(),
  packageId: int("package_id").notNull(),
  clientId: int("client_id").notNull(),
  appointmentId: int("appointment_id"),
  purchaseDate: text("purchase_date").notNull(),
  usedCount: int("used_count").notNull().default(0),
  maxUses: int("max_uses").notNull().default(1),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPackagePurchaseSchema = createInsertSchema(packagePurchases).omit({ id: true, createdAt: true }).extend({
  packageId: z.number().int(),
  clientId: z.number().int(),
  appointmentId: z.number().int().optional(),
  purchaseDate: z.string().min(1),
  usedCount: z.number().int().min(0).optional(),
  maxUses: z.number().int().min(1).optional(),
  status: z.enum(["active", "completed", "expired", "cancelled"]).optional(),
});
export type PackagePurchase = typeof packagePurchases.$inferSelect;
export type InsertPackagePurchase = z.infer<typeof insertPackagePurchaseSchema>;

export const waitlist = mysqlTable("waitlist", {
  id: serial("id").primaryKey(),
  clientId: int("client_id"),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone"),
  requestedDate: text("requested_date").notNull(),
  requestedTime: text("requested_time"),
  serviceIds: json("service_ids").$type<number[]>().default([]),
  servicesDescription: text("services_description"),
  staffId: int("staff_id"),
  staffName: text("staff_name"),
  status: varchar("status", { length: 20 }).notNull().default("waiting"),
  notifiedAt: timestamp("notified_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWaitlistSchema = createInsertSchema(waitlist).omit({ id: true, createdAt: true }).extend({
  clientName: z.string().min(1, "Client name is required"),
  clientPhone: z.string().optional(),
  requestedDate: z.string().min(1, "Date is required"),
  requestedTime: z.string().optional(),
  serviceIds: z.array(z.number().int()).optional(),
  servicesDescription: z.string().optional(),
  staffId: z.number().int().optional(),
  staffName: z.string().optional(),
  status: z.enum(["waiting", "notified", "booked", "expired"]).optional(),
});
export type Waitlist = typeof waitlist.$inferSelect;
export type InsertWaitlist = z.infer<typeof insertWaitlistSchema>;

export const staffSchedules = mysqlTable("staff_schedules", {
  id: serial("id").primaryKey(),
  staffId: int("staff_id").notNull(),
  dayOfWeek: int("day_of_week").notNull(),
  startTime: varchar("start_time", { length: 10 }).notNull(),
  endTime: varchar("end_time", { length: 10 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStaffScheduleSchema = createInsertSchema(staffSchedules).omit({ id: true, createdAt: true }).extend({
  staffId: z.number().int(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  isActive: z.boolean().optional(),
});
export type StaffSchedule = typeof staffSchedules.$inferSelect;
export type InsertStaffSchedule = z.infer<typeof insertStaffScheduleSchema>;

export const staffBreaks = mysqlTable("staff_breaks", {
  id: serial("id").primaryKey(),
  staffId: int("staff_id").notNull(),
  date: text("date").notNull(),
  startTime: varchar("start_time", { length: 10 }).notNull(),
  endTime: varchar("end_time", { length: 10 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStaffBreakSchema = createInsertSchema(staffBreaks).omit({ id: true, createdAt: true }).extend({
  staffId: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.string().optional(),
});
export type StaffBreak = typeof staffBreaks.$inferSelect;
export type InsertStaffBreak = z.infer<typeof insertStaffBreakSchema>;

export const staffTimeOff = mysqlTable("staff_time_off", {
  id: serial("id").primaryKey(),
  staffId: int("staff_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStaffTimeOffSchema = createInsertSchema(staffTimeOff).omit({ id: true, createdAt: true }).extend({
  staffId: z.number().int(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});
export type StaffTimeOff = typeof staffTimeOff.$inferSelect;
export type InsertStaffTimeOff = z.infer<typeof insertStaffTimeOffSchema>;

export const staffGoals = mysqlTable("staff_goals", {
  id: serial("id").primaryKey(),
  staffId: int("staff_id").notNull(),
  period: varchar("period", { length: 7 }).notNull(),
  revenueTarget: double("revenue_target").notNull().default(0),
  appointmentsTarget: int("appointments_target").notNull().default(0),
  commissionTarget: double("commission_target").notNull().default(0),
  actualRevenue: double("actual_revenue").notNull().default(0),
  actualAppointments: int("actual_appointments").notNull().default(0),
  actualCommission: double("actual_commission").notNull().default(0),
  bonusPercentage: double("bonus_percentage").notNull().default(5),
  bonusAmount: double("bonus_amount").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStaffGoalSchema = createInsertSchema(staffGoals).omit({ id: true, createdAt: true }).extend({
  staffId: z.number().int(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM format"),
  revenueTarget: z.number().min(0).optional(),
  appointmentsTarget: z.number().int().min(0).optional(),
  commissionTarget: z.number().min(0).optional(),
  actualRevenue: z.number().min(0).optional(),
  actualAppointments: z.number().int().min(0).optional(),
  actualCommission: z.number().min(0).optional(),
  bonusPercentage: z.number().min(0).max(100).optional(),
  bonusAmount: z.number().min(0).optional(),
  status: z.enum(["active", "achieved", "missed"]).optional(),
});
export type StaffGoal = typeof staffGoals.$inferSelect;
export type InsertStaffGoal = z.infer<typeof insertStaffGoalSchema>;

export const messageTemplates = mysqlTable("message_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 100 }).default("general"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMessageTemplateSchema = createInsertSchema(messageTemplates).omit({ id: true, createdAt: true, updatedAt: true }).extend({
  name: z.string().min(1, "Template name is required"),
  content: z.string().min(1, "Template content is required"),
  category: z.string().optional(),
});
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type InsertMessageTemplate = z.infer<typeof insertMessageTemplateSchema>;

export const staffPayments = mysqlTable("staff_payments", {
  id: serial("id").primaryKey(),
  staffId: int("staff_id").notNull(),
  staffName: text("staff_name").notNull(),
  amount: double("amount").notNull(),
  paidAt: timestamp("paid_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStaffPaymentSchema = createInsertSchema(staffPayments).omit({ id: true, createdAt: true }).extend({
  staffId: z.number().int(),
  staffName: z.string().min(1),
  amount: z.number().min(0),
});
export type StaffPayment = typeof staffPayments.$inferSelect;
export type InsertStaffPayment = z.infer<typeof insertStaffPaymentSchema>;
