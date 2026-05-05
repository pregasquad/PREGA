import path from "path";
import fs from "fs";

const AUTH_FOLDER = path.join(process.cwd(), "baileys_auth");
const CREDS_FILE = path.join(AUTH_FOLDER, "creds.json");

type Status = "disconnected" | "connecting" | "qr" | "pairing" | "open";

let sock: any = null;
let currentQRDataUrl: string | null = null;
let currentPairingCode: string | null = null;
let lastPairingError: string | null = null;
let status: Status = "disconnected";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let shouldReconnect = false;
let socketIO: any = null;
let pendingPairingPhone: string | null = null;

export function setSocketIO(io: any): void {
  socketIO = io;
}

function log(msg: string) {
  console.log(`[Baileys] ${msg}`);
}

function hasExistingSession(): boolean {
  return fs.existsSync(CREDS_FILE);
}

function wipeAuth() {
  try { fs.rmSync(AUTH_FOLDER, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(AUTH_FOLDER, { recursive: true });
}

function scheduleReconnect(delayMs = 20000) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (!shouldReconnect) return;
  reconnectTimer = setTimeout(() => {
    log("Reconnecting…");
    connectSocket().catch((err) => log(`Reconnect failed: ${err.message}`));
  }, delayMs);
}

async function fetchVersionWithFallback() {
  // This version was verified working on Replit — update if WhatsApp rejects connections
  const FALLBACK_VERSION: [number, number, number] = [2, 3000, 1035194821];
  try {
    const { fetchLatestBaileysVersion } = await import("@whiskeysockets/baileys");
    const result = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 15000)
      ),
    ]);
    log(`WA version: ${result.version.join(".")} (latest: ${result.isLatest})`);
    return result;
  } catch (err: any) {
    log(`Using fallback WA version ${FALLBACK_VERSION.join(".")} (${err.message})`);
    return { version: FALLBACK_VERSION, isLatest: false };
  }
}

