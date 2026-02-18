import qz from "qz-tray";

let connected = false;
let printerName: string | null = null;
let setupDone = false;

export function isQzConnected(): boolean {
  return connected && printerName !== null && qz.websocket.isActive();
}

export function getSelectedPrinter(): string | null {
  return printerName;
}

function setupSecurity() {
  if (setupDone) return;
  setupDone = true;
  qz.security.setCertificatePromise(function (resolve) {
    resolve("");
  });
  qz.security.setSignatureAlgorithm("SHA512");
}

export async function connectQz(): Promise<boolean> {
  try {
    setupSecurity();

    if (qz.websocket.isActive()) {
      connected = true;
    } else {
      await qz.websocket.connect();
      connected = true;
    }

    const saved = localStorage.getItem("qz_printer");
    if (saved) {
      printerName = saved;
    } else {
      await autoSelectPrinter();
    }
    return true;
  } catch {
    connected = false;
    return false;
  }
}

async function autoSelectPrinter() {
  try {
    const defaultPrinter = await qz.printers.getDefault();
    if (defaultPrinter) {
      printerName = defaultPrinter;
      localStorage.setItem("qz_printer", defaultPrinter);
      return;
    }
  } catch {}

  try {
    const list = await qz.printers.find();
    const printers = Array.isArray(list) ? list : [list];
    if (printers.length > 0) {
      printerName = printers[0];
      localStorage.setItem("qz_printer", printers[0]);
    }
  } catch {}
}

export async function findPrinters(): Promise<string[]> {
  if (!connected || !qz.websocket.isActive()) return [];
  try {
    const list = await qz.printers.find();
    return Array.isArray(list) ? list : [list];
  } catch {
    return [];
  }
}

export function selectPrinter(name: string) {
  printerName = name;
  localStorage.setItem("qz_printer", name);
}

interface SilentPrintData {
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
  appointmentId?: number;
  loyaltyPointsEarned?: number;
  loyaltyPointsBalance?: number;
}

function buildEscPosReceipt(data: SilentPrintData): string[] {
  const cmds: string[] = [];
  const ESC = "\x1B";
  const GS = "\x1D";

  cmds.push(ESC + "@");
  cmds.push(ESC + "p" + "\x00" + "\x19" + "\xFA");
  cmds.push(ESC + "a" + "\x01");
  cmds.push(GS + "!" + "\x11");
  cmds.push(data.businessName + "\n");
  cmds.push(GS + "!" + "\x00");
  cmds.push("================================\n");
  cmds.push(ESC + "a" + "\x00");
  cmds.push(padRow("Date:", data.date) + "\n");
  cmds.push(padRow("Time:", data.time) + "\n");
  if (data.appointmentId) {
    cmds.push(padRow("#:", String(data.appointmentId)) + "\n");
  }
  cmds.push("--------------------------------\n");
  cmds.push(padRow("Client:", data.clientName) + "\n");
  if (data.clientPhone) {
    cmds.push(padRow("Phone:", data.clientPhone) + "\n");
  }
  cmds.push(padRow("Staff:", data.staffName) + "\n");
  cmds.push("--------------------------------\n");
  cmds.push(ESC + "E" + "\x01");
  cmds.push("Services:\n");
  cmds.push(ESC + "E" + "\x00");
  cmds.push(data.services + "\n");
  cmds.push(padRow("Duration:", data.duration + " min") + "\n");
  cmds.push("================================\n");
  cmds.push(ESC + "E" + "\x01");
  cmds.push(GS + "!" + "\x01");
  cmds.push(padRow("TOTAL", data.total.toFixed(2) + " " + data.currency) + "\n");
  cmds.push(GS + "!" + "\x00");
  cmds.push(ESC + "E" + "\x00");

  if (
    (data.loyaltyPointsEarned !== undefined && data.loyaltyPointsEarned > 0) ||
    (data.loyaltyPointsBalance !== undefined && data.loyaltyPointsBalance > 0)
  ) {
    cmds.push("--------------------------------\n");
    cmds.push(ESC + "E" + "\x01");
    cmds.push("Fidelite / نقاط الولاء\n");
    cmds.push(ESC + "E" + "\x00");
    if (data.loyaltyPointsEarned !== undefined && data.loyaltyPointsEarned > 0) {
      cmds.push(padRow("Points earned:", "+" + data.loyaltyPointsEarned) + "\n");
    }
    if (data.loyaltyPointsBalance !== undefined) {
      cmds.push(padRow("Balance:", String(data.loyaltyPointsBalance)) + "\n");
    }
  }

  cmds.push("================================\n");
  cmds.push(ESC + "a" + "\x01");
  cmds.push("Thank you / شكراً\n");
  const now = new Date();
  cmds.push(
    now.toLocaleDateString() +
      " " +
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
      "\n"
  );
  cmds.push("\n\n\n");
  cmds.push(GS + "V" + "\x01");

  return cmds;
}

function padRow(label: string, value: string, width = 32): string {
  const gap = width - label.length - value.length;
  if (gap > 0) {
    return label + " ".repeat(gap) + value;
  }
  return label + " " + value;
}

export async function silentPrint(data: SilentPrintData): Promise<boolean> {
  if (!isQzConnected()) return false;

  try {
    const config = qz.configs.create(printerName!, { encoding: "UTF-8" });
    const cmds = buildEscPosReceipt(data);
    await qz.print(config, [{ type: "raw", format: "plain", data: cmds.join("") }]);
    return true;
  } catch (e) {
    console.error("QZ Tray print failed:", e);
    return false;
  }
}

export async function openCashDrawer(): Promise<boolean> {
  if (!isQzConnected()) return false;
  try {
    const config = qz.configs.create(printerName!);
    const cmd = "\x1B" + "p" + "\x00" + "\x19" + "\xFA";
    await qz.print(config, [{ type: "raw", format: "plain", data: cmd }]);
    return true;
  } catch {
    return false;
  }
}
