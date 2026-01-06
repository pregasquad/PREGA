import { db, schema, dbDialect } from "./db";
import {
  type Appointment, type InsertAppointment,
  type Service, type InsertService,
  type Category, type InsertCategory,
  type Staff, type InsertStaff,
  type Product, type InsertProduct,
  type Client, type InsertClient,
  type Charge, type InsertCharge,
  type StaffDeduction, type InsertStaffDeduction,
  type ExpenseCategory, type InsertExpenseCategory,
  type LoyaltyRedemption, type InsertLoyaltyRedemption,
  type AdminRole, type InsertAdminRole,
  type BusinessSettings, type InsertBusinessSettings
} from "@shared/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { authStorage, type IAuthStorage } from "./replit_integrations/auth/storage";

// Helper to check if we're using MySQL (no .returning() support)
function isMySQL(): boolean {
  return dbDialect === 'mysql';
}

export interface IStorage extends IAuthStorage {
  getAppointments(date?: string): Promise<Appointment[]>;
  getAppointmentsByDateRange(startDate: string, endDate: string): Promise<Appointment[]>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: number, appointment: Partial<InsertAppointment>): Promise<Appointment>;
  deleteAppointment(id: number): Promise<void>;
  getAppointment(id: number): Promise<Appointment | undefined>;

  getServices(): Promise<Service[]>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: number, service: Partial<InsertService>): Promise<Service>;
  deleteService(id: number): Promise<void>;

  getCategories(): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: number, category: Partial<InsertCategory>): Promise<Category>;
  deleteCategory(id: number): Promise<void>;

  getStaff(): Promise<Staff[]>;
  createStaff(staff: InsertStaff): Promise<Staff>;
  updateStaff(id: number, staff: Partial<InsertStaff>): Promise<Staff>;
  deleteStaff(id: number): Promise<void>;

  getProducts(): Promise<Product[]>;
  getProductByName(name: string): Promise<Product | undefined>;
  getProduct(id: number): Promise<Product | undefined>;
  updateProductQuantity(id: number, quantity: number): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product>;
  createProduct(product: InsertProduct): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  getLowStockProducts(): Promise<Product[]>;

  getClients(): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, client: Partial<InsertClient>): Promise<Client>;
  deleteClient(id: number): Promise<void>;
  updateClientLoyalty(id: number, points: number, spent: number): Promise<Client>;
  getClientAppointments(clientId: number): Promise<Appointment[]>;

  getCharges(): Promise<Charge[]>;
  createCharge(charge: InsertCharge): Promise<Charge>;
  deleteCharge(id: number): Promise<void>;

  getStaffDeductions(): Promise<StaffDeduction[]>;
  createStaffDeduction(deduction: InsertStaffDeduction): Promise<StaffDeduction>;
  deleteStaffDeduction(id: number): Promise<void>;

  getExpenseCategories(): Promise<ExpenseCategory[]>;
  createExpenseCategory(category: InsertExpenseCategory): Promise<ExpenseCategory>;
  deleteExpenseCategory(id: number): Promise<void>;

  getLoyaltyRedemptions(clientId?: number): Promise<LoyaltyRedemption[]>;
  createLoyaltyRedemption(redemption: InsertLoyaltyRedemption): Promise<LoyaltyRedemption>;

  getStaffPerformance(staffName: string, startDate: string, endDate: string): Promise<{
    totalAppointments: number;
    totalRevenue: number;
    totalCommission: number;
  }>;

  getAdminRoles(): Promise<AdminRole[]>;
  getAdminRole(id: number): Promise<AdminRole | undefined>;
  getAdminRoleByName(name: string): Promise<AdminRole | undefined>;
  createAdminRole(role: InsertAdminRole): Promise<AdminRole>;
  updateAdminRole(id: number, role: Partial<InsertAdminRole>): Promise<AdminRole>;
  deleteAdminRole(id: number): Promise<void>;

  getBusinessSettings(): Promise<BusinessSettings | undefined>;
  updateBusinessSettings(settings: Partial<InsertBusinessSettings>): Promise<BusinessSettings>;
}

