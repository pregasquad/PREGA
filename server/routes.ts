import express, { type Express, RequestHandler } from "express";
import type { Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isPinAuthenticated, requirePermission, checkRateLimit, recordFailedAttempt, clearAttempts } from "./replit_integrations/auth";
import { vapidPublicKey, sendPushNotification, checkAndNotifyExpiringProducts, checkAndNotifyLowStock as broadcastLowStockNotifications, sendClosingReminderNow } from "./push";
import { db, schema, pool, dbDialect, isDatabaseOffline, checkDatabaseConnection, getBotMemory, saveBotMemory, type BotClientMemory } from "./db";
import { eq } from "drizzle-orm";
import { insertAdminRoleSchema, ROLE_PERMISSIONS } from "@shared/schema";
import bcrypt from "bcryptjs";
import multer from "multer";
import { offlineStorage } from "./offline-storage";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";

import path from "path";

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET || "avatars";
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
}) : null;

let io: SocketIOServer;

export function getIO() {
  return io;
}

// Helper function to check low stock and send push notification
async function checkAndNotifyLowStock(productId: number) {
  try {
    const products = await storage.getProducts();
    const product = products.find((p: any) => p.id === productId);
    if (!product) return;
    
    const quantity = Number(product.quantity || 0);
    const threshold = Number(product.lowStockThreshold || 0);
    
    if (quantity <= threshold && threshold > 0) {
      await sendPushNotification(
        "⚠️ Low Stock Alert",
        `${product.name} is low on stock (${quantity} remaining)`,
        "/inventory"
      );
      console.log(`[Push] Sent low stock notification for ${product.name}`);
    }
  } catch (error) {
    console.error("[Push] Error checking low stock:", error);
  }
}

import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";

/**
 * After an appointment is created, ensure the client record has a phone number.
 * - If clientId is known: update that client's phone if it's missing.
 * - If only a name is known: look up by name, update phone if missing, or
 *   create a new client with that name + phone.
 * Phone can come from a dedicated phone field OR be embedded in the client
 * string as "Name (0612345678)".
 */
