import qz from "qz-tray";
import { io, Socket } from "socket.io-client";

let connected = false;
let printerName: string | null = null;
let setupDone = false;
let printSocket: Socket | null = null;
let printStationAvailable = false;
let stationRegistered = false;
let qzConnecting: Promise<boolean> | null = null;

export function isQzConnected(): boolean {
  return connected && printerName !== null && qz.websocket.isActive();
}

export function isPrintStationAvailable(): boolean {
  return printStationAvailable;
}

export function getSelectedPrinter(): string | null {
  return printerName;
}

function setupSecurity() {
  if (setupDone) return;
  setupDone = true;

  qz.security.setCertificatePromise(function (resolve: (cert: string) => void) {
    fetch("/api/qz/cert")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch certificate");
        return res.text();
      })
      .then(resolve)
      .catch(() => resolve(""));
  });

  qz.security.setSignatureAlgorithm("SHA512");

  (qz.security as any).setSignaturePromise(function (toSign: string) {
    return function (resolve: (sig: string) => void, reject: (err: Error) => void) {
      fetch("/api/qz/sign", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: toSign,
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to sign");
          return res.text();
        })
        .then(resolve)
        .catch(reject);
    };
  });
}

export async function connectQz(): Promise<boolean> {
  if (qzConnecting) return qzConnecting;
  qzConnecting = _doConnectQz();
  try {
    return await qzConnecting;
  } finally {
    qzConnecting = null;
  }
}

async function _doConnectQz(): Promise<boolean> {
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

    if (isQzConnected()) {
      registerAsPrintStation();
    }
    return true;
  } catch {
    connected = false;
    return false;
  }
}

export async function ensureQzConnected(): Promise<boolean> {
  if (isQzConnected()) return true;
  return connectQz();
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

function toHex(str: string): string {
  let hex = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    hex += code.toString(16).padStart(2, "0");
  }
  return hex;
}

function hexCmd(...bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, "0")).join("");
}

function textToHex(text: string): string {
  return toHex(text);
}

const LINE_WIDTH = 48;
const SEP_DOUBLE = "=".repeat(LINE_WIDTH);
const SEP_SINGLE = "-".repeat(LINE_WIDTH);

function buildReceiptHex(data: SilentPrintData): string {
  const parts: string[] = [];

  parts.push(hexCmd(0x1B, 0x40));

  parts.push(hexCmd(0x1B, 0x33, 0x16));

  parts.push(hexCmd(0x1B, 0x70, 0x00, 0x19, 0xFA));

  parts.push(hexCmd(0x1B, 0x61, 0x01));
  parts.push(hexCmd(0x1D, 0x21, 0x11));
  parts.push(textToHex(data.businessName + "\n"));
  parts.push(hexCmd(0x1D, 0x21, 0x00));
  parts.push(textToHex(SEP_DOUBLE + "\n"));

  parts.push(hexCmd(0x1B, 0x61, 0x00));
  parts.push(textToHex(padRow("Date:", data.date) + "\n"));
  parts.push(textToHex(padRow("Heure / Time:", data.time) + "\n"));
  if (data.appointmentId) {
    parts.push(textToHex(padRow("Ticket #:", String(data.appointmentId)) + "\n"));
  }
  parts.push(textToHex(SEP_SINGLE + "\n"));

  parts.push(textToHex(padRow("Client(e):", data.clientName) + "\n"));
  if (data.clientPhone) {
    parts.push(textToHex(padRow("Tel:", data.clientPhone) + "\n"));
  }
  parts.push(textToHex(padRow("Staff:", data.staffName) + "\n"));
  parts.push(textToHex(SEP_SINGLE + "\n"));

  parts.push(hexCmd(0x1B, 0x45, 0x01));
  parts.push(textToHex("Services:\n"));
  parts.push(hexCmd(0x1B, 0x45, 0x00));

  const serviceLines = data.services.split(",").map(s => s.trim()).filter(Boolean);
  for (const svc of serviceLines) {
    parts.push(textToHex("  " + svc + "\n"));
  }

  parts.push(textToHex(padRow("Duree / Duration:", data.duration + " min") + "\n"));
  parts.push(textToHex(SEP_DOUBLE + "\n"));

  parts.push(hexCmd(0x1B, 0x61, 0x01));
  parts.push(hexCmd(0x1B, 0x45, 0x01));
  parts.push(hexCmd(0x1D, 0x21, 0x11));
  parts.push(textToHex("TOTAL: " + data.total.toFixed(2) + " " + data.currency + "\n"));
  parts.push(hexCmd(0x1D, 0x21, 0x00));
  parts.push(hexCmd(0x1B, 0x45, 0x00));
  parts.push(hexCmd(0x1B, 0x61, 0x00));

  if (
    (data.loyaltyPointsEarned !== undefined && data.loyaltyPointsEarned > 0) ||
    (data.loyaltyPointsBalance !== undefined && data.loyaltyPointsBalance > 0)
  ) {
    parts.push(textToHex(SEP_SINGLE + "\n"));
    parts.push(hexCmd(0x1B, 0x45, 0x01));
    parts.push(textToHex("Fidelite / Points\n"));
    parts.push(hexCmd(0x1B, 0x45, 0x00));
    if (data.loyaltyPointsEarned !== undefined && data.loyaltyPointsEarned > 0) {
      parts.push(textToHex(padRow("Points gagnes:", "+" + data.loyaltyPointsEarned) + "\n"));
    }
    if (data.loyaltyPointsBalance !== undefined) {
      parts.push(textToHex(padRow("Solde:", String(data.loyaltyPointsBalance)) + "\n"));
    }
  }

  parts.push(textToHex(SEP_DOUBLE + "\n"));
  parts.push(hexCmd(0x1B, 0x61, 0x01));
  parts.push(textToHex("Merci de votre visite!\n"));
  parts.push(textToHex("Thank you for your visit!\n"));
  parts.push(textToHex("Tel: 0635198816\n"));
  parts.push(textToHex("IG: @pregasquad.women\n"));
  const now = new Date();
  parts.push(
    textToHex(
      now.toLocaleDateString("fr-FR") +
        " " +
        now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) +
        "\n"
    )
  );
  parts.push(textToHex("\n\n\n\n\n\n"));

  parts.push(hexCmd(0x1D, 0x56, 0x01));

  return parts.join("");
}

