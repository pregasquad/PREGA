import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { initializeDatabase, warmupDatabase, ensurePushSubscriptionsTable, ensureAppointmentsAuditColumns, ensureForeignKeyConstraints, ensureAdminRolesPhotoColumn, ensureProductExpiryColumns, ensureServiceStartingPriceColumn, ensureDeductionClearedColumns, ensureStaffIdBackfillMySQL, ensureStaffPaymentsTable, ensureStaffPublicTokens, ensureAutoLockColumn, ensureChargeAttachmentColumns, ensurePlanningShortcutsColumn, ensureAppointmentDiscountColumns } from "./db";
import { checkAndSendClosingReminder, checkAndSendAppointmentReminders } from "./push";

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
      await ensureDeductionClearedColumns();
      await ensureAutoLockColumn();
      await ensureChargeAttachmentColumns();
      await ensurePlanningShortcutsColumn();
      await ensureAppointmentDiscountColumns();
      await ensureStaffIdBackfillMySQL();
      await ensureStaffPaymentsTable();
      await ensureStaffPublicTokens();
      await ensureForeignKeyConstraints();
    }
  } else {
    console.log("Starting in OFFLINE MODE - database migrations skipped");
  }
  
  await registerRoutes(httpServer, app);
  registerObjectStorageRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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

      setInterval(() => {
        checkAndSendClosingReminder().catch(err =>
          console.error('[Closing Reminder] Error:', err)
        );
        checkAndSendAppointmentReminders().catch(err =>
          console.error('[Appointment Reminder] Error:', err)
        );
      }, 5 * 60 * 1000);
    },
  );
};

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
