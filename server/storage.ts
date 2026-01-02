import { db } from "./db";
import {
  appointments, services, categories, staff, products, clients, charges, staffDeductions,
  type Appointment, type InsertAppointment,
  type Service, type InsertService,
  type Category, type InsertCategory,
  type Staff, type InsertStaff,
  type Product, type InsertProduct,
  type Client, type InsertClient,
  type Charge, type InsertCharge,
  type StaffDeduction, type InsertStaffDeduction
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { authStorage, type IAuthStorage } from "./replit_integrations/auth/storage";

export interface IStorage extends IAuthStorage {
  getAppointments(date?: string): Promise<Appointment[]>;
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
  updateProductQuantity(id: number, quantity: number): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product>;
  createProduct(product: InsertProduct): Promise<Product>;
  deleteProduct(id: number): Promise<void>;

  getClients(): Promise<Client[]>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, client: Partial<InsertClient>): Promise<Client>;
  deleteClient(id: number): Promise<void>;

  getCharges(): Promise<Charge[]>;
  createCharge(charge: InsertCharge): Promise<Charge>;
  deleteCharge(id: number): Promise<void>;

  getStaffDeductions(): Promise<StaffDeduction[]>;
  createStaffDeduction(deduction: InsertStaffDeduction): Promise<StaffDeduction>;
  deleteStaffDeduction(id: number): Promise<void>;
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

  async createAppointment(appt: InsertAppointment): Promise<Appointment> {
    const [created] = await db.insert(appointments).values(appt).returning();
    return created;
  }

  async updateAppointment(id: number, appt: Partial<InsertAppointment>): Promise<Appointment> {
    const [updated] = await db.update(appointments).set(appt).where(eq(appointments.id, id)).returning();
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
    const [created] = await db.insert(services).values(service).returning();
    return created;
  }

  async updateService(id: number, service: Partial<InsertService>): Promise<Service> {
    const [updated] = await db.update(services).set(service).where(eq(services.id, id)).returning();
    return updated;
  }

  async deleteService(id: number): Promise<void> {
    await db.delete(services).where(eq(services.id, id));
  }

  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories);
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [created] = await db.insert(categories).values(category).returning();
    return created;
  }

  async updateCategory(id: number, category: Partial<InsertCategory>): Promise<Category> {
    const [updated] = await db.update(categories).set(category).where(eq(categories.id, id)).returning();
    return updated;
  }

  async deleteCategory(id: number): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  async getStaff(): Promise<Staff[]> {
    return await db.select().from(staff);
  }

  async createStaff(st: InsertStaff): Promise<Staff> {
    const [created] = await db.insert(staff).values(st).returning();
    return created;
  }

  async updateStaff(id: number, st: Partial<InsertStaff>): Promise<Staff> {
    const [updated] = await db.update(staff).set(st).where(eq(staff.id, id)).returning();
    return updated;
  }

  async deleteStaff(id: number): Promise<void> {
    await db.delete(staff).where(eq(staff.id, id));
  }

  async getProducts(): Promise<Product[]> {
    return await db.select().from(products);
  }

  async getProductByName(name: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.name, name));
    return product;
  }

  async updateProductQuantity(id: number, quantity: number): Promise<Product> {
    const [updated] = await db.update(products).set({ quantity }).where(eq(products.id, id)).returning();
    if (!updated) {
      throw new Error("Product not found");
    }
    return updated;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product> {
    const [updated] = await db.update(products).set(product).where(eq(products.id, id)).returning();
    return updated;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    return created;
  }

  async deleteProduct(id: number): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  async getClients(): Promise<Client[]> {
    return await db.select().from(clients).orderBy(desc(clients.createdAt));
  }

  async createClient(client: InsertClient): Promise<Client> {
    const [created] = await db.insert(clients).values(client).returning();
    return created;
  }

  async updateClient(id: number, client: Partial<InsertClient>): Promise<Client> {
    const [updated] = await db.update(clients).set(client).where(eq(clients.id, id)).returning();
    return updated;
  }

  async deleteClient(id: number): Promise<void> {
    await db.delete(clients).where(eq(clients.id, id));
  }

  async getCharges(): Promise<Charge[]> {
    return await db.select().from(charges).orderBy(desc(charges.createdAt));
  }

  async createCharge(charge: InsertCharge): Promise<Charge> {
    const [created] = await db.insert(charges).values(charge).returning();
    return created;
  }

  async deleteCharge(id: number): Promise<void> {
    await db.delete(charges).where(eq(charges.id, id));
  }

  async getStaffDeductions(): Promise<StaffDeduction[]> {
    return await db.select().from(staffDeductions).orderBy(desc(staffDeductions.createdAt));
  }

  async createStaffDeduction(deduction: InsertStaffDeduction): Promise<StaffDeduction> {
    const [created] = await db.insert(staffDeductions).values(deduction).returning();
    return created;
  }

  async deleteStaffDeduction(id: number): Promise<void> {
    await db.delete(staffDeductions).where(eq(staffDeductions.id, id));
  }
}

export const storage = new DatabaseStorage();