function padRow(label: string, value: string): string {
  const gap = LINE_WIDTH - label.length - value.length;
  if (gap > 0) {
    return label + " ".repeat(gap) + value;
  }
  return label + " " + value;
}

export async function silentPrint(data: SilentPrintData): Promise<boolean> {
  if (!isQzConnected()) return false;

  try {
    const config = qz.configs.create(printerName!);
    const hexData = buildReceiptHex(data);
    await qz.print(config, [{ type: "raw", format: "hex", data: hexData }]);
    return true;
  } catch (e) {
    console.error("QZ Tray print failed:", e);
    return false;
  }
}

interface ExpenseReceiptData {
  businessName: string;
  currency: string;
  expenseType: string;
  expenseName: string;
  amount: number;
  date: string;
}

function buildExpenseReceiptHex(data: ExpenseReceiptData): string {
  const parts: string[] = [];

  parts.push(hexCmd(0x1B, 0x40));

  parts.push(hexCmd(0x1B, 0x33, 0x16));

  parts.push(hexCmd(0x1B, 0x61, 0x01));
  parts.push(hexCmd(0x1D, 0x21, 0x11));
  parts.push(textToHex(data.businessName + "\n"));
  parts.push(hexCmd(0x1D, 0x21, 0x00));
  parts.push(textToHex(SEP_DOUBLE + "\n"));

  parts.push(hexCmd(0x1B, 0x61, 0x01));
  parts.push(hexCmd(0x1B, 0x45, 0x01));
  parts.push(textToHex("RECU DE DEPENSE\n"));
  parts.push(hexCmd(0x1B, 0x45, 0x00));
  parts.push(textToHex(SEP_SINGLE + "\n"));

  parts.push(hexCmd(0x1B, 0x61, 0x00));
  parts.push(textToHex(padRow("Date:", data.date) + "\n"));
  const now = new Date();
  const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  parts.push(textToHex(padRow("Heure:", timeStr) + "\n"));
  parts.push(textToHex(SEP_SINGLE + "\n"));

  parts.push(textToHex(padRow("Categorie:", data.expenseType) + "\n"));
  parts.push(textToHex(padRow("Description:", data.expenseName) + "\n"));
  parts.push(textToHex(SEP_DOUBLE + "\n"));

  parts.push(hexCmd(0x1B, 0x61, 0x01));
  parts.push(hexCmd(0x1B, 0x45, 0x01));
  parts.push(hexCmd(0x1D, 0x21, 0x11));
  parts.push(textToHex("MONTANT: " + data.amount.toFixed(2) + " " + data.currency + "\n"));
  parts.push(hexCmd(0x1D, 0x21, 0x00));
  parts.push(hexCmd(0x1B, 0x45, 0x00));
  parts.push(hexCmd(0x1B, 0x61, 0x00));

  parts.push(textToHex(SEP_DOUBLE + "\n"));
  parts.push(hexCmd(0x1B, 0x61, 0x01));
  parts.push(textToHex(now.toLocaleDateString("fr-FR") + " " + timeStr + "\n"));
  parts.push(textToHex("\n\n\n\n\n\n"));

  parts.push(hexCmd(0x1D, 0x56, 0x01));

  return parts.join("");
}

