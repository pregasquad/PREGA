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
  parts.push(hexCmd(0x1B, 0x70, 0x01, 0x19, 0xFA));

  parts.push(hexCmd(0x1B, 0x61, 0x01));
  parts.push(hexCmd(0x1D, 0x21, 0x11));
  parts.push(textToHex(data.businessName + "\n"));
  parts.push(hexCmd(0x1D, 0x21, 0x00));
  parts.push(textToHex(SEP_DOUBLE + "\n"));

  parts.push(hexCmd(0x1B, 0x61, 0x00));
  parts.push(textToHex(padRow("Date:", data.date) + "\n"));
  parts.push(textToHex(padRow("Heure:", data.time) + "\n"));
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

  parts.push(textToHex(padRow("Duree:", data.duration + " min") + "\n"));
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
  parts.push(textToHex("\n\n\n"));

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
  parts.push(textToHex("\n"));
  parts.push(textToHex(now.toLocaleDateString("fr-FR") + " " + timeStr + "\n"));
  parts.push(textToHex("\n\n\n\n"));

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

export async function openCashDrawer(): Promise<boolean> {
  if (!isQzConnected()) return false;
  try {
    const config = qz.configs.create(printerName!);
    const hexData = hexCmd(0x1B, 0x40) + hexCmd(0x1B, 0x70, 0x00, 0x19, 0xFA) + hexCmd(0x1B, 0x70, 0x01, 0x19, 0xFA);
    await qz.print(config, [{ type: "raw", format: "hex", data: hexData }]);
    return true;
  } catch {
    return false;
  }
}
