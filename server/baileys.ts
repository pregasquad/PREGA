import path from "path";
import fs from "fs";

const AUTH_FOLDER = path.join(process.cwd(), "baileys_auth");
const CREDS_FILE = path.join(AUTH_FOLDER, "creds.json");

type Status = "disconnected" | "connecting" | "qr" | "pairing" | "open";

let sock: any = null;
let currentQRDataUrl: string | null = null;
let currentPairingCode: string | null = null;
let status: Status = "disconnected";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let shouldReconnect = false;
let socketIO: any = null;

export function setSocketIO(io: any): void {
  socketIO = io;
}

function log(msg: string) {
  console.log(`[Baileys] ${msg}`);
}

function hasExistingSession(): boolean {
  return fs.existsSync(CREDS_FILE);
}

function scheduleReconnect(delayMs = 15000) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (!shouldReconnect) return;
  reconnectTimer = setTimeout(() => {
    log(`Reconnecting in ${delayMs / 1000}s…`);
    connectSocket().catch((err) => log(`Reconnect failed: ${err.message}`));
  }, delayMs);
}

async function fetchVersionWithFallback() {
  const FALLBACK_VERSION: [number, number, number] = [2, 3000, 1023333143];
  try {
    const { fetchLatestBaileysVersion } = await import("@whiskeysockets/baileys");
    const result = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("version fetch timeout")), 8000)
      ),
    ]);
    return result;
  } catch (err: any) {
    log(`Using fallback WA version (${err.message})`);
    return { version: FALLBACK_VERSION, isLatest: false };
  }
}

async function connectSocket(pairingPhone?: string): Promise<void> {
  if (sock) {
    try { sock.end(); } catch {}
    sock = null;
  }

  // For pairing code flow: always start with a clean slate to avoid
  // "already registered" state from a broken old session
  if (pairingPhone) {
    try { fs.rmSync(AUTH_FOLDER, { recursive: true, force: true }); } catch {}
  }

  if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });

  const {
    useMultiFileAuthState,
    makeWASocket,
    makeCacheableSignalKeyStore,
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
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);

  // Pairing code mode: wait for socket to be ready, then request code
  if (pairingPhone) {
    status = "pairing";
    // Wait longer (6s) for the WA socket handshake to complete before requesting
    setTimeout(async () => {
      try {
        const cleanPhone = pairingPhone.replace(/[^0-9]/g, "");
        log(`Requesting pairing code for ${cleanPhone}…`);
        const code = await sock.requestPairingCode(cleanPhone);
        currentPairingCode = code;
        log(`Pairing code ready: ${code}`);
        if (socketIO) socketIO.emit("whatsapp:pairing_code", { code });
      } catch (err: any) {
        log(`Pairing code error: ${err.message}`);
        currentPairingCode = null;
        status = "disconnected";
        if (socketIO) socketIO.emit("whatsapp:pairing_error", { error: err.message });
      }
    }, 6000);
  }

  sock.ev.on("connection.update", async (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !pairingPhone) {
      status = "qr";
      try {
        const QRCode = await import("qrcode");
        currentQRDataUrl = await QRCode.default.toDataURL(qr, { width: 280, margin: 2 });
        log("QR code ready for scanning");
      } catch (err: any) {
        log(`QR generation error: ${err.message}`);
      }
    }

    if (connection === "open") {
      status = "open";
      currentQRDataUrl = null;
      currentPairingCode = null;
      shouldReconnect = true;
      const phone = sock?.user?.id?.split(":")[0] ?? "?";
      log(`Connected as +${phone}`);
      if (socketIO) socketIO.emit("whatsapp:connected", { phone });
    }

    if (connection === "close") {
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;
      const { DisconnectReason: DR } = await import("@whiskeysockets/baileys");
      const loggedOut = reason === DR.loggedOut;

      log(`Connection closed. Reason code: ${reason}. LoggedOut: ${loggedOut}`);
      status = "disconnected";
      sock = null;

      if (loggedOut) {
        shouldReconnect = false;
        try { fs.rmSync(AUTH_FOLDER, { recursive: true, force: true }); } catch {}
        log("Logged out — session cleared");
        if (socketIO) socketIO.emit("whatsapp:logged_out", {});
      } else {
        if (socketIO) socketIO.emit("whatsapp:disconnected", { reason });
        if (shouldReconnect) {
          // Only reconnect if we had an established session, back off generously
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
    log("No saved session — waiting for user to connect via QR or pairing code");
  }
}

/** Start a new connection and show a QR code */
export async function startQR(): Promise<void> {
  shouldReconnect = false;
  await connectSocket();
}

/** Start a new connection and return a pairing code for the given phone number */
export async function startPairingCode(phone: string): Promise<string> {
  shouldReconnect = false;
  await connectSocket(phone);
  // Wait up to 35 seconds for the pairing code (6s socket init + up to 29s for WA response)
  for (let i = 0; i < 70; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (currentPairingCode) return currentPairingCode;
    // If something went wrong and status flipped back to disconnected, fail fast
    if (status === "disconnected" && i > 14) {
      throw new Error("Connection failed — please try again");
    }
  }
  throw new Error("Timed out waiting for pairing code — please try again");
}

export function getQRDataUrl(): string | null { return currentQRDataUrl; }
export function getPairingCode(): string | null { return currentPairingCode; }

export function getStatus(): { status: Status; connected: boolean; phone?: string } {
  return {
    status,
    connected: status === "open",
    phone: sock?.user?.id?.split(":")[0] ?? undefined,
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
  try { fs.rmSync(AUTH_FOLDER, { recursive: true, force: true }); } catch {}
  status = "disconnected";
  currentQRDataUrl = null;
  currentPairingCode = null;
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
