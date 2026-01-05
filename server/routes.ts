import type { Express } from "express";
import type { Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";

let io: SocketIOServer;

export function getIO() {
  return io;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Socket.IO
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // === API ROUTES ===

  // Appointments
  app.get(api.appointments.list.path, async (req, res) => {
    const { date } = z.object({ date: z.string().optional() }).parse(req.query);
    const items = await storage.getAppointments(date);
    res.json(items);
  });

  // Get all appointments (for salaries calculation)
  app.get("/api/appointments/all", async (req, res) => {
    const items = await storage.getAppointments();
    res.json(items);
  });

  app.post(api.appointments.create.path, async (req, res) => {
    try {
      const input = api.appointments.create.input.parse(req.body);
      const item = await storage.createAppointment(input);
      
      // Emit real-time notification for new booking (only unpaid reservations)
      if (!item.paid) {
        io.emit("booking:created", item);
      }
      
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.appointments.update.path, async (req, res) => {
    try {
      const input = api.appointments.update.input.parse(req.body);
      const item = await storage.updateAppointment(Number(req.params.id), input);
      
      io.emit("appointment:updated", item);
      if (item.paid) {
        io.emit("appointment:paid", item);
      }
      
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.appointments.delete.path, async (req, res) => {
    await storage.deleteAppointment(Number(req.params.id));
    res.status(204).send();
  });

  // Services
  app.get(api.services.list.path, async (req, res) => {
    const items = await storage.getServices();
    res.json(items);
  });

  app.post(api.services.create.path, async (req, res) => {
    try {
      const input = api.services.create.input.parse(req.body);
      const item = await storage.createService(input);
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.patch("/api/services/:id", async (req, res) => {
    try {
      const item = await storage.updateService(Number(req.params.id), req.body);
      res.json(item);
    } catch (err) {
      res.status(400).json({ message: "Update failed" });
    }
  });

  app.delete(api.services.delete.path, async (req, res) => {
    await storage.deleteService(Number(req.params.id));
    res.status(204).send();
  });

  // Categories
  app.get(api.categories.list.path, async (req, res) => {
    const items = await storage.getCategories();
    res.json(items);
  });

  app.post(api.categories.create.path, async (req, res) => {
    try {
      const input = api.categories.create.input.parse(req.body);
      const item = await storage.createCategory(input);
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.patch("/api/categories/:id", async (req, res) => {
    try {
      const item = await storage.updateCategory(Number(req.params.id), req.body);
      res.json(item);
    } catch (err) {
      res.status(400).json({ message: "Update failed" });
    }
  });

  app.delete("/api/categories/:id", async (req, res) => {
    await storage.deleteCategory(Number(req.params.id));
    res.status(204).send();
  });

  // Staff
  app.get(api.staff.list.path, async (req, res) => {
    const items = await storage.getStaff();
    res.json(items);
  });

  app.post("/api/staff", async (req, res) => {
    const item = await storage.createStaff(req.body);
    res.status(201).json(item);
  });

  app.patch("/api/staff/:id", async (req, res) => {
    const item = await storage.updateStaff(Number(req.params.id), req.body);
    res.json(item);
  });

  app.delete("/api/staff/:id", async (req, res) => {
    await storage.deleteStaff(Number(req.params.id));
    res.status(204).send();
  });

  // Products/Inventory
  app.get("/api/products", async (_req, res) => {
    const products = await storage.getProducts();
    res.json(products);
  });

  app.get("/api/products/low-stock", async (_req, res) => {
    const items = await storage.getLowStockProducts();
    res.json(items);
  });

  app.get("/api/products/by-name/:name", async (req, res) => {
    const product = await storage.getProductByName(req.params.name);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  });

  app.post("/api/products", async (req, res) => {
    const item = await storage.createProduct(req.body);
    res.status(201).json(item);
  });

  app.patch("/api/products/:id", async (req, res) => {
    const item = await storage.updateProduct(Number(req.params.id), req.body);
    res.json(item);
  });

  app.delete("/api/products/:id", async (req, res) => {
    await storage.deleteProduct(Number(req.params.id));
    res.status(204).send();
  });

  app.get("/api/products/:id", async (req, res) => {
    const product = await storage.getProducts().then(prods => prods.find(p => p.id === parseInt(req.params.id)));
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  });

  app.patch("/api/products/:id/quantity", async (req, res) => {
    const { quantity } = req.body;
    if (typeof quantity !== "number") return res.status(400).json({ message: "Invalid quantity" });
    try {
      const updated = await storage.updateProductQuantity(parseInt(req.params.id), quantity);
      res.json(updated);
    } catch (e) {
      res.status(404).json({ message: "Product not found" });
    }
  });

  // Charges
  app.get("/api/charges", async (_req, res) => {
    const items = await storage.getCharges();
    res.json(items);
  });

  app.post("/api/charges", async (req, res) => {
    try {
      const item = await storage.createCharge(req.body);
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ message: "Failed to create charge" });
    }
  });

  app.delete("/api/charges/:id", async (req, res) => {
    await storage.deleteCharge(Number(req.params.id));
    res.status(204).send();
  });

  // Staff Deductions
  app.get("/api/staff-deductions", async (_req, res) => {
    const items = await storage.getStaffDeductions();
    res.json(items);
  });

  app.post("/api/staff-deductions", async (req, res) => {
    try {
      const item = await storage.createStaffDeduction(req.body);
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ message: "Failed to create deduction" });
    }
  });

  app.delete("/api/staff-deductions/:id", async (req, res) => {
    await storage.deleteStaffDeduction(Number(req.params.id));
    res.status(204).send();
  });

  // Clients
  app.get("/api/clients", async (_req, res) => {
    const items = await storage.getClients();
    res.json(items);
  });

  app.get("/api/clients/:id", async (req, res) => {
    const client = await storage.getClient(Number(req.params.id));
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  app.get("/api/clients/:id/appointments", async (req, res) => {
    const appointments = await storage.getClientAppointments(Number(req.params.id));
    res.json(appointments);
  });

  app.post("/api/clients", async (req, res) => {
    try {
      const item = await storage.createClient(req.body);
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ message: "Failed to create client" });
    }
  });

  app.patch("/api/clients/:id", async (req, res) => {
    try {
      const item = await storage.updateClient(Number(req.params.id), req.body);
      res.json(item);
    } catch (err) {
      res.status(400).json({ message: "Update failed" });
    }
  });

  app.patch("/api/clients/:id/loyalty", async (req, res) => {
    try {
      const { points, spent } = req.body;
      const item = await storage.updateClientLoyalty(Number(req.params.id), points, spent);
      res.json(item);
    } catch (err) {
      res.status(400).json({ message: "Update failed" });
    }
  });

  app.delete("/api/clients/:id", async (req, res) => {
    await storage.deleteClient(Number(req.params.id));
    res.status(204).send();
  });

  // Expense Categories
  app.get("/api/expense-categories", async (_req, res) => {
    const items = await storage.getExpenseCategories();
    res.json(items);
  });

  app.post("/api/expense-categories", async (req, res) => {
    try {
      const item = await storage.createExpenseCategory(req.body);
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ message: "Failed to create category" });
    }
  });

  app.delete("/api/expense-categories/:id", async (req, res) => {
    await storage.deleteExpenseCategory(Number(req.params.id));
    res.status(204).send();
  });

  // Loyalty Redemptions
  app.get("/api/loyalty-redemptions", async (req, res) => {
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
    const items = await storage.getLoyaltyRedemptions(clientId);
    res.json(items);
  });

  app.post("/api/loyalty-redemptions", async (req, res) => {
    try {
      const item = await storage.createLoyaltyRedemption(req.body);
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ message: "Failed to redeem points" });
    }
  });

  // Staff Performance
  app.get("/api/staff-performance/:staffName", async (req, res) => {
    try {
      const { startDate, endDate } = z.object({
        startDate: z.string(),
        endDate: z.string(),
      }).parse(req.query);
      
      const performance = await storage.getStaffPerformance(
        req.params.staffName,
        startDate,
        endDate
      );
      res.json(performance);
    } catch (err) {
      res.status(400).json({ message: "Invalid parameters" });
    }
  });

  // WhatsApp Notifications (SendZen)
  app.post("/api/notifications/send", async (req, res) => {
    try {
      const { sendWhatsAppMessage } = await import("./sendzen");
      const { phone, message } = z.object({
        phone: z.string(),
        message: z.string(),
      }).parse(req.body);
      
      const result = await sendWhatsAppMessage(phone, message);
      
      if (result.success) {
        res.json({ success: true, messageId: result.messageId });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.post("/api/notifications/appointment-reminder", async (req, res) => {
    try {
      const { sendAppointmentReminder } = await import("./sendzen");
      const { clientPhone, clientName, appointmentDate, appointmentTime, serviceName } = z.object({
        clientPhone: z.string(),
        clientName: z.string(),
        appointmentDate: z.string(),
        appointmentTime: z.string(),
        serviceName: z.string(),
      }).parse(req.body);
      
      const result = await sendAppointmentReminder(clientPhone, clientName, appointmentDate, appointmentTime, serviceName);
      
      if (result.success) {
        res.json({ success: true, messageId: result.messageId });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.post("/api/notifications/booking-confirmation", async (req, res) => {
    try {
      const { sendBookingConfirmation } = await import("./sendzen");
      const { clientPhone, clientName, appointmentDate, appointmentTime, serviceName } = z.object({
        clientPhone: z.string(),
        clientName: z.string(),
        appointmentDate: z.string(),
        appointmentTime: z.string(),
        serviceName: z.string(),
      }).parse(req.body);
      
      const result = await sendBookingConfirmation(clientPhone, clientName, appointmentDate, appointmentTime, serviceName);
      
      if (result.success) {
        res.json({ success: true, messageId: result.messageId });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Seed data if empty
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const staff = await storage.getStaff();
  if (staff.length === 0) {
    await storage.createStaff({ name: "Hayat", color: "#d63384" });
    await storage.createStaff({ name: "Mehdi", color: "#20c997" });
    await storage.createStaff({ name: "Nofl", color: "#0d6efd" });
  }

  const categories = await storage.getCategories();
  if (categories.length === 0) {
    await storage.createCategory({ name: "Beauté" });
    await storage.createCategory({ name: "Coiffure" });
    await storage.createCategory({ name: "Onglerie" });
    await storage.createCategory({ name: "Épilation à la Cire" });
    await storage.createCategory({ name: "Soins du Visage" });
  }

  const services = await storage.getServices();
  if (services.length === 0) {
    // BEAUTE
    await storage.createService({ name: "Maquillage Simple", price: 100, duration: 30, category: "Beauté" });
    await storage.createService({ name: "Maquillage et faux-cils", price: 150, duration: 45, category: "Beauté" });
    await storage.createService({ name: "Maquillage Pro", price: 300, duration: 60, category: "Beauté" });
    await storage.createService({ name: "Maquillage Fiancé & Marié", price: 600, duration: 90, category: "Beauté" });
    await storage.createService({ name: "Extension de cils Permanent", price: 350, duration: 90, category: "Beauté" });
    await storage.createService({ name: "Cils Normaux", price: 50, duration: 30, category: "Beauté" });
    await storage.createService({ name: "Cils Mèche/Mèche", price: 100, duration: 45, category: "Beauté" });
    await storage.createService({ name: "Cils Naturel", price: 150, duration: 60, category: "Beauté" });
    await storage.createService({ name: "Coloration des Sourcils", price: 20, duration: 15, category: "Beauté" });

    // COIFFURE
    await storage.createService({ name: "Shampoing", price: 20, duration: 15, category: "Coiffure" });
    await storage.createService({ name: "Brushing", price: 50, duration: 30, category: "Coiffure" });
    await storage.createService({ name: "Coupe Unique", price: 40, duration: 30, category: "Coiffure" });
    await storage.createService({ name: "Coupe et Brushing", price: 80, duration: 60, category: "Coiffure" });
    await storage.createService({ name: "Soin Cheveux", price: 100, duration: 45, category: "Coiffure" });
    await storage.createService({ name: "Soin Tanino", price: 200, duration: 75, category: "Coiffure" });
    await storage.createService({ name: "Coloration", price: 250, duration: 90, category: "Coiffure" });
    await storage.createService({ name: "Mèche", price: 300, duration: 90, category: "Coiffure" });
    await storage.createService({ name: "Permanent", price: 300, duration: 90, category: "Coiffure" });
    await storage.createService({ name: "Défrisage", price: 300, duration: 90, category: "Coiffure" });
    await storage.createService({ name: "Balayage", price: 600, duration: 120, category: "Coiffure" });
    await storage.createService({ name: "Soin Lissage", price: 600, duration: 120, category: "Coiffure" });
    await storage.createService({ name: "Tanino Plastie", price: 1000, duration: 180, category: "Coiffure" });
    await storage.createService({ name: "Chignon", price: 150, duration: 60, category: "Coiffure" });
    await storage.createService({ name: "Chignon marié", price: 600, duration: 120, category: "Coiffure" });

    // ONGLERIE
    await storage.createService({ name: "Manicure Simple", price: 50, duration: 30, category: "Onglerie" });
    await storage.createService({ name: "Manicure + vernis permanent", price: 150, duration: 60, category: "Onglerie" });
    await storage.createService({ name: "Pose vernis simple", price: 30, duration: 20, category: "Onglerie" });
    await storage.createService({ name: "Pédicure simple", price: 100, duration: 45, category: "Onglerie" });
    await storage.createService({ name: "Pédicure + vernis permanent", price: 200, duration: 75, category: "Onglerie" });
    await storage.createService({ name: "SPA Manicure", price: 80, duration: 45, category: "Onglerie" });
    await storage.createService({ name: "SPA Pédicure", price: 150, duration: 60, category: "Onglerie" });
    await storage.createService({ name: "Soin Paraffine", price: 40, duration: 30, category: "Onglerie" });
    await storage.createService({ name: "Dépose vernis permanent", price: 40, duration: 20, category: "Onglerie" });
    await storage.createService({ name: "Dépose Gel ou Résine", price: 80, duration: 30, category: "Onglerie" });
    await storage.createService({ name: "Ongle Normale", price: 100, duration: 45, category: "Onglerie" });
    await storage.createService({ name: "Ongle en Gel", price: 300, duration: 90, category: "Onglerie" });
    await storage.createService({ name: "Pose vernis permanent", price: 100, duration: 45, category: "Onglerie" });
    await storage.createService({ name: "Remplissage", price: 150, duration: 60, category: "Onglerie" });
    await storage.createService({ name: "Baby boomer ou French", price: 50, duration: 30, category: "Onglerie" });

    // ÉPILATION À LA CIRE
    await storage.createService({ name: "Sourcils", price: 30, duration: 15, category: "Épilation à la Cire" });
    await storage.createService({ name: "Duvet", price: 20, duration: 10, category: "Épilation à la Cire" });
    await storage.createService({ name: "Menton", price: 20, duration: 10, category: "Épilation à la Cire" });
    await storage.createService({ name: "Visage", price: 70, duration: 30, category: "Épilation à la Cire" });
    await storage.createService({ name: "Aisselles", price: 30, duration: 15, category: "Épilation à la Cire" });
    await storage.createService({ name: "Avant-Bras", price: 50, duration: 20, category: "Épilation à la Cire" });
    await storage.createService({ name: "Bras Complet", price: 80, duration: 30, category: "Épilation à la Cire" });
    await storage.createService({ name: "Ventre", price: 60, duration: 20, category: "Épilation à la Cire" });
    await storage.createService({ name: "Bord Maillot", price: 50, duration: 20, category: "Épilation à la Cire" });
    await storage.createService({ name: "Maillot Brésilien", price: 100, duration: 30, category: "Épilation à la Cire" });
    await storage.createService({ name: "Maillot Complet", price: 120, duration: 45, category: "Épilation à la Cire" });
    await storage.createService({ name: "Demi-Jambe", price: 60, duration: 30, category: "Épilation à la Cire" });
    await storage.createService({ name: "Jambe Complet", price: 100, duration: 45, category: "Épilation à la Cire" });
    await storage.createService({ name: "Dos", price: 100, duration: 30, category: "Épilation à la Cire" });
    await storage.createService({ name: "Cire Complet", price: 380, duration: 120, category: "Épilation à la Cire" });

    // SOINS DU VISAGE
    await storage.createService({ name: "Gommage + Masque", price: 100, duration: 30, category: "Soins du Visage" });
    await storage.createService({ name: "Mini soin de Visage", price: 150, duration: 30, category: "Soins du Visage" });
    await storage.createService({ name: "Soin Classique", price: 200, duration: 45, category: "Soins du Visage" });
    await storage.createService({ name: "Soin Eclaircissant", price: 300, duration: 60, category: "Soins du Visage" });
    await storage.createService({ name: "Soin Hydratant", price: 300, duration: 60, category: "Soins du Visage" });
    await storage.createService({ name: "Soin Hydrafaciale", price: 450, duration: 90, category: "Soins du Visage" });
  }

  const prods = await storage.getProducts();
  if (prods.length === 0) {
    await storage.createProduct({ name: "Lissage Protéine", quantity: 10 });
    await storage.createProduct({ name: "Color Blond", quantity: 5 });
  }
}
