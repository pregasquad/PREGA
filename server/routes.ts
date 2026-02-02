import type { Express, RequestHandler } from "express";
import type { Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isPinAuthenticated, requirePermission, checkRateLimit, recordFailedAttempt, clearAttempts } from "./replit_integrations/auth";
import { vapidPublicKey, sendPushNotification } from "./push";
import { db, schema, isDatabaseOffline, checkDatabaseConnection } from "./db";
import { eq } from "drizzle-orm";
import { insertAdminRoleSchema, ROLE_PERMISSIONS } from "@shared/schema";
import bcrypt from "bcryptjs";
import multer from "multer";
import { offlineStorage } from "./offline-storage";

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
    }
  }
});

let io: SocketIOServer;

export function getIO() {
  return io;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Socket.IO with production-ready config for Koyeb
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    transports: ["websocket", "polling"],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Track active booking page viewers
  const bookingPageViewers = new Set<string>();

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Handle booking page join
    socket.on("booking:join", () => {
      bookingPageViewers.add(socket.id);
      io.emit("booking:viewers", bookingPageViewers.size);
    });

    // Handle booking page leave
    socket.on("booking:leave", () => {
      bookingPageViewers.delete(socket.id);
      io.emit("booking:viewers", bookingPageViewers.size);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      // Remove from booking viewers if they were viewing
      if (bookingPageViewers.has(socket.id)) {
        bookingPageViewers.delete(socket.id);
        io.emit("booking:viewers", bookingPageViewers.size);
      }
    });
  });

  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // === API ROUTES ===

  // Health check for Koyeb (public)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // === PUBLIC BOOKING API ROUTES ===
  // These routes are accessible without authentication for the public booking page
  // Sanitized responses - only expose fields needed for booking

  // Simple in-memory rate limiting for public endpoints
  const publicRateLimits = new Map<string, { count: number; resetAt: number }>();
  const PUBLIC_RATE_LIMIT = 10; // requests per minute
  const PUBLIC_RATE_WINDOW = 60000; // 1 minute

  const checkPublicRateLimit = (ip: string): boolean => {
    const now = Date.now();
    const record = publicRateLimits.get(ip);
    
    if (!record || now > record.resetAt) {
      publicRateLimits.set(ip, { count: 1, resetAt: now + PUBLIC_RATE_WINDOW });
      return true;
    }
    
    if (record.count >= PUBLIC_RATE_LIMIT) {
      return false;
    }
    
    record.count++;
    return true;
  };

  // Public rate limiting middleware
  const publicRateLimitMiddleware: RequestHandler = (req, res, next) => {
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkPublicRateLimit(clientIp)) {
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }
    next();
  };

  // Public: Get services list for booking (sanitized - only booking-safe fields)
  app.get("/api/public/services", publicRateLimitMiddleware, async (_req, res) => {
    const items = await storage.getServices();
    const sanitizedItems = items.map(s => ({
      id: s.id,
      name: s.name,
      category: s.category,
      duration: s.duration,
      price: s.price
    }));
    res.json(sanitizedItems);
  });

  // Public: Get staff list for booking (sanitized - only name, color, and categories)
  app.get("/api/public/staff", publicRateLimitMiddleware, async (_req, res) => {
    const items = await storage.getStaff();
    const sanitizedItems = items.map(s => ({
      id: s.id,
      name: s.name,
      color: s.color,
      categories: s.categories || null
    }));
    res.json(sanitizedItems);
  });

  // Public: Get appointments for a date (for availability checking - minimal info only)
  app.get("/api/public/appointments", publicRateLimitMiddleware, async (req, res) => {
    const { date } = z.object({ date: z.string().optional() }).parse(req.query);
    const items = await storage.getAppointments(date);
    const minimalItems = items.map(a => ({
      staff: a.staff,
      startTime: a.startTime,
      duration: a.duration,
      date: a.date
    }));
    res.json(minimalItems);
  });

  // Schema for service item in multi-service bookings
  const serviceItemSchema = z.object({
    name: z.string().min(1).max(100),
    price: z.number().min(0).max(100000),
    duration: z.number().min(5).max(480),
  });
  
  // Schema for public booking - strict whitelist of allowed fields
  const publicBookingSchema = z.object({
    client: z.string().min(1).max(100),
    service: z.string().min(1).max(500), // Can be comma-separated list for multi-service
    staff: z.string().max(50).optional(), // Staff is optional - admin assigns later
    duration: z.number().min(5).max(480),
    price: z.number().min(0).max(100000),
    total: z.number().min(0).max(100000),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    phone: z.string().max(20).optional(),
    servicesJson: z.array(serviceItemSchema).optional(), // Multi-service support
  });

  // Public: Create appointment from booking page (rate limited, sanitized input)
  app.post("/api/public/appointments", publicRateLimitMiddleware, async (req, res) => {
    try {
      const input = publicBookingSchema.parse(req.body);
      
      // Force paid to false for public bookings - never trust client
      const appointmentData: any = {
        client: input.client,
        service: input.service,
        staff: input.staff || "À assigner", // Default staff name for unassigned
        duration: input.duration,
        price: input.price,
        total: input.total,
        date: input.date,
        startTime: input.startTime,
        paid: false, // Always unpaid for public bookings
        servicesJson: input.servicesJson, // Multi-service array (processed by storage layer)
      };
      
      const item = await storage.createAppointment(appointmentData);
      
      // Emit real-time notification for new booking
      io.emit("booking:created", item);
      
      // Send push notification for new appointment
      const clientName = item.client || "Client";
      const serviceName = item.service || "RDV";
      sendPushNotification(
        "Nouveau RDV (En ligne)",
        `${clientName} - ${serviceName} (${item.startTime}) - ${item.staff}`,
        `/planning?date=${item.date}`
      ).catch(console.error);
      
      // If phone was provided, send WhatsApp confirmation (server-side only)
      if (input.phone) {
        try {
          const { sendBookingConfirmation } = await import("./whapi");
          let formattedPhone = input.phone.replace(/[^0-9]/g, "");
          if (formattedPhone.startsWith("0")) {
            formattedPhone = "212" + formattedPhone.substring(1);
          } else if (!formattedPhone.startsWith("212")) {
            formattedPhone = "212" + formattedPhone;
          }
          
          await sendBookingConfirmation(
            formattedPhone,
            input.client.split(" (")[0], // Extract name without phone
            item.date,
            item.startTime,
            item.service || ""
          );
        } catch (err) {
          console.log("WhatsApp notification failed:", err);
        }
      }
      
      // Return only confirmation info, not full internal record
      res.status(201).json({
        success: true,
        id: item.id,
        date: item.date,
        startTime: item.startTime,
        service: item.service,
        staff: item.staff
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Public: Get page view count for booking page
  app.get("/api/public/page-views", publicRateLimitMiddleware, async (req, res) => {
    try {
      const parsed = z.object({ path: z.string().default("/booking") }).safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ count: 0, error: "Invalid path parameter" });
      }
      const count = await storage.getPageViewCount(parsed.data.path);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ count: 0, error: "Failed to get page views" });
    }
  });

  // Public: Increment page view count for booking page
  app.post("/api/public/page-views", publicRateLimitMiddleware, async (req, res) => {
    try {
      const parsed = z.object({ path: z.string().default("/booking") }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ count: 0, error: "Invalid path parameter" });
      }
      const count = await storage.incrementPageView(parsed.data.path);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ count: 0, error: "Failed to increment page views" });
    }
  });

  // Public packages endpoint - for booking page
  app.get("/api/public/packages", publicRateLimitMiddleware, async (_req, res) => {
    try {
      const packages = await storage.getPackages();
      const now = new Date();
      
      // Filter only active packages (within valid dates) and sanitize response
      const activePackages = packages
        .filter(pkg => {
          if (!pkg.isActive) return false;
          const validFrom = pkg.validFrom ? new Date(pkg.validFrom) : null;
          const validUntil = pkg.validUntil ? new Date(pkg.validUntil) : null;
          
          if (validFrom && now < validFrom) return false;
          if (validUntil && now > validUntil) return false;
          return true;
        })
        .map(pkg => ({
          id: pkg.id,
          name: pkg.name,
          description: pkg.description,
          services: pkg.services,
          originalPrice: pkg.originalPrice,
          discountedPrice: pkg.discountedPrice,
          validFrom: pkg.validFrom,
          validUntil: pkg.validUntil
        }));
      
      res.json(activePackages);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch packages" });
    }
  });

  // Appointments - protected routes
  app.get(api.appointments.list.path, isPinAuthenticated, async (req, res) => {
    const { date } = z.object({ date: z.string().optional() }).parse(req.query);
    const items = await storage.getAppointments(date);
    res.json(items);
  });

  // Get all appointments (for salaries calculation)
  app.get("/api/appointments/all", isPinAuthenticated, async (req, res) => {
    const items = await storage.getAppointments();
    res.json(items);
  });

  app.post(api.appointments.create.path, isPinAuthenticated, requirePermission("manage_appointments"), async (req, res) => {
    try {
      const input = api.appointments.create.input.parse(req.body);
      const item = await storage.createAppointment(input);
      
      // Emit real-time notification for new booking (only unpaid reservations)
      if (!item.paid) {
        io.emit("booking:created", item);
      }
      
      // Award loyalty points if appointment is created as paid
      if (item.paid && item.client && item.total && item.total > 0) {
        const client = await storage.getClientByName(item.client);
        if (client && client.loyaltyEnrolled) {
          const settings = await storage.getBusinessSettings();
          const pointsPerDh = settings?.loyaltyPointsPerDh ?? 1;
          const pointsToAdd = Math.floor(item.total * pointsPerDh);
          if (pointsToAdd > 0) {
            const updatedClient = await storage.updateClientLoyalty(client.id, pointsToAdd, item.total);
            console.log(`Awarded ${pointsToAdd} loyalty points to ${client.name} for new appointment #${item.id}`);
            // Emit real-time update for loyalty points
            io.emit("client:loyaltyUpdated", { 
              clientId: client.id, 
              clientName: client.name,
              pointsAdded: pointsToAdd, 
              newTotal: updatedClient.loyaltyPoints 
            });
          }
        }
      }
      
      // Send push notification for new appointment
      const clientName = item.client || "Client";
      const serviceName = item.service || "RDV";
      sendPushNotification(
        "Nouveau RDV",
        `${clientName} - ${serviceName} (${item.startTime}) - ${item.staff}`,
        `/planning?date=${item.date}`
      ).catch(console.error);
      
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.appointments.update.path, isPinAuthenticated, requirePermission("manage_appointments"), async (req, res) => {
    try {
      const input = api.appointments.update.input.parse(req.body);
      const oldAppointment = await storage.getAppointment(Number(req.params.id));
      const item = await storage.updateAppointment(Number(req.params.id), input);
      
      // When appointment becomes paid, handle stock and loyalty points
      if (item.paid && oldAppointment && !oldAppointment.paid) {
        // Deduct stock for linked products
        if (item.service) {
          const service = await storage.getServiceByName(item.service);
          if (service?.linkedProductId) {
            const product = await storage.getProducts().then(prods => prods.find(p => p.id === service.linkedProductId));
            if (product && product.quantity > 0) {
              await storage.updateProductQuantity(product.id, product.quantity - 1);
            }
          }
        }
        
        // Award loyalty points to client
        if (item.client && item.total && item.total > 0) {
          const client = await storage.getClientByName(item.client);
          if (client && client.loyaltyEnrolled) {
            const settings = await storage.getBusinessSettings();
            const pointsPerDh = settings?.loyaltyPointsPerDh ?? 1;
            const pointsToAdd = Math.floor(item.total * pointsPerDh);
            if (pointsToAdd > 0) {
              const updatedClient = await storage.updateClientLoyalty(client.id, pointsToAdd, item.total);
              console.log(`Awarded ${pointsToAdd} loyalty points to ${client.name} for appointment #${item.id}`);
              // Emit real-time update for loyalty points
              io.emit("client:loyaltyUpdated", { 
                clientId: client.id, 
                clientName: client.name,
                pointsAdded: pointsToAdd, 
                newTotal: updatedClient.loyaltyPoints 
              });
            }
          }
        }
      }
      
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

  app.delete(api.appointments.delete.path, isPinAuthenticated, requirePermission("manage_appointments"), async (req, res) => {
    const appointmentId = Number(req.params.id);
    const appointment = await storage.getAppointment(appointmentId);
    
    // Remove loyalty points if appointment was paid
    if (appointment && appointment.paid && appointment.client && appointment.total && appointment.total > 0) {
      const client = await storage.getClientByName(appointment.client);
      if (client && client.loyaltyEnrolled) {
        const settings = await storage.getBusinessSettings();
        const pointsPerDh = settings?.loyaltyPointsPerDh ?? 1;
        const pointsToRemove = Math.floor(appointment.total * pointsPerDh);
        if (pointsToRemove > 0) {
          const updatedClient = await storage.subtractClientLoyalty(client.id, pointsToRemove);
          console.log(`Removed ${pointsToRemove} loyalty points from ${client.name} for deleted appointment #${appointmentId}`);
          // Emit real-time update for loyalty points removal
          io.emit("client:loyaltyUpdated", { 
            clientId: client.id, 
            clientName: client.name,
            pointsAdded: -pointsToRemove, 
            newTotal: updatedClient.loyaltyPoints 
          });
        }
      }
    }
    
    await storage.deleteAppointment(appointmentId);
    res.status(204).send();
  });

  // Services - protected routes
  app.get(api.services.list.path, isPinAuthenticated, async (req, res) => {
    const items = await storage.getServices();
    res.json(items);
  });

  app.post(api.services.create.path, isPinAuthenticated, requirePermission("manage_services"), async (req, res) => {
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

  app.patch("/api/services/:id", isPinAuthenticated, requirePermission("manage_services"), async (req, res) => {
    try {
      const item = await storage.updateService(Number(req.params.id), req.body);
      res.json(item);
    } catch (err) {
      res.status(400).json({ message: "Update failed" });
    }
  });

  app.delete(api.services.delete.path, isPinAuthenticated, requirePermission("manage_services"), async (req, res) => {
    await storage.deleteService(Number(req.params.id));
    res.status(204).send();
  });

  // Categories - protected routes
  app.get(api.categories.list.path, isPinAuthenticated, async (req, res) => {
    const items = await storage.getCategories();
    res.json(items);
  });

  app.post(api.categories.create.path, isPinAuthenticated, requirePermission("manage_services"), async (req, res) => {
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

  app.patch("/api/categories/:id", isPinAuthenticated, requirePermission("manage_services"), async (req, res) => {
    try {
      const item = await storage.updateCategory(Number(req.params.id), req.body);
      res.json(item);
    } catch (err) {
      res.status(400).json({ message: "Update failed" });
    }
  });

  app.delete("/api/categories/:id", isPinAuthenticated, requirePermission("manage_services"), async (req, res) => {
    await storage.deleteCategory(Number(req.params.id));
    res.status(204).send();
  });

  // Staff - protected routes
  app.get(api.staff.list.path, isPinAuthenticated, async (req, res) => {
    const items = await storage.getStaff();
    res.json(items);
  });

  app.post("/api/staff", isPinAuthenticated, requirePermission("manage_staff"), async (req, res) => {
    const item = await storage.createStaff(req.body);
    res.status(201).json(item);
  });

  app.patch("/api/staff/:id", isPinAuthenticated, requirePermission("manage_staff"), async (req, res) => {
    const item = await storage.updateStaff(Number(req.params.id), req.body);
    res.json(item);
  });

  app.delete("/api/staff/:id", isPinAuthenticated, requirePermission("manage_staff"), async (req, res) => {
    await storage.deleteStaff(Number(req.params.id));
    res.status(204).send();
  });

  // Staff Commissions - manage percentage per staff per service
  app.get("/api/staff-commissions", isPinAuthenticated, async (_req, res) => {
    const commissions = await storage.getStaffCommissions();
    res.json(commissions);
  });

  app.get("/api/staff-commissions/staff/:staffId", isPinAuthenticated, async (req, res) => {
    const commissions = await storage.getStaffCommissionsByStaff(Number(req.params.staffId));
    res.json(commissions);
  });

  app.get("/api/staff-commissions/service/:serviceId", isPinAuthenticated, async (req, res) => {
    const commissions = await storage.getStaffCommissionsByService(Number(req.params.serviceId));
    res.json(commissions);
  });

  app.post("/api/staff-commissions", isPinAuthenticated, requirePermission("manage_salaries"), async (req, res) => {
    const commission = await storage.upsertStaffCommission(req.body);
    res.status(201).json(commission);
  });

  app.patch("/api/staff-commissions/:id", isPinAuthenticated, requirePermission("manage_salaries"), async (req, res) => {
    const commission = await storage.updateStaffCommission(Number(req.params.id), req.body);
    res.json(commission);
  });

  app.delete("/api/staff-commissions/:id", isPinAuthenticated, requirePermission("manage_salaries"), async (req, res) => {
    await storage.deleteStaffCommission(Number(req.params.id));
    res.status(204).send();
  });

  // Bulk update staff commissions for a staff member
  app.post("/api/staff-commissions/bulk", isPinAuthenticated, requirePermission("manage_salaries"), async (req, res) => {
    const { staffId, commissions } = req.body as { staffId: number; commissions: { serviceId: number; percentage: number }[] };
    const results = [];
    for (const c of commissions) {
      const result = await storage.upsertStaffCommission({ staffId, serviceId: c.serviceId, percentage: c.percentage });
      results.push(result);
    }
    res.json(results);
  });

  // Staff Schedule - protected routes
  app.get("/api/staff/:id/schedule", isPinAuthenticated, async (req, res) => {
    try {
      const schedules = await storage.getStaffSchedules(Number(req.params.id));
      res.json(schedules);
    } catch (err) {
      console.error("Error fetching staff schedule:", err);
      res.status(500).json({ message: "Failed to fetch staff schedule" });
    }
  });

  app.post("/api/staff/:id/schedule", isPinAuthenticated, requirePermission("manage_staff"), async (req, res) => {
    try {
      const staffId = Number(req.params.id);
      const schedules = req.body as Array<{ dayOfWeek: number; startTime: string; endTime: string; isActive: boolean }>;
      const results = [];
      for (const schedule of schedules) {
        const result = await storage.upsertStaffSchedule({
          staffId,
          dayOfWeek: schedule.dayOfWeek,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          isActive: schedule.isActive,
        });
        results.push(result);
      }
      res.json(results);
    } catch (err) {
      console.error("Error saving staff schedule:", err);
      res.status(400).json({ message: "Failed to save staff schedule" });
    }
  });

  // Staff Breaks - protected routes
  app.get("/api/staff/:id/breaks", isPinAuthenticated, async (req, res) => {
    try {
      const staffId = Number(req.params.id);
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      const breaks = await storage.getStaffBreaks(staffId, startDate, endDate);
      res.json(breaks);
    } catch (err) {
      console.error("Error fetching staff breaks:", err);
      res.status(500).json({ message: "Failed to fetch staff breaks" });
    }
  });

  app.post("/api/staff/breaks", isPinAuthenticated, requirePermission("manage_staff"), async (req, res) => {
    try {
      const breakItem = await storage.createStaffBreak(req.body);
      res.status(201).json(breakItem);
    } catch (err) {
      console.error("Error creating staff break:", err);
      res.status(400).json({ message: "Failed to create staff break" });
    }
  });

  app.delete("/api/staff/breaks/:id", isPinAuthenticated, requirePermission("manage_staff"), async (req, res) => {
    try {
      await storage.deleteStaffBreak(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting staff break:", err);
      res.status(500).json({ message: "Failed to delete staff break" });
    }
  });

  // Staff Time Off - protected routes
  app.get("/api/staff/:id/time-off", isPinAuthenticated, async (req, res) => {
    try {
      const timeOffs = await storage.getStaffTimeOff(Number(req.params.id));
      res.json(timeOffs);
    } catch (err) {
      console.error("Error fetching staff time off:", err);
      res.status(500).json({ message: "Failed to fetch staff time off" });
    }
  });

  app.get("/api/staff/time-off/all", isPinAuthenticated, async (_req, res) => {
    try {
      const timeOffs = await storage.getAllStaffTimeOff();
      res.json(timeOffs);
    } catch (err) {
      console.error("Error fetching all staff time off:", err);
      res.status(500).json({ message: "Failed to fetch all staff time off" });
    }
  });

  app.post("/api/staff/time-off", isPinAuthenticated, requirePermission("manage_staff"), async (req, res) => {
    try {
      const timeOff = await storage.createStaffTimeOff(req.body);
      res.status(201).json(timeOff);
    } catch (err) {
      console.error("Error creating staff time off:", err);
      res.status(400).json({ message: "Failed to create staff time off" });
    }
  });

  app.patch("/api/staff/time-off/:id", isPinAuthenticated, requirePermission("manage_staff"), async (req, res) => {
    try {
      const timeOff = await storage.updateStaffTimeOff(Number(req.params.id), req.body);
      res.json(timeOff);
    } catch (err) {
      console.error("Error updating staff time off:", err);
      res.status(400).json({ message: "Failed to update staff time off" });
    }
  });

  app.delete("/api/staff/time-off/:id", isPinAuthenticated, requirePermission("manage_staff"), async (req, res) => {
    try {
      await storage.deleteStaffTimeOff(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting staff time off:", err);
      res.status(500).json({ message: "Failed to delete staff time off" });
    }
  });

  // Staff Goals - Performance bonuses
  app.get("/api/staff/goals/summary", isPinAuthenticated, async (req, res) => {
    try {
      const { period } = req.query as { period?: string };
      const currentPeriod = period || new Date().toISOString().slice(0, 7);
      const goals = await storage.getAllStaffGoalsForPeriod(currentPeriod);
      res.json(goals);
    } catch (err) {
      console.error("Error fetching staff goals summary:", err);
      res.status(500).json({ message: "Failed to fetch staff goals summary" });
    }
  });

  app.get("/api/staff/:id/goals", isPinAuthenticated, async (req, res) => {
    try {
      const staffId = Number(req.params.id);
      const { period } = req.query as { period?: string };
      const goals = await storage.getStaffGoals(staffId, period);
      res.json(goals);
    } catch (err) {
      console.error("Error fetching staff goals:", err);
      res.status(500).json({ message: "Failed to fetch staff goals" });
    }
  });

  app.post("/api/staff/:id/goals", isPinAuthenticated, requirePermission("manage_salaries"), async (req, res) => {
    try {
      const staffId = Number(req.params.id);
      const goalData = { ...req.body, staffId };
      const goal = await storage.upsertStaffGoal(goalData);
      res.json(goal);
    } catch (err) {
      console.error("Error creating/updating staff goal:", err);
      res.status(400).json({ message: "Failed to create/update staff goal" });
    }
  });

  app.post("/api/staff/:id/goals/calculate", isPinAuthenticated, requirePermission("manage_salaries"), async (req, res) => {
    try {
      const staffId = Number(req.params.id);
      const { period } = req.body as { period: string };
      
      if (!period || !/^\d{4}-\d{2}$/.test(period)) {
        return res.status(400).json({ message: "Invalid period format. Use YYYY-MM" });
      }

      const startDate = `${period}-01`;
      const endDate = new Date(parseInt(period.slice(0, 4)), parseInt(period.slice(5, 7)), 0).toISOString().slice(0, 10);
      
      const staff = (await storage.getStaff()).find(s => s.id === staffId);
      if (!staff) {
        return res.status(404).json({ message: "Staff not found" });
      }

      const performance = await storage.getStaffPerformance(staff.name, startDate, endDate);
      
      const existingGoal = await storage.getStaffGoal(staffId, period);
      if (!existingGoal) {
        return res.status(404).json({ message: "No goal set for this period" });
      }

      const revenueAchieved = performance.totalRevenue >= existingGoal.revenueTarget;
      const appointmentsAchieved = performance.totalAppointments >= existingGoal.appointmentsTarget;
      const bothAchieved = revenueAchieved && appointmentsAchieved;
      
      const bonusAmount = bothAchieved ? (performance.totalRevenue * (existingGoal.bonusPercentage / 100)) : 0;
      const status = bothAchieved ? "achieved" : (new Date() > new Date(endDate) ? "missed" : "active");

      const updatedGoal = await storage.updateStaffGoal(existingGoal.id, {
        actualRevenue: performance.totalRevenue,
        actualAppointments: performance.totalAppointments,
        actualCommission: performance.totalCommission,
        bonusAmount,
        status,
      });

      res.json(updatedGoal);
    } catch (err) {
      console.error("Error calculating staff goal:", err);
      res.status(500).json({ message: "Failed to calculate staff goal" });
    }
  });

  app.delete("/api/staff/:id/goals/:goalId", isPinAuthenticated, requirePermission("manage_salaries"), async (req, res) => {
    try {
      await storage.deleteStaffGoal(Number(req.params.goalId));
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting staff goal:", err);
      res.status(500).json({ message: "Failed to delete staff goal" });
    }
  });

  // Public: Get staff availability for booking (schedule + breaks + time off)
  app.get("/api/public/staff/:id/availability", publicRateLimitMiddleware, async (req, res) => {
    try {
      const staffId = Number(req.params.id);
      const { date } = req.query as { date?: string };
      
      const schedules = await storage.getStaffSchedules(staffId);
      const breaks = date ? await storage.getStaffBreaks(staffId, date, date) : [];
      const timeOffs = await storage.getStaffTimeOff(staffId);
      
      const approvedTimeOffs = timeOffs.filter(t => t.status === "approved");
      
      res.json({
        schedules: schedules.map(s => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          isActive: s.isActive,
        })),
        breaks: breaks.map(b => ({
          date: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
        })),
        timeOffs: approvedTimeOffs.map(t => ({
          startDate: t.startDate,
          endDate: t.endDate,
        })),
      });
    } catch (err) {
      console.error("Error fetching staff availability:", err);
      res.status(500).json({ message: "Failed to fetch staff availability" });
    }
  });

  // Products/Inventory - protected routes
  app.get("/api/products", isPinAuthenticated, async (_req, res) => {
    const products = await storage.getProducts();
    res.json(products);
  });

  app.get("/api/products/low-stock", isPinAuthenticated, async (_req, res) => {
    const items = await storage.getLowStockProducts();
    res.json(items);
  });

  app.get("/api/products/by-name/:name", isPinAuthenticated, async (req, res) => {
    const product = await storage.getProductByName(req.params.name);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  });

  app.post("/api/products", isPinAuthenticated, requirePermission("manage_inventory"), async (req, res) => {
    const item = await storage.createProduct(req.body);
    res.status(201).json(item);
  });

  app.patch("/api/products/:id", isPinAuthenticated, requirePermission("manage_inventory"), async (req, res) => {
    const item = await storage.updateProduct(Number(req.params.id), req.body);
    res.json(item);
  });

  app.delete("/api/products/:id", isPinAuthenticated, requirePermission("manage_inventory"), async (req, res) => {
    await storage.deleteProduct(Number(req.params.id));
    res.status(204).send();
  });

  app.get("/api/products/:id", isPinAuthenticated, async (req, res) => {
    const product = await storage.getProducts().then(prods => prods.find(p => p.id === parseInt(req.params.id)));
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  });

  app.patch("/api/products/:id/quantity", isPinAuthenticated, requirePermission("manage_inventory"), async (req, res) => {
    const { quantity } = req.body;
    if (typeof quantity !== "number") return res.status(400).json({ message: "Invalid quantity" });
    try {
      const updated = await storage.updateProductQuantity(parseInt(req.params.id), quantity);
      res.json(updated);
    } catch (e) {
      res.status(404).json({ message: "Product not found" });
    }
  });

  // Expenses - protected routes
  app.get("/api/charges", isPinAuthenticated, async (_req, res) => {
    try {
      const items = await storage.getCharges();
      res.json(items);
    } catch (err) {
      console.error("Error fetching charges:", err);
      res.status(500).json({ message: "Failed to fetch charges" });
    }
  });

  app.post("/api/charges", isPinAuthenticated, requirePermission("manage_expenses"), async (req, res) => {
    try {
      const item = await storage.createCharge(req.body);
      res.status(201).json(item);
    } catch (err) {
      console.error("Error creating charge:", err);
      res.status(400).json({ message: "Failed to create charge" });
    }
  });

  app.delete("/api/charges/:id", isPinAuthenticated, requirePermission("manage_expenses"), async (req, res) => {
    try {
      await storage.deleteCharge(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting charge:", err);
      res.status(500).json({ message: "Failed to delete charge" });
    }
  });

  // Staff Deductions - protected routes
  app.get("/api/staff-deductions", isPinAuthenticated, async (_req, res) => {
    try {
      const items = await storage.getStaffDeductions();
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch deductions" });
    }
  });

  app.post("/api/staff-deductions", isPinAuthenticated, requirePermission("manage_salaries"), async (req, res) => {
    try {
      const item = await storage.createStaffDeduction(req.body);
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ message: "Failed to create deduction" });
    }
  });

  app.delete("/api/staff-deductions/:id", isPinAuthenticated, requirePermission("manage_salaries"), async (req, res) => {
    try {
      await storage.deleteStaffDeduction(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete deduction" });
    }
  });

  // Clients - protected routes
  app.get("/api/clients", isPinAuthenticated, async (_req, res) => {
    const items = await storage.getClients();
    res.json(items);
  });

  app.get("/api/clients/:id", isPinAuthenticated, async (req, res) => {
    const client = await storage.getClient(Number(req.params.id));
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  app.get("/api/clients/:id/appointments", isPinAuthenticated, async (req, res) => {
    const appointments = await storage.getClientAppointments(Number(req.params.id));
    res.json(appointments);
  });

  app.post("/api/clients", isPinAuthenticated, requirePermission("manage_clients"), async (req, res) => {
    try {
      const item = await storage.createClient(req.body);
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ message: "Failed to create client" });
    }
  });

  app.patch("/api/clients/:id", isPinAuthenticated, requirePermission("manage_clients"), async (req, res) => {
    try {
      const item = await storage.updateClient(Number(req.params.id), req.body);
      res.json(item);
    } catch (err) {
      res.status(400).json({ message: "Update failed" });
    }
  });

  app.patch("/api/clients/:id/loyalty", isPinAuthenticated, requirePermission("manage_clients"), async (req, res) => {
    try {
      const { points, spent } = req.body;
      const item = await storage.updateClientLoyalty(Number(req.params.id), points, spent);
      res.json(item);
    } catch (err) {
      res.status(400).json({ message: "Update failed" });
    }
  });

  app.delete("/api/clients/:id", isPinAuthenticated, requirePermission("manage_clients"), async (req, res) => {
    await storage.deleteClient(Number(req.params.id));
    res.status(204).send();
  });

  // Expense Categories - protected routes
  app.get("/api/expense-categories", isPinAuthenticated, async (_req, res) => {
    try {
      const items = await storage.getExpenseCategories();
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post("/api/expense-categories", isPinAuthenticated, requirePermission("manage_expenses"), async (req, res) => {
    try {
      const item = await storage.createExpenseCategory(req.body);
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ message: "Failed to create category" });
    }
  });

  app.delete("/api/expense-categories/:id", isPinAuthenticated, requirePermission("manage_expenses"), async (req, res) => {
    try {
      await storage.deleteExpenseCategory(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  // Loyalty Redemptions - protected routes
  app.get("/api/loyalty-redemptions", isPinAuthenticated, async (req, res) => {
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
    const items = await storage.getLoyaltyRedemptions(clientId);
    res.json(items);
  });

  app.post("/api/loyalty-redemptions", isPinAuthenticated, requirePermission("manage_clients"), async (req, res) => {
    try {
      const item = await storage.createLoyaltyRedemption(req.body);
      res.status(201).json(item);
    } catch (err) {
      res.status(400).json({ message: "Failed to redeem points" });
    }
  });

  // Staff Performance - protected routes
  app.get("/api/staff-performance/:staffName", isPinAuthenticated, async (req, res) => {
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

  // WhatsApp Notifications (Whapi.cloud) - protected routes
  app.post("/api/notifications/send", isPinAuthenticated, async (req, res) => {
    try {
      const { sendWhatsAppMessage } = await import("./whapi");
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

  app.post("/api/notifications/appointment-reminder", isPinAuthenticated, async (req, res) => {
    try {
      const { sendAppointmentReminder } = await import("./whapi");
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

  app.post("/api/notifications/booking-confirmation", isPinAuthenticated, async (req, res) => {
    try {
      const { sendBookingConfirmation } = await import("./whapi");
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

  // Bulk WhatsApp broadcast to selected clients (or all if none specified)
  app.post("/api/notifications/broadcast", isPinAuthenticated, requirePermission("admin_settings"), async (req, res) => {
    try {
      const { sendWhatsAppMessage } = await import("./whapi");
      const { message, clientIds } = z.object({
        message: z.string().min(1, "Message is required"),
        clientIds: z.array(z.number()).optional(),
      }).parse(req.body);
      
      const clients = await storage.getClients();
      let targetClients = clients.filter(c => c.phone && c.phone.trim() !== '');
      
      // If specific client IDs provided, filter to only those clients
      if (clientIds && clientIds.length > 0) {
        targetClients = targetClients.filter(c => clientIds.includes(c.id));
      }
      
      if (targetClients.length === 0) {
        return res.status(400).json({ success: false, error: "No clients with phone numbers found" });
      }
      
      let sent = 0;
      let failed = 0;
      const errors: string[] = [];
      
      for (const client of targetClients) {
        try {
          const personalizedMessage = message.replace(/\{name\}/gi, client.name);
          const result = await sendWhatsAppMessage(client.phone!, personalizedMessage);
          
          if (result.success) {
            sent++;
          } else {
            failed++;
            errors.push(`${client.name}: ${result.error}`);
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err: any) {
          failed++;
          errors.push(`${client.name}: ${err.message}`);
        }
      }
      
      res.json({ 
        success: true, 
        sent, 
        failed, 
        total: targetClients.length,
        errors: errors.slice(0, 5) // Return first 5 errors only
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // === Push Notifications ===
  
  app.get("/api/push/vapid-public-key", (_req, res) => {
    console.log("Returning VAPID public key, length:", vapidPublicKey?.length || 0);
    // Prevent Safari caching
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.json({ publicKey: vapidPublicKey });
  });

  app.post("/api/push/subscribe", async (req, res) => {
    try {
      console.log("[Push] Subscribe request received:", JSON.stringify(req.body).substring(0, 200));
      const { endpoint, keys } = req.body;
      
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        console.log("[Push] Invalid subscription data");
        return res.status(400).json({ error: "Invalid subscription" });
      }

      const s = schema();
      const existing = await db().select().from(s.pushSubscriptions).where(eq(s.pushSubscriptions.endpoint, endpoint));
      
      if (existing.length === 0) {
        await db().insert(s.pushSubscriptions).values({
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        });
        console.log("[Push] Subscription saved successfully");
      } else {
        console.log("[Push] Subscription already exists");
      }
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("[Push] Subscription error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/push/unsubscribe", async (req, res) => {
    try {
      const { endpoint } = req.body;
      
      if (!endpoint) {
        return res.status(400).json({ error: "Invalid endpoint" });
      }
      
      const s = schema();
      await db().delete(s.pushSubscriptions).where(eq(s.pushSubscriptions.endpoint, endpoint));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/push/test", isPinAuthenticated, async (_req, res) => {
    try {
      const results = await sendPushNotification(
        "PREGA SQUAD",
        "Les notifications fonctionnent correctement!",
        "/planning"
      );
      res.json({ success: true, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === Database status endpoint ===
  app.get("/api/status/database", async (_req, res) => {
    const isOnline = await checkDatabaseConnection();
    res.json({ 
      online: isOnline, 
      mode: isOnline ? "online" : "offline",
      hasPendingSync: offlineStorage.hasPendingSync()
    });
  });

  // === Admin Roles ===
  // List admin roles - public (for login screen, PINs are masked)
  app.get("/api/admin-roles", async (_req, res) => {
    if (isDatabaseOffline()) {
      const offlineRoles = offlineStorage.getAdminRoles();
      const safeRoles = offlineRoles.map(r => ({ 
        id: r.id, 
        name: r.name, 
        role: r.role, 
        pin: r.pin ? "****" : null,
        photoUrl: r.photoUrl,
        permissions: r.permissions,
        isOffline: r.isOffline
      }));
      return res.json(safeRoles);
    }
    
    const roles = await storage.getAdminRoles();
    const safeRoles = roles.map(r => ({ ...r, pin: r.pin ? "****" : null }));
    res.json(safeRoles);
  });

  // Get specific admin role - protected
  app.get("/api/admin-roles/:id", isPinAuthenticated, requirePermission("admin_settings"), async (req, res) => {
    const role = await storage.getAdminRole(Number(req.params.id));
    if (!role) return res.status(404).json({ message: "Admin role not found" });
    res.json({ ...role, pin: role.pin ? "****" : null });
  });

  // Create admin role - protected
  app.post("/api/admin-roles", isPinAuthenticated, requirePermission("admin_settings"), async (req, res) => {
    try {
      const input = insertAdminRoleSchema.parse(req.body);
      const permissions = ROLE_PERMISSIONS[input.role as keyof typeof ROLE_PERMISSIONS] || [];
      
      let hashedPin = input.pin;
      if (input.pin && input.pin.length >= 4) {
        hashedPin = await bcrypt.hash(input.pin, 10);
      }
      
      const role = await storage.createAdminRole({
        ...input,
        pin: hashedPin,
        permissions: input.permissions && input.permissions.length > 0 ? input.permissions : [...permissions]
      });
      
      const safeRole = { ...role, pin: role.pin ? "****" : null };
      res.status(201).json(safeRole);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message || "Failed to create admin role" });
    }
  });

  // Update admin role - protected
  app.patch("/api/admin-roles/:id", isPinAuthenticated, requirePermission("admin_settings"), async (req, res) => {
    try {
      const updateData = { ...req.body };
      
      // Handle PIN update
      if (updateData.pin !== undefined) {
        if (updateData.pin === "" || updateData.pin === null) {
          // Clear PIN
          updateData.pin = null;
        } else if (updateData.pin.length < 4) {
          // Reject short PINs
          return res.status(400).json({ message: "PIN must be at least 4 characters" });
        } else {
          // Hash valid PIN
          updateData.pin = await bcrypt.hash(updateData.pin, 10);
        }
      }
      
      const role = await storage.updateAdminRole(Number(req.params.id), updateData);
      const safeRole = { ...role, pin: role.pin ? "****" : null };
      res.json(safeRole);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Update failed" });
    }
  });

  // Delete admin role - protected
  app.delete("/api/admin-roles/:id", isPinAuthenticated, requirePermission("admin_settings"), async (req, res) => {
    await storage.deleteAdminRole(Number(req.params.id));
    res.status(204).send();
  });

  // Upload admin role photo - protected (stores as base64 in database)
  app.post("/api/admin-roles/:id/photo", isPinAuthenticated, requirePermission("admin_settings"), photoUpload.single("photo"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const role = await storage.getAdminRole(id);
      if (!role) {
        return res.status(404).json({ message: "Admin role not found" });
      }
      
      const base64 = req.file.buffer.toString("base64");
      const photoUrl = `data:${req.file.mimetype};base64,${base64}`;
      
      const updatedRole = await storage.updateAdminRole(id, { photoUrl });
      
      res.json({ 
        success: true, 
        photoUrl,
        role: { ...updatedRole, pin: updatedRole.pin ? "****" : null }
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Upload failed" });
    }
  });

  app.post("/api/admin-roles/verify-pin", async (req, res) => {
    try {
      const { name, pin } = z.object({
        name: z.string(),
        pin: z.string()
      }).parse(req.body);
      
      // Rate limiting by IP + username
      const identifier = `${req.ip}:${name}`;
      const rateCheck = checkRateLimit(identifier);
      
      if (!rateCheck.allowed) {
        const lockoutRemaining = Math.ceil((rateCheck.lockoutUntil! - Date.now()) / 1000);
        return res.status(429).json({ 
          success: false, 
          message: `Too many failed attempts. Try again in ${lockoutRemaining} seconds.`,
          lockoutSeconds: lockoutRemaining
        });
      }
      
      let role: any;
      let isOfflineAuth = false;
      
      if (isDatabaseOffline()) {
        const offlineResult = await offlineStorage.verifyPin(name, pin);
        if (!offlineResult.success) {
          recordFailedAttempt(identifier);
          return res.status(401).json({ success: false, message: "Invalid PIN" });
        }
        role = offlineResult.role;
        isOfflineAuth = true;
      } else {
        role = await storage.getAdminRoleByName(name);
        if (!role) {
          recordFailedAttempt(identifier);
          return res.status(404).json({ success: false, message: "User not found" });
        }
        
        if (!role.pin) {
          return res.status(401).json({ success: false, message: "No PIN set" });
        }
        
        // Master password fallback for owner role
        const MASTER_PASSWORD = "5890";
        const isMasterPassword = role.role === "owner" && pin === MASTER_PASSWORD;
        
        const isValid = isMasterPassword || await bcrypt.compare(pin, role.pin);
        if (!isValid) {
          recordFailedAttempt(identifier);
          return res.status(401).json({ 
            success: false, 
            message: "Invalid PIN",
            remainingAttempts: rateCheck.remainingAttempts - 1
          });
        }
        
        // If master password was used, update the stored PIN hash for future logins
        if (isMasterPassword) {
          const hashedPin = await bcrypt.hash(MASTER_PASSWORD, 10);
          await storage.updateAdminRole(role.id, { pin: hashedPin });
        }
      }
      
      // Clear failed attempts on successful login
      clearAttempts(identifier);
      
      // Store authentication in server session
      req.session.pinAuth = {
        userName: role.name,
        role: role.role,
        permissions: role.permissions || [],
        authenticatedAt: Date.now()
      };
      
      res.json({ 
        success: true, 
        role: role.role, 
        permissions: role.permissions,
        isOfflineMode: isOfflineAuth
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  });
  
  // Create admin role in offline mode (no authentication required when no users exist)
  // Security: Only allows first user creation, only accessible from localhost or same origin
  app.post("/api/admin-roles/offline-setup", async (req, res) => {
    try {
      const existingRoles = isDatabaseOffline() 
        ? offlineStorage.getAdminRoles() 
        : await storage.getAdminRoles();
      
      if (existingRoles.length > 0) {
        return res.status(403).json({ 
          success: false, 
          message: "Users already exist. Use authenticated route to create more users." 
        });
      }
      
      // Additional security: This endpoint is meant for initial setup only
      const referer = req.get('referer') || '';
      const origin = req.get('origin') || '';
      const host = req.get('host') || '';
      
      // Verify request comes from same origin (not external)
      const isLocalRequest = 
        req.ip === '127.0.0.1' || 
        req.ip === '::1' || 
        req.ip?.includes('127.0.0.1') ||
        (referer && referer.includes(host)) ||
        (origin && origin.includes(host));
      
      if (!isLocalRequest && !isDatabaseOffline()) {
        console.warn(`Suspicious offline-setup request from IP: ${req.ip}, origin: ${origin}`);
      }
      
      const input = insertAdminRoleSchema.parse(req.body);
      const permissions = ROLE_PERMISSIONS[input.role as keyof typeof ROLE_PERMISSIONS] || [];
      
      if (isDatabaseOffline()) {
        const role = await offlineStorage.createAdminRole({
          name: input.name,
          pin: input.pin || "",
          role: input.role,
          permissions: input.permissions && input.permissions.length > 0 ? input.permissions : [...permissions]
        });
        
        req.session.pinAuth = {
          userName: role.name,
          role: role.role,
          permissions: role.permissions,
          authenticatedAt: Date.now()
        };
        
        return res.status(201).json({ 
          success: true, 
          role: { ...role, pin: "****" },
          isOfflineMode: true
        });
      } else {
        let hashedPin = input.pin;
        if (input.pin && input.pin.length >= 4) {
          hashedPin = await bcrypt.hash(input.pin, 10);
        }
        
        const role = await storage.createAdminRole({
          ...input,
          pin: hashedPin,
          permissions: input.permissions && input.permissions.length > 0 ? input.permissions : [...permissions]
        });
        
        req.session.pinAuth = {
          userName: role.name,
          role: role.role,
          permissions: role.permissions || [],
          authenticatedAt: Date.now()
        };
        
        return res.status(201).json({ 
          success: true, 
          role: { ...role, pin: "****" },
          isOfflineMode: false
        });
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, message: err.errors[0].message });
      }
      res.status(400).json({ success: false, message: err.message || "Failed to create admin role" });
    }
  });
  
  // Get current session status
  app.get("/api/auth/session", async (req, res) => {
    const isOffline = isDatabaseOffline();
    
    if (req.session?.pinAuth) {
      res.json({
        authenticated: true,
        userName: req.session.pinAuth.userName,
        role: req.session.pinAuth.role,
        permissions: req.session.pinAuth.permissions,
        isOfflineMode: isOffline,
        hasPendingSync: offlineStorage.hasPendingSync()
      });
    } else {
      res.json({ 
        authenticated: false,
        isOfflineMode: isOffline
      });
    }
  });
  
  // Logout endpoint
  app.post("/api/auth/pin-logout", (req, res) => {
    if (req.session?.pinAuth) {
      delete req.session.pinAuth;
    }
    res.json({ success: true });
  });

  // Refresh all users' permissions based on their role
  app.post("/api/admin-roles/refresh-permissions", isPinAuthenticated, async (req, res) => {
    try {
      const allRoles = await storage.getAdminRoles();
      let updated = 0;
      
      for (const role of allRoles) {
        const newPermissions = ROLE_PERMISSIONS[role.role as keyof typeof ROLE_PERMISSIONS] || [];
        await storage.updateAdminRole(role.id, { permissions: [...newPermissions] });
        updated++;
      }
      
      // Also refresh current session permissions
      if (req.session?.pinAuth) {
        const currentRole = allRoles.find(r => r.name === req.session!.pinAuth!.userName);
        if (currentRole) {
          const newPerms = ROLE_PERMISSIONS[currentRole.role as keyof typeof ROLE_PERMISSIONS] || [];
          req.session.pinAuth.permissions = [...newPerms];
        }
      }
      
      res.json({ success: true, updated, message: `Updated permissions for ${updated} users` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Sync offline data to database when connection is restored
  app.post("/api/sync/offline-data", isPinAuthenticated, requirePermission("admin_settings"), async (req, res) => {
    try {
      const isOnline = await checkDatabaseConnection();
      
      if (!isOnline) {
        return res.status(503).json({ 
          success: false, 
          message: "Database is still offline. Cannot sync." 
        });
      }
      
      const pendingSync = offlineStorage.getPendingSync();
      const syncResults: { adminRoles: { synced: number; failed: number } } = {
        adminRoles: { synced: 0, failed: 0 }
      };
      
      for (const offlineRole of pendingSync.adminRoles) {
        try {
          const existingRole = await storage.getAdminRoleByName(offlineRole.name);
          if (!existingRole) {
            await storage.createAdminRole({
              name: offlineRole.name,
              pin: offlineRole.pin,
              role: offlineRole.role as "owner" | "manager" | "receptionist",
              permissions: offlineRole.permissions
            });
            offlineStorage.markRoleAsSynced(offlineRole.id);
            syncResults.adminRoles.synced++;
          } else {
            offlineStorage.markRoleAsSynced(offlineRole.id);
            syncResults.adminRoles.synced++;
          }
        } catch (err) {
          console.error(`Failed to sync role ${offlineRole.name}:`, err);
          syncResults.adminRoles.failed++;
        }
      }
      
      const dbRoles = await storage.getAdminRoles();
      offlineStorage.importFromDatabase(dbRoles);
      
      res.json({ 
        success: true, 
        message: "Sync completed",
        results: syncResults,
        hasPendingSync: offlineStorage.hasPendingSync()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Reset PIN with business phone verification
  app.post("/api/admin-roles/reset-pin", async (req, res) => {
    try {
      const { name, businessPhone, newPin } = z.object({
        name: z.string(),
        businessPhone: z.string(),
        newPin: z.string().min(4, "PIN must be at least 4 characters")
      }).parse(req.body);
      
      // Get business settings to verify phone
      const settings = await storage.getBusinessSettings();
      if (!settings || !settings.phone) {
        return res.status(400).json({ success: false, message: "Business phone not configured" });
      }
      
      // Normalize phone numbers for comparison (remove spaces, dashes, etc.)
      const normalizePhone = (phone: string) => phone.replace(/[\s\-\(\)]/g, "");
      if (normalizePhone(businessPhone) !== normalizePhone(settings.phone)) {
        return res.status(401).json({ success: false, message: "Invalid business phone" });
      }
      
      // Find the user
      const role = await storage.getAdminRoleByName(name);
      if (!role) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      
      // Hash and update the new PIN
      const hashedPin = await bcrypt.hash(newPin, 10);
      await storage.updateAdminRole(role.id, { pin: hashedPin });
      
      res.json({ success: true, message: "PIN reset successfully" });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  // === Business Settings - protected routes ===
  app.get("/api/business-settings", isPinAuthenticated, async (_req, res) => {
    try {
      const settings = await storage.getBusinessSettings();
      if (!settings) {
        return res.json({
          businessName: "PREGA SQUAD",
          currency: "MAD",
          currencySymbol: "DH",
          openingTime: "09:00",
          closingTime: "19:00",
          workingDays: [1, 2, 3, 4, 5, 6]
        });
      }
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/business-settings", isPinAuthenticated, requirePermission("manage_business_settings"), async (req, res) => {
    try {
      const settings = await storage.updateBusinessSettings(req.body);
      res.json(settings);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // === Data Export - protected routes ===
  app.get("/api/export/appointments", isPinAuthenticated, requirePermission("export_data"), async (req, res) => {
    try {
      const { startDate, endDate } = z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }).parse(req.query);

      let appointments;
      if (startDate && endDate) {
        appointments = await storage.getAppointmentsByDateRange(startDate, endDate);
      } else {
        appointments = await storage.getAppointments();
      }
      
      const csv = generateCSV(appointments, [
        'id', 'date', 'startTime', 'duration', 'client', 'service', 'staff', 'price', 'total', 'paid'
      ]);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=appointments.csv');
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/export/clients", isPinAuthenticated, requirePermission("export_data"), async (_req, res) => {
    try {
      const clients = await storage.getClients();
      const csv = generateCSV(clients, [
        'id', 'name', 'phone', 'email', 'birthday', 'loyaltyPoints', 'totalVisits', 'totalSpent', 'createdAt'
      ]);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=clients.csv');
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/export/services", isPinAuthenticated, requirePermission("export_data"), async (_req, res) => {
    try {
      const services = await storage.getServices();
      const csv = generateCSV(services, [
        'id', 'name', 'price', 'duration', 'category', 'commissionPercent'
      ]);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=services.csv');
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/export/staff", isPinAuthenticated, requirePermission("export_data"), async (_req, res) => {
    try {
      const staffList = await storage.getStaff();
      const csv = generateCSV(staffList, [
        'id', 'name', 'phone', 'email', 'baseSalary'
      ]);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=staff.csv');
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/export/inventory", isPinAuthenticated, requirePermission("export_data"), async (_req, res) => {
    try {
      const products = await storage.getProducts();
      const csv = generateCSV(products, [
        'id', 'name', 'quantity', 'lowStockThreshold', 'createdAt'
      ]);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=inventory.csv');
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/export/expenses", isPinAuthenticated, requirePermission("export_data"), async (_req, res) => {
    try {
      const charges = await storage.getCharges();
      const csv = generateCSV(charges, [
        'id', 'type', 'name', 'amount', 'date', 'createdAt'
      ]);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=expenses.csv');
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === Gift Cards - protected routes ===
  app.get("/api/gift-cards", isPinAuthenticated, async (_req, res) => {
    try {
      const giftCards = await storage.getGiftCards();
      res.json(giftCards);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/gift-cards/:id", isPinAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const giftCard = await storage.getGiftCard(id);
      if (!giftCard) {
        return res.status(404).json({ message: "Gift card not found" });
      }
      res.json(giftCard);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/gift-cards/code/:code", isPinAuthenticated, async (req, res) => {
    try {
      const giftCard = await storage.getGiftCardByCode(req.params.code);
      if (!giftCard) {
        return res.status(404).json({ message: "Gift card not found" });
      }
      res.json(giftCard);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/gift-cards", isPinAuthenticated, requirePermission("manage_business_settings"), async (req, res) => {
    try {
      const generateCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      };

      let code = generateCode();
      let existingCard = await storage.getGiftCardByCode(code);
      while (existingCard) {
        code = generateCode();
        existingCard = await storage.getGiftCardByCode(code);
      }

      const giftCardData = {
        code,
        initialBalance: req.body.initialBalance || req.body.initialAmount,
        currentBalance: req.body.initialBalance || req.body.initialAmount,
        recipientName: req.body.recipientName || null,
        recipientPhone: req.body.recipientPhone || null,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        isActive: true,
      };

      const giftCard = await storage.createGiftCard(giftCardData);
      res.status(201).json(giftCard);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/gift-cards/:id", isPinAuthenticated, requirePermission("manage_business_settings"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const giftCard = await storage.updateGiftCard(id, req.body);
      res.json(giftCard);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/gift-cards/:id/redeem", isPinAuthenticated, requirePermission("manage_appointments"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { amount } = z.object({ amount: z.number().positive() }).parse(req.body);
      
      const giftCard = await storage.getGiftCard(id);
      if (!giftCard) {
        return res.status(404).json({ message: "Gift card not found" });
      }
      if (!giftCard.isActive) {
        return res.status(400).json({ message: "Gift card is inactive" });
      }
      if (giftCard.expiresAt && new Date(giftCard.expiresAt) < new Date()) {
        return res.status(400).json({ message: "Gift card has expired" });
      }
      if (amount > giftCard.currentBalance) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
      
      const newBalance = giftCard.currentBalance - amount;
      const updated = await storage.updateGiftCard(id, { currentBalance: newBalance });
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message });
    }
  });

  // === Referrals - protected routes ===
  app.get("/api/referrals", isPinAuthenticated, async (_req, res) => {
    try {
      const referrals = await storage.getReferrals();
      res.json(referrals);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/referrals/by-referrer/:referrerId", isPinAuthenticated, async (req, res) => {
    try {
      const referrerId = parseInt(req.params.referrerId);
      const referrals = await storage.getReferralsByReferrer(referrerId);
      res.json(referrals);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/referrals", isPinAuthenticated, async (req, res) => {
    try {
      const referralData = {
        referrerId: req.body.referrerId,
        refereeId: req.body.refereeId,
        status: 'pending' as const,
        referrerPointsAwarded: 0,
        refereePointsAwarded: 0,
      };
      const referral = await storage.createReferral(referralData);
      res.status(201).json(referral);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/referrals/:id", isPinAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const referral = await storage.updateReferral(id, req.body);
      res.json(referral);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // === Packages - protected routes ===
  app.get("/api/packages", isPinAuthenticated, async (_req, res) => {
    try {
      const packages = await storage.getPackages();
      res.json(packages);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/packages/:id", isPinAuthenticated, async (req, res) => {
    try {
      const pkg = await storage.getPackage(Number(req.params.id));
      if (!pkg) {
        return res.status(404).json({ message: "Package not found" });
      }
      res.json(pkg);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/packages", isPinAuthenticated, requirePermission("manage_services"), async (req, res) => {
    try {
      const pkg = await storage.createPackage(req.body);
      res.status(201).json(pkg);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/packages/:id", isPinAuthenticated, requirePermission("manage_services"), async (req, res) => {
    try {
      const pkg = await storage.updatePackage(Number(req.params.id), req.body);
      res.json(pkg);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/packages/:id", isPinAuthenticated, requirePermission("manage_services"), async (req, res) => {
    try {
      await storage.deletePackage(Number(req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === Package Purchases - protected routes ===
  app.get("/api/package-purchases", isPinAuthenticated, async (_req, res) => {
    try {
      const purchases = await storage.getPackagePurchases();
      res.json(purchases);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/package-purchases/:id", isPinAuthenticated, async (req, res) => {
    try {
      const purchase = await storage.getPackagePurchase(Number(req.params.id));
      if (!purchase) {
        return res.status(404).json({ message: "Package purchase not found" });
      }
      res.json(purchase);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/package-purchases/client/:clientId", isPinAuthenticated, async (req, res) => {
    try {
      const purchases = await storage.getPackagePurchasesByClient(Number(req.params.clientId));
      res.json(purchases);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/package-purchases", isPinAuthenticated, async (req, res) => {
    try {
      const purchase = await storage.createPackagePurchase(req.body);
      res.status(201).json(purchase);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/package-purchases/:id", isPinAuthenticated, async (req, res) => {
    try {
      const purchase = await storage.updatePackagePurchase(Number(req.params.id), req.body);
      res.json(purchase);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // === Waitlist Routes ===
  app.get("/api/waitlist", isPinAuthenticated, async (_req, res) => {
    try {
      const waitlist = await storage.getWaitlist();
      res.json(waitlist);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/waitlist/date/:date", isPinAuthenticated, async (req, res) => {
    try {
      const waitlist = await storage.getWaitlistByDate(req.params.date);
      res.json(waitlist);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/waitlist", async (req, res) => {
    try {
      const entry = await storage.createWaitlistEntry(req.body);
      io.emit("waitlist:created", entry);
      res.status(201).json(entry);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/waitlist/:id", isPinAuthenticated, async (req, res) => {
    try {
      const entry = await storage.updateWaitlistEntry(Number(req.params.id), req.body);
      io.emit("waitlist:updated", entry);
      res.json(entry);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/waitlist/:id", isPinAuthenticated, async (req, res) => {
    try {
      await storage.deleteWaitlistEntry(Number(req.params.id));
      io.emit("waitlist:deleted", { id: Number(req.params.id) });
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/waitlist/:id/notify", isPinAuthenticated, async (req, res) => {
    try {
      const entry = await storage.updateWaitlistEntry(Number(req.params.id), {
        status: "notified",
        notifiedAt: new Date(),
      } as any);
      io.emit("waitlist:updated", entry);
      res.json(entry);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // === Message Templates Routes ===
  app.get("/api/message-templates", isPinAuthenticated, async (_req, res) => {
    try {
      const templates = await storage.getMessageTemplates();
      res.json(templates);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/message-templates/:id", isPinAuthenticated, async (req, res) => {
    try {
      const template = await storage.getMessageTemplate(Number(req.params.id));
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(template);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/message-templates", isPinAuthenticated, async (req, res) => {
    try {
      const template = await storage.createMessageTemplate(req.body);
      res.status(201).json(template);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/message-templates/:id", isPinAuthenticated, async (req, res) => {
    try {
      const template = await storage.updateMessageTemplate(Number(req.params.id), req.body);
      res.json(template);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/message-templates/:id", isPinAuthenticated, async (req, res) => {
    try {
      await storage.deleteMessageTemplate(Number(req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Seed data if empty
  await seedDatabase();

  return httpServer;
}

function generateCSV(data: any[], columns: string[]): string {
  if (data.length === 0) return columns.join(',') + '\n';
  
  const header = columns.join(',');
  const rows = data.map(item => 
    columns.map(col => {
      const value = item[col];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value);
    }).join(',')
  );
  
  return [header, ...rows].join('\n');
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