async function connectSocket(pairingPhone?: string): Promise<void> {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  if (sock) {
    try { sock.end(); } catch {}
    sock = null;
  }

  // Always start with a clean slate when pairing.
  // Leftover partial credentials from a previous failed attempt will cause the
  // socket to try logging in as an already-linked device, which fails silently.
  if (pairingPhone) {
    log("Pairing requested — clearing auth for fresh start");
    wipeAuth();
    pendingPairingPhone = pairingPhone;
    lastPairingError = null;
  } else {
    if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });
  }

  const {
    useMultiFileAuthState,
    makeWASocket,
    makeCacheableSignalKeyStore,
    Browsers,
  } = await import("@whiskeysockets/baileys");
  const pino = (await import("pino")).default;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchVersionWithFallback();

  status = "connecting";
  currentQRDataUrl = null;
  currentPairingCode = null;

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    logger: pino({ level: "silent" }),
    browser: Browsers.macOS("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);

  // ── Pairing code flow ───────────────────────────────────────────────────
  if (pairingPhone) {
    status = "pairing";
    const cleanPhone = pairingPhone.replace(/[^0-9]/g, "");
    const targetPhone = pairingPhone; // capture for closure checks
    let codeObtained = false;

    async function attemptPairingCode(trigger: string) {
      if (codeObtained) return;
      if (!sock || pendingPairingPhone !== targetPhone) return;

      log(`[${trigger}] Requesting pairing code for ${cleanPhone}…`);
      try {
        const code = await sock.requestPairingCode(cleanPhone);
        if (codeObtained) return; // race: another trigger already got it
        codeObtained = true;
        currentPairingCode = code;
        lastPairingError = null;
        log(`Pairing code ready: ${code}`);
        if (socketIO) socketIO.emit("whatsapp:pairing_code", { code });
      } catch (err: any) {
        // Log but do NOT surface yet — a later trigger may still succeed
        log(`[${trigger}] Pairing attempt failed: ${err.message}`);
        lastPairingError = err.message; // track last known error for diagnostics
      }
    }

    // Strategy 1: trigger when Baileys emits "connecting" (noise handshake done)
    const onConnecting = (update: any) => {
      if (update.connection === "connecting" && !codeObtained) {
        setTimeout(() => attemptPairingCode("connecting-event"), 300);
      }
    };
    sock.ev.on("connection.update", onConnecting);

    // Strategy 2: fixed-delay fallback triggers
    [3000, 6000, 9000].forEach((ms) => {
      setTimeout(() => attemptPairingCode(`${ms / 1000}s-fallback`), ms);
    });

    // Strategy 3: final verdict after 14s — if nothing worked, surface the error
    setTimeout(() => {
      if (!codeObtained && pendingPairingPhone === targetPhone) {
        const finalError = lastPairingError ?? "Timed out waiting for pairing code";
        log(`Pairing failed after all attempts: ${finalError}`);
        lastPairingError = finalError;
        status = "disconnected";
        pendingPairingPhone = null;
        if (socketIO) socketIO.emit("whatsapp:pairing_error", { error: finalError });
      }
    }, 14000);
  }

  // ── Connection event handler ─────────────────────────────────────────────
  sock.ev.on("connection.update", async (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !pendingPairingPhone) {
      status = "qr";
      try {
        const QRCode = await import("qrcode");
        currentQRDataUrl = await QRCode.default.toDataURL(qr, { width: 280, margin: 2 });
        log("QR code ready");
      } catch (err: any) {
        log(`QR error: ${err.message}`);
      }
    }

    if (connection === "open") {
      status = "open";
      currentQRDataUrl = null;
      currentPairingCode = null;
      pendingPairingPhone = null;
      lastPairingError = null;
      shouldReconnect = true;
      const phone = sock?.user?.id?.split(":")[0] ?? "?";
      log(`Connected as +${phone}`);
      if (socketIO) socketIO.emit("whatsapp:connected", { phone });
    }

    if (connection === "close") {
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;
      const { DisconnectReason: DR } = await import("@whiskeysockets/baileys");
      const loggedOut = reason === DR.loggedOut;

      log(`Connection closed. Code: ${reason}. LoggedOut: ${loggedOut}`);
      status = "disconnected";
      sock = null;
      pendingPairingPhone = null;

      if (loggedOut) {
        shouldReconnect = false;
        wipeAuth();
        log("Logged out — session cleared");
        if (socketIO) socketIO.emit("whatsapp:logged_out", {});
      } else {
        if (socketIO) socketIO.emit("whatsapp:disconnected", { reason });
        if (shouldReconnect) {
          scheduleReconnect(20000);
        }
      }
    }
  });
}

/** Called at server start — only connects if a saved session exists */
export async function initBaileys(): Promise<void> {
  if (hasExistingSession()) {
    log("Existing session found — connecting…");
    shouldReconnect = true;
    await connectSocket();
  } else {
    log("No saved session — waiting for user to connect");
  }
}

/** Start QR flow — non-blocking */
export function startQR(): void {
  shouldReconnect = false;
  pendingPairingPhone = null;
  connectSocket().catch((err) => log(`startQR error: ${err.message}`));
}

/** Start pairing code flow — fully non-blocking. Code appears via getPairingCode() / polling. */
export function startPairingCode(phone: string): void {
  shouldReconnect = false;
  connectSocket(phone).catch((err) => log(`startPairingCode error: ${err.message}`));
}

export function getQRDataUrl(): string | null { return currentQRDataUrl; }
export function getPairingCode(): string | null { return currentPairingCode; }
export function getLastPairingError(): string | null { return lastPairingError; }

export function getStatus(): {
  status: Status;
  connected: boolean;
  phone?: string;
  pairingCode?: string;
  pairingError?: string;
} {
  return {
    status,
    connected: status === "open",
    phone: sock?.user?.id?.split(":")[0] ?? undefined,
    pairingCode: currentPairingCode ?? undefined,
    pairingError: lastPairingError ?? undefined,
  };
}

