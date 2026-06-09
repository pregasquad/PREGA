import "./log-buffer";
import { createServer } from "http";
import app from "./app";
import { registerRoutes } from "./routes/routes";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerPayPalRoutes } from "./paypal";
import { serveStatic } from "./static";
import {
  initializeDatabase,
  warmupDatabase,
  ensurePushSubscriptionsTable,
  ensureAppointmentsAuditColumns,
  ensureForeignKeyConstraints,
  ensureAdminRolesPhotoColumn,
  ensureProductExpiryColumns,
  ensureServiceStartingPriceColumn,
  ensureServiceMaxPriceColumn,
  ensureServiceEmojiColumn,
  ensureDeductionClearedColumns,
  ensureDeductionPaidBackColumn,
  ensureStaffIdBackfillMySQL,
  ensureStaffPaymentsTable,
  ensureStaffPublicTokens,
  ensureAutoLockColumn,
  ensureChargeAttachmentColumns,
  ensurePlanningShortcutsColumn,
  ensurePlanningSlotHeightColumn,
  ensureAppointmentDiscountColumns,
  ensureTombolaSpinsTable,
  ensureSalonPaymentsTable,
  ensureBookingStatusColumn,
  ensureBaileysSessionTable,
  ensureBotMemoryTable,
  ensureBotMemoryPhoneColumn,
  ensureBotBlockedColumn,
  ensureTtsVoiceColumn,
  ensureTtsEnabledColumn,
  ensureMapsLinkColumn,
  ensureBotEnabledColumn,
  ensureBotFilterColumns,
  ensureOwnerWithdrawalsTable,
  ensureOwnerWithdrawalsNotesColumn,
  ensureCategoriesColorColumn,
  ensureSalonComplaintsTable,
  ensureComplaintTypeColumn,
  ensureBotSilenceAfterBookingColumn,
  ensurePrivateRoomColumn,
  ensureStaffGenderColumn,
  ensureStaffGenderDefaults,
  ensureBossInstructionsColumn,
  ensureLinaPersonalityColumn,
  ensureStaffPhotoUrlColumn,
  ensureLoyaltyColumnsInSettings,
  ensureBusinessSettingsRow,
  ensurePaypalOrderIdColumn,
  ensureHolidaysColumn,
  ensureBroadcastLogsTable,
  ensureDailySummaryColumns,
  ensureReminderSentColumn,
  ensureClientTagsColumn,
} from "./db";
import { checkAndSendClosingReminder, checkAndSendAppointmentReminders, checkAndSendRebookingReminders, checkAndSend24hReminders, checkAndSendMorningStatus } from "./push";

const httpServer = createServer(app);

const startServer = async () => {
  const rawPort = process.env["PORT"];
  if (!rawPort) {
    throw new Error("PORT environment variable is required but was not provided.");
  }
  const port = Number(rawPort);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

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
      await ensureServiceEmojiColumn();
      await ensureDeductionClearedColumns();
      await ensureDeductionPaidBackColumn();
      await ensureAutoLockColumn();
      await ensureChargeAttachmentColumns();
      await ensurePlanningShortcutsColumn();
      await ensurePlanningSlotHeightColumn();
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
      await ensureStaffPhotoUrlColumn();
      await ensureLoyaltyColumnsInSettings();
      await ensureBusinessSettingsRow();
      await ensurePaypalOrderIdColumn();
      await ensureHolidaysColumn();
      await ensureBroadcastLogsTable();
      await ensureDailySummaryColumns();
      await ensureReminderSentColumn();
      await ensureClientTagsColumn();
      await ensureForeignKeyConstraints();
    }
  } else {
    console.log("Starting in OFFLINE MODE - database migrations skipped");
  }

  await registerRoutes(httpServer, app);
  registerPayPalRoutes(app);
  serveStatic(app);

  app.use((err: any, _req: any, res: any, _next: any) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[Error] ${status} — ${message}`, err.stack || "");
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      console.log(`Server listening on port ${port}`);

      setTimeout(() => {
        checkAndSendClosingReminder().catch((err) =>
          console.error("[Closing Reminder] Error:", err)
        );
        checkAndSendAppointmentReminders().catch((err) =>
          console.error("[Appointment Reminder] Error:", err)
        );
        checkAndSendRebookingReminders().catch((err) =>
          console.error("[Rebooking Reminder] Error:", err)
        );
        checkAndSend24hReminders().catch((err) =>
          console.error("[24h Reminder] Error:", err)
        );
        checkAndSendMorningStatus().catch((err) =>
          console.error("[Morning Status] Error:", err)
        );
      }, 15 * 1000);

      setInterval(() => {
        checkAndSendClosingReminder().catch((err) =>
          console.error("[Closing Reminder] Error:", err)
        );
        checkAndSendAppointmentReminders().catch((err) =>
          console.error("[Appointment Reminder] Error:", err)
        );
        checkAndSendRebookingReminders().catch((err) =>
          console.error("[Rebooking Reminder] Error:", err)
        );
        checkAndSend24hReminders().catch((err) =>
          console.error("[24h Reminder] Error:", err)
        );
        checkAndSendMorningStatus().catch((err) =>
          console.error("[Morning Status] Error:", err)
        );
      }, 5 * 60 * 1000);
    }
  );
};

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
  // Force exit after 3 s so lingering Socket.io connections don't block restarts
  setTimeout(() => process.exit(0), 3000).unref();
});
process.on("SIGINT", () => {
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
});

// ── Boss crash-alert — rate-limited to 1 per 5 min ──────────────────────────
let lastCrashAlertAt = 0;
async function sendCrashAlert(label: string, detail: string) {
  const now = Date.now();
  if (now - lastCrashAlertAt < 5 * 60 * 1000) return; // max 1 per 5 min
  lastCrashAlertAt = now;
  try {
    const { storage } = await import("./storage.js");
    const settings = await storage.getBusinessSettings().catch(() => null);
    const ownerPhone: string | undefined = (settings as any)?.ownerPhone;
    if (!ownerPhone) return;
    const { sendWhatsAppMessage, formatJid } = await import("./baileys.js");
    const msg = `⚠️ *تنبيه: خطأ في السيرفر*\n\n🔴 *${label}*\n\`${String(detail).slice(0, 300)}\`\n\n🕐 ${new Date().toLocaleTimeString("fr-MA")}`;
    const recipients = ownerPhone.split(",").map((p: string) => p.trim()).filter(Boolean);
    for (const phone of recipients) {
      await sendWhatsAppMessage(formatJid(phone), msg).catch(() => {});
    }
  } catch { /* never crash the crash handler */ }
}

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException] Unhandled error (server kept alive):", err);
  sendCrashAlert("uncaughtException", err?.message || String(err));
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] Unhandled promise rejection (server kept alive):", reason);
  const msg = reason instanceof Error ? reason.message : String(reason);
  sendCrashAlert("unhandledRejection", msg);
});
