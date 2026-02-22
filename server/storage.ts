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
  type BusinessSettings, type InsertBusinessSettings,
  type StaffCommission, type InsertStaffCommission,
  type GiftCard, type InsertGiftCard,
  type Referral, type InsertReferral,
  type Package, type InsertPackage,
  type PackagePurchase, type InsertPackagePurchase,
  type Waitlist, type InsertWaitlist,
  type StaffSchedule, type InsertStaffSchedule,
  type StaffBreak, type InsertStaffBreak,
  type StaffTimeOff, type InsertStaffTimeOff,
  type StaffGoal, type InsertStaffGoal,
  type MessageTemplate, type InsertMessageTemplate,
  type StaffPayment, type InsertStaffPayment
} from "@shared/schema";
import { eq, desc, and, gte, lte, sql, isNull } from "drizzle-orm";
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
  getServiceByName(name: string): Promise<Service | undefined>;
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
  getExpiringProducts(): Promise<Product[]>;

  getClients(): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  getClientByName(name: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, client: Partial<InsertClient>): Promise<Client>;
  deleteClient(id: number): Promise<void>;
  updateClientLoyalty(id: number, points: number, spent: number): Promise<Client>;
  subtractClientLoyalty(id: number, points: number): Promise<Client>;
  restoreClientLoyaltyPoints(id: number, points: number): Promise<Client>;
  updateClientGiftCardBalance(id: number, amount: number): Promise<Client>;
  getClientAppointments(clientId: number): Promise<Appointment[]>;

  getCharges(): Promise<Charge[]>;
  createCharge(charge: InsertCharge): Promise<Charge>;
  updateCharge(id: number, data: Partial<InsertCharge>): Promise<void>;
  deleteCharge(id: number): Promise<void>;

  getStaffDeductions(): Promise<StaffDeduction[]>;
  createStaffDeduction(deduction: InsertStaffDeduction): Promise<StaffDeduction>;
  updateStaffDeduction(id: number, data: Partial<InsertStaffDeduction>): Promise<void>;
  deleteStaffDeduction(id: number): Promise<void>;
  clearStaffDeduction(id: number): Promise<void>;

  getExpenseCategories(): Promise<ExpenseCategory[]>;
  createExpenseCategory(category: InsertExpenseCategory): Promise<ExpenseCategory>;
  deleteExpenseCategory(id: number): Promise<void>;

  getLoyaltyRedemptions(clientId?: number): Promise<LoyaltyRedemption[]>;
  createLoyaltyRedemption(redemption: InsertLoyaltyRedemption): Promise<LoyaltyRedemption>;

  getStaffPerformance(staffName: string, startDate: string, endDate: string, staffId?: number): Promise<{
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

  getStaffCommissions(): Promise<StaffCommission[]>;
  getStaffCommissionsByStaff(staffId: number): Promise<StaffCommission[]>;
  getStaffCommissionsByService(serviceId: number): Promise<StaffCommission[]>;
  getStaffCommission(staffId: number, serviceId: number): Promise<StaffCommission | undefined>;
  createStaffCommission(commission: InsertStaffCommission): Promise<StaffCommission>;
  updateStaffCommission(id: number, commission: Partial<InsertStaffCommission>): Promise<StaffCommission>;
  deleteStaffCommission(id: number): Promise<void>;
  upsertStaffCommission(commission: InsertStaffCommission): Promise<StaffCommission>;

  getPageViewCount(pagePath: string): Promise<number>;
  incrementPageView(pagePath: string): Promise<number>;

  getGiftCards(): Promise<GiftCard[]>;
  getGiftCard(id: number): Promise<GiftCard | undefined>;
  getGiftCardByCode(code: string): Promise<GiftCard | undefined>;
  createGiftCard(giftCard: InsertGiftCard): Promise<GiftCard>;
  updateGiftCard(id: number, giftCard: Partial<InsertGiftCard>): Promise<GiftCard>;
  deleteGiftCard(id: number): Promise<void>;

  getReferrals(): Promise<Referral[]>;
  getReferralsByReferrer(referrerId: number): Promise<Referral[]>;
  createReferral(referral: InsertReferral): Promise<Referral>;
  updateReferral(id: number, referral: Partial<InsertReferral>): Promise<Referral>;

  getPackages(): Promise<Package[]>;
  getPackage(id: number): Promise<Package | undefined>;
  createPackage(pkg: InsertPackage): Promise<Package>;
  updatePackage(id: number, pkg: Partial<InsertPackage>): Promise<Package>;
  deletePackage(id: number): Promise<void>;

  getPackagePurchases(): Promise<PackagePurchase[]>;
  getPackagePurchase(id: number): Promise<PackagePurchase | undefined>;
  getPackagePurchasesByClient(clientId: number): Promise<PackagePurchase[]>;
  createPackagePurchase(purchase: InsertPackagePurchase): Promise<PackagePurchase>;
  updatePackagePurchase(id: number, purchase: Partial<InsertPackagePurchase>): Promise<PackagePurchase>;

  getWaitlist(): Promise<Waitlist[]>;
  getWaitlistEntry(id: number): Promise<Waitlist | undefined>;
  getWaitlistByDate(date: string): Promise<Waitlist[]>;
  createWaitlistEntry(entry: InsertWaitlist): Promise<Waitlist>;
  updateWaitlistEntry(id: number, entry: Partial<InsertWaitlist>): Promise<Waitlist>;
  deleteWaitlistEntry(id: number): Promise<void>;

  getStaffSchedules(staffId: number): Promise<StaffSchedule[]>;
  saveStaffSchedule(schedule: InsertStaffSchedule): Promise<StaffSchedule>;
  updateStaffSchedule(id: number, schedule: Partial<InsertStaffSchedule>): Promise<StaffSchedule>;
  deleteStaffSchedule(id: number): Promise<void>;
  upsertStaffSchedule(schedule: InsertStaffSchedule): Promise<StaffSchedule>;

  getStaffBreaks(staffId: number, startDate?: string, endDate?: string): Promise<StaffBreak[]>;
  createStaffBreak(breakItem: InsertStaffBreak): Promise<StaffBreak>;
  deleteStaffBreak(id: number): Promise<void>;

  getStaffTimeOff(staffId: number): Promise<StaffTimeOff[]>;
  getAllStaffTimeOff(): Promise<StaffTimeOff[]>;
  createStaffTimeOff(timeOff: InsertStaffTimeOff): Promise<StaffTimeOff>;
  updateStaffTimeOff(id: number, timeOff: Partial<InsertStaffTimeOff>): Promise<StaffTimeOff>;
  deleteStaffTimeOff(id: number): Promise<void>;

  getStaffGoals(staffId: number, period?: string): Promise<StaffGoal[]>;
  getStaffGoal(staffId: number, period: string): Promise<StaffGoal | undefined>;
  getAllStaffGoalsForPeriod(period: string): Promise<StaffGoal[]>;
  createStaffGoal(goal: InsertStaffGoal): Promise<StaffGoal>;
  updateStaffGoal(id: number, goal: Partial<InsertStaffGoal>): Promise<StaffGoal>;
  deleteStaffGoal(id: number): Promise<void>;
  upsertStaffGoal(goal: InsertStaffGoal): Promise<StaffGoal>;

  getMessageTemplates(): Promise<MessageTemplate[]>;
  getMessageTemplate(id: number): Promise<MessageTemplate | undefined>;
  createMessageTemplate(template: InsertMessageTemplate): Promise<MessageTemplate>;
  updateMessageTemplate(id: number, template: Partial<InsertMessageTemplate>): Promise<MessageTemplate>;
  deleteMessageTemplate(id: number): Promise<void>;

  getStaffPayments(): Promise<StaffPayment[]>;
  getStaffPaymentsByStaff(staffId: number): Promise<StaffPayment[]>;
  getLastStaffPayment(staffId: number): Promise<StaffPayment | undefined>;
  createStaffPayment(payment: InsertStaffPayment): Promise<StaffPayment>;

  getStaffByToken(token: string): Promise<Staff | undefined>;
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
    
    const processedAppointment = this.processAppointmentServices(appointment);

    if (!processedAppointment.staffId && processedAppointment.staff) {
      const [staffMember] = await db().select().from(s.staff)
        .where(eq(s.staff.name, processedAppointment.staff));
      if (staffMember) {
        processedAppointment.staffId = staffMember.id;
      }
    }
    
    console.log("[STORAGE] createAppointment - processed data:", JSON.stringify(processedAppointment));
    
    if (isMySQL()) {
      console.log("[STORAGE] Using MySQL/TiDB path");
      const result = await db().insert(s.appointments).values(processedAppointment);
      console.log("[STORAGE] MySQL/TiDB insert result type:", typeof result);
      console.log("[STORAGE] MySQL/TiDB insert result keys:", Object.keys(result || {}));
      console.log("[STORAGE] MySQL/TiDB insert result:", JSON.stringify(result));
      
      // TiDB/MySQL2 returns result differently - try multiple approaches
      let insertId = (result as any).insertId 
        ?? (result as any)[0]?.insertId 
        ?? (result as any)[0]?.[0]?.insertId;
      
      // If still no insertId, try to get the last inserted row
      if (!insertId) {
        console.log("[STORAGE] No insertId found, querying for latest appointment");
        const [latest] = await db()
          .select()
          .from(s.appointments)
          .where(eq(s.appointments.client, processedAppointment.client))
          .orderBy(desc(s.appointments.id))
          .limit(1);
        if (latest) {
          console.log("[STORAGE] Found latest appointment:", JSON.stringify(latest));
          return latest;
        }
        throw new Error("Failed to get insert ID from MySQL/TiDB");
      }
      
      console.log("[STORAGE] MySQL/TiDB insertId:", insertId);
      const [created] = await db().select().from(s.appointments).where(eq(s.appointments.id, insertId));
      if (!created) throw new Error("Failed to retrieve created appointment from MySQL/TiDB");
      console.log("[STORAGE] MySQL/TiDB created appointment:", JSON.stringify(created));
      return created;
    }
    console.log("[STORAGE] Using PostgreSQL path");
    const [created] = await db().insert(s.appointments).values(processedAppointment).returning();
    console.log("[STORAGE] PostgreSQL created appointment:", JSON.stringify(created));
    return created;
  }
  
  private processAppointmentServices(appointment: InsertAppointment): any {
    const servicesArray = (appointment as any).servicesJson;
    
    if (servicesArray && Array.isArray(servicesArray) && servicesArray.length > 0) {
      // Ensure non-negative values for each service
      const sanitizedServices = servicesArray.map((svc: any) => ({
        ...svc,
        duration: Math.max(0, svc.duration || 0),
        price: Math.max(0, svc.price || 0),
      }));
      
      const totalDuration = sanitizedServices.reduce((sum: number, svc: any) => sum + svc.duration, 0);
      const calculatedPrice = sanitizedServices.reduce((sum: number, svc: any) => sum + svc.price, 0);
      const serviceNames = sanitizedServices.map((svc: any) => svc.name).join(', ');
      
      // Use the user's custom price/total if provided, otherwise use calculated values
      // Ensure non-negative final values
      const rawPrice = (appointment as any).price !== undefined ? (appointment as any).price : calculatedPrice;
      const rawTotal = (appointment as any).total !== undefined ? (appointment as any).total : calculatedPrice;
      const finalPrice = Math.max(0, rawPrice);
      const finalTotal = Math.max(0, rawTotal);
      
      return {
        ...appointment,
        servicesJson: JSON.stringify(sanitizedServices),
        service: appointment.service || serviceNames,
        duration: totalDuration,
        price: finalPrice,
        total: finalTotal,
      };
    }
    
    return appointment;
  }

  async updateAppointment(id: number, appointment: Partial<InsertAppointment>): Promise<Appointment> {
    const s = schema();
    
    const processedAppointment = this.processAppointmentServices(appointment as InsertAppointment);
    
    if (!processedAppointment.staffId && processedAppointment.staff) {
      const [staffMember] = await db().select().from(s.staff)
        .where(eq(s.staff.name, processedAppointment.staff));
      if (staffMember) {
        processedAppointment.staffId = staffMember.id;
      }
    }
    
    if (isMySQL()) {
      await db().update(s.appointments).set(processedAppointment).where(eq(s.appointments.id, id));
      const [updated] = await db().select().from(s.appointments).where(eq(s.appointments.id, id));
      if (!updated) throw new Error("Appointment not found");
      return updated;
    }
    const [updated] = await db().update(s.appointments).set(processedAppointment).where(eq(s.appointments.id, id)).returning();
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

  async getServiceByName(name: string): Promise<Service | undefined> {
    const s = schema();
    const [service] = await db().select().from(s.services).where(eq(s.services.name, name));
    return service;
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
    if (Object.keys(st).length === 0) {
      const [current] = await db().select().from(s.staff).where(eq(s.staff.id, id));
      if (!current) throw new Error("Staff not found");
      return current;
    }

    if (st.name) {
      const [oldStaff] = await db().select().from(s.staff).where(eq(s.staff.id, id));
      if (oldStaff && oldStaff.name !== st.name) {
        await db().update(s.appointments)
          .set({ staff: st.name, staffId: id })
          .where(eq(s.appointments.staffId, id));
        await db().update(s.appointments)
          .set({ staff: st.name, staffId: id })
          .where(and(
            isNull(s.appointments.staffId),
            eq(s.appointments.staff, oldStaff.name)
          ));
        await db().update(s.staffDeductions)
          .set({ staffName: st.name, staffId: id })
          .where(eq(s.staffDeductions.staffId, id));
        await db().update(s.staffDeductions)
          .set({ staffName: st.name, staffId: id })
          .where(and(
            isNull(s.staffDeductions.staffId),
            eq(s.staffDeductions.staffName, oldStaff.name)
          ));
      }
    }

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
    return allProducts.filter((p: any) => {
      const quantity = Number(p.quantity || 0);
      const threshold = Number(p.lowStockThreshold || 0);
      return quantity <= threshold;
    });
  }

  async getExpiringProducts(): Promise<Product[]> {
    const s = schema();
    const allProducts = await db().select().from(s.products);
    const today = new Date();
    
    return allProducts.filter((p: any) => {
      if (!p.expiryDate) return false;
      const expiryDate = new Date(p.expiryDate);
      const warningDays = Number(p.expiryWarningDays || 30);
      const warningDate = new Date(today);
      warningDate.setDate(warningDate.getDate() + warningDays);
      return expiryDate <= warningDate;
    });
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

  async getClientByName(name: string): Promise<Client | undefined> {
    const s = schema();
    const [client] = await db().select().from(s.clients).where(eq(s.clients.name, name));
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
    
    // Only add loyalty points if client is enrolled in the program
    const pointsToAdd = client.loyaltyEnrolled ? points : 0;
    
    if (isMySQL()) {
      await db().update(s.clients).set({
        loyaltyPoints: client.loyaltyPoints + pointsToAdd,
        totalVisits: client.totalVisits + 1,
        totalSpent: client.totalSpent + spent,
      }).where(eq(s.clients.id, id));
      const [updated] = await db().select().from(s.clients).where(eq(s.clients.id, id));
      if (!updated) throw new Error("Failed to update client loyalty");
      return updated;
    }
    const [updated] = await db().update(s.clients).set({
      loyaltyPoints: client.loyaltyPoints + pointsToAdd,
      totalVisits: client.totalVisits + 1,
      totalSpent: client.totalSpent + spent,
    }).where(eq(s.clients.id, id)).returning();
    return updated;
  }

  async subtractClientLoyalty(id: number, points: number): Promise<Client> {
    const s = schema();
    const [client] = await db().select().from(s.clients).where(eq(s.clients.id, id));
    if (!client) throw new Error("Client not found");
    
    const newPoints = Math.max(0, client.loyaltyPoints - points);
    
    if (isMySQL()) {
      await db().update(s.clients).set({
        loyaltyPoints: newPoints,
      }).where(eq(s.clients.id, id));
      const [updated] = await db().select().from(s.clients).where(eq(s.clients.id, id));
      if (!updated) throw new Error("Failed to update client loyalty");
      return updated;
    }
    const [updated] = await db().update(s.clients).set({
      loyaltyPoints: newPoints,
    }).where(eq(s.clients.id, id)).returning();
    return updated;
  }

  async restoreClientLoyaltyPoints(id: number, points: number): Promise<Client> {
    const s = schema();
    const [client] = await db().select().from(s.clients).where(eq(s.clients.id, id));
    if (!client) throw new Error("Client not found");
    
    const newPoints = client.loyaltyPoints + points;
    
    if (isMySQL()) {
      await db().update(s.clients).set({
        loyaltyPoints: newPoints,
      }).where(eq(s.clients.id, id));
      const [updated] = await db().select().from(s.clients).where(eq(s.clients.id, id));
      if (!updated) throw new Error("Failed to restore client loyalty points");
      return updated;
    }
    const [updated] = await db().update(s.clients).set({
      loyaltyPoints: newPoints,
    }).where(eq(s.clients.id, id)).returning();
    return updated;
  }

  async updateClientGiftCardBalance(id: number, amount: number): Promise<Client> {
    const s = schema();
    const [client] = await db().select().from(s.clients).where(eq(s.clients.id, id));
    if (!client) throw new Error("Client not found");
    
    const currentBalance = Number(client.giftCardBalance) || 0;
    const newBalance = Math.max(0, currentBalance + amount);
    console.log(`[GiftCard] Updating client ${id} balance: ${currentBalance} + ${amount} = ${newBalance}`);
    
    if (isMySQL()) {
      await db().update(s.clients).set({
        giftCardBalance: newBalance,
      }).where(eq(s.clients.id, id));
      const [updated] = await db().select().from(s.clients).where(eq(s.clients.id, id));
      if (!updated) throw new Error("Failed to update client gift card balance");
      return updated;
    }
    const [updated] = await db().update(s.clients).set({
      giftCardBalance: newBalance,
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
    const items = await db().select().from(s.charges).orderBy(desc(s.charges.createdAt));
    return items.map((item: any) => ({
      ...item,
      amount: Number(item.amount || 0)
    }));
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

  async updateCharge(id: number, data: Partial<InsertCharge>): Promise<void> {
    const s = schema();
    await db().update(s.charges).set(data).where(eq(s.charges.id, id));
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

    if (!(deduction as any).staffId && deduction.staffName) {
      const [staffMember] = await db().select().from(s.staff)
        .where(eq(s.staff.name, deduction.staffName));
      if (staffMember) {
        (deduction as any).staffId = staffMember.id;
      }
    }

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

  async updateStaffDeduction(id: number, data: Partial<InsertStaffDeduction>): Promise<void> {
    const s = schema();
    if (!(data as any).staffId && data.staffName) {
      const [staffMember] = await db().select().from(s.staff)
        .where(eq(s.staff.name, data.staffName));
      if (staffMember) {
        (data as any).staffId = staffMember.id;
      }
    }
    await db().update(s.staffDeductions).set(data).where(eq(s.staffDeductions.id, id));
  }

  async deleteStaffDeduction(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.staffDeductions).where(eq(s.staffDeductions.id, id));
  }

  async clearStaffDeduction(id: number): Promise<void> {
    const s = schema();
    await db().update(s.staffDeductions).set({ cleared: true, clearedAt: new Date() }).where(eq(s.staffDeductions.id, id));
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

  async getStaffPerformance(staffName: string, startDate: string, endDate: string, staffId?: number): Promise<{
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
    
    let customCommissions: Map<number, number> = new Map();
    if (staffId) {
      const staffComms = await db().select().from(s.staffCommissions)
        .where(eq(s.staffCommissions.staffId, staffId));
      for (const sc of staffComms) {
        customCommissions.set(sc.serviceId, Number(sc.percentage));
      }
    }
    
    let totalRevenue = 0;
    let totalCommission = 0;
    
    for (const appt of appts) {
      const amount = Number(appt.total || 0);
      totalRevenue += amount;
      const service = serviceMap.get(appt.service);
      let commissionRate = Number(service?.commissionPercent || 50);
      if (service && customCommissions.has(service.id)) {
        commissionRate = customCommissions.get(service.id)!;
      }
      totalCommission += (amount * commissionRate) / 100;
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
    if (Object.keys(role).length === 0) {
      const [current] = await db().select().from(s.adminRoles).where(eq(s.adminRoles.id, id));
      if (!current) throw new Error("Admin role not found");
      return current;
    }
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

  async getStaffCommissions(): Promise<StaffCommission[]> {
    const s = schema();
    return await db().select().from(s.staffCommissions);
  }

  async getStaffCommissionsByStaff(staffId: number): Promise<StaffCommission[]> {
    const s = schema();
    return await db().select().from(s.staffCommissions).where(eq(s.staffCommissions.staffId, staffId));
  }

  async getStaffCommissionsByService(serviceId: number): Promise<StaffCommission[]> {
    const s = schema();
    return await db().select().from(s.staffCommissions).where(eq(s.staffCommissions.serviceId, serviceId));
  }

  async getStaffCommission(staffId: number, serviceId: number): Promise<StaffCommission | undefined> {
    const s = schema();
    const [commission] = await db().select().from(s.staffCommissions)
      .where(and(eq(s.staffCommissions.staffId, staffId), eq(s.staffCommissions.serviceId, serviceId)));
    return commission;
  }

  async createStaffCommission(commission: InsertStaffCommission): Promise<StaffCommission> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.staffCommissions).values(commission);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.staffCommissions).where(eq(s.staffCommissions.id, insertId));
      if (!created) throw new Error("Failed to retrieve staff commission");
      return created;
    }
    const [created] = await db().insert(s.staffCommissions).values(commission).returning();
    return created;
  }

  async updateStaffCommission(id: number, commission: Partial<InsertStaffCommission>): Promise<StaffCommission> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.staffCommissions).set({ ...commission, updatedAt: new Date() }).where(eq(s.staffCommissions.id, id));
      const [updated] = await db().select().from(s.staffCommissions).where(eq(s.staffCommissions.id, id));
      if (!updated) throw new Error("Staff commission not found");
      return updated;
    }
    const [updated] = await db().update(s.staffCommissions).set({ ...commission, updatedAt: new Date() }).where(eq(s.staffCommissions.id, id)).returning();
    return updated;
  }

  async deleteStaffCommission(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.staffCommissions).where(eq(s.staffCommissions.id, id));
  }

  async upsertStaffCommission(commission: InsertStaffCommission): Promise<StaffCommission> {
    const existing = await this.getStaffCommission(commission.staffId, commission.serviceId);
    if (existing) {
      return await this.updateStaffCommission(existing.id, { percentage: commission.percentage });
    }
    return await this.createStaffCommission(commission);
  }

  async getPageViewCount(pagePath: string): Promise<number> {
    const s = schema();
    const [result] = await db().select().from(s.pageViews).where(eq(s.pageViews.pagePath, pagePath));
    return result?.viewCount ?? 0;
  }

  async incrementPageView(pagePath: string): Promise<number> {
    const s = schema();
    
    if (isMySQL()) {
      await db().execute(
        sql`INSERT INTO page_views (page_path, view_count, created_at, updated_at) 
            VALUES (${pagePath}, 1, NOW(), NOW()) 
            ON DUPLICATE KEY UPDATE view_count = view_count + 1, updated_at = NOW()`
      );
    } else {
      await db().execute(
        sql`INSERT INTO page_views (page_path, view_count, created_at, updated_at) 
            VALUES (${pagePath}, 1, NOW(), NOW()) 
            ON CONFLICT (page_path) DO UPDATE SET view_count = page_views.view_count + 1, updated_at = NOW()`
      );
    }
    
    const [result] = await db().select().from(s.pageViews).where(eq(s.pageViews.pagePath, pagePath));
    return result?.viewCount ?? 1;
  }

  async getGiftCards(): Promise<GiftCard[]> {
    const s = schema();
    return await db().select().from(s.giftCards).orderBy(desc(s.giftCards.createdAt));
  }

  async getGiftCard(id: number): Promise<GiftCard | undefined> {
    const s = schema();
    const [giftCard] = await db().select().from(s.giftCards).where(eq(s.giftCards.id, id));
    return giftCard;
  }

  async getGiftCardByCode(code: string): Promise<GiftCard | undefined> {
    const s = schema();
    const [giftCard] = await db().select().from(s.giftCards).where(eq(s.giftCards.code, code));
    return giftCard;
  }

  async createGiftCard(giftCard: InsertGiftCard): Promise<GiftCard> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.giftCards).values(giftCard);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.giftCards).where(eq(s.giftCards.id, insertId));
      if (!created) throw new Error("Failed to retrieve created gift card");
      return created;
    }
    const [created] = await db().insert(s.giftCards).values(giftCard).returning();
    return created;
  }

  async updateGiftCard(id: number, giftCard: Partial<InsertGiftCard>): Promise<GiftCard> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.giftCards).set(giftCard).where(eq(s.giftCards.id, id));
      const [updated] = await db().select().from(s.giftCards).where(eq(s.giftCards.id, id));
      if (!updated) throw new Error("Gift card not found");
      return updated;
    }
    const [updated] = await db().update(s.giftCards).set(giftCard).where(eq(s.giftCards.id, id)).returning();
    return updated;
  }

  async deleteGiftCard(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.giftCards).where(eq(s.giftCards.id, id));
  }

  async getReferrals(): Promise<Referral[]> {
    const s = schema();
    return await db().select().from(s.referrals).orderBy(desc(s.referrals.createdAt));
  }

  async getReferralsByReferrer(referrerId: number): Promise<Referral[]> {
    const s = schema();
    return await db().select().from(s.referrals).where(eq(s.referrals.referrerId, referrerId));
  }

  async createReferral(referral: InsertReferral): Promise<Referral> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.referrals).values(referral);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.referrals).where(eq(s.referrals.id, insertId));
      if (!created) throw new Error("Failed to retrieve created referral");
      return created;
    }
    const [created] = await db().insert(s.referrals).values(referral).returning();
    return created;
  }

  async updateReferral(id: number, referral: Partial<InsertReferral>): Promise<Referral> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.referrals).set(referral).where(eq(s.referrals.id, id));
      const [updated] = await db().select().from(s.referrals).where(eq(s.referrals.id, id));
      if (!updated) throw new Error("Referral not found");
      return updated;
    }
    const [updated] = await db().update(s.referrals).set(referral).where(eq(s.referrals.id, id)).returning();
    return updated;
  }

  async getPackages(): Promise<Package[]> {
    const s = schema();
    return await db().select().from(s.packages).orderBy(desc(s.packages.createdAt));
  }

  async getPackage(id: number): Promise<Package | undefined> {
    const s = schema();
    const [pkg] = await db().select().from(s.packages).where(eq(s.packages.id, id));
    return pkg;
  }

  async createPackage(pkg: InsertPackage): Promise<Package> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.packages).values(pkg);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.packages).where(eq(s.packages.id, insertId));
      if (!created) throw new Error("Failed to retrieve created package");
      return created;
    }
    const [created] = await db().insert(s.packages).values(pkg).returning();
    return created;
  }

  async updatePackage(id: number, pkg: Partial<InsertPackage>): Promise<Package> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.packages).set(pkg).where(eq(s.packages.id, id));
      const [updated] = await db().select().from(s.packages).where(eq(s.packages.id, id));
      if (!updated) throw new Error("Package not found");
      return updated;
    }
    const [updated] = await db().update(s.packages).set(pkg).where(eq(s.packages.id, id)).returning();
    return updated;
  }

  async deletePackage(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.packages).where(eq(s.packages.id, id));
  }

  async getPackagePurchases(): Promise<PackagePurchase[]> {
    const s = schema();
    return await db().select().from(s.packagePurchases).orderBy(desc(s.packagePurchases.createdAt));
  }

  async getPackagePurchase(id: number): Promise<PackagePurchase | undefined> {
    const s = schema();
    const [purchase] = await db().select().from(s.packagePurchases).where(eq(s.packagePurchases.id, id));
    return purchase;
  }

  async getPackagePurchasesByClient(clientId: number): Promise<PackagePurchase[]> {
    const s = schema();
    return await db().select().from(s.packagePurchases)
      .where(eq(s.packagePurchases.clientId, clientId))
      .orderBy(desc(s.packagePurchases.createdAt));
  }

  async createPackagePurchase(purchase: InsertPackagePurchase): Promise<PackagePurchase> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.packagePurchases).values(purchase);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.packagePurchases).where(eq(s.packagePurchases.id, insertId));
      if (!created) throw new Error("Failed to retrieve created package purchase");
      return created;
    }
    const [created] = await db().insert(s.packagePurchases).values(purchase).returning();
    return created;
  }

  async updatePackagePurchase(id: number, purchase: Partial<InsertPackagePurchase>): Promise<PackagePurchase> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.packagePurchases).set(purchase).where(eq(s.packagePurchases.id, id));
      const [updated] = await db().select().from(s.packagePurchases).where(eq(s.packagePurchases.id, id));
      if (!updated) throw new Error("Package purchase not found");
      return updated;
    }
    const [updated] = await db().update(s.packagePurchases).set(purchase).where(eq(s.packagePurchases.id, id)).returning();
    return updated;
  }

  async getWaitlist(): Promise<Waitlist[]> {
    const s = schema();
    return await db().select().from(s.waitlist).orderBy(desc(s.waitlist.createdAt));
  }

  async getWaitlistEntry(id: number): Promise<Waitlist | undefined> {
    const s = schema();
    const [entry] = await db().select().from(s.waitlist).where(eq(s.waitlist.id, id));
    return entry;
  }

  async getWaitlistByDate(date: string): Promise<Waitlist[]> {
    const s = schema();
    return await db().select().from(s.waitlist)
      .where(eq(s.waitlist.requestedDate, date))
      .orderBy(desc(s.waitlist.createdAt));
  }

  async createWaitlistEntry(entry: InsertWaitlist): Promise<Waitlist> {
    const s = schema();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);
    
    const entryWithExpiry = {
      ...entry,
      expiresAt,
    };
    
    if (isMySQL()) {
      const result = await db().insert(s.waitlist).values(entryWithExpiry);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.waitlist).where(eq(s.waitlist.id, insertId));
      if (!created) throw new Error("Failed to retrieve created waitlist entry");
      return created;
    }
    const [created] = await db().insert(s.waitlist).values(entryWithExpiry).returning();
    return created;
  }

  async updateWaitlistEntry(id: number, entry: Partial<InsertWaitlist>): Promise<Waitlist> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.waitlist).set(entry).where(eq(s.waitlist.id, id));
      const [updated] = await db().select().from(s.waitlist).where(eq(s.waitlist.id, id));
      if (!updated) throw new Error("Waitlist entry not found");
      return updated;
    }
    const [updated] = await db().update(s.waitlist).set(entry).where(eq(s.waitlist.id, id)).returning();
    return updated;
  }

  async deleteWaitlistEntry(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.waitlist).where(eq(s.waitlist.id, id));
  }

  async getStaffSchedules(staffId: number): Promise<StaffSchedule[]> {
    const s = schema();
    return await db().select().from(s.staffSchedules).where(eq(s.staffSchedules.staffId, staffId));
  }

  async saveStaffSchedule(schedule: InsertStaffSchedule): Promise<StaffSchedule> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.staffSchedules).values(schedule);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.staffSchedules).where(eq(s.staffSchedules.id, insertId));
      if (!created) throw new Error("Failed to retrieve created staff schedule");
      return created;
    }
    const [created] = await db().insert(s.staffSchedules).values(schedule).returning();
    return created;
  }

  async updateStaffSchedule(id: number, schedule: Partial<InsertStaffSchedule>): Promise<StaffSchedule> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.staffSchedules).set(schedule).where(eq(s.staffSchedules.id, id));
      const [updated] = await db().select().from(s.staffSchedules).where(eq(s.staffSchedules.id, id));
      if (!updated) throw new Error("Staff schedule not found");
      return updated;
    }
    const [updated] = await db().update(s.staffSchedules).set(schedule).where(eq(s.staffSchedules.id, id)).returning();
    return updated;
  }

  async deleteStaffSchedule(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.staffSchedules).where(eq(s.staffSchedules.id, id));
  }

  async upsertStaffSchedule(schedule: InsertStaffSchedule): Promise<StaffSchedule> {
    const s = schema();
    const [existing] = await db().select().from(s.staffSchedules)
      .where(and(eq(s.staffSchedules.staffId, schedule.staffId), eq(s.staffSchedules.dayOfWeek, schedule.dayOfWeek)));
    
    if (existing) {
      return await this.updateStaffSchedule(existing.id, schedule);
    }
    return await this.saveStaffSchedule(schedule);
  }

  async getStaffBreaks(staffId: number, startDate?: string, endDate?: string): Promise<StaffBreak[]> {
    const s = schema();
    let query = db().select().from(s.staffBreaks).where(eq(s.staffBreaks.staffId, staffId));
    
    if (startDate && endDate) {
      return await db().select().from(s.staffBreaks)
        .where(and(
          eq(s.staffBreaks.staffId, staffId),
          gte(s.staffBreaks.date, startDate),
          lte(s.staffBreaks.date, endDate)
        ))
        .orderBy(desc(s.staffBreaks.createdAt));
    }
    
    return await db().select().from(s.staffBreaks)
      .where(eq(s.staffBreaks.staffId, staffId))
      .orderBy(desc(s.staffBreaks.createdAt));
  }

  async createStaffBreak(breakItem: InsertStaffBreak): Promise<StaffBreak> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.staffBreaks).values(breakItem);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.staffBreaks).where(eq(s.staffBreaks.id, insertId));
      if (!created) throw new Error("Failed to retrieve created staff break");
      return created;
    }
    const [created] = await db().insert(s.staffBreaks).values(breakItem).returning();
    return created;
  }

  async deleteStaffBreak(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.staffBreaks).where(eq(s.staffBreaks.id, id));
  }

  async getStaffTimeOff(staffId: number): Promise<StaffTimeOff[]> {
    const s = schema();
    return await db().select().from(s.staffTimeOff)
      .where(eq(s.staffTimeOff.staffId, staffId))
      .orderBy(desc(s.staffTimeOff.createdAt));
  }

  async getAllStaffTimeOff(): Promise<StaffTimeOff[]> {
    const s = schema();
    return await db().select().from(s.staffTimeOff).orderBy(desc(s.staffTimeOff.createdAt));
  }

  async createStaffTimeOff(timeOff: InsertStaffTimeOff): Promise<StaffTimeOff> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.staffTimeOff).values(timeOff);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.staffTimeOff).where(eq(s.staffTimeOff.id, insertId));
      if (!created) throw new Error("Failed to retrieve created staff time off");
      return created;
    }
    const [created] = await db().insert(s.staffTimeOff).values(timeOff).returning();
    return created;
  }

  async updateStaffTimeOff(id: number, timeOff: Partial<InsertStaffTimeOff>): Promise<StaffTimeOff> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.staffTimeOff).set(timeOff).where(eq(s.staffTimeOff.id, id));
      const [updated] = await db().select().from(s.staffTimeOff).where(eq(s.staffTimeOff.id, id));
      if (!updated) throw new Error("Staff time off not found");
      return updated;
    }
    const [updated] = await db().update(s.staffTimeOff).set(timeOff).where(eq(s.staffTimeOff.id, id)).returning();
    return updated;
  }

  async deleteStaffTimeOff(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.staffTimeOff).where(eq(s.staffTimeOff.id, id));
  }

  async getStaffGoals(staffId: number, period?: string): Promise<StaffGoal[]> {
    const s = schema();
    if (period) {
      return await db().select().from(s.staffGoals)
        .where(and(eq(s.staffGoals.staffId, staffId), eq(s.staffGoals.period, period)))
        .orderBy(desc(s.staffGoals.period));
    }
    return await db().select().from(s.staffGoals)
      .where(eq(s.staffGoals.staffId, staffId))
      .orderBy(desc(s.staffGoals.period));
  }

  async getStaffGoal(staffId: number, period: string): Promise<StaffGoal | undefined> {
    const s = schema();
    const [goal] = await db().select().from(s.staffGoals)
      .where(and(eq(s.staffGoals.staffId, staffId), eq(s.staffGoals.period, period)));
    return goal;
  }

  async getAllStaffGoalsForPeriod(period: string): Promise<StaffGoal[]> {
    const s = schema();
    return await db().select().from(s.staffGoals)
      .where(eq(s.staffGoals.period, period))
      .orderBy(s.staffGoals.staffId);
  }

  async createStaffGoal(goal: InsertStaffGoal): Promise<StaffGoal> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.staffGoals).values(goal);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.staffGoals).where(eq(s.staffGoals.id, insertId));
      if (!created) throw new Error("Failed to retrieve created staff goal");
      return created;
    }
    const [created] = await db().insert(s.staffGoals).values(goal).returning();
    return created;
  }

  async updateStaffGoal(id: number, goal: Partial<InsertStaffGoal>): Promise<StaffGoal> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.staffGoals).set(goal).where(eq(s.staffGoals.id, id));
      const [updated] = await db().select().from(s.staffGoals).where(eq(s.staffGoals.id, id));
      if (!updated) throw new Error("Staff goal not found");
      return updated;
    }
    const [updated] = await db().update(s.staffGoals).set(goal).where(eq(s.staffGoals.id, id)).returning();
    return updated;
  }

  async deleteStaffGoal(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.staffGoals).where(eq(s.staffGoals.id, id));
  }

  async upsertStaffGoal(goal: InsertStaffGoal): Promise<StaffGoal> {
    const existing = await this.getStaffGoal(goal.staffId, goal.period);
    if (existing) {
      return await this.updateStaffGoal(existing.id, goal);
    }
    return await this.createStaffGoal(goal);
  }

  async getMessageTemplates(): Promise<MessageTemplate[]> {
    const s = schema();
    return await db().select().from(s.messageTemplates).orderBy(desc(s.messageTemplates.createdAt));
  }

  async getMessageTemplate(id: number): Promise<MessageTemplate | undefined> {
    const s = schema();
    const [template] = await db().select().from(s.messageTemplates).where(eq(s.messageTemplates.id, id));
    return template;
  }

  async createMessageTemplate(template: InsertMessageTemplate): Promise<MessageTemplate> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.messageTemplates).values(template);
      const insertId = (result as any).insertId ?? (result as any)[0]?.insertId;
      if (!insertId) throw new Error("Failed to get insert ID");
      const [created] = await db().select().from(s.messageTemplates).where(eq(s.messageTemplates.id, insertId));
      if (!created) throw new Error("Failed to retrieve created message template");
      return created;
    }
    const [created] = await db().insert(s.messageTemplates).values(template).returning();
    return created;
  }

  async updateMessageTemplate(id: number, template: Partial<InsertMessageTemplate>): Promise<MessageTemplate> {
    const s = schema();
    if (isMySQL()) {
      await db().update(s.messageTemplates).set({ ...template, updatedAt: new Date() }).where(eq(s.messageTemplates.id, id));
      const [updated] = await db().select().from(s.messageTemplates).where(eq(s.messageTemplates.id, id));
      if (!updated) throw new Error("Message template not found");
      return updated;
    }
    const [updated] = await db().update(s.messageTemplates).set({ ...template, updatedAt: new Date() }).where(eq(s.messageTemplates.id, id)).returning();
    return updated;
  }

  async deleteMessageTemplate(id: number): Promise<void> {
    const s = schema();
    await db().delete(s.messageTemplates).where(eq(s.messageTemplates.id, id));
  }

  async getStaffPayments(): Promise<StaffPayment[]> {
    const s = schema();
    return await db().select().from(s.staffPayments).orderBy(desc(s.staffPayments.paidAt));
  }

  async getStaffPaymentsByStaff(staffId: number): Promise<StaffPayment[]> {
    const s = schema();
    return await db().select().from(s.staffPayments).where(eq(s.staffPayments.staffId, staffId)).orderBy(desc(s.staffPayments.paidAt));
  }

  async getLastStaffPayment(staffId: number): Promise<StaffPayment | undefined> {
    const s = schema();
    const [payment] = await db().select().from(s.staffPayments).where(eq(s.staffPayments.staffId, staffId)).orderBy(desc(s.staffPayments.paidAt)).limit(1);
    return payment;
  }

  async createStaffPayment(payment: InsertStaffPayment): Promise<StaffPayment> {
    const s = schema();
    if (isMySQL()) {
      const result = await db().insert(s.staffPayments).values(payment);
      const insertId = (result as any)[0]?.insertId;
      const [created] = await db().select().from(s.staffPayments).where(eq(s.staffPayments.id, insertId));
      return created;
    }
    const [created] = await db().insert(s.staffPayments).values(payment).returning();
    return created;
  }
  async getStaffByToken(token: string): Promise<Staff | undefined> {
    const s = schema();
    const [staffMember] = await db().select().from(s.staff).where(eq(s.staff.publicToken, token));
    return staffMember;
  }
}

export const storage = new DatabaseStorage();
