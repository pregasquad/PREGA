import { db } from "./db-sqlite";
import {
  appointments, services, categories, staff, products, clients, charges, users,
  type Appointment, type InsertAppointment,
  type Service, type InsertService,
  type Category, type InsertCategory,
  type Staff, type InsertStaff,
  type Product, type InsertProduct,
  type Client, type InsertClient,
  type Charge, type InsertCharge,
  type User, type InsertUser
} from "@shared/schema-sqlite";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
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

  getUser(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  validateUser(username: string, password: string): Promise<User | null>;
}

export class SQLiteStorage implements IStorage {
  async getAppointments(date?: string): Promise<Appointment[]> {
    if (date) {
      return db.select().from(appointments).where(eq(appointments.date, date)).orderBy(appointments.startTime).all();
    }
    return db.select().from(appointments).orderBy(appointments.date, appointments.startTime).all();
  }

  async createAppointment(appt: InsertAppointment): Promise<Appointment> {
    const result = db.insert(appointments).values(appt).returning().get();
    return result;
  }

  async updateAppointment(id: number, appt: Partial<InsertAppointment>): Promise<Appointment> {
    const result = db.update(appointments).set(appt).where(eq(appointments.id, id)).returning().get();
    return result;
  }

  async deleteAppointment(id: number): Promise<void> {
    db.delete(appointments).where(eq(appointments.id, id)).run();
  }

  async getAppointment(id: number): Promise<Appointment | undefined> {
    return db.select().from(appointments).where(eq(appointments.id, id)).get();
  }

  async getServices(): Promise<Service[]> {
    return db.select().from(services).all();
  }

  async createService(service: InsertService): Promise<Service> {
    return db.insert(services).values(service).returning().get();
  }

  async updateService(id: number, service: Partial<InsertService>): Promise<Service> {
    return db.update(services).set(service).where(eq(services.id, id)).returning().get();
  }

  async deleteService(id: number): Promise<void> {
    db.delete(services).where(eq(services.id, id)).run();
  }

  async getCategories(): Promise<Category[]> {
    return db.select().from(categories).all();
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    return db.insert(categories).values(category).returning().get();
  }

  async updateCategory(id: number, category: Partial<InsertCategory>): Promise<Category> {
    return db.update(categories).set(category).where(eq(categories.id, id)).returning().get();
  }

  async deleteCategory(id: number): Promise<void> {
    db.delete(categories).where(eq(categories.id, id)).run();
  }

  async getStaff(): Promise<Staff[]> {
    return db.select().from(staff).all();
  }

  async createStaff(st: InsertStaff): Promise<Staff> {
    return db.insert(staff).values(st).returning().get();
  }

  async updateStaff(id: number, st: Partial<InsertStaff>): Promise<Staff> {
    return db.update(staff).set(st).where(eq(staff.id, id)).returning().get();
  }

  async deleteStaff(id: number): Promise<void> {
    db.delete(staff).where(eq(staff.id, id)).run();
  }

  async getProducts(): Promise<Product[]> {
    return db.select().from(products).all();
  }

  async getProductByName(name: string): Promise<Product | undefined> {
    return db.select().from(products).where(eq(products.name, name)).get();
  }

  async updateProductQuantity(id: number, quantity: number): Promise<Product> {
    const result = db.update(products).set({ quantity }).where(eq(products.id, id)).returning().get();
    if (!result) {
      throw new Error("Product not found");
    }
    return result;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product> {
    return db.update(products).set(product).where(eq(products.id, id)).returning().get();
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    return db.insert(products).values(product).returning().get();
  }

  async deleteProduct(id: number): Promise<void> {
    db.delete(products).where(eq(products.id, id)).run();
  }

  async getClients(): Promise<Client[]> {
    return db.select().from(clients).orderBy(desc(clients.createdAt)).all();
  }

  async createClient(client: InsertClient): Promise<Client> {
    return db.insert(clients).values(client).returning().get();
  }

  async updateClient(id: number, client: Partial<InsertClient>): Promise<Client> {
    return db.update(clients).set(client).where(eq(clients.id, id)).returning().get();
  }

  async deleteClient(id: number): Promise<void> {
    db.delete(clients).where(eq(clients.id, id)).run();
  }

  async getCharges(): Promise<Charge[]> {
    return db.select().from(charges).orderBy(desc(charges.createdAt)).all();
  }

  async createCharge(charge: InsertCharge): Promise<Charge> {
    return db.insert(charges).values(charge).returning().get();
  }

  async deleteCharge(id: number): Promise<void> {
    db.delete(charges).where(eq(charges.id, id)).run();
  }

  async getUser(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  async createUser(user: InsertUser): Promise<User> {
    return db.insert(users).values(user).returning().get();
  }

  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.getUser(username);
    if (user && user.password === password) {
      return user;
    }
    return null;
  }
}

export const storage = new SQLiteStorage();