export class DatabaseStorage implements IStorage {
  getUser = authStorage.getUser;
  upsertUser = authStorage.upsertUser;

  async getAppointments(date?: string): Promise<Appointment[]> {
    const s = schema();
    if (date) {
      return await db().select().from(s.appointments).where(eq(s.appointments.date, date));
    }
    return await db().select().from(s.appointments);
  }

  async getAppointmentsByDateRange(startDate: string, endDate: string): Promise<Appointment[]> {
    const s = schema();
    return await db().select().from(s.appointments)
      .where(and(
        gte(s.appointments.date, startDate),
        lte(s.appointments.date, endDate)
      ));
  }

  async getAppointment(id: number): Promise<Appointment | undefined> {
    const s = schema();
    const [appointment] = await db().select().from(s.appointments).where(eq(s.appointments.id, id));
    return appointment;
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.appointments).values(appointment);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.appointments).where(eq(s.appointments.id, insertId));
      if (!created) throw new Error("Failed to retrieve created appointment");
      return created;
    }
    const [created] = await db().insert(s.appointments).values(appointment).returning();
    return created;
  }

  async updateAppointment(id: number, appointment: Partial<InsertAppointment>): Promise<Appointment> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.appointments).set(appointment).where(eq(s.appointments.id, id));
      const [updated] = await db().select().from(s.appointments).where(eq(s.appointments.id, id));
      if (!updated) throw new Error("Appointment not found");
      return updated;
    }
    const [updated] = await db().update(s.appointments).set(appointment).where(eq(s.appointments.id, id)).returning();
    return updated;
  }

  async deleteAppointment(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.appointments).where(eq(s.appointments.id, id));
  }

  async getServices(): Promise<Service[]> {
    const s = schema();
    return await db().select().from(s.services);
  }

  async createService(service: InsertService): Promise<Service> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.services).values(service);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.services).where(eq(s.services.id, insertId));
      if (!created) throw new Error("Failed to retrieve created service");
      return created;
    }
    const [created] = await db().insert(s.services).values(service).returning();
    return created;
  }

  async updateService(id: number, service: Partial<InsertService>): Promise<Service> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.services).set(service).where(eq(s.services.id, id));
      const [updated] = await db().select().from(s.services).where(eq(s.services.id, id));
      if (!updated) throw new Error("Service not found");
      return updated;
    }
    const [updated] = await db().update(s.services).set(service).where(eq(s.services.id, id)).returning();
    return updated;
  }

  async deleteService(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.services).where(eq(s.services.id, id));
  }

  async getCategories(): Promise<Category[]> {
    const s = schema();
    return await db().select().from(s.categories);
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.categories).values(category);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.categories).where(eq(s.categories.id, insertId));
      if (!created) throw new Error("Failed to retrieve created category");
      return created;
    }
    const [created] = await db().insert(s.categories).values(category).returning();
    return created;
  }

  async updateCategory(id: number, category: Partial<InsertCategory>): Promise<Category> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.categories).set(category).where(eq(s.categories.id, id));
      const [updated] = await db().select().from(s.categories).where(eq(s.categories.id, id));
      if (!updated) throw new Error("Category not found");
      return updated;
    }
    const [updated] = await db().update(s.categories).set(category).where(eq(s.categories.id, id)).returning();
    return updated;
  }

  async deleteCategory(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.categories).where(eq(s.categories.id, id));
  }

  async getStaff(): Promise<Staff[]> {
    const s = schema();
    return await db().select().from(s.staff);
  }

  async createStaff(st: InsertStaff): Promise<Staff> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.staff).values(st);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.staff).where(eq(s.staff.id, insertId));
      if (!created) throw new Error("Failed to retrieve created staff");
      return created;
    }
    const [created] = await db().insert(s.staff).values(st).returning();
    return created;
  }

  async updateStaff(id: number, st: Partial<InsertStaff>): Promise<Staff> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.staff).set(st).where(eq(s.staff.id, id));
      const [updated] = await db().select().from(s.staff).where(eq(s.staff.id, id));
      if (!updated) throw new Error("Staff not found");
      return updated;
    }
    const [updated] = await db().update(s.staff).set(st).where(eq(s.staff.id, id)).returning();
    return updated;
  }

  async deleteStaff(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.staff).where(eq(s.staff.id, id));
  }

  async getProducts(): Promise<Product[]> {
    const s = schema();
    return await db().select().from(s.products);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const s = schema();
    const [product] = await db().select().from(s.products).where(eq(s.products.id, id));
    return product;
  }

  async getProductByName(name: string): Promise<Product | undefined> {
    const s = schema();
    const [product] = await db().select().from(s.products).where(eq(s.products.name, name));
    return product;
  }

  async getLowStockProducts(): Promise<Product[]> {
    const s = schema();
    const allProducts = await db().select().from(s.products);
    return allProducts.filter((p: any) => p.quantity <= p.lowStockThreshold);
  }

  async updateProductQuantity(id: number, quantity: number): Promise<Product> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.products).set({ quantity }).where(eq(s.products.id, id));
      const [updated] = await db().select().from(s.products).where(eq(s.products.id, id));
      if (!updated) throw new Error("Product not found");
      return updated;
    }
    const [updated] = await db().update(s.products).set({ quantity }).where(eq(s.products.id, id)).returning();
    if (!updated) {
      throw new Error("Product not found");
    }
    return updated;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.products).set(product).where(eq(s.products.id, id));
      const [updated] = await db().select().from(s.products).where(eq(s.products.id, id));
      if (!updated) throw new Error("Product not found");
      return updated;
    }
    const [updated] = await db().update(s.products).set(product).where(eq(s.products.id, id)).returning();
    return updated;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.products).values(product);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.products).where(eq(s.products.id, insertId));
      if (!created) throw new Error("Failed to retrieve created product");
      return created;
    }
    const [created] = await db().insert(s.products).values(product).returning();
    return created;
  }

  async deleteProduct(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.products).where(eq(s.products.id, id));
  }

  async getClients(): Promise<Client[]> {
    const s = schema();
    return await db().select().from(s.clients).orderBy(desc(s.clients.createdAt));
  }

  async getClient(id: number): Promise<Client | undefined> {
    const s = schema();
    const [client] = await db().select().from(s.clients).where(eq(s.clients.id, id));
    return client;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.clients).values(client);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.clients).where(eq(s.clients.id, insertId));
      if (!created) throw new Error("Failed to retrieve created client");
      return created;
    }
    const [created] = await db().insert(s.clients).values(client).returning();
    return created;
  }

  async updateClient(id: number, client: Partial<InsertClient>): Promise<Client> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.clients).set(client).where(eq(s.clients.id, id));
      const [updated] = await db().select().from(s.clients).where(eq(s.clients.id, id));
      if (!updated) throw new Error("Client not found");
      return updated;
    }
    const [updated] = await db().update(s.clients).set(client).where(eq(s.clients.id, id)).returning();
    return updated;
  }

  async deleteClient(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.clients).where(eq(s.clients.id, id));
  }

  async updateClientLoyalty(id: number, points: number, spent: number): Promise<Client> {
    const s = schema();
    const [client] = await db().select().from(s.clients).where(eq(s.clients.id, id));
    if (!client) throw new Error("Client not found");
    
    if (isMySQL()) {
      await db().update(s.clients).set({
        loyaltyPoints: client.loyaltyPoints + points,
        totalVisits: client.totalVisits + 1,
        totalSpent: client.totalSpent + spent,
      }).where(eq(s.clients.id, id));
      const [updated] = await db().select().from(s.clients).where(eq(s.clients.id, id));
      if (!updated) throw new Error("Failed to update client loyalty");
      return updated;
    }
    const [updated] = await db().update(s.clients).set({
      loyaltyPoints: client.loyaltyPoints + points,
      totalVisits: client.totalVisits + 1,
      totalSpent: client.totalSpent + spent,
    }).where(eq(s.clients.id, id)).returning();
    return updated;
  }

  async getClientAppointments(clientId: number): Promise<Appointment[]> {
    const s = schema();
    return await db().select().from(s.appointments)
      .where(eq(s.appointments.clientId, clientId))
      .orderBy(desc(s.appointments.date));
  }

  async getCharges(): Promise<Charge[]> {
    const s = schema();
    return await db().select().from(s.charges).orderBy(desc(s.charges.createdAt));
  }

  async createCharge(charge: InsertCharge): Promise<Charge> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.charges).values(charge);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.charges).where(eq(s.charges.id, insertId));
      if (!created) throw new Error("Failed to retrieve created charge");
      return created;
    }
    const [created] = await db().insert(s.charges).values(charge).returning();
    return created;
  }

  async deleteCharge(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.charges).where(eq(s.charges.id, id));
  }

  async getStaffDeductions(): Promise<StaffDeduction[]> {
    const s = schema();
    return await db().select().from(s.staffDeductions).orderBy(desc(s.staffDeductions.createdAt));
  }

  async createStaffDeduction(deduction: InsertStaffDeduction): Promise<StaffDeduction> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.staffDeductions).values(deduction);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.staffDeductions).where(eq(s.staffDeductions.id, insertId));
      if (!created) throw new Error("Failed to retrieve created staff deduction");
      return created;
    }
    const [created] = await db().insert(s.staffDeductions).values(deduction).returning();
    return created;
  }

  async deleteStaffDeduction(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.staffDeductions).where(eq(s.staffDeductions.id, id));
  }

  async getExpenseCategories(): Promise<ExpenseCategory[]> {
    const s = schema();
    return await db().select().from(s.expenseCategories);
  }

  async createExpenseCategory(category: InsertExpenseCategory): Promise<ExpenseCategory> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.expenseCategories).values(category);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.expenseCategories).where(eq(s.expenseCategories.id, insertId));
      if (!created) throw new Error("Failed to retrieve created expense category");
      return created;
    }
    const [created] = await db().insert(s.expenseCategories).values(category).returning();
    return created;
  }

  async deleteExpenseCategory(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.expenseCategories).where(eq(s.expenseCategories.id, id));
  }

  async getLoyaltyRedemptions(clientId?: number): Promise<LoyaltyRedemption[]> {
    const s = schema();
    if (clientId) {
      return await db().select().from(s.loyaltyRedemptions)
        .where(eq(s.loyaltyRedemptions.clientId, clientId))
        .orderBy(desc(s.loyaltyRedemptions.createdAt));
    }
    return await db().select().from(s.loyaltyRedemptions).orderBy(desc(s.loyaltyRedemptions.createdAt));
  }

  async createLoyaltyRedemption(redemption: InsertLoyaltyRedemption): Promise<LoyaltyRedemption> {
    const s = schema();
    let created;
    if (isMySQL()) {
      const result = await db().insert(s.loyaltyRedemptions).values(redemption);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      [created] = await db().select().from(s.loyaltyRedemptions).where(eq(s.loyaltyRedemptions.id, insertId));
      if (!created) throw new Error("Failed to retrieve created loyalty redemption");
    } else {
      [created] = await db().insert(s.loyaltyRedemptions).values(redemption).returning();
    }
    
    const [client] = await db().select().from(s.clients).where(eq(s.clients.id, redemption.clientId));
    if (client) {
      await db().update(s.clients).set({
        loyaltyPoints: client.loyaltyPoints - redemption.pointsUsed,
      }).where(eq(s.clients.id, redemption.clientId));
    }
    
    return created;
  }

  async getStaffPerformance(staffName: string, startDate: string, endDate: string): Promise<{
    totalAppointments: number;
    totalRevenue: number;
    totalCommission: number;
  }> {
    const s = schema();
    const appts = await db().select().from(s.appointments)
      .where(and(
        eq(s.appointments.staff, staffName),
        gte(s.appointments.date, startDate),
        lte(s.appointments.date, endDate)
      ));
    
    const allServices = await db().select().from(s.services);
    const serviceMap: Map<string, any> = new Map(allServices.map((svc: any) => [svc.name, svc]));
    
    let totalRevenue = 0;
    let totalCommission = 0;
    
    for (const appt of appts) {
      totalRevenue += appt.total;
      const service = serviceMap.get(appt.service);
      const commissionRate = service?.commissionPercent || 50;
      totalCommission += (appt.total * commissionRate) / 100;
    }
    
    return {
      totalAppointments: appts.length,
      totalRevenue,
      totalCommission,
    };
  }

  async getAdminRoles(): Promise<AdminRole[]> {
    const s = schema();
    return await db().select().from(s.adminRoles).orderBy(s.adminRoles.name);
  }

  async getAdminRole(id: number): Promise<AdminRole | undefined> {
    const s = schema();
    const [role] = await db().select().from(s.adminRoles).where(eq(s.adminRoles.id, id));
    return role;
  }

  async getAdminRoleByName(name: string): Promise<AdminRole | undefined> {
    const s = schema();
    const [role] = await db().select().from(s.adminRoles).where(eq(s.adminRoles.name, name));
    return role;
  }

  async createAdminRole(role: InsertAdminRole): Promise<AdminRole> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.adminRoles).values(role);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.adminRoles).where(eq(s.adminRoles.id, insertId));
      if (!created) throw new Error("Failed to retrieve created admin role");
      return created;
    }
    const [created] = await db().insert(s.adminRoles).values(role).returning();
    return created;
  }

  async updateAdminRole(id: number, role: Partial<InsertAdminRole>): Promise<AdminRole> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.adminRoles).set(role).where(eq(s.adminRoles.id, id));
      const [updated] = await db().select().from(s.adminRoles).where(eq(s.adminRoles.id, id));
      if (!updated) throw new Error("Admin role not found");
      return updated;
    }
    const [updated] = await db().update(s.adminRoles).set(role).where(eq(s.adminRoles.id, id)).returning();
    return updated;
  }

  async deleteAdminRole(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.adminRoles).where(eq(s.adminRoles.id, id));
  }

  async getBusinessSettings(): Promise<BusinessSettings | undefined> {
    const s = schema();
    const [settings] = await db().select().from(s.businessSettings).limit(1);
    return settings;
  }

  async updateBusinessSettings(settings: Partial<InsertBusinessSettings>): Promise<BusinessSettings> {
    const s = schema();
    const existing = await this.getBusinessSettings();
    
    if (existing) {
      if (isMySQL()) {
        await db().update(s.businessSettings).set({ ...settings, updatedAt: new Date() }).where(eq(s.businessSettings.id, existing.id));
        const [updated] = await db().select().from(s.businessSettings).where(eq(s.businessSettings.id, existing.id));
        if (!updated) throw new Error("Failed to update business settings");
        return updated;
      }
      const [updated] = await db().update(s.businessSettings).set({ ...settings, updatedAt: new Date() }).where(eq(s.businessSettings.id, existing.id)).returning();
      return updated;
    } else {
      if (isMySQL()) {
        const result = await db().insert(s.businessSettings).values(settings as InsertBusinessSettings);
        const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
        if (!insertId) throw new Error("Failed to get insert ID");
        const [created] = await db().select().from(s.businessSettings).where(eq(s.businessSettings.id, insertId));
        if (!created) throw new Error("Failed to retrieve business settings");
        return created;
      }
      const [created] = await db().insert(s.businessSettings).values(settings as InsertBusinessSettings).returning();
      return created;
    }
  }
}

export const storage = new DatabaseStorage();
