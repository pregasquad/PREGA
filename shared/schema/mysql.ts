import { mysqlTable, text, int, boolean, timestamp, varchar, serial, double, index, json } from "drizzle-orm/mysql-core";
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true }).extend({
  name: z.string().min(1, "Product name is required"),
  quantity: z.number().int().min(0, "Quantity must be non-negative").optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true, loyaltyPoints: true, totalVisits: true, totalSpent: true }).extend({
  name: z.string().min(1, "Client name is required"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  birthday: z.string().optional(),
  notes: z.string().optional(),
  referredBy: z.number().int().optional(),
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
  service: text("service").notNull(),
  staff: text("staff").notNull(),
  price: double("price").notNull(),
  total: double("total").notNull(),
  paid: boolean("paid").default(false).notNull(),
  loyaltyPointsEarned: int("loyalty_points_earned").default(0),
});

export const services = mysqlTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: double("price").notNull(),
  duration: int("duration").notNull(),
  category: text("category").notNull(),
  linkedProductId: int("linked_product_id"),
  commissionPercent: double("commission_percent").notNull().default(50),
  loyaltyPointsMultiplier: int("loyalty_points_multiplier").notNull().default(1),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChargeSchema = createInsertSchema(charges).omit({ id: true, createdAt: true }).extend({
  type: z.string().min(1, "Type is required"),
  name: z.string().min(1, "Name is required"),
  amount: z.number().min(0, "Amount must be non-negative"),
  date: z.string().min(1, "Date is required"),
  categoryId: z.number().int().optional(),
});
export type Charge = typeof charges.$inferSelect;
export type InsertCharge = z.infer<typeof insertChargeSchema>;

export const staffDeductions = mysqlTable("staff_deductions", {
  id: serial("id").primaryKey(),
  staffName: text("staff_name").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  amount: double("amount").notNull(),
  date: text("date").notNull(),
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

export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true });
export const insertServiceSchema = createInsertSchema(services).omit({ id: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertExpenseCategorySchema = createInsertSchema(expenseCategories).omit({ id: true });
export const insertStaffSchema = createInsertSchema(staff).omit({ id: true }).extend({
  name: z.string().min(1, "Staff name is required"),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Must be valid hex color"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  baseSalary: z.number().min(0).optional(),
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