async function syncClientPhone(
  clientId: number | null | undefined,
  clientString: string | null | undefined,
  directPhone: string | null | undefined
): Promise<void> {
  try {
    // Resolve phone: prefer direct field, fall back to extracting from "Name (phone)"
    const phone =
      directPhone?.trim() ||
      clientString?.match(/\(([^)]+)\)/)?.[1]?.trim() ||
      null;

    if (!phone) return; // No phone to save

    const cleanName = clientString?.split(" (")[0]?.trim() || null;

    // 1. Try by clientId first
    if (clientId) {
      const existing = await storage.getClient(clientId);
      if (existing && !existing.phone) {
        await storage.updateClient(clientId, { phone });
        console.log(`[syncClientPhone] Updated phone for client #${clientId} (${existing.name})`);
      }
      return;
    }

    // 2. Try by name
    if (cleanName) {
      const existing = await storage.getClientByName(cleanName);
      if (existing) {
        if (!existing.phone) {
          await storage.updateClient(existing.id, { phone });
          console.log(`[syncClientPhone] Updated phone for client "${cleanName}"`);
        }
        return;
      }

      // 3. Client doesn't exist yet — create them
      await storage.createClient({ name: cleanName, phone });
      console.log(`[syncClientPhone] Created new client "${cleanName}" with phone ${phone}`);
    }
  } catch (err) {
    console.error("[syncClientPhone] Error:", err);
  }
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
  // Track print station (POS computer with QZ Tray)
  let printStationId: string | null = null;

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("print:register", () => {
      printStationId = socket.id;
      console.log("Print station registered:", socket.id);
      io.emit("print:station-status", true);
    });

    socket.on("print:unregister", () => {
      if (printStationId === socket.id) {
        printStationId = null;
        io.emit("print:station-status", false);
      }
    });

    socket.on("print:remote-receipt", (data: any) => {
      console.log("[print-relay] Remote receipt request from:", socket.id, "station:", printStationId);
      if (printStationId && printStationId !== socket.id) {
        io.to(printStationId).emit("print:execute-receipt", data);
        console.log("[print-relay] Receipt relayed to station");
      } else {
        console.log("[print-relay] No station available for receipt relay");
      }
    });

    socket.on("print:remote-expense", (data: any) => {
      console.log("[print-relay] Remote expense request from:", socket.id, "station:", printStationId);
      if (printStationId && printStationId !== socket.id) {
        io.to(printStationId).emit("print:execute-expense", data);
        console.log("[print-relay] Expense relayed to station");
      } else {
        console.log("[print-relay] No station available for expense relay");
      }
    });

    let lastDrawerTime = 0;
    socket.on("print:remote-drawer", () => {
      const now = Date.now();
      if (now - lastDrawerTime < 2000) {
        console.log("[print-relay] Drawer rate-limited");
        return;
      }
      lastDrawerTime = now;
      console.log("[print-relay] Remote drawer request from:", socket.id, "station:", printStationId);
      if (printStationId && printStationId !== socket.id) {
        io.to(printStationId).emit("print:execute-drawer");
        console.log("[print-relay] Drawer command relayed to station");
      } else {
        console.log("[print-relay] No station available for drawer relay");
      }
    });

    socket.on("print:check-station", () => {
      const available = printStationId !== null && printStationId !== socket.id;
      console.log("[print-relay] Station check from:", socket.id, "available:", available, "stationId:", printStationId);
      socket.emit("print:station-status", available);
    });

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
      if (printStationId === socket.id) {
        printStationId = null;
        io.emit("print:station-status", false);
      }
      if (bookingPageViewers.has(socket.id)) {
        bookingPageViewers.delete(socket.id);
        io.emit("booking:viewers", bookingPageViewers.size);
      }
    });
  });

  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // Register Object Storage routes
  registerObjectStorageRoutes(app);

  // === UPLOAD ROUTE ===
  app.post("/api/upload", multer({ 
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
    }
  }).single("file"), async (req, res) => {
    if (!req.file) {
      console.error("Upload attempt with no file in request");
      return res.status(400).json({ message: "No file uploaded" });
    }

    try {
      const file = req.file;
      const staffId = req.body.staffId || 'unknown';
      console.log(`Uploading file: ${file.originalname} (${file.size} bytes) for staff ${staffId}`);

      let photoUrl = "";

      if (supabase) {
        try {
          const fileExt = path.extname(file.originalname) || '.jpg';
          const fileName = `staff-${staffId}${fileExt}`;
          const filePath = `staff/${fileName}`;

          const { error } = await supabase.storage
            .from(supabaseBucket)
            .upload(filePath, file.buffer, {
              contentType: file.mimetype,
              upsert: true,
              cacheControl: '0'
            });

          if (error) throw error;

          const { data: publicUrlData } = supabase.storage
            .from(supabaseBucket)
            .getPublicUrl(filePath);
          photoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;
        } catch (supabaseError: any) {
          console.error("Supabase upload error, falling back to base64:", supabaseError);
          photoUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
        }
      } else {
        photoUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
      }

      if (staffId !== 'unknown') {
        await storage.updateStaff(Number(staffId), { photoUrl });
      }

      return res.json({ url: photoUrl, photoUrl });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ message: error.message || "Failed to upload file" });
    }
  });

  // Staff/Admin photo upload - stores as base64 in DB (works on any hosting)
  app.post("/api/admin-roles/:id/photo", multer({ 
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
    }
  }).single("photo"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No photo uploaded" });
    }

    try {
      const file = req.file;
      const roleId = req.params.id;
      const type = req.query.type || 'admin';

      let photoUrl = "";

      if (supabase) {
        try {
          const fileExt = path.extname(file.originalname) || '.jpg';
          const fileName = `${type}-${roleId}${fileExt}`;
          const filePath = `photos/${fileName}`;

          const { error } = await supabase.storage
            .from(supabaseBucket)
            .upload(filePath, file.buffer, {
              contentType: file.mimetype,
              upsert: true,
              cacheControl: '0'
            });

          if (error) throw error;

          const { data: publicUrlData } = supabase.storage
            .from(supabaseBucket)
            .getPublicUrl(filePath);
          photoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;
        } catch (supabaseError: any) {
          console.error("Supabase upload error, falling back to base64:", supabaseError);
          photoUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
        }
      } else {
        photoUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
      }

      if (type === 'staff') {
        const updatedStaff = await storage.updateStaff(Number(roleId), { photoUrl });
        res.json({ success: true, photoUrl, staff: updatedStaff });
      } else {
        const updatedRole = await storage.updateAdminRole(Number(roleId), { photoUrl });
        res.json({ success: true, photoUrl, role: updatedRole });
      }
    } catch (error: any) {
      console.error("Photo upload error:", error);
      res.status(500).json({ message: error.message || "Failed to upload photo" });
    }
  });

  // === API ROUTES ===

  // Health check for Koyeb and UptimeRobot (public)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
  
  // Simple health check for UptimeRobot
  app.get("/health", (_req, res) => {
    res.status(200).send("OK");
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
      price: s.price,
      isStartingPrice: s.isStartingPrice ?? false
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
      photoUrl: s.photoUrl,
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
  // Supports both single-service (service/duration/price/total) and multi-service (servicesJson)
  const publicBookingSchema = z.object({
    client: z.string().min(1).max(100),
    service: z.string().min(1).max(500).optional(), // Optional when using servicesJson
    staff: z.string().max(50).optional(), // Staff is optional - admin assigns later
    duration: z.number().min(5).max(480).optional(), // Optional when using servicesJson
    price: z.number().min(0).max(100000).optional(), // Optional when using servicesJson
    total: z.number().min(0).max(100000).optional(), // Optional when using servicesJson
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    phone: z.string().max(20).optional(),
    servicesJson: z.array(serviceItemSchema).optional().nullable(), // Multi-service support
  }).refine(
    (data) => data.servicesJson?.length || (data.service && data.duration && data.price && data.total),
    { message: "Either servicesJson or service/duration/price/total fields are required" }
  );

  // Helper: Find available staff for a SINGLE category and time slot
  async function findAvailableStaffForCategory(
    category: string,
    date: string,
    startTime: string,
    duration: number,
    excludeStaff: string[] = [], // Staff already assigned to other appointments in this booking
    useFallback: boolean = true // Whether to fall back to any available staff if no specialist found
  ): Promise<string> {
    try {
      const allStaff = await storage.getStaff();
      const appointments = await storage.getAppointments(date);
      
      // Filter staff by category - staff must have this category in their specializations
      let eligibleStaff = allStaff.filter(s => {
        if (excludeStaff.includes(s.name)) return false; // Exclude already used staff
        if (!s.categories) return false;
        const staffCategories = s.categories.split(",").map(c => c.trim().toLowerCase());
        return staffCategories.includes(category.toLowerCase());
      });
      
      // Only use fallback if enabled and no specialists found
      if (eligibleStaff.length === 0 && useFallback) {
        eligibleStaff = allStaff.filter(s => {
          if (excludeStaff.includes(s.name)) return false;
          return true; // Consider all staff as potential fallback
        });
      }
      
      // If still no staff available, fall back to unassigned
      if (eligibleStaff.length === 0) {
        return "À assigner";
      }
      
      // Parse the requested time
      const [reqHour, reqMin] = startTime.split(":").map(Number);
      const reqStartMinutes = reqHour * 60 + reqMin;
      const reqEndMinutes = reqStartMinutes + duration;
      
      // Get day of week (0 = Sunday, 1 = Monday, etc.)
      const dateObj = new Date(date);
      const dayOfWeek = dateObj.getDay();
      
      // Check each eligible staff for availability
      for (const staffMember of eligibleStaff) {
        let isAvailable = true;
        
        // Check staff schedule for this day
        try {
          const schedules = await storage.getStaffSchedules(staffMember.id);
          const daySchedule = schedules.find(s => s.dayOfWeek === dayOfWeek);
          
          if (daySchedule) {
            if (!daySchedule.isActive) {
              isAvailable = false;
              continue;
            }
            // Check if appointment time is within working hours
            if (daySchedule.startTime && daySchedule.endTime) {
              const [schStartH, schStartM] = daySchedule.startTime.split(":").map(Number);
              const [schEndH, schEndM] = daySchedule.endTime.split(":").map(Number);
              const schStart = schStartH * 60 + schStartM;
              const schEnd = schEndH * 60 + schEndM;
              
              if (reqStartMinutes < schStart || reqEndMinutes > schEnd) {
                isAvailable = false;
                continue;
              }
            }
          }
          // No schedule for this day means staff is not available that day
          if (!daySchedule) {
            isAvailable = false;
            continue;
          }
        } catch (e) {
          // Error fetching schedule - skip this staff
          isAvailable = false;
          continue;
        }
        
        // Check for time off on this date
        try {
          const timeOffRequests = await storage.getStaffTimeOff(staffMember.id);
          const hasTimeOff = timeOffRequests.some(t => 
            t.status === "approved" && 
            t.startDate <= date && 
            t.endDate >= date
          );
          if (hasTimeOff) {
            isAvailable = false;
            continue;
          }
        } catch (e) {
          // No time off - continue
        }
        
        // Check for breaks on this date
        try {
          const breaks = await storage.getStaffBreaks(staffMember.id, date, date);
          const hasBreakConflict = breaks.some(b => {
            const [bStartH, bStartM] = b.startTime.split(":").map(Number);
            const [bEndH, bEndM] = b.endTime.split(":").map(Number);
            const bStart = bStartH * 60 + bStartM;
            const bEnd = bEndH * 60 + bEndM;
            
            return !(reqEndMinutes <= bStart || reqStartMinutes >= bEnd);
          });
          if (hasBreakConflict) {
            isAvailable = false;
            continue;
          }
        } catch (e) {
          // No breaks - continue
        }
        
        // Check for appointment conflicts
        const staffAppointments = appointments.filter(a => a.staff === staffMember.name);
        const hasConflict = staffAppointments.some(appt => {
          const [apptH, apptM] = (appt.startTime || "00:00").split(":").map(Number);
          const apptStart = apptH * 60 + apptM;
          const apptEnd = apptStart + (appt.duration || 30);
          
          return !(reqEndMinutes <= apptStart || reqStartMinutes >= apptEnd);
        });
        
        if (hasConflict) {
          isAvailable = false;
          continue;
        }
        
        // Found an available staff member!
        if (isAvailable) {
          return staffMember.name;
        }
      }
      
      // No available staff found
      return "À assigner";
    } catch (e) {
      console.error("Error finding available staff for category:", e);
      return "À assigner";
    }
  }

  // Helper: Convert minutes to HH:MM format
  function minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60) % 24;
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  // Helper: Convert HH:MM to minutes
  function timeToMinutes(time: string): number {
    const [hours, mins] = time.split(":").map(Number);
    return hours * 60 + mins;
  }

  // Type for grouped services by category
  interface CategoryGroup {
    category: string;
    services: Array<{ name: string; price: number; duration: number }>;
    totalDuration: number;
    totalPrice: number;
  }

  // Public: Create appointment from booking page (rate limited, sanitized input)
  // Supports auto-splitting by category: if services are from different categories,
  // creates separate appointments with appropriate staff specialists for each category
  app.post("/api/public/appointments", publicRateLimitMiddleware, async (req, res) => {
    try {
      console.log("[PUBLIC BOOKING] Received request:", JSON.stringify(req.body));
      const input = publicBookingSchema.parse(req.body);
      console.log("[PUBLIC BOOKING] Validated input:", JSON.stringify(input));
      
      const allServices = await storage.getServices();
      const createdAppointments: any[] = [];
      
      // Group services by category
      const categoryGroups: Map<string, CategoryGroup> = new Map();
      
      if (input.servicesJson && input.servicesJson.length > 0) {
        // Multi-service booking: group by category
        for (const svc of input.servicesJson) {
          const matchedService = allServices.find(s => s.name === svc.name);
          const category = matchedService?.category || "Général";
          
          if (!categoryGroups.has(category)) {
            categoryGroups.set(category, {
              category,
              services: [],
              totalDuration: 0,
              totalPrice: 0
            });
          }
          
          const group = categoryGroups.get(category)!;
          group.services.push({
            name: svc.name,
            price: svc.price,
            duration: svc.duration
          });
          group.totalDuration += svc.duration;
          group.totalPrice += svc.price;
        }
      } else if (input.service && input.duration && input.price && input.total) {
        // Single service booking (validated by refine)
        const matchedService = allServices.find(s => s.name === input.service);
        const category = matchedService?.category || "Général";
        
        categoryGroups.set(category, {
          category,
          services: [{ name: input.service, price: input.price, duration: input.duration }],
          totalDuration: input.duration,
          totalPrice: input.price
        });
      }
      
      console.log("[PUBLIC BOOKING] Category groups:", categoryGroups.size);
      
      // If only one category, create a single appointment (original behavior)
      if (categoryGroups.size <= 1) {
        const [category] = categoryGroups.keys();
        const group = categoryGroups.get(category);
        
        // Use group values for duration (calculated from services) or fallback to input values
        // NOTE: Avoid || with numeric values – 0 is a valid price/duration
        const effectiveDuration = group != null ? group.totalDuration : (input.duration ?? 30);
        const effectivePrice = group != null ? group.totalPrice : (input.price ?? 0);
        const effectiveTotal = (input.total != null) ? input.total : effectivePrice;
        
        // Find available staff for this category
        const assignedStaff = input.staff || await findAvailableStaffForCategory(
          category || "Général",
          input.date,
          input.startTime,
          effectiveDuration
        );
        
        const appointmentData: any = {
          client: input.client,
          service: input.service || group?.services.map(s => s.name).join(", "),
          staff: assignedStaff,
          duration: effectiveDuration,
          price: effectivePrice,
          total: effectiveTotal,
          date: input.date,
          startTime: input.startTime,
          paid: false,
          phone: input.phone || null,
          servicesJson: input.servicesJson,
        };
        
        console.log("[PUBLIC BOOKING] Creating single appointment:", JSON.stringify(appointmentData));
        const item = await storage.createAppointment(appointmentData);
        createdAppointments.push(item);
        syncClientPhone(null, input.client, input.phone).catch(() => {});
        
      } else {
        // Multiple categories: split into separate appointments
        console.log("[PUBLIC BOOKING] Splitting into", categoryGroups.size, "appointments by category");
        
        // Calculate total service prices before discount to determine discount ratio
        const totalServicePrice = Array.from(categoryGroups.values()).reduce((sum, g) => sum + g.totalPrice, 0);
        const effectiveTotal = (input.total != null) ? input.total : totalServicePrice;
        // Guard against division by zero: if all services are free, no discount applies
        const hasDiscount = totalServicePrice > 0 && effectiveTotal < totalServicePrice;
        const discountRatio = (hasDiscount && totalServicePrice > 0) ? effectiveTotal / totalServicePrice : 1;
        console.log("[PUBLIC BOOKING] Discount ratio:", discountRatio, "(total:", effectiveTotal, "vs services:", totalServicePrice, ")");
        // Track distributed amount so last category gets the remainder (avoids rounding gaps)
        let distributedTotal = 0;
        
        let currentStartMinutes = timeToMinutes(input.startTime);
        const usedStaff: string[] = [];
        
        const categoryGroupEntries = Array.from(categoryGroups.entries());
        for (let gi = 0; gi < categoryGroupEntries.length; gi++) {
          const [category, group] = categoryGroupEntries[gi];
          const isLastGroup = gi === categoryGroupEntries.length - 1;
          const currentStartTime = minutesToTime(currentStartMinutes);
          
          // Find available staff for this category - priority order:
          // 1. Specialist for this category (excluding already used staff)
          // 2. Specialist for this category (including used staff - same person can do multiple)
          // 3. Any available staff as fallback
          
          // Step 1: Try specialists only, excluding used staff
          let assignedStaff = await findAvailableStaffForCategory(
            category,
            input.date,
            currentStartTime,
            group.totalDuration,
            usedStaff,
            false // No fallback - specialists only
          );
          
          // Step 2: If no different specialist found, try same specialist (without exclusion)
          if (assignedStaff === "À assigner" && usedStaff.length > 0) {
            assignedStaff = await findAvailableStaffForCategory(
              category,
              input.date,
              currentStartTime,
              group.totalDuration,
              [], // No exclusion
              false // No fallback - specialists only
            );
          }
          
          // Step 3: If still no specialist, fall back to any available staff
          if (assignedStaff === "À assigner") {
            assignedStaff = await findAvailableStaffForCategory(
              category,
              input.date,
              currentStartTime,
              group.totalDuration,
              usedStaff,
              true // Use fallback
            );
          }
          
          // Track used staff to prefer different specialists for remaining categories
          if (assignedStaff !== "À assigner") {
            usedStaff.push(assignedStaff);
          }
          
          // Create service name from group
          const serviceNames = group.services.map(s => s.name).join(", ");
          
          // Apply package discount proportionally; last group gets the remainder to avoid rounding gaps
          let discountedPrice: number;
          if (isLastGroup) {
            discountedPrice = Math.round((effectiveTotal - distributedTotal) * 100) / 100;
          } else {
            discountedPrice = Math.round(group.totalPrice * discountRatio * 100) / 100;
            distributedTotal += discountedPrice;
          }
          
          const appointmentData: any = {
            client: input.client,
            service: serviceNames,
            staff: assignedStaff,
            duration: group.totalDuration,
            price: discountedPrice,
            total: discountedPrice,
            date: input.date,
            startTime: currentStartTime,
            paid: false,
            phone: input.phone || null,
            servicesJson: group.services,
          };
          
          console.log(`[PUBLIC BOOKING] Creating appointment for category "${category}":`, JSON.stringify(appointmentData));
          const item = await storage.createAppointment(appointmentData);
          createdAppointments.push(item);
          syncClientPhone(null, input.client, input.phone).catch(() => {});
          
          // Move start time forward for next appointment
          currentStartMinutes += group.totalDuration;
        }
      }
      
      // Emit real-time notifications for all created bookings
      for (const item of createdAppointments) {
        io.emit("booking:created", item);
        console.log("[PUBLIC BOOKING] Socket.IO event emitted: booking:created for appointment", item.id);
        
        // Send push notification
        const clientName = item.client || "Client";
        const serviceName = item.service || "RDV";
        sendPushNotification(
          "Nouveau RDV (En ligne)",
          `${clientName} - ${serviceName} (${item.startTime}) - ${item.staff}`,
          `/planning?date=${item.date}`
        ).catch(console.error);
      }
      
      // Send WhatsApp confirmation for the overall booking (if phone provided)
      if (input.phone && createdAppointments.length > 0) {
        try {
          const { sendBookingConfirmation } = await import("./baileys");
          const allServiceNames = createdAppointments.map(a => a.service).join(" + ");
          
          await sendBookingConfirmation(
            input.phone,
            input.client.split(" (")[0],
            input.date,
            input.startTime,
            allServiceNames
          );
        } catch (err) {
          console.log("WhatsApp notification failed:", err);
        }
      }
      
      // Fetch client loyalty points for receipt
      let loyaltyPointsBalance: number | undefined;
      if (input.client) {
        try {
          const client = await storage.getClientByName(input.client.split(" (")[0]);
          if (client && client.loyaltyEnrolled) {
            loyaltyPointsBalance = client.loyaltyPoints;
          }
        } catch (e) {
          console.log("Failed to fetch client loyalty for booking response:", e);
        }
      }

      // Return confirmation info for all created appointments
      if (createdAppointments.length === 1) {
        const item = createdAppointments[0];
        res.status(201).json({
          success: true,
          id: item.id,
          date: item.date,
          startTime: item.startTime,
          service: item.service,
          staff: item.staff,
          loyaltyPointsBalance,
        });
      } else {
        // Multiple appointments created
        res.status(201).json({
          success: true,
          multipleAppointments: true,
          count: createdAppointments.length,
          loyaltyPointsBalance,
          appointments: createdAppointments.map(item => ({
            id: item.id,
            date: item.date,
            startTime: item.startTime,
            service: item.service,
            staff: item.staff,
            duration: item.duration
          }))
        });
      }
    } catch (err) {
      console.error("[PUBLIC BOOKING] Error:", err);
      if (err instanceof z.ZodError) {
        console.error("[PUBLIC BOOKING] Validation error:", JSON.stringify(err.errors));
        return res.status(400).json({ message: err.errors[0].message });
      }
      return res.status(500).json({ message: "Failed to create appointment", error: String(err) });
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
      
      // Filter only valid active packages (within valid dates, proper pricing) and sanitize response
      const activePackages = packages
        .filter(pkg => {
          if (!pkg.isActive) return false;
          
          // Validate pricing: discounted must be less than original
          if (pkg.discountedPrice >= pkg.originalPrice || pkg.originalPrice <= 0) return false;
          
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

  // Helper to normalize phone for exact matching (strip non-digits, ensure min length)
  function normalizePhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '');
  }
  
  // Public endpoint to get client's appointments by phone number
  app.get("/api/public/my-bookings", publicRateLimitMiddleware, async (req, res) => {
    try {
      const { phone } = z.object({ phone: z.string().min(8).max(20) }).parse(req.query);
      
      const normalizedQuery = normalizePhone(phone);
      
      // Require minimum 8 digits for security
      if (normalizedQuery.length < 8) {
        return res.status(400).json({ error: "Phone number must have at least 8 digits" });
      }
      
      // Get all appointments with this phone number (future only)
      const allAppointments = await storage.getAppointments();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const clientAppointments = allAppointments
        .filter(a => {
          if (!a.phone) return false;
          // Exact normalized match (last 8+ digits must match)
          const normalizedAppPhone = normalizePhone(a.phone);
          // Match if both end with same digits (handles country code variations)
          const minLength = Math.min(normalizedQuery.length, normalizedAppPhone.length, 10);
          return normalizedAppPhone.slice(-minLength) === normalizedQuery.slice(-minLength);
        })
        .filter(a => {
          // Only future/today appointments
          const appointmentDate = new Date(a.date);
          return appointmentDate >= today;
        })
        .sort((a, b) => {
          // Sort by date + time ascending
          const dateA = new Date(`${a.date}T${a.startTime}`);
          const dateB = new Date(`${b.date}T${b.startTime}`);
          return dateA.getTime() - dateB.getTime();
        })
        .map(a => ({
          id: a.id,
          client: a.client,
          service: a.service,
          staff: a.staff,
          date: a.date,
          startTime: a.startTime,
          duration: a.duration,
          total: a.total,
          paid: a.paid,
          status: a.staff ? (a.paid ? 'confirmed' : 'pending') : 'awaiting_assignment'
        }));
      
      // Get cancellation hours from settings
      const settings = await storage.getBusinessSettings();
      const cancellationHours = settings?.cancellationHours ?? 24;
      
      res.json({ 
        appointments: clientAppointments,
        cancellationHours 
      });
    } catch (err) {
      console.error("[PUBLIC MY-BOOKINGS] Error:", err);
      res.status(400).json({ error: "Invalid phone number" });
    }
  });

  // Public endpoint to cancel an appointment
  app.post("/api/public/cancel-booking", publicRateLimitMiddleware, async (req, res) => {
    try {
      const { appointmentId, phone } = z.object({
        appointmentId: z.number(),
        phone: z.string().min(8).max(20)
      }).parse(req.body);
      
      const normalizedReqPhone = normalizePhone(phone);
      
      // Require minimum 8 digits for security
      if (normalizedReqPhone.length < 8) {
        return res.status(400).json({ error: "Phone number must have at least 8 digits" });
      }
      
      // Get the appointment
      const appointments = await storage.getAppointments();
      const appointment = appointments.find(a => a.id === appointmentId);
      
      if (!appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      
      // Verify phone number matches exactly
      if (!appointment.phone) {
        return res.status(403).json({ error: "Cannot cancel this appointment" });
      }
      
      const normalizedAppPhone = normalizePhone(appointment.phone);
      
      // Exact match on last 8-10 digits (handles country code variations)
      const minLength = Math.min(normalizedReqPhone.length, normalizedAppPhone.length, 10);
      if (normalizedAppPhone.slice(-minLength) !== normalizedReqPhone.slice(-minLength)) {
        return res.status(403).json({ error: "Phone number does not match" });
      }
      
      // Check cancellation window
      const settings = await storage.getBusinessSettings();
      const cancellationHours = settings?.cancellationHours ?? 24;
      
      const appointmentDateTime = new Date(`${appointment.date}T${appointment.startTime}`);
      const now = new Date();
      const hoursUntilAppointment = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      if (hoursUntilAppointment < cancellationHours) {
        return res.status(400).json({ 
          error: `Cannot cancel appointments less than ${cancellationHours} hours in advance`,
          hoursRemaining: Math.max(0, Math.floor(hoursUntilAppointment))
        });
      }
      
      // Delete the appointment
      await storage.deleteAppointment(appointmentId);
      
      // Emit real-time notification for cancelled booking
      io.emit("booking:cancelled", { id: appointmentId, client: appointment.client });
      
      res.json({ success: true, message: "Appointment cancelled successfully" });
    } catch (err) {
      console.error("[PUBLIC CANCEL-BOOKING] Error:", err);
      res.status(400).json({ error: "Failed to cancel appointment" });
    }
  });

  // Public endpoint to get cancellation settings
  // QZ Tray certificate and signing endpoints
  const qzCertPath = path.join(process.cwd(), "server/certs/qz-cert.pem");
  const qzKeyPath = path.join(process.cwd(), "server/certs/qz-private-key.pem");

  app.get("/api/qz/cert", (_req, res) => {
    try {
      const cert = fs.readFileSync(qzCertPath, "utf-8");
      res.type("text/plain").send(cert);
    } catch {
      res.status(404).send("Certificate not found");
    }
  });

  app.post("/api/qz/sign", express.text({ type: "*/*" }), (req, res) => {
    try {
      const toSign = typeof req.body === "string" ? req.body : String(req.body);
      const privateKey = fs.readFileSync(qzKeyPath, "utf-8");
      const sign = crypto.createSign("SHA512");
      sign.update(toSign);
      sign.end();
      const signature = sign.sign(privateKey, "base64");
      res.type("text/plain").send(signature);
    } catch (e: any) {
      console.error("QZ sign error:", e.message);
      res.status(500).send("Signing failed");
    }
  });

  app.get("/api/public/settings", publicRateLimitMiddleware, async (_req, res) => {
    try {
      const settings = await storage.getBusinessSettings();
      res.json({
        cancellationHours: settings?.cancellationHours ?? 24,
        businessName: settings?.businessName ?? "PREGA SQUAD",
        currency: settings?.currency ?? "MAD",
        currencySymbol: settings?.currencySymbol ?? "DH"
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Public endpoint to get AI-powered service recommendations based on client history
  app.get("/api/public/recommendations", publicRateLimitMiddleware, async (req, res) => {
    try {
      const { phone } = z.object({ phone: z.string().min(6).max(20) }).parse(req.query);
      
      const { getClientRecommendations } = await import("./services/recommendations");
      const recommendations = await getClientRecommendations(phone);
      
      res.json({ recommendations });
    } catch (err) {
      console.error("[PUBLIC RECOMMENDATIONS] Error:", err);
      res.status(400).json({ error: "Failed to get recommendations", recommendations: [] });
    }
  });

  app.post("/api/public/add-service-to-appointment", publicRateLimitMiddleware, async (req, res) => {
    try {
      const { appointmentId, phone, serviceId } = z.object({
        appointmentId: z.number(),
        phone: z.string().min(8).max(20),
        serviceId: z.number()
      }).parse(req.body);

      const normalizedReqPhone = normalizePhone(phone);
      if (normalizedReqPhone.length < 8) {
        return res.status(400).json({ error: "Phone number must have at least 8 digits" });
      }

      const appointments = await storage.getAppointments();
      const appointment = appointments.find(a => a.id === appointmentId);

      if (!appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }

      if (!appointment.phone) {
        return res.status(403).json({ error: "Cannot modify this appointment" });
      }

      const normalizedAppPhone = normalizePhone(appointment.phone);
      const minLength = Math.min(normalizedReqPhone.length, normalizedAppPhone.length, 10);
      if (normalizedReqPhone.slice(-minLength) !== normalizedAppPhone.slice(-minLength)) {
        return res.status(403).json({ error: "Phone number does not match" });
      }

      const services = await storage.getServices();
      const serviceToAdd = services.find(s => s.id === serviceId);
      if (!serviceToAdd) {
        return res.status(404).json({ error: "Service not found" });
      }

      let existingServices: { id?: number; name: string; price: number; duration: number }[] = [];
      if (appointment.servicesJson) {
        try {
          const parsed = typeof appointment.servicesJson === 'string' 
            ? JSON.parse(appointment.servicesJson) 
            : appointment.servicesJson;
          if (Array.isArray(parsed)) {
            existingServices = parsed;
          }
        } catch {}
      }

      const alreadyHasService = existingServices.some(s => 
        (s.id && s.id === serviceId) || s.name.toLowerCase() === serviceToAdd.name.toLowerCase()
      );
      if (alreadyHasService) {
        return res.status(400).json({ error: "Service already in appointment" });
      }

      existingServices.push({
        id: serviceToAdd.id,
        name: serviceToAdd.name,
        price: serviceToAdd.price,
        duration: serviceToAdd.duration
      });

      const totalDuration = existingServices.reduce((sum, s) => sum + s.duration, 0);
      const originalTotal = appointment.total || 0;
      const newTotal = originalTotal + serviceToAdd.price;
      const serviceNames = existingServices.map(s => s.name).join(", ");

      await storage.updateAppointment(appointmentId, {
        servicesJson: JSON.stringify(existingServices) as any,
        service: serviceNames,
        duration: totalDuration,
        total: newTotal
      });

      res.json({ success: true, message: "Service added to appointment" });
    } catch (err) {
      console.error("[ADD SERVICE TO APPOINTMENT] Error:", err);
      res.status(400).json({ error: "Failed to add service" });
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
      syncClientPhone(input.clientId, input.client, input.phone).catch(() => {});
      
      // Emit real-time notification for new booking (only unpaid reservations)
      if (!item.paid) {
        io.emit("booking:created", item);
      }
      
      // Award loyalty points if appointment is created as paid
      if (item.paid && item.total && item.total > 0 && (item.clientId || item.client)) {
        const client = item.clientId ? await storage.getClient(item.clientId) : await storage.getClientByName(item.client!);
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
              checkAndNotifyLowStock(product.id);
            }
          }
        }
        
        // Award loyalty points to client
        if (item.total && item.total > 0 && (item.clientId || item.client)) {
          const client = item.clientId ? await storage.getClient(item.clientId) : await storage.getClientByName(item.client!);
          if (client && client.loyaltyEnrolled) {
            const settings = await storage.getBusinessSettings();
            const pointsPerDh = settings?.loyaltyPointsPerDh ?? 1;
            const pointsToAdd = Math.floor(item.total * pointsPerDh);
            if (pointsToAdd > 0) {
              const updatedClient = await storage.updateClientLoyalty(client.id, pointsToAdd, item.total);
              console.log(`Awarded ${pointsToAdd} loyalty points to ${client.name} for appointment #${item.id}`);
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
      
      // When appointment becomes unpaid (paid→unpaid), reverse loyalty points that were earned
      if (!item.paid && oldAppointment && oldAppointment.paid) {
        if (oldAppointment.total && oldAppointment.total > 0 && (oldAppointment.clientId || oldAppointment.client)) {
          const client = oldAppointment.clientId ? await storage.getClient(oldAppointment.clientId) : await storage.getClientByName(oldAppointment.client!);
          if (client && client.loyaltyEnrolled) {
            const settings = await storage.getBusinessSettings();
            const pointsPerDh = settings?.loyaltyPointsPerDh ?? 1;
            const pointsToRemove = Math.floor(oldAppointment.total * pointsPerDh);
            if (pointsToRemove > 0) {
              const updatedClient = await storage.subtractClientLoyalty(client.id, pointsToRemove);
              console.log(`Reversed ${pointsToRemove} loyalty points from ${client.name} for appointment #${item.id} (paid→unpaid)`);
              io.emit("client:loyaltyUpdated", { 
                clientId: client.id, 
                clientName: client.name,
                pointsAdded: -pointsToRemove, 
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
    
    if (appointment && appointment.paid && (appointment.clientId || appointment.client)) {
      const client = appointment.clientId ? await storage.getClient(appointment.clientId) : await storage.getClientByName(appointment.client!);
      
      // Remove loyalty points if appointment was paid
      if (client && client.loyaltyEnrolled && appointment.total && appointment.total > 0) {
        const settings = await storage.getBusinessSettings();
        const pointsPerDh = settings?.loyaltyPointsPerDh ?? 1;
        const pointsToRemove = Math.floor(appointment.total * pointsPerDh);
        if (pointsToRemove > 0) {
          const updatedClient = await storage.subtractClientLoyalty(client.id, pointsToRemove);
          console.log(`Removed ${pointsToRemove} loyalty points from ${client.name} for deleted appointment #${appointmentId}`);
          io.emit("client:loyaltyUpdated", { 
            clientId: client.id, 
            clientName: client.name,
            pointsAdded: -pointsToRemove, 
            newTotal: updatedClient.loyaltyPoints 
          });
        }
      }
      
      // Restore loyalty points that were redeemed for this appointment
      if (client && appointment.loyaltyPointsRedeemed && appointment.loyaltyPointsRedeemed > 0) {
        await storage.restoreClientLoyaltyPoints(client.id, appointment.loyaltyPointsRedeemed);
        console.log(`Restored ${appointment.loyaltyPointsRedeemed} redeemed loyalty points to ${client.name} for deleted appointment #${appointmentId}`);
      }
      
      // Restore gift card balance that was used for this appointment
      if (client && appointment.giftCardDiscountAmount && appointment.giftCardDiscountAmount > 0) {
        await storage.updateClientGiftCardBalance(client.id, appointment.giftCardDiscountAmount);
        console.log(`Restored ${appointment.giftCardDiscountAmount} gift card balance to ${client.name} for deleted appointment #${appointmentId}`);
        io.emit("client:giftCardUpdated", {
          clientId: client.id,
          clientName: client.name,
          amountDeducted: -appointment.giftCardDiscountAmount,
          newBalance: (Number(client.giftCardBalance) || 0) + appointment.giftCardDiscountAmount
        });
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
    const { randomUUID } = await import("crypto");
    const staffData = { ...req.body, publicToken: req.body.publicToken || randomUUID() };
    const item = await storage.createStaff(staffData);
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

      const performance = await storage.getStaffPerformance(staff.name, startDate, endDate, staffId);
      
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

  // Staff Portal - dynamic manifest for PWA install
  app.get("/api/public/staff-portal/:token/manifest.json", async (req, res) => {
    try {
      const staffMember = await storage.getStaffByToken(req.params.token);
      const name = staffMember ? `${staffMember.name} - PREGA SQUAD` : "PREGA SQUAD Portal";
      res.json({
        name,
        short_name: staffMember?.name || "Portal",
        description: "Staff Portal - PREGA SQUAD",
        start_url: `/staff-portal/${req.params.token}`,
        scope: `/staff-portal/${req.params.token}`,
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#06b6d4",
        orientation: "portrait-primary",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      });
    } catch (err) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // Staff Portal - public routes (token-based)
  app.get("/api/public/staff-portal/:token", publicRateLimitMiddleware, async (req, res) => {
    try {
      const staffMember = await storage.getStaffByToken(req.params.token);
      if (!staffMember) {
        return res.status(404).json({ message: "Invalid portal link" });
      }
      res.json({
        id: staffMember.id,
        name: staffMember.name,
        color: staffMember.color,
      });
    } catch (err) {
      console.error("Error fetching staff portal:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/public/staff-portal/:token/appointments", publicRateLimitMiddleware, async (req, res) => {
    try {
      const staffMember = await storage.getStaffByToken(req.params.token);
      if (!staffMember) {
        return res.status(404).json({ message: "Invalid portal link" });
      }
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }
      const appointments = await storage.getAppointmentsByDateRange(startDate, endDate);
      const staffAppointments = appointments
        .filter(a => a.staffId === staffMember.id || (!a.staffId && a.staff === staffMember.name))
        .map(a => ({
          id: a.id,
          date: a.date,
          time: a.startTime,
          service: a.service,
          duration: a.duration,
          total: a.total,
          paid: a.paid,
          client: a.client ? a.client.split(" ")[0] : "",
        }));
      res.json(staffAppointments);
    } catch (err) {
      console.error("Error fetching staff portal appointments:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/public/staff-portal/:token/earnings", publicRateLimitMiddleware, async (req, res) => {
    try {
      const staffMember = await storage.getStaffByToken(req.params.token);
      if (!staffMember) {
        return res.status(404).json({ message: "Invalid portal link" });
      }
      const { startDate, endDate, walletMode } = req.query as { startDate?: string; endDate?: string; walletMode?: string };

      // Resolve today's date using local parts to avoid UTC shift
      const todayD = new Date();
      const todayStr = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, "0")}-${String(todayD.getDate()).padStart(2, "0")}`;

      // In walletMode the period is always lastPaidAt → today, determined server-side
      const lastPayment = await storage.getLastStaffPayment(staffMember.id);

      // Build the wallet sinceDate (local date parts, not UTC)
      let walletSinceDate = "2000-01-01";
      if (lastPayment?.paidAt) {
        const d = new Date(lastPayment.paidAt);
        walletSinceDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }

      // Effective period for stats
      const effectiveStart = walletMode === "true" ? walletSinceDate : (startDate || "2000-01-01");
      const effectiveEnd   = walletMode === "true" ? todayStr         : (endDate   || todayStr);

      if (!walletMode && (!startDate || !endDate)) {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }

      const allServices = await storage.getServices();
      const serviceMap = new Map(allServices.map(s => [s.name, s]));
      const staffCommissions = await storage.getStaffCommissionsByStaff(staffMember.id);

      // Fetch appointments for the effective period AND future (pre-booked) ones for wallet
      const [periodAppointments, futureAppointments] = await Promise.all([
        storage.getAppointmentsByDateRange(effectiveStart, effectiveEnd),
        // For wallet we also need appointments beyond today (pre-booked)
        storage.getAppointmentsByDateRange(effectiveStart, "2099-12-31"),
      ]);

      const isStaffAppt = (a: any) =>
        (Number(a.staffId) === staffMember.id || (!a.staffId && a.staff === staffMember.name));

      const paidAppointments = periodAppointments.filter(a => isStaffAppt(a) && !!a.paid);

      let totalRevenue = 0;
      let totalCommission = 0;
      const serviceBreakdown: Record<string, { name: string; count: number; revenue: number; commission: number }> = {};

      for (const appt of paidAppointments) {
        const serviceName = appt.service || "Unknown";
        const service = serviceMap.get(serviceName);
        let commissionRate = service?.commissionPercent ?? 50;

        if (service) {
          const customComm = staffCommissions.find(c => c.serviceId === service.id);
          if (customComm) {
            commissionRate = customComm.percentage;
          }
        }

        const commission = ((appt.total || 0) * commissionRate) / 100;
        totalRevenue += (appt.total || 0);
        totalCommission += commission;

        if (!serviceBreakdown[serviceName]) {
          serviceBreakdown[serviceName] = { name: serviceName, count: 0, revenue: 0, commission: 0 };
        }
        serviceBreakdown[serviceName].count++;
        serviceBreakdown[serviceName].revenue += (appt.total || 0);
        serviceBreakdown[serviceName].commission += commission;
      }

      const deductions = await storage.getStaffDeductions();
      const staffDeductions = deductions.filter(
        d => d.staffId === staffMember.id || (!d.staffId && d.staffName === staffMember.name)
      );

      const periodDeductions = staffDeductions.filter(d => {
        if (d.cleared && d.clearedAt) {
          const clearedDate = new Date(d.clearedAt).toISOString().split("T")[0];
          return clearedDate >= effectiveStart && clearedDate <= effectiveEnd;
        }
        return d.date >= effectiveStart && d.date <= effectiveEnd;
      });
      const totalPeriodDeductions = periodDeductions.reduce((sum, d) => sum + Math.max(0, d.amount - (d.paidBack || 0)), 0);

      const pendingDeductions = staffDeductions.filter(d => !d.cleared);
      const totalPendingDeductions = pendingDeductions.reduce((sum, d) => sum + Math.max(0, d.amount - (d.paidBack || 0)), 0);

      // Wallet = commission on all paid appointments from walletSinceDate onward (including future pre-booked)
      let walletBalance = 0;
      if (lastPayment) {
        const sincePayment = futureAppointments.filter(a => isStaffAppt(a) && !!a.paid);
        for (const appt of sincePayment) {
          const serviceName = appt.service || "Unknown";
          const service = serviceMap.get(serviceName);
          let cr = service?.commissionPercent ?? 50;
          const cc = staffCommissions.find(c => service && c.serviceId === service.id);
          if (cc) cr = cc.percentage;
          walletBalance += ((appt.total || 0) * cr) / 100;
        }
        walletBalance -= totalPendingDeductions;
      } else {
        walletBalance = totalCommission - totalPendingDeductions;
      }

      const netCommission = totalCommission - totalPeriodDeductions;
      const periodPendingDeductions = periodDeductions.filter(d => !d.cleared).reduce((sum, d) => sum + Math.max(0, d.amount - (d.paidBack || 0)), 0);

      res.json({
        totalRevenue,
        totalCommission: netCommission,
        totalAppointments: paidAppointments.length,
        pendingDeductions: periodPendingDeductions,
        netPayable: netCommission,
        walletBalance,
        walletSinceDate,
        lastPaidAt: lastPayment?.paidAt || null,
        deductionsList: periodDeductions.map(d => ({
          type: d.type,
          description: d.description,
          amount: d.amount,
          paidBack: d.paidBack || 0,
          date: d.date,
          cleared: d.cleared || false,
        })),
        services: Object.values(serviceBreakdown),
      });
    } catch (err) {
      console.error("Error fetching staff portal earnings:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/staff/:id/regenerate-token", isPinAuthenticated, requirePermission("manage_staff"), async (req, res) => {
    try {
      const { randomUUID } = await import("crypto");
      const newToken = randomUUID();
      await storage.updateStaff(Number(req.params.id), { publicToken: newToken } as any);
      res.json({ token: newToken });
    } catch (err) {
      console.error("Error regenerating staff token:", err);
      res.status(500).json({ message: "Server error" });
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
    // Check and notify if product is now low on stock
    checkAndNotifyLowStock(Number(req.params.id));
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
      // Check and notify if product is now low on stock
      checkAndNotifyLowStock(parseInt(req.params.id));
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

  app.patch("/api/charges/:id", isPinAuthenticated, requirePermission("manage_expenses"), async (req, res) => {
    try {
      await storage.updateCharge(Number(req.params.id), req.body);
      res.status(200).json({ success: true });
    } catch (err) {
      console.error("Error updating charge:", err);
      res.status(500).json({ message: "Failed to update charge" });
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

  // Owner Withdrawals
  app.get("/api/owner-withdrawals", isPinAuthenticated, async (_req, res) => {
    try {
      const items = await storage.getOwnerWithdrawals();
      res.json(items);
    } catch (err) {
      console.error("Error fetching owner withdrawals:", err);
      res.status(500).json({ message: "Failed to fetch owner withdrawals" });
    }
  });

  app.post("/api/owner-withdrawals", isPinAuthenticated, requirePermission("manage_expenses"), async (req, res) => {
    try {
      const item = await storage.createOwnerWithdrawal(req.body);
      res.status(201).json(item);
    } catch (err) {
      console.error("Error creating owner withdrawal:", err);
      res.status(400).json({ message: "Failed to create owner withdrawal" });
    }
  });

  app.delete("/api/owner-withdrawals/:id", isPinAuthenticated, requirePermission("manage_expenses"), async (req, res) => {
    try {
      await storage.deleteOwnerWithdrawal(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting owner withdrawal:", err);
      res.status(500).json({ message: "Failed to delete owner withdrawal" });
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

  app.patch("/api/staff-deductions/:id", isPinAuthenticated, requirePermission("manage_salaries"), async (req, res) => {
    try {
      await storage.updateStaffDeduction(Number(req.params.id), req.body);
      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to update deduction" });
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

  app.patch("/api/staff-deductions/:id/clear", isPinAuthenticated, requirePermission("manage_salaries"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.clearStaffDeduction(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to clear deduction" });
    }
  });

  app.patch("/api/staff-deductions/:id/pay-back", isPinAuthenticated, requirePermission("manage_salaries"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { amount } = z.object({ amount: z.number().min(0.01, "Amount must be positive") }).parse(req.body);
      const deductions = await storage.getStaffDeductions();
      const deduction = deductions.find(d => d.id === id);
      if (!deduction) {
        return res.status(404).json({ message: "Deduction not found" });
      }
      if (deduction.cleared) {
        return res.status(400).json({ message: "Deduction is already cleared" });
      }
      const currentPaidBack = deduction.paidBack || 0;
      const newPaidBack = Math.min(currentPaidBack + amount, deduction.amount);
      const fullyPaid = newPaidBack >= deduction.amount;
      if (fullyPaid) {
        await storage.updateStaffDeduction(id, { paidBack: deduction.amount } as any);
        await storage.clearStaffDeduction(id);
      } else {
        await storage.updateStaffDeduction(id, { paidBack: newPaidBack } as any);
      }
      res.json({ success: true, paidBack: fullyPaid ? deduction.amount : newPaidBack, cleared: fullyPaid });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to record repayment" });
    }
  });

  // Single-shot salary data endpoint — fetches all data sources in parallel
  // on the server and returns them in one response so the client renders once,
  // with no cascading updates from independent queries completing at different times.
  app.get("/api/salaries/compute", isPinAuthenticated, async (_req, res) => {
    try {
      const [staff, services, staffCommissions, appointments, charges, deductions, staffPayments, salonPayments] =
        await Promise.all([
          storage.getStaff(),
          storage.getServices(),
          storage.getStaffCommissions(),
          storage.getAppointments(),
          storage.getCharges(),
          storage.getStaffDeductions(),
          storage.getStaffPayments(),
          storage.getSalonPayments(),
        ]);
      res.json({ staff, services, staffCommissions, appointments, charges, deductions, staffPayments, salonPayments });
    } catch (err) {
      res.status(500).json({ message: "Failed to compute salary data" });
    }
  });

  // Salon Payments (Salon Earnings Wallet)
  app.get("/api/salon-payments", isPinAuthenticated, async (_req, res) => {
    try {
      const items = await storage.getSalonPayments();
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch salon payments" });
    }
  });

  app.post("/api/salon-payments", isPinAuthenticated, requirePermission("manage_salaries"), async (req, res) => {
    try {
      const { insertSalonPaymentSchema } = await import("@shared/schema");
      const validated = insertSalonPaymentSchema.parse(req.body);
      const payment = await storage.createSalonPayment(validated);
      res.json(payment);
    } catch (err: any) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid payment data", errors: err.errors });
      }
      res.status(500).json({ message: "Failed to create salon payment" });
    }
  });

  // Staff Payments (Employee Wallet)
  app.get("/api/staff-payments", isPinAuthenticated, async (_req, res) => {
    try {
      const items = await storage.getStaffPayments();
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch staff payments" });
    }
  });

  app.get("/api/staff-payments/staff/:staffId", isPinAuthenticated, async (req, res) => {
    try {
      const items = await storage.getStaffPaymentsByStaff(Number(req.params.staffId));
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch staff payments" });
    }
  });

  app.get("/api/staff-payments/staff/:staffId/last", isPinAuthenticated, async (req, res) => {
    try {
      const payment = await storage.getLastStaffPayment(Number(req.params.staffId));
      res.json(payment || null);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch last payment" });
    }
  });

  app.post("/api/staff-payments", isPinAuthenticated, requirePermission("manage_salaries"), async (req, res) => {
    try {
      const { insertStaffPaymentSchema } = await import("@shared/schema");
      const validated = insertStaffPaymentSchema.parse(req.body);
      const payment = await storage.createStaffPayment(validated);
      res.json(payment);
    } catch (err: any) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid payment data", errors: err.errors });
      }
      res.status(500).json({ message: "Failed to create staff payment" });
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

  app.patch("/api/clients/:id/use-points", isPinAuthenticated, requirePermission("manage_clients"), async (req, res) => {
    try {
      const { usePoints } = req.body;
      const item = await storage.updateClient(Number(req.params.id), { usePoints: !!usePoints });
      res.json(item);
    } catch (err) {
      res.status(400).json({ message: "Update failed" });
    }
  });

  app.patch("/api/clients/:id/restore-loyalty-points", isPinAuthenticated, requirePermission("manage_appointments"), async (req, res) => {
    try {
      const { points } = req.body;
      if (!points || points <= 0) {
        return res.status(400).json({ message: "Invalid points amount" });
      }
      const item = await storage.restoreClientLoyaltyPoints(Number(req.params.id), points);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to restore loyalty points" });
    }
  });

  app.patch("/api/clients/:id/use-gift-card-balance", isPinAuthenticated, requirePermission("manage_clients"), async (req, res) => {
    try {
      const { useGiftCardBalance } = req.body;
      const item = await storage.updateClient(Number(req.params.id), { useGiftCardBalance: !!useGiftCardBalance });
      res.json(item);
    } catch (err) {
      res.status(400).json({ message: "Update failed" });
    }
  });

  app.patch("/api/clients/:id/gift-card-balance", isPinAuthenticated, requirePermission("manage_appointments"), async (req, res) => {
    try {
      const { amount } = req.body;
      const clientId = Number(req.params.id);
      const numAmount = Number(amount);
      console.log(`[GiftCard Route] Updating client ${clientId} balance by ${numAmount} (raw: ${amount})`);
      if (isNaN(numAmount)) {
        return res.status(400).json({ message: "Invalid amount" });
      }
      if (numAmount < 0) {
        const client = await storage.getClient(clientId);
        if (!client) return res.status(404).json({ message: "Client not found" });
        const currentBalance = Number(client.giftCardBalance) || 0;
        if (Math.abs(numAmount) > currentBalance + 0.01) {
          return res.status(400).json({ message: `Insufficient gift card balance: has ${currentBalance}, requested deduction ${Math.abs(numAmount)}` });
        }
      }
      const item = await storage.updateClientGiftCardBalance(clientId, numAmount);
      res.json(item);
    } catch (err) {
      console.error("[GiftCard Route] Error:", err);
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
      const { clientId, pointsUsed, rewardDescription, date } = req.body;
      if (!clientId || !pointsUsed || pointsUsed <= 0) {
        return res.status(400).json({ message: "Invalid redemption: clientId and positive pointsUsed required" });
      }
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      if (client.loyaltyPoints < pointsUsed) {
        return res.status(400).json({ message: `Insufficient loyalty points: has ${client.loyaltyPoints}, requested ${pointsUsed}` });
      }
      const item = await storage.createLoyaltyRedemption({ clientId, pointsUsed, rewardDescription, date });
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
      
      const allStaff = await storage.getStaff();
      const staffMember = allStaff.find(s => s.name === req.params.staffName);
      const performance = await storage.getStaffPerformance(
        req.params.staffName,
        startDate,
        endDate,
        staffMember?.id
      );
      res.json(performance);
    } catch (err) {
      res.status(400).json({ message: "Invalid parameters" });
    }
  });

  // ── Baileys WhatsApp management routes ──────────────────────────────────
  app.get("/api/whatsapp/qr", isPinAuthenticated, async (_req, res) => {
    try {
      const { getQRDataUrl, getStatus, getPairingCode, getPairingCodeExpiresAt, getLastPairingError } = await import("./baileys");
      const s = getStatus();
      const qr = getQRDataUrl();
      const pairingCode = getPairingCode();
      const pairingCodeExpiresAt = getPairingCodeExpiresAt();
      const pairingError = getLastPairingError();
      const isReplitDev = !!process.env.REPL_ID;
      res.json({ status: s.status, connected: s.connected, phone: s.phone, qr, pairingCode, pairingCodeExpiresAt, pairingError, isReplitDev });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/whatsapp/status", isPinAuthenticated, async (_req, res) => {
    try {
      const { getStatus } = await import("./baileys");
      res.json(getStatus());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/connect-qr", isPinAuthenticated, async (_req, res) => {
    if (process.env.REPL_ID) {
      return res.status(400).json({ success: false, error: "REPLIT_DEV" });
    }
    try {
      const { startQR } = await import("./baileys");
      startQR(); // non-blocking — QR arrives via polling /api/whatsapp/qr
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/whatsapp/pairing-code", isPinAuthenticated, async (req, res) => {
    if (process.env.REPL_ID) {
      return res.status(400).json({ success: false, error: "REPLIT_DEV" });
    }
    try {
      const { startPairingCode } = await import("./baileys");
      const { phone } = z.object({ phone: z.string().min(8) }).parse(req.body);
      startPairingCode(phone); // non-blocking — code arrives via polling /api/whatsapp/qr
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/whatsapp/reconnect", isPinAuthenticated, async (_req, res) => {
    try {
      const { reconnect } = await import("./baileys");
      await reconnect();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/whatsapp/disconnect", isPinAuthenticated, requirePermission("admin_settings"), async (_req, res) => {
    try {
      const { disconnect } = await import("./baileys");
      await disconnect();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/whatsapp/clear-session", isPinAuthenticated, async (_req, res) => {
    try {
      const { clearSessionIfDisconnected } = await import("./baileys");
      clearSessionIfDisconnected();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/whatsapp/bot-conversations", isPinAuthenticated, async (_req, res) => {
    try {
      const { getAllBotMemories } = await import("./db");
      const memories = await getAllBotMemories();
      // Return only what the UI needs — strip raw preferred_services list to keep payload small
      const result = memories
        .filter((m) => m.convHistory && m.convHistory.length > 0)
        .map((m) => ({
          jid: m.jid,
          phone: m.jid.replace("@s.whatsapp.net", ""),
          clientName: m.clientName ?? null,
          language: m.language,
          visitCount: m.visitCount,
          lastSeen: m.lastSeen ? m.lastSeen.toISOString() : null,
          history: m.convHistory,
        }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/whatsapp/bot-conversations/:jid", isPinAuthenticated, async (req, res) => {
    try {
      const jid = decodeURIComponent(req.params.jid);
      const { saveBotMemory } = await import("./db");
      // Wipe conv history only — keep name, language, services
      const { getBotMemory } = await import("./db");
      const mem = await getBotMemory(jid);
      if (mem) {
        await saveBotMemory({ ...mem, convHistory: [] });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // WhatsApp Notifications (Baileys) - protected routes
  app.post("/api/notifications/send", isPinAuthenticated, async (req, res) => {
    try {
      const { sendWhatsAppMessage } = await import("./baileys");
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
      const { sendAppointmentReminder } = await import("./baileys");
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
      const { sendBookingConfirmation } = await import("./baileys");
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

  // Send gift card notification via WhatsApp
  app.post("/api/notifications/gift-card", isPinAuthenticated, requirePermission("manage_business_settings"), async (req, res) => {
    try {
      const { sendGiftCardNotification } = await import("./baileys");
      const { recipientPhone, recipientName, giftCardCode, amount, senderName } = z.object({
        recipientPhone: z.string().min(1, "Phone is required"),
        recipientName: z.string().min(1, "Recipient name is required"),
        giftCardCode: z.string().min(1, "Gift card code is required"),
        amount: z.number().min(0, "Amount must be positive"),
        senderName: z.string().optional(),
      }).parse(req.body);
      
      const result = await sendGiftCardNotification(recipientPhone, recipientName, giftCardCode, amount, senderName);
      
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
      const { sendWhatsAppMessage } = await import("./baileys");
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
      const failedClients: { id: number; name: string; phone: string; error: string }[] = [];
      
      for (const client of targetClients) {
        try {
          const personalizedMessage = message.replace(/\{name\}/gi, client.name);
          const result = await sendWhatsAppMessage(client.phone!, personalizedMessage);
          
          if (result.success) {
            sent++;
          } else {
            failed++;
            const errorMsg = result.error || "Unknown error";
            errors.push(`${client.name}: ${errorMsg}`);
            failedClients.push({ id: client.id, name: client.name, phone: client.phone!, error: errorMsg });
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err: any) {
          failed++;
          const errorMsg = err.message || "Unknown error";
          errors.push(`${client.name}: ${errorMsg}`);
          failedClients.push({ id: client.id, name: client.name, phone: client.phone!, error: errorMsg });
        }
      }
      
      res.json({ 
        success: true, 
        sent, 
        failed, 
        total: targetClients.length,
        errors: errors.slice(0, 5),
        failedClients
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Check Baileys connection status (legacy endpoint kept for compatibility)
  app.get("/api/notifications/status", isPinAuthenticated, async (_req, res) => {
    try {
      const { getConnectionStatus } = await import("./baileys");
      const status = await getConnectionStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ connected: false, error: err.message });
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
      const settings = await storage.getBusinessSettings();
      const businessName = settings?.businessName ?? "PREGA SQUAD";
      const results = await sendPushNotification(
        businessName,
        "Les notifications fonctionnent correctement!",
        "/planning"
      );
      res.json({ success: true, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/push/check-expiry", isPinAuthenticated, async (_req, res) => {
    try {
      await checkAndNotifyExpiringProducts();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/push/check-stock", isPinAuthenticated, async (_req, res) => {
    try {
      await broadcastLowStockNotifications();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/push/closing-reminder", isPinAuthenticated, requirePermission("admin_settings"), async (_req, res) => {
    try {
      await sendClosingReminderNow();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/products/expiring", isPinAuthenticated, async (_req, res) => {
    try {
      const expiringProducts = await storage.getExpiringProducts();
      res.json(expiringProducts);
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
          workingDays: [1, 2, 3, 4, 5, 6],
          autoLockEnabled: false,
          planningShortcuts: ["services", "clients", "salaries", "inventory"]
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

  app.delete("/api/gift-cards/:id", isPinAuthenticated, requirePermission("manage_business_settings"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteGiftCard(id);
      res.json({ success: true });
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

  // ─── Tombola Spin Wheel ──────────────────────────────────────────────────────
  const TOMBOLA_SEGMENTS = [
    { label: '10%',              prize: '10%' },  // 0
    { label: 'Better Next Time', prize: null },   // 1
    { label: '20%',              prize: '20%' },  // 2
    { label: 'Better Next Time', prize: null },   // 3
    { label: '40%',              prize: '40%' },  // 4
    { label: 'Better Next Time', prize: null },   // 5
    { label: '60%',              prize: '60%' },  // 6
    { label: 'Better Next Time', prize: null },   // 7
    { label: '80%',              prize: '80%' },  // 8
    { label: 'Better Next Time', prize: null },   // 9
    { label: 'Free Service',     prize: 'free' }, // 10
    { label: 'Better Next Time', prize: null },   // 11
  ];
  const TOMBOLA_HOURS = 48;

  function spinResult(): { result: string; segmentIndex: number } {
    const rand = Math.random();
    // 50% → 10% off · 15% → 20% off · 5% → 40% off
    // 30% → better luck · 0% → 60% / 80% / Free Service
    if (rand < 0.50) return { result: '10%', segmentIndex: 0 };
    if (rand < 0.65) return { result: '20%', segmentIndex: 2 };
    if (rand < 0.70) return { result: '40%', segmentIndex: 4 };
    const betterSegments = [1, 3, 5, 7, 9, 11];
    const segmentIndex = betterSegments[Math.floor(Math.random() * betterSegments.length)];
    return { result: 'Better Next Time', segmentIndex };
  }

  app.get("/api/tombola/status", async (req, res) => {
    try {
      const deviceId = req.query.deviceId as string;
      if (!deviceId) return res.json({ canSpin: true, nextSpinAt: null });

      const cutoff = new Date(Date.now() - TOMBOLA_HOURS * 60 * 60 * 1000);
      let lastSpin: any = null;

      if (dbDialect === 'mysql') {
        const conn = await pool().getConnection();
        const [rows] = await conn.query(
          `SELECT spun_at FROM tombola_spins WHERE device_id = ? AND spun_at > ? ORDER BY spun_at DESC LIMIT 1`,
          [deviceId, cutoff]
        );
        conn.release();
        lastSpin = (rows as any[])[0] || null;
      } else {
        const { rows } = await pool().query(
          `SELECT spun_at FROM tombola_spins WHERE device_id = $1 AND spun_at > $2 ORDER BY spun_at DESC LIMIT 1`,
          [deviceId, cutoff]
        );
        lastSpin = rows[0] || null;
      }

      if (lastSpin) {
        const spunAt = new Date(lastSpin.spun_at);
        const nextSpinAt = new Date(spunAt.getTime() + TOMBOLA_HOURS * 60 * 60 * 1000);
        return res.json({ canSpin: false, nextSpinAt: nextSpinAt.toISOString(), spunAt: spunAt.toISOString() });
      }
      res.json({ canSpin: true, nextSpinAt: null });
    } catch (err: any) {
      res.json({ canSpin: true, nextSpinAt: null });
    }
  });

  app.post("/api/tombola/spin", async (req, res) => {
    try {
      const { deviceId } = req.body;
      if (!deviceId || typeof deviceId !== 'string' || deviceId.length > 255) {
        return res.status(400).json({ message: 'Invalid device ID' });
      }

      const cutoff = new Date(Date.now() - TOMBOLA_HOURS * 60 * 60 * 1000);
      let lastSpin: any = null;

      if (dbDialect === 'mysql') {
        const conn = await pool().getConnection();
        const [rows] = await conn.query(
          `SELECT spun_at FROM tombola_spins WHERE device_id = ? AND spun_at > ? ORDER BY spun_at DESC LIMIT 1`,
          [deviceId, cutoff]
        );
        lastSpin = (rows as any[])[0] || null;
        conn.release();
      } else {
        const { rows } = await pool().query(
          `SELECT spun_at FROM tombola_spins WHERE device_id = $1 AND spun_at > $2 ORDER BY spun_at DESC LIMIT 1`,
          [deviceId, cutoff]
        );
        lastSpin = rows[0] || null;
      }

      if (lastSpin) {
        const nextSpinAt = new Date(new Date(lastSpin.spun_at).getTime() + TOMBOLA_HOURS * 60 * 60 * 1000);
        return res.status(429).json({ message: 'Already spun', nextSpinAt: nextSpinAt.toISOString() });
      }

      const { result, segmentIndex } = spinResult();

      if (dbDialect === 'mysql') {
        const conn = await pool().getConnection();
        await conn.query(
          `INSERT INTO tombola_spins (device_id, result, segment_index, spun_at) VALUES (?, ?, ?, NOW())`,
          [deviceId, result, segmentIndex]
        );
        conn.release();
      } else {
        await pool().query(
          `INSERT INTO tombola_spins (device_id, result, segment_index, spun_at) VALUES ($1, $2, $3, NOW())`,
          [deviceId, result, segmentIndex]
        );
      }

      const nextSpinAt = new Date(Date.now() + TOMBOLA_HOURS * 60 * 60 * 1000);
      res.json({ result, segmentIndex, nextSpinAt: nextSpinAt.toISOString() });
    } catch (err: any) {
      console.error('Tombola spin error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Seed data if empty
  await seedDatabase();

  // Initialize Baileys WhatsApp (non-blocking)

  // AI reply cache — avoids burning Gemini quota on repeated identical messages
  // Only used when there is no active conversation history for a JID.
  const aiReplyCache = new Map<string, { reply: string; ts: number }>();
  const AI_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  // In-memory shadow of the DB memory — reduces DB reads on rapid back-and-forth.
  // Flushed to DB after every exchange.
  type ConvTurn = { role: "user" | "model"; text: string };
  const memCache = new Map<string, BotClientMemory>();

  // How long an idle conversation keeps its context (7 days — returning clients always get full context)
  const CONV_TTL = 7 * 24 * 60 * 60 * 1000;
  // Maximum recent turns to keep in history (15 back-and-forth = 30 entries)
  const CONV_MAX_TURNS = 15;

  // ── Memory extraction helpers ──────────────────────────────────────────────

  /** Detect the dominant language of a message */
  function detectLanguage(text: string): string {
    const arabicChars  = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const latinChars   = (text.match(/[a-zA-Z]/g) || []).length;
    const darijaLatin  = /\b(bghit|wach|dial|taman|ndir|kifach|mnin|fain|kayn|hna|dyal|zloul|ana|nta|hiya|huwa|3ref|3reft|wash|gha|mashi|bzzaf|chhal|makayn|ola|wla|ndir|diri|nhar|liyam|smiyti|ismi)\b/i;
    if (arabicChars > 3) return arabicChars > latinChars * 1.5 ? "arabic" : "darija";
    if (darijaLatin.test(text)) return "darija";
    if (latinChars > 3) return "french";
    return "unknown";
  }

  /** Try to extract a client first name from their message */
  function extractName(text: string): string | null {
    const patterns = [
      /أنا\s+([\u0600-\u06FF]+)/,
      /اسمي\s+([\u0600-\u06FFa-zA-Z]+)/,
      /سميتي\s+([\u0600-\u06FFa-zA-Z]+)/,
      /إسمي\s+([\u0600-\u06FFa-zA-Z]+)/,
      /je\s+m['']?appelle\s+([A-Za-zÀ-ÿ]+)/i,
      /je\s+suis\s+([A-Za-zÀ-ÿ]+)/i,
      /c['']?est\s+([A-Za-zÀ-ÿ]+)/i,
      /ana\s+([A-Za-zÀ-ÿ\u0600-\u06FF]+)/i,
      /smiyti\s+([A-Za-zÀ-ÿ\u0600-\u06FF]+)/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1] && m[1].length >= 2) return m[1];
    }
    return null;
  }

  /** Return service names from the message that match the known services list */
  function extractMentionedServices(text: string, services: { name: string }[]): string[] {
    const lower = text.toLowerCase();
    return services.filter((s) => lower.includes(s.name.toLowerCase())).map((s) => s.name);
  }

  // ── DB-backed memory load/save ────────────────────────────────────────────

  async function loadMemory(jid: string): Promise<BotClientMemory> {
    // Return in-memory shadow if fresh enough
    const cached = memCache.get(jid);
    if (cached) return cached;

    const dbMem = await getBotMemory(jid);
    if (dbMem) {
      memCache.set(jid, dbMem);
      return dbMem;
    }
    // New client — create a blank memory record
    const blank: BotClientMemory = {
      jid,
      clientName: null,
      language: "unknown",
      preferredServices: [],
      personalityNotes: null,
      convHistory: [],
      visitCount: 0,
      lastSeen: null,
    };
    memCache.set(jid, blank);
    return blank;
  }

  async function persistMemory(mem: BotClientMemory): Promise<void> {
    memCache.set(mem.jid, mem);
    // Fire-and-forget — don't block the reply on the DB write
    saveBotMemory(mem).catch((err) =>
      console.error("[BotMemory] Background save failed:", err)
    );
  }

  /** Get the active conversation turns from memory, respecting the 30-min TTL */
  function getActiveHistory(mem: BotClientMemory): ConvTurn[] {
    if (!mem.lastSeen) return [];
    if (Date.now() - new Date(mem.lastSeen).getTime() > CONV_TTL) return [];
    return mem.convHistory;
  }

  /** Merge new turns into memory, trimming to max depth */
  function mergeHistory(mem: BotClientMemory, newTurns: ConvTurn[]): BotClientMemory {
    const maxEntries = CONV_MAX_TURNS * 2;
    const trimmed = newTurns.length > maxEntries
      ? newTurns.slice(newTurns.length - maxEntries)
      : newTurns;
    return { ...mem, convHistory: trimmed };
  }

  // ── Smart message buffer — collects all messages per user, waits for silence,
  //    then flushes as ONE merged context to the AI. This prevents multiple
  //    replies when a client sends text + images in quick succession.
  interface BufferedMsg {
    text: string;
    imageBase64?: string;
    imageMimeType?: string;
    isVoice?: boolean; // true if the message came from a WhatsApp voice note
  }

  interface JidSession {
    buffer: BufferedMsg[];
    timer: ReturnType<typeof setTimeout> | null;
    processing: boolean;
  }

  const jidSessions = new Map<string, JidSession>();
  // Wait this long after the LAST message before replying (reset on every new message)
  const BUFFER_DELAY_MS = 10_000;

  function detectCancellationIntent(text: string): boolean {
    const t = text.toLowerCase().trim();
    return (
      // Arabic script patterns
      /إلغاء|ألغي|نلغي|بغيت\s*نلغي|بغيت\s*نلغيو|بغيت\s*نكنسل|بغيت\s*نقطع|ما\s*نجيش|ما\s*نقدرش\s*نجي|مكنجيش|مكنقدرش\s*نجي|ما\s*قادرش\s*نجي|ما\s*غادي\s*نجي|ما\s*نقدر\s*نجي/.test(text) ||
      // Darija in Latin script
      /\b(nannuli|nannulti|nannuliha|bghit\s+n[a-z]*nul|bghit\s+nqt[ae]3|bghit\s+nqat3|ma\s+najich|ma\s+n[a-z]*ji\s*ch|ma\s+n9derch|makan9derch|bghit\s+cancel|bghit\s+annuler|bghit\s+n7yyad|nqder\s*maji|maqaderch\s*nji)\b/i.test(t) ||
      // French
      /\b(annuler|annulation|je\s+veux\s+annuler|je\s+souhaite\s+annuler|je\s+voulais\s+annuler|annule\s+mon|annule\s+le)\b/i.test(t) ||
      // English
      /\bcancel\s*(my\s*)?(appointment|booking|rdv|rendez.?vous)?\b/i.test(t)
    );
  }

  async function runFlush(remoteJid: string, flush: (msgs: BufferedMsg[]) => Promise<void>): Promise<void> {
    const sess = jidSessions.get(remoteJid);
    if (!sess || sess.buffer.length === 0) return;

    const batch = [...sess.buffer];
    sess.buffer = [];
    sess.timer = null;
    sess.processing = true;
    console.log(`[Bot] Flushing ${batch.length} buffered message(s) for ${remoteJid}`);

    try {
      await flush(batch);
    } finally {
      const s = jidSessions.get(remoteJid);
      if (s) {
        s.processing = false;
        if (s.buffer.length > 0) {
          // New messages arrived while processing — schedule another flush
          s.timer = setTimeout(() => runFlush(remoteJid, flush), BUFFER_DELAY_MS);
        } else {
          jidSessions.delete(remoteJid);
        }
      }
    }
  }

  function addToBuffer(
    remoteJid: string,
    text: string,
    imageBase64: string | undefined,
    imageMimeType: string | undefined,
    isVoice: boolean | undefined,
    flush: (msgs: BufferedMsg[]) => Promise<void>
  ): void {
    let sess = jidSessions.get(remoteJid);
    if (!sess) {
      sess = { buffer: [], timer: null, processing: false };
      jidSessions.set(remoteJid, sess);
    }

    sess.buffer.push({ text, imageBase64, imageMimeType, isVoice });
    console.log(`[Bot] Buffered msg ${sess.buffer.length} for ${remoteJid} — waiting ${BUFFER_DELAY_MS / 1000}s after last message`);

    // Reset debounce timer on every new message
    if (sess.timer) clearTimeout(sess.timer);

    // Don't arm a new timer while processing — buffer will be picked up after flush
    if (sess.processing) return;

    sess.timer = setTimeout(() => runFlush(remoteJid, flush), BUFFER_DELAY_MS);
  }

  import("./baileys").then(({ initBaileys, setSocketIO, setIncomingMessageHandler, sendBotConfirmed, sendBotCancelled, sendBotModify, sendBotError }) => {
    setSocketIO(io);
    // On Replit dev, skip auto-connect — Koyeb production holds the active session.
    // Two simultaneous connections with the same creds cause WhatsApp to kick both (440/replaced).
    // The user can still manually link from the WhatsApp settings page when needed;
    // the new session is saved to the DB and Koyeb picks it up on its next restart.
    if (!process.env.REPL_ID) {
      initBaileys().catch((err) => console.error("[Baileys] Startup error:", err));
    } else {
      console.log("[Baileys] Replit dev — skipping auto-connect (Koyeb holds the active session). Link manually when needed.");
    }

    // Register incoming message handler — uses smart buffer so rapid messages
    // (text + images sent in quick succession) are collected and answered as ONE reply.
    // remoteJid = full WhatsApp JID (may be @s.whatsapp.net OR @lid for newer accounts)
    // phone     = numeric digits extracted from JID — used ONLY for DB matching
    setIncomingMessageHandler(async (remoteJid: string, phone: string, text: string, imageBase64?: string, imageMimeType?: string, isVoice?: boolean) => {
      // Ignore empty messages, groups, and broadcasts
      if ((!text || !text.trim()) && !imageBase64) return;
      if (remoteJid.endsWith("@g.us")) return;
      if (remoteJid.includes("broadcast") || remoteJid === "status@broadcast") return;

      // Check if bot is enabled before processing
      const botSettings = await storage.getBusinessSettings().catch(() => null);
      if (botSettings && (botSettings as any).botEnabled === false) return;

      // ── Phone number filter (allowlist / blocklist) ────────────────────────
      const filterMode: string = (botSettings as any)?.botFilterMode || "all";
      if (filterMode !== "all") {
        const rawNums: string = (botSettings as any)?.botFilterNumbers || "[]";
        let filterList: string[] = [];
        try { filterList = JSON.parse(rawNums); } catch { filterList = []; }
        // Normalize each stored number the same way we normalize incoming JIDs
        const normalizeNum = (n: string) => {
          let d = n.replace(/[^0-9]/g, "");
          if (d.startsWith("00")) d = d.slice(2);
          if (d.startsWith("0") && d.length === 10) d = "212" + d.slice(1);
          if (d.length === 9) d = "212" + d;
          return d;
        };
        const normalizedList = filterList.map(normalizeNum).filter(Boolean);
        const incomingNorm = normalizeNum(phone);
        const isInList = normalizedList.includes(incomingNorm);
        if (filterMode === "allowlist" && !isInList) return;  // not in allowlist → ignore
        if (filterMode === "blocklist" && isInList) return;   // in blocklist → ignore
      }

      addToBuffer(remoteJid, text, imageBase64, imageMimeType, isVoice, async (msgs: BufferedMsg[]) => {
        try {
          // ── Merge all buffered messages into one context ─────────────────
          const mergedText = msgs.map((m) => m.text).filter(Boolean).join("\n").trim();
          // Use the last image in the batch (most recent photo sent)
          const imgMsg = [...msgs].reverse().find((m) => m.imageBase64);
          const mergedImageBase64 = imgMsg?.imageBase64;
          const mergedImageMimeType = imgMsg?.imageMimeType;
          const batchSize = msgs.length;

          if (batchSize > 1) {
            console.log(`[Bot] Merged batch of ${batchSize} message(s) for ${remoteJid}: "${mergedText.slice(0, 60)}"`);
          }

          // Normalize the phone for DB matching (digits only)
          let normalized = phone.replace(/[^0-9]/g, "");
          if (normalized.startsWith("00")) normalized = normalized.slice(2);
          if (normalized.startsWith("0") && normalized.length === 10) normalized = "212" + normalized.slice(1);
          if (normalized.length === 9) normalized = "212" + normalized;

          // ── Appointment quick-reply check (1/2/3) ────────────────────────
          const allApts = await storage.getAppointments();
          const matched = allApts.filter((a: any) => {
            if (!a.phone) return false;
            let ap = a.phone.replace(/[^0-9]/g, "");
            if (ap.startsWith("00")) ap = ap.slice(2);
            if (ap.startsWith("0") && ap.length === 10) ap = "212" + ap.slice(1);
            if (ap.length === 9) ap = "212" + ap;
            return ap === normalized;
          });

          const pendingApts = matched
            .filter((a: any) => !a.bookingStatus || a.bookingStatus === "pending" || a.bookingStatus === "modify_requested")
            .sort((a: any, b: any) => b.id - a.id);

          const apt = pendingApts.length > 0 ? pendingApts[0] : null;

          if (apt && mergedText === "1") {
            await storage.updateAppointment(apt.id, { bookingStatus: "confirmed" } as any);
            await sendBotConfirmed(remoteJid);
            console.log(`[Bot] Appointment ${apt.id} confirmed by client (${remoteJid})`);
            return;
          }
          if (apt && mergedText === "2") {
            await storage.updateAppointment(apt.id, { bookingStatus: "cancelled" } as any);
            await sendBotCancelled(remoteJid);
            console.log(`[Bot] Appointment ${apt.id} cancelled by client (${remoteJid})`);
            return;
          }
          if (apt && mergedText === "3") {
            await storage.updateAppointment(apt.id, { bookingStatus: "modify_requested" } as any);
            await sendBotModify(remoteJid);
            console.log(`[Bot] Appointment ${apt.id} modify requested by client (${remoteJid})`);
            return;
          }

          // ── Natural-language cancellation (any upcoming appointment) ─────
          if (detectCancellationIntent(mergedText)) {
            const cancellableApts = matched
              .filter((a: any) => {
                const s = a.bookingStatus;
                return !s || s === "pending" || s === "confirmed" || s === "modify_requested";
              })
              .sort((a: any, b: any) => b.id - a.id);

            if (cancellableApts.length > 0) {
              const { sendWhatsAppMessage, sendTypingPresence, stopTypingPresence } = await import("./baileys");
              await sendTypingPresence(remoteJid);
              const aptToCancel = cancellableApts[0];
              await storage.updateAppointment(aptToCancel.id, { bookingStatus: "cancelled" } as any);
              const typingMs = 1500 + Math.floor(Math.random() * 1000);
              await new Promise<void>((r) => setTimeout(r, typingMs));
              await stopTypingPresence(remoteJid);
              await sendWhatsAppMessage(
                remoteJid,
                `واخا حبيبتي 💙\n\nتم إلغاء ميعادك بنجاح ✅\n\nإذا بغيتِ تحجزي وقت آخر، راسليني هنا وغادي يتواصلو معاكِ الفريق 🌸\nكنتمنو نشوفوك قريباً 💖`
              );
              console.log(`[Bot] Appointment ${aptToCancel.id} cancelled via natural language from ${remoteJid}`);
              return;
            }
            // No appointment found — fall through so AI can respond naturally
          }

          // ── Short-reply fast-path: merci/شكرا/bye/بسلامة only ───────────
          {
            const t = mergedText.trim().toLowerCase();
            const shortReplies: [RegExp, string[]][] = [
              [/^(شكرا|شكراً|شكرا بزاف|chokran|merci|merci beaucoup|thank you|thanks|thx|🙏|شكرا لك|شكراً لك)$/i, [
                "بالله عليك 🌸 يسعدنا نخدموك!",
                "هيا بالله 💖 ننتظروك!",
                "والله سعداء بيك 🌸",
              ]],
              [/^(بسلامة|بالسلامة|مع السلامة|au revoir|bye|byee|bbye|سلام|تصبح على خير|تصبحي على خير|lila sa3ida|bonne nuit|bonne journée|👋)$/i, [
                "بسلامة 🌸 ننتظروك دايما!",
                "مع السلامة 💖 تصبحي على خير!",
                "يسلمك ربي 🌸 أي وقت راسليني!",
              ]],
            ];

            for (const [pattern, responses] of shortReplies) {
              if (pattern.test(t)) {
                const { sendWhatsAppMessage: _send, sendTypingPresence: _tp, stopTypingPresence: _stp } = await import("./baileys");
                await _tp(remoteJid);
                await new Promise<void>((r) => setTimeout(r, 700 + Math.floor(Math.random() * 500)));
                await _stp(remoteJid);
                const reply = responses[Math.floor(Math.random() * responses.length)];
                await _send(remoteJid, reply);
                console.log(`[Bot] Short-reply fast-path for ${remoteJid}: "${t}"`);
                return;
              }
            }
          }

          // ── AI assistant reply ───────────────────────────────────────────
          const { askGemini, FALLBACK_REPLY } = await import("./gemini");
          const { sendWhatsAppMessage, sendTypingPresence, stopTypingPresence } = await import("./baileys");

          // Show typing immediately — client sees we're working on a reply
          await sendTypingPresence(remoteJid);

          // Load persistent memory for this client (DB-backed, survives restarts)
          const mem = await loadMemory(remoteJid);
          const history = getActiveHistory(mem);
          const hasHistory = history.length > 0;

          // New conversation = no history OR last seen > 20h (triggers welcome greeting)
          const lastSeenMs = mem.lastSeen ? new Date(mem.lastSeen).getTime() : 0;
          const isNewConversation = !hasHistory || (Date.now() - lastSeenMs > 20 * 60 * 60 * 1000);

          // Cache hit — only for text-only, no-history first contacts
          if (!hasHistory && !mergedImageBase64) {
            const cacheKey = `${remoteJid}:${mergedText.toLowerCase().trim()}`;
            const cached = aiReplyCache.get(cacheKey);
            if (cached && Date.now() - cached.ts < AI_CACHE_TTL) {
              await stopTypingPresence(remoteJid);
              await sendWhatsAppMessage(remoteJid, cached.reply);
              console.log(`[Bot] Cache hit for ${remoteJid} — skipping AI call`);
              return;
            }
          }

          // Fetch salon context (settings + services list)
          const [bizSettings, allServices] = await Promise.all([
            storage.getBusinessSettings().catch(() => undefined),
            storage.getServices().catch(() => []),
          ]);

          const serviceList = (allServices || []).map((s: any) => ({
            name: s.name,
            price: s.price,
            duration: s.duration,
            category: s.category,
            isStartingPrice: !!s.isStartingPrice,
          }));

          const salonCtx = {
            name: bizSettings?.businessName || "PREGASQUAD",
            address: bizSettings?.address || undefined,
            mapsLink: (bizSettings as any)?.mapsLink || undefined,
            phone: bizSettings?.phone || undefined,
            openingTime: bizSettings?.openingTime || undefined,
            closingTime: bizSettings?.closingTime || undefined,
            currency: bizSettings?.currencySymbol || "DH",
            services: serviceList,
            isNewConversation,
            clientMemory: {
              clientName: mem.clientName,
              language: mem.language !== "unknown" ? mem.language : undefined,
              preferredServices: mem.preferredServices,
              personalityNotes: mem.personalityNotes,
              visitCount: mem.visitCount,
            },
          };

          // Single AI call with merged context from all buffered messages
          const { reply: aiReply, newHistory } = await askGemini(
            mergedText, salonCtx, history, mergedImageBase64, mergedImageMimeType
          );

          if (!aiReply) {
            await stopTypingPresence(remoteJid);
            console.warn(`[Bot] No AI reply — silent for ${remoteJid}`);
            return;
          }

          // Update client memory on genuine AI replies (not fallback)
          if (aiReply !== FALLBACK_REPLY) {
            const detectedLang = detectLanguage(mergedText);
            const detectedName = extractName(mergedText);
            const mentionedSvcs = extractMentionedServices(mergedText + " " + aiReply, serviceList);

            const updatedMem: BotClientMemory = mergeHistory(
              {
                ...mem,
                clientName: detectedName || mem.clientName,
                language: (detectedLang !== "unknown" ? detectedLang : mem.language) || "unknown",
                preferredServices: Array.from(
                  new Set([...(mem.preferredServices || []), ...mentionedSvcs])
                ).slice(0, 20),
                visitCount: (mem.visitCount || 0) + (hasHistory ? 0 : 1),
                lastSeen: new Date(),
              },
              newHistory
            );

            await persistMemory(updatedMem);

            // Cache first-contact text-only replies
            if (!hasHistory && !mergedImageBase64) {
              const cacheKey = `${remoteJid}:${mergedText.toLowerCase().trim()}`;
              aiReplyCache.set(cacheKey, { reply: aiReply, ts: Date.now() });
              if (aiReplyCache.size > 500) {
                const now = Date.now();
                for (const [k, v] of aiReplyCache) {
                  if (now - v.ts > AI_CACHE_TTL) aiReplyCache.delete(k);
                }
              }
            }
          }

          // ── Human-like typing delay (proportional to reply length) ───────
          const typingDelay = Math.min(Math.max(1500, aiReply.length * 35), 6000);
          await new Promise<void>((r) => setTimeout(r, typingDelay));
          await stopTypingPresence(remoteJid);

          const finalReply = hasHistory ? aiReply : `مرحبا بيك أحبيبا 🌸\n\n${aiReply}`;

          // ── Respond in kind: voice note → voice note, text → text ────────
          const batchHasVoice = msgs.some((m) => m.isVoice);
          let repliedWithVoice = false;

          if (batchHasVoice) {
            try {
              const { textToSpeech } = await import("./gemini");
              const { sendWhatsAppVoiceNote } = await import("./baileys");
              const ttsResult = await textToSpeech(finalReply, bizSettings?.ttsVoice || "Aoede");
              if (ttsResult) {
                const { success } = await sendWhatsAppVoiceNote(
                  remoteJid, ttsResult.pcmBase64, ttsResult.sampleRate
                );
                if (success) {
                  repliedWithVoice = true;
                  console.log(`[Bot] Voice reply sent to ${remoteJid}`);
                } else {
                  console.warn(`[Bot] Voice send failed — falling back to text`);
                }
              } else {
                console.warn(`[Bot] TTS failed — falling back to text`);
              }
            } catch (ttsErr: any) {
              console.warn(`[Bot] TTS error: ${ttsErr.message} — falling back to text`);
            }
          }

          // Send text reply if: not a voice batch, or voice send failed
          if (!repliedWithVoice) {
            await sendWhatsAppMessage(remoteJid, finalReply);
          }

          const turnNum = Math.floor(newHistory.length / 2);
          const clientLabel = mem.clientName ? `${mem.clientName} (${remoteJid})` : remoteJid;
          const batchNote = batchSize > 1 ? ` [${batchSize} msgs merged]` : "";
          const imgNote = mergedImageBase64 ? " [+image]" : "";
          const replyMode = repliedWithVoice ? " [🎙️ voice reply]" : "";
          console.log(`[Bot] ${hasHistory ? "↩ returning" : "★ new"} client ${clientLabel} — turn ${turnNum}${batchNote}${imgNote}${replyMode}`);

        } catch (err: any) {
          console.error("[Bot] Error handling buffered batch:", err.message);
          try {
            const { FALLBACK_REPLY } = await import("./gemini");
            const { sendWhatsAppMessage, stopTypingPresence } = await import("./baileys");
            await stopTypingPresence(remoteJid);
            await sendWhatsAppMessage(remoteJid, FALLBACK_REPLY);
          } catch { /* last-resort */ }
        }
      });
    });
  }).catch((err) => console.error("[Baileys] Import error:", err));

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
