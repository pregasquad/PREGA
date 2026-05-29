import { createServer } from "http";
import app from "./app";
import { registerRoutes } from "./routes/routes";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerPayPalRoutes } from "./paypal";
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
} from "./db";
import { checkAndSendClosingReminder, checkAndSendAppointmentReminders, checkAndSendRebookingReminders } from "./push";

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
      await ensureForeignKeyConstraints();
    }
  } else {
    console.log("Starting in OFFLINE MODE - database migrations skipped");
  }

  await registerRoutes(httpServer, app);
  registerObjectStorageRoutes(app);
  registerPayPalRoutes(app);

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
});
process.on("SIGINT", () => {
  httpServer.close(() => process.exit(0));
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException] Unhandled error (server kept alive):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] Unhandled promise rejection (server kept alive):", reason);
});
