import { db } from "./db";
import {
  appointments, services, categories, staff, products, clients, charges, staffDeductions, expenseCategories, loyaltyRedemptions,
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
    if (date) {
      return await db.select().from(appointments).where(eq(appointments.date, date)).orderBy(appointments.startTime);
    }
    return await db.select().from(appointments).orderBy(appointments.date, appointments.startTime);
  }

  async getAppointmentsByDateRange(startDate: string, endDate: string): Promise<Appointment[]> {
    return await db.select().from(appointments)
      .where(and(gte(appointments.date, startDate), lte(appointments.date, endDate)))
      .orderBy(appointments.date, appointments.startTime);
  }

  async createAppointment(appt: InsertAppointment): Promise<Appointment> {
    const result = await db.insert(appointments).values(appt).$returningId();
    const [created] = await db.select().from(appointments).where(eq(appointments.id, result[0].id));
    return created;
  }

  async updateAppointment(id: number, appt: Partial<InsertAppointment>): Promise<Appointment> {
    await db.update(appointments).set(appt).where(eq(appointments.id, id));
    const [updated] = await db.select().from(appointments).where(eq(appointments.id, id));
    return updated;
  }

  async deleteAppointment(id: number): Promise<void> {
    await db.delete(appointments).where(eq(appointments.id, id));
  }

  async getAppointment(id: number): Promise<Appointment | undefined> {
    const [appt] = await db.select().from(appointments).where(eq(appointments.id, id));
    return appt;
  }

  async getServices(): Promise<Service[]> {
    return await db.select().from(services);
  }

  async createService(service: InsertService): Promise<Service> {
    const result = await db.insert(services).values(service).$returningId();
    const [created] = await db.select().from(services).where(eq(services.id, result[0].id));
    return created;
  }

  async updateService(id: number, service: Partial<InsertService>): Promise<Service> {
    await db.update(services).set(service).where(eq(services.id, id));
    const [updated] = await db.select().from(services).where(eq(services.id, id));
    return updated;
  }

  async deleteService(id: number): Promise<void> {
    await db.delete(services).where(eq(services.id, id));
  }

  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories);
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const result = await db.insert(categories).values(category).$returningId();
    const [created] = await db.select().from(categories).where(eq(categories.id, result[0].id));
    return created;
  }

  async updateCategory(id: number, category: Partial<InsertCategory>): Promise<Category> {
    await db.update(categories).set(category).where(eq(categories.id, id));
    const [updated] = await db.select().from(categories).where(eq(categories.id, id));
    return updated;
  }

  async deleteCategory(id: number): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  async getStaff(): Promise<Staff[]> {
    return await db.select().from(staff);
  }

  async createStaff(st: InsertStaff): Promise<Staff> {
    const result = await db.insert(staff).values(st).$returningId();
    const [created] = await db.select().from(staff).where(eq(staff.id, result[0].id));
    return created;
  }

  async updateStaff(id: number, st: Partial<InsertStaff>): Promise<Staff> {
    await db.update(staff).set(st).where(eq(staff.id, id));
    const [updated] = await db.select().from(staff).where(eq(staff.id, id));
    return updated;
  }

  async deleteStaff(id: number): Promise<void> {
    await db.delete(staff).where(eq(staff.id, id));
  }

  async getProducts(): Promise<Product[]> {
    return await db.select().from(products);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async getProductByName(name: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.name, name));
    return product;
  }

  async getLowStockProducts(): Promise<Product[]> {
    const allProducts = await db.select().from(products);
    return allProducts.filter(p => p.quantity <= p.lowStockThreshold);
  }

  async updateProductQuantity(id: number, quantity: number): Promise<Product> {
    await db.update(products).set({ quantity }).where(eq(products.id, id));
    const [updated] = await db.select().from(products).where(eq(products.id, id));
    if (!updated) {
      throw new Error("Product not found");
    }
    return updated;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product> {
    await db.update(products).set(product).where(eq(products.id, id));
    const [updated] = await db.select().from(products).where(eq(products.id, id));
    return updated;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const result = await db.insert(products).values(product).$returningId();
    const [created] = await db.select().from(products).where(eq(products.id, result[0].id));
    return created;
  }

  async deleteProduct(id: number): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  async getClients(): Promise<Client[]> {
    return await db.select().from(clients).orderBy(desc(clients.createdAt));
  }

  async getClient(id: number): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const result = await db.insert(clients).values(client).$returningId();
    const [created] = await db.select().from(clients).where(eq(clients.id, result[0].id));
    return created;
  }

  async updateClient(id: number, client: Partial<InsertClient>): Promise<Client> {
    await db.update(clients).set(client).where(eq(clients.id, id));
    const [updated] = await db.select().from(clients).where(eq(clients.id, id));
    return updated;
  }

  async deleteClient(id: number): Promise<void> {
    await db.delete(clients).where(eq(clients.id, id));
  }

  async updateClientLoyalty(id: number, points: number, spent: number): Promise<Client> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    if (!client) throw new Error("Client not found");
    
    await db.update(clients).set({
      loyaltyPoints: client.loyaltyPoints + points,
      totalSpent: client.totalSpent + spent,
      totalVisits: client.totalVisits + 1,
    }).where(eq(clients.id, id));
    
    const [updated] = await db.select().from(clients).where(eq(clients.id, id));
    return updated;
  }

  async getClientAppointments(clientId: number): Promise<Appointment[]> {
    return await db.select().from(appointments)
      .where(eq(appointments.clientId, clientId))
      .orderBy(desc(appointments.date));
  }

  async getCharges(): Promise<Charge[]> {
    return await db.select().from(charges).orderBy(desc(charges.createdAt));
  }

  async createCharge(charge: InsertCharge): Promise<Charge> {
    const result = await db.insert(charges).values(charge).$returningId();
    const [created] = await db.select().from(charges).where(eq(charges.id, result[0].id));
    return created;
  }

  async deleteCharge(id: number): Promise<void> {
    await db.delete(charges).where(eq(charges.id, id));
  }

  async getStaffDeductions(): Promise<StaffDeduction[]> {
    return await db.select().from(staffDeductions).orderBy(desc(staffDeductions.createdAt));
  }

  async createStaffDeduction(deduction: InsertStaffDeduction): Promise<StaffDeduction> {
    const result = await db.insert(staffDeductions).values(deduction).$returningId();
    const [created] = await db.select().from(staffDeductions).where(eq(staffDeductions.id, result[0].id));
    return created;
  }

  async deleteStaffDeduction(id: number): Promise<void> {
    await db.delete(staffDeductions).where(eq(staffDeductions.id, id));
  }

  async getExpenseCategories(): Promise<ExpenseCategory[]> {
    return await db.select().from(expenseCategories);
  }

  async createExpenseCategory(category: InsertExpenseCategory): Promise<ExpenseCategory> {
    const result = await db.insert(expenseCategories).values(category).$returningId();
    const [created] = await db.select().from(expenseCategories).where(eq(expenseCategories.id, result[0].id));
    return created;
  }

  async deleteExpenseCategory(id: number): Promise<void> {
    await db.delete(expenseCategories).where(eq(expenseCategories.id, id));
  }

  async getLoyaltyRedemptions(clientId?: number): Promise<LoyaltyRedemption[]> {
    if (clientId) {
      return await db.select().from(loyaltyRedemptions)
        .where(eq(loyaltyRedemptions.clientId, clientId))
        .orderBy(desc(loyaltyRedemptions.createdAt));
    }
    return await db.select().from(loyaltyRedemptions).orderBy(desc(loyaltyRedemptions.createdAt));
  }

  async createLoyaltyRedemption(redemption: InsertLoyaltyRedemption): Promise<LoyaltyRedemption> {
    const result = await db.insert(loyaltyRedemptions).values(redemption).$returningId();
    const [created] = await db.select().from(loyaltyRedemptions).where(eq(loyaltyRedemptions.id, result[0].id));
    
    const [client] = await db.select().from(clients).where(eq(clients.id, redemption.clientId));
    if (client) {
      await db.update(clients).set({
        loyaltyPoints: client.loyaltyPoints - redemption.pointsUsed,
      }).where(eq(clients.id, redemption.clientId));
    }
    
    return created;
  }

  async getStaffPerformance(staffName: string, startDate: string, endDate: string): Promise<{
    totalAppointments: number;
    totalRevenue: number;
    totalCommission: number;
  }> {
    const appts = await db.select().from(appointments)
      .where(and(
        eq(appointments.staff, staffName),
        gte(appointments.date, startDate),
        lte(appointments.date, endDate)
      ));
    
    const allServices = await db.select().from(services);
    const serviceMap = new Map(allServices.map(s => [s.name, s]));
    
    let totalRevenue = 0;
    let totalCommission = 0;
    
    for (const appt of appts) {
      totalRevenue += appt.total;
      const service = serviceMap.get(appt.service);
      const commissionRate = service?.commissionPercent || 50;
      totalCommission += Math.round(appt.total * commissionRate / 100);
    }
    
    return {
      totalAppointments: appts.length,
      totalRevenue,
      totalCommission,
    };
  }
}

export const storage = new DatabaseStorage();
