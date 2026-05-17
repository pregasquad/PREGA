import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerPayPalRoutes } from "./paypal";
import { initializeDatabase, warmupDatabase, ensurePushSubscriptionsTable, ensureAppointmentsAuditColumns, ensureForeignKeyConstraints, ensureAdminRolesPhotoColumn, ensureProductExpiryColumns, ensureServiceStartingPriceColumn, ensureServiceMaxPriceColumn, ensureDeductionClearedColumns, ensureDeductionPaidBackColumn, ensureStaffIdBackfillMySQL, ensureStaffPaymentsTable, ensureStaffPublicTokens, ensureAutoLockColumn, ensureChargeAttachmentColumns, ensurePlanningShortcutsColumn, ensureAppointmentDiscountColumns, ensureTombolaSpinsTable, ensureSalonPaymentsTable, ensureBookingStatusColumn, ensureBaileysSessionTable, ensureBotMemoryTable, ensureBotMemoryPhoneColumn, ensureBotBlockedColumn, ensureTtsVoiceColumn, ensureTtsEnabledColumn, ensureMapsLinkColumn, ensureBotEnabledColumn, ensureBotFilterColumns, ensureOwnerWithdrawalsTable, ensureOwnerWithdrawalsNotesColumn, ensureCategoriesColorColumn, ensureSalonComplaintsTable, ensureComplaintTypeColumn, ensureBotSilenceAfterBookingColumn, ensurePrivateRoomColumn, ensureStaffGenderColumn, ensureStaffGenderDefaults, ensureBossInstructionsColumn, ensureLinaPersonalityColumn, ensureBusinessSettingsRow, ensurePaypalOrderIdColumn } from "./db";
import { checkAndSendClosingReminder, checkAndSendAppointmentReminders, checkAndSendRebookingReminders } from "./push";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ limit: "10mb", extended: false }));

// Disable caching for development only (production uses proper caching for speed)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

const startServer = async () => {
  const dbConnected = await initializeDatabase();
  
  if (dbConnected) {
    const warmedUp = await warmupDatabase();
    if (warmedUp) {
      await ensurePushSubscriptionsTable();
      await ensureAppointmentsAuditColumns();
      await ensureAdminRolesPhotoColumn();
      await ensureProductExpiryColumns();
      await ensureServiceStartingPriceColumn();
      await ensureServiceMaxPriceColumn();
      await ensureDeductionClearedColumns();
      await ensureDeductionPaidBackColumn();
      await ensureAutoLockColumn();
      await ensureChargeAttachmentColumns();
      await ensurePlanningShortcutsColumn();
      await ensureAppointmentDiscountColumns();
      await ensureStaffIdBackfillMySQL();
      await ensureStaffPaymentsTable();
      await ensureStaffPublicTokens();
      await ensureTombolaSpinsTable();
      await ensureSalonPaymentsTable();
      await ensureBookingStatusColumn();
      await ensureBaileysSessionTable();
      await ensureBotMemoryTable();
      await ensureBotMemoryPhoneColumn();
      await ensureBotBlockedColumn();
      await ensureTtsVoiceColumn();
      await ensureTtsEnabledColumn();
      await ensureMapsLinkColumn();
      await ensureBotEnabledColumn();
      await ensureBotFilterColumns();
      await ensureBotSilenceAfterBookingColumn();
      await ensureOwnerWithdrawalsTable();
      await ensureOwnerWithdrawalsNotesColumn();
      await ensureCategoriesColorColumn();
      await ensureSalonComplaintsTable();
      await ensureComplaintTypeColumn();
      await ensurePrivateRoomColumn();
      await ensureStaffGenderColumn();
      await ensureStaffGenderDefaults();
      await ensureBossInstructionsColumn();
      await ensureLinaPersonalityColumn();
      await ensureBusinessSettingsRow();
      await ensurePaypalOrderIdColumn();
      await ensureForeignKeyConstraints();
    }
  } else {
    console.log("Starting in OFFLINE MODE - database migrations skipped");
  }
  
  await registerRoutes(httpServer, app);
  registerObjectStorageRoutes(app);
  registerPayPalRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[Error] ${status} — ${message}`, err.stack || "");
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const PORT = parseInt(process.env.PORT || "5000", 10);
  const ENV = process.env.PORT ? "Koyeb" : "Local";
  
  httpServer.listen(
    {
      port: PORT,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${PORT} (${ENV} environment)`);

      // Run immediately on startup (after 15s for DB to settle), then every 5 min
      setTimeout(() => {
        checkAndSendClosingReminder().catch(err =>
          console.error('[Closing Reminder] Error:', err)
        );
        checkAndSendAppointmentReminders().catch(err =>
          console.error('[Appointment Reminder] Error:', err)
        );
        checkAndSendRebookingReminders().catch(err =>
          console.error('[Rebooking Reminder] Error:', err)
        );
      }, 15 * 1000);

      setInterval(() => {
        checkAndSendClosingReminder().catch(err =>
          console.error('[Closing Reminder] Error:', err)
        );
        checkAndSendAppointmentReminders().catch(err =>
          console.error('[Appointment Reminder] Error:', err)
        );
        checkAndSendRebookingReminders().catch(err =>
          console.error('[Rebooking Reminder] Error:', err)
        );
      }, 5 * 60 * 1000);
    },
  );
};

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

// Graceful shutdown — ensures port is released before process exits
// so restarts don't hit EADDRINUSE
process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  httpServer.close(() => process.exit(0));
});

// Global crash guards — log but never crash the process on Koyeb
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException] Unhandled error (server kept alive):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] Unhandled promise rejection (server kept alive):", reason);
});
