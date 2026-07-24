import {
  isQzConnected,
  silentPrint,
  silentPrintExpense,
  remotePrint,
  remotePrintExpense,
  remoteOpenDrawer,
  openCashDrawer,
  checkPrintStationAsync,
  ensureQzConnected,
} from "./qzPrint";

export interface ReceiptData {
  businessName: string;
  currency: string;
  clientName: string;
  clientPhone?: string;
  services: string;
  staffName: string;
  date: string;
  time: string;
  duration: number;
  total: number;
  paid?: boolean;
  appointmentId?: number;
  loyaltyPointsEarned?: number;
  loyaltyPointsBalance?: number;
}

export interface ExpenseReceiptData {
  businessName: string;
  currency: string;
  expenseType: string;
  expenseName: string;
  amount: number;
  date: string;
}

/**
 * Auto-print a receipt after an appointment is created.
 * Order of attempts:
 *   1. QZ Tray already connected on this device → silent ESC/POS print + open cash drawer
 *   2. QZ Tray not yet connected → try to connect, then print silently
 *   3. No local QZ → relay print job to whichever device is registered as the print station
 *   4. Nothing available → skip silently (no popup, no dialog, ever)
 */
export async function autoPrint(data: ReceiptData): Promise<void> {
  // 1. Already connected — fire immediately
  if (isQzConnected()) {
    await silentPrint(data);
    setTimeout(() => openCashDrawer(), 800);
    return;
  }

  // 2. Try to connect (reuses any in-progress attempt, won't double-connect)
  const qzOk = await ensureQzConnected();
  if (qzOk && isQzConnected()) {
    await silentPrint(data);
    setTimeout(() => openCashDrawer(), 800);
    return;
  }

  // 3. No local QZ — relay to the registered remote print station (laptop / desktop)
  const stationAvailable = await checkPrintStationAsync();
  if (stationAvailable) {
    await remotePrint(data);
    setTimeout(() => remoteOpenDrawer(), 800);
    return;
  }

  // 4. Nothing available — skip silently
  console.log("[print] No printer available — skipping silently");
}

/**
 * Auto-print an expense receipt. Same strategy as autoPrint, without cash drawer.
 */
export async function autoPrintExpense(data: ExpenseReceiptData): Promise<void> {
  if (isQzConnected()) {
    await silentPrintExpense(data);
    return;
  }

  const qzOk = await ensureQzConnected();
  if (qzOk && isQzConnected()) {
    await silentPrintExpense(data);
    return;
  }

  const stationAvailable = await checkPrintStationAsync();
  if (stationAvailable) {
    await remotePrintExpense(data);
    return;
  }

  console.log("[print] No printer available — skipping expense print silently");
}