export async function silentPrintExpense(data: ExpenseReceiptData): Promise<boolean> {
  if (!isQzConnected()) return false;

  try {
    const config = qz.configs.create(printerName!);
    const hexData = buildExpenseReceiptHex(data);
    await qz.print(config, [{ type: "raw", format: "hex", data: hexData }]);
    return true;
  } catch (e) {
    console.error("QZ Tray expense print failed:", e);
    return false;
  }
}

let drawerInFlight = false;
export async function openCashDrawer(): Promise<boolean> {
  if (!isQzConnected()) return false;
  if (drawerInFlight) return false;
  drawerInFlight = true;
  try {
    const config = qz.configs.create(printerName!);
    const hexData = hexCmd(0x1B, 0x40) + hexCmd(0x1B, 0x70, 0x00, 0x19, 0xFA);
    await qz.print(config, [{ type: "raw", format: "hex", data: hexData }]);
    return true;
  } catch {
    return false;
  } finally {
    setTimeout(() => { drawerInFlight = false; }, 2000);
  }
}

function ensurePrintSocket(): Socket {
  if (!printSocket) {
    printSocket = io(window.location.origin, {
      transports: ["websocket", "polling"],
    });
    printSocket.on("print:station-status", (available: boolean) => {
      printStationAvailable = available;
    });
    printSocket.on("connect", () => {
      console.log("[print-relay] Socket connected:", printSocket?.id);
      if (stationRegistered) {
        if (isQzConnected()) {
          printSocket!.emit("print:register");
          bindStationListeners();
          console.log("[print-relay] Re-registered as print station after reconnect");
        } else {
          connectQz().then((ok) => {
            if (ok && printSocket?.connected) {
              printSocket.emit("print:register");
              bindStationListeners();
              console.log("[print-relay] Re-registered as print station after QZ reconnect");
            }
          }).catch(() => {});
        }
      }
    });
    printSocket.on("disconnect", () => {
      console.log("[print-relay] Socket disconnected");
      printStationAvailable = false;
    });
  }
  return printSocket;
}

export function initPrintSocket(): void {
  ensurePrintSocket();
}

function waitForSocketConnected(sock: Socket, timeoutMs: number): Promise<boolean> {
  if (sock.connected) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
    sock.once("connect", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

function bindStationListeners(): void {
  if (!printSocket) return;
  printSocket.off("print:execute-receipt");
  printSocket.off("print:execute-expense");
  printSocket.off("print:execute-drawer");

  printSocket.on("print:execute-receipt", async (data: SilentPrintData) => {
    console.log("[print-relay] Executing receipt print from relay");
    await silentPrint(data);
  });

  printSocket.on("print:execute-expense", async (data: ExpenseReceiptData) => {
    console.log("[print-relay] Executing expense print from relay");
    await silentPrintExpense(data);
  });

  printSocket.on("print:execute-drawer", async () => {
    console.log("[print-relay] Executing cash drawer from relay");
    await openCashDrawer();
  });
}

export function registerAsPrintStation(): void {
  if (stationRegistered) return;
  const sock = ensurePrintSocket();
  stationRegistered = true;
  sock.emit("print:register");
  console.log("[print-relay] Registered as print station");
  bindStationListeners();
}

export function unregisterPrintStation(): void {
  if (!stationRegistered || !printSocket) return;
  stationRegistered = false;
  printSocket.emit("print:unregister");
  printSocket.off("print:execute-receipt");
  printSocket.off("print:execute-expense");
  printSocket.off("print:execute-drawer");
}

export async function checkPrintStationAsync(): Promise<boolean> {
  const sock = ensurePrintSocket();
  const socketReady = await waitForSocketConnected(sock, 3000);
  if (!socketReady) {
    console.log("[print-relay] Socket connection timeout");
    return false;
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log("[print-relay] Station check timeout");
      resolve(false);
    }, 2000);
    sock.emit("print:check-station");
    sock.once("print:station-status", (available: boolean) => {
      clearTimeout(timeout);
      printStationAvailable = available;
      console.log("[print-relay] Station available:", available);
      resolve(available);
    });
  });
}

export async function remotePrint(data: SilentPrintData): Promise<boolean> {
  const sock = ensurePrintSocket();
  const ready = await waitForSocketConnected(sock, 3000);
  if (!ready) return false;
  console.log("[print-relay] Sending remote receipt print");
  sock.emit("print:remote-receipt", data);
  return true;
}

export async function remotePrintExpense(data: ExpenseReceiptData): Promise<boolean> {
  const sock = ensurePrintSocket();
  const ready = await waitForSocketConnected(sock, 3000);
  if (!ready) return false;
  console.log("[print-relay] Sending remote expense print");
  sock.emit("print:remote-expense", data);
  return true;
}

export async function remoteOpenDrawer(): Promise<boolean> {
  const sock = ensurePrintSocket();
  const ready = await waitForSocketConnected(sock, 3000);
  if (!ready) return false;
  console.log("[print-relay] Sending remote drawer open");
  sock.emit("print:remote-drawer");
  return true;
}
