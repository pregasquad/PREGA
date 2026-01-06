import { db, schema } from "./db";
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
  type LoyaltyRedemption, type InsertLoyaltyRedemption
} from "@shared/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { authStorage, type IAuthStorage } from "./replit_integrations/auth/storage";

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
    const [created] = await db().insert(s.appointments).values(appointment).returning();
    return created;
  }

  async updateAppointment(id: number, appointment: Partial<InsertAppointment>): Promise<Appointment> {
    const s = schema();
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
    const [created] = await db().insert(s.services).values(service).returning();
    return created;
  }

  async updateService(id: number, service: Partial<InsertService>): Promise<Service> {
    const s = schema();
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
    const [created] = await db().insert(s.categories).values(category).returning();
    return created;
  }

  async updateCategory(id: number, category: Partial<InsertCategory>): Promise<Category> {
    const s = schema();
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
    const [created] = await db().insert(s.staff).values(st).returning();
    return created;
  }

  async updateStaff(id: number, st: Partial<InsertStaff>): Promise<Staff> {
    const s = schema();
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
    const [updated] = await db().update(s.products).set({ quantity }).where(eq(s.products.id, id)).returning();
    if (!updated) {
      throw new Error("Product not found");
    }
    return updated;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product> {
    const s = schema();
    const [updated] = await db().update(s.products).set(product).where(eq(s.products.id, id)).returning();
    return updated;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const s = schema();
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
    const [created] = await db().insert(s.clients).values(client).returning();
    return created;
  }

  async updateClient(id: number, client: Partial<InsertClient>): Promise<Client> {
    const s = schema();
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
    const [created] = await db().insert(s.loyaltyRedemptions).values(redemption).returning();
    
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
    const serviceMap = new Map(allServices.map((svc: any) => [svc.name, svc]));
    
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
}

export const storage = new DatabaseStorage();
