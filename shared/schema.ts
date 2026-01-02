import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
export * from "./models/auth";

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  quantity: integer("quantity").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true }).extend({
  name: z.string().min(1, "Product name is required"),
  quantity: z.number().int().min(0, "Quantity must be non-negative").optional(),
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true }).extend({
  name: z.string().min(1, "Client name is required"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
});
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  duration: integer("duration").notNull(),
  client: text("client").notNull(),
  service: text("service").notNull(),
  staff: text("staff").notNull(),
  price: integer("price").notNull(),
  total: integer("total").notNull(),
  paid: boolean("paid").default(false).notNull(),
});

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  duration: integer("duration").notNull(),
  category: text("category").notNull(),
  linkedProductId: integer("linked_product_id").references(() => products.id),
  commissionPercent: integer("commission_percent").notNull().default(50),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
});

export const charges = pgTable("charges", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  amount: integer("amount").notNull(),
  date: text("date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChargeSchema = createInsertSchema(charges).omit({ id: true, createdAt: true }).extend({
  type: z.string().min(1, "Type is required"),
  name: z.string().min(1, "Name is required"),
  amount: z.number().int().min(0, "Amount must be non-negative"),
  date: z.string().min(1, "Date is required"),
});
export type Charge = typeof charges.$inferSelect;
export type InsertCharge = z.infer<typeof insertChargeSchema>;

export const staffDeductions = pgTable("staff_deductions", {
  id: serial("id").primaryKey(),
  staffName: text("staff_name").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  date: text("date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStaffDeductionSchema = createInsertSchema(staffDeductions).omit({ id: true, createdAt: true }).extend({
  staffName: z.string().min(1, "Staff name is required"),
  type: z.enum(["advance", "loan", "penalty", "other"]),
  description: z.string().min(1, "Description is required"),
  amount: z.number().int().min(0, "Amount must be non-negative"),
  date: z.string().min(1, "Date is required"),
});
export type StaffDeduction = typeof staffDeductions.$inferSelect;
export type InsertStaffDeduction = z.infer<typeof insertStaffDeductionSchema>;

export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true });
export const insertServiceSchema = createInsertSchema(services).omit({ id: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertStaffSchema = createInsertSchema(staff).omit({ id: true }).extend({
  name: z.string().min(1, "Staff name is required"),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Must be valid hex color"),
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Staff = typeof staff.$inferSelect;
export type InsertStaff = z.infer<typeof insertStaffSchema>;