function formatJid(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("00")) cleaned = cleaned.slice(2);
  if (cleaned.startsWith("0") && cleaned.length === 10) cleaned = "212" + cleaned.slice(1);
  if (cleaned.length === 9) cleaned = "212" + cleaned;
  return cleaned + "@s.whatsapp.net";
}

export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!sock || status !== "open") {
    return { success: false, error: "WhatsApp not connected. Please link your phone first." };
  }
  try {
    const jid = formatJid(to);
    const result = await sock.sendMessage(jid, { text: message });
    return { success: true, messageId: result?.key?.id };
  } catch (err: any) {
    log(`Send error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

export async function sendWhatsAppImage(
  to: string,
  imageUrl: string,
  caption?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!sock || status !== "open") return { success: false, error: "WhatsApp not connected" };
  try {
    const jid = formatJid(to);
    const result = await sock.sendMessage(jid, { image: { url: imageUrl }, caption: caption || "" });
    return { success: true, messageId: result?.key?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function disconnect(): Promise<void> {
  shouldReconnect = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (sock) {
    try { await sock.logout(); } catch {}
    try { sock.end(); } catch {}
    sock = null;
  }
  wipeAuth();
  status = "disconnected";
  currentQRDataUrl = null;
  currentPairingCode = null;
  pendingPairingPhone = null;
  lastPairingError = null;
  log("Disconnected and session cleared");
}

export async function reconnect(): Promise<void> {
  shouldReconnect = true;
  await connectSocket();
}

export async function sendAppointmentReminder(
  clientPhone: string, clientName: string, appointmentDate: string,
  appointmentTime: string, serviceName: string, salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || "PREGASQUAD";
  const msg = `مرحباً ${clientName}! 💇‍♀️\n\n⏳ تذكير: موعدك بعد قليل!\n\n📅 التاريخ: ${appointmentDate}\n⏰ الوقت: ${appointmentTime}\n💅 الخدمة: ${serviceName}\n\nنتطلع لرؤيتك في ${salon}! 🌸`;
  return sendWhatsAppMessage(clientPhone, msg);
}

export async function sendBookingConfirmation(
  clientPhone: string, clientName: string, appointmentDate: string,
  appointmentTime: string, serviceName: string, salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || "PREGASQUAD";
  const msg = `مرحباً ${clientName}! ✨\n\nتم تأكيد حجزك بنجاح:\n📅 التاريخ: ${appointmentDate}\n⏰ الوقت: ${appointmentTime}\n💅 الخدمة: ${serviceName}\n\nشكراً لاختيارك ${salon}! 💕`;
  return sendWhatsAppMessage(clientPhone, msg);
}

export async function sendWaitlistNotification(
  clientPhone: string, clientName: string, availableDate: string,
  availableTime: string, salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || "PREGASQUAD";
  const msg = `مرحباً ${clientName}! 🎉\n\nأخبار سارة! أصبح لدينا موعد متاح:\n📅 التاريخ: ${availableDate}\n⏰ الوقت: ${availableTime}\n\n${salon} 💕`;
  return sendWhatsAppMessage(clientPhone, msg);
}

export async function sendGiftCardNotification(
  recipientPhone: string, recipientName: string, giftCardCode: string,
  amount: number, senderName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const from = senderName ? `من ${senderName}` : "";
  const msg = `مرحباً ${recipientName}! 🎁\n\nلقد تلقيت بطاقة هدية ${from}!\n💳 رمز البطاقة: ${giftCardCode}\n💰 القيمة: ${amount} درهم\n\nيمكنك استخدام هذه البطاقة في موعدك القادم. 💕`;
  return sendWhatsAppMessage(recipientPhone, msg);
}

export async function getConnectionStatus(): Promise<{ connected: boolean; status?: string; error?: string }> {
  const s = getStatus();
  return { connected: s.connected, status: s.status };
}
