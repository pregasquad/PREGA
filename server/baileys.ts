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
let pairingRetryCount = 0;
const MAX_PAIRING_RETRIES = 2; // keep low — too many attempts triggers WhatsApp rate-limiting
let isVerifyingLink = false;   // true while we reconnect to check if phone confirmed the code

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
    // Short grace period so the WS close frame reaches WhatsApp before we
    // open a new connection with the same credentials.  Without this, WA can
    // see two simultaneous sessions and kick both with "device_removed".
    await new Promise((r) => setTimeout(r, 800));
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

  const pinoLogger = pino({ level: "warn" });
  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    logger: pinoLogger,
    browser: Browsers.macOS("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    keepAliveIntervalMs: 8_000,   // more frequent pings — Replit proxy drops idle WS fast
    connectTimeoutMs: 90_000,
    defaultQueryTimeoutMs: undefined,
    getMessage: async () => ({ conversation: "" }),
  });

  sock.ev.on("creds.update", saveCreds);

  // ── Pairing code flow ───────────────────────────────────────────────────
  if (pairingPhone) {
    status = "pairing";
    let cleanPhone = pairingPhone.replace(/[^0-9]/g, "");
    // Normalise to international format (handles Moroccan local numbers)
    if (cleanPhone.startsWith("00")) cleanPhone = cleanPhone.slice(2);
    if (cleanPhone.startsWith("0") && cleanPhone.length === 10) cleanPhone = "212" + cleanPhone.slice(1);
    if (cleanPhone.length === 9) cleanPhone = "212" + cleanPhone;
    const targetPhone = pairingPhone; // capture for closure checks
    let codeObtained = false;

    async function attemptPairingCode(trigger: string) {
      if (codeObtained) { log(`[${trigger}] Skip — code already obtained`); return; }
      if (!sock) { log(`[${trigger}] Skip — sock is null (connection dropped)`); return; }
      if (pendingPairingPhone !== targetPhone) { log(`[${trigger}] Skip — phone mismatch (pending=${pendingPairingPhone} target=${targetPhone})`); return; }

      log(`[${trigger}] Calling requestPairingCode for ${cleanPhone}…`);
      try {
        const code = await sock.requestPairingCode(cleanPhone);
        if (codeObtained) { log(`[${trigger}] Race: another trigger already got code`); return; }
        codeObtained = true;
        currentPairingCode = code;
        lastPairingError = null;
        log(`[${trigger}] Pairing code obtained: ${code}`);
        if (socketIO) socketIO.emit("whatsapp:pairing_code", { code });
      } catch (err: any) {
        log(`[${trigger}] requestPairingCode threw: ${err.message}`);
        lastPairingError = err.message;
      }
    }

    // Strategy 1: trigger as soon as the noise handshake completes ("connecting").
    // 500ms grace period — enough for the frame layer to be ready.
    const onConnecting = (update: any) => {
      if (update.connection === "connecting" && !codeObtained) {
        log(`Noise handshake done — requesting pairing code in 500ms for ${cleanPhone}`);
        setTimeout(() => attemptPairingCode("connecting-event"), 500);
      }
    };
    sock.ev.on("connection.update", onConnecting);

    // Strategy 2: fixed-delay fallbacks in case the "connecting" event fires late.
    [4000, 9000, 16000].forEach((ms) => {
      setTimeout(() => attemptPairingCode(`${ms / 1000}s-fallback`), ms);
    });

    // Strategy 3: final verdict after 30s.
    setTimeout(() => {
      if (!codeObtained && pendingPairingPhone === targetPhone) {
        const finalError = lastPairingError ?? "Timed out waiting for pairing code — please try again";
        log(`Pairing timed out. Last error: ${finalError}`);
        lastPairingError = finalError;
        status = "disconnected";
        pendingPairingPhone = null;
        if (socketIO) socketIO.emit("whatsapp:pairing_error", { error: finalError });
      }
    }, 30000);
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
      const errorMsg = (lastDisconnect?.error as any)?.message ?? "";
      const { DisconnectReason: DR } = await import("@whiskeysockets/baileys");
      const loggedOut = reason === DR.loggedOut;
      // Capture state BEFORE clearing so we can make the right decision below.
      const droppedPairingPhone = pendingPairingPhone;
      const hadCode = currentPairingCode !== null;
      const wasVerifying = isVerifyingLink;

      log(`Connection closed. Code: ${reason}. Pairing: ${!!droppedPairingPhone}. HadCode: ${hadCode}. Verifying: ${wasVerifying}. Retry: ${pairingRetryCount}/${MAX_PAIRING_RETRIES}. Error: "${errorMsg}"`);
      status = "disconnected";
      sock = null;
      pendingPairingPhone = null;
      currentPairingCode = null;
      isVerifyingLink = false;

      const isDeviceRemoved = errorMsg.toLowerCase().includes("conflict") || errorMsg.toLowerCase().includes("device_removed");

      if (loggedOut && !wasVerifying) {
        // Genuine logout / device removal — wipe session
        shouldReconnect = false;
        pairingRetryCount = 0;
        wipeAuth();
        if (isDeviceRemoved) {
          log("Device removed by WhatsApp — session cleared");
          if (socketIO) socketIO.emit("whatsapp:logged_out", { reason: "device_removed" });
        } else {
          log("Logged out — session cleared");
          if (socketIO) socketIO.emit("whatsapp:logged_out", { reason: "logged_out" });
        }
      } else if (loggedOut && wasVerifying) {
        // 401 during link-verification → phone didn't accept the code.
        // Wipe partial creds and let user try a fresh code.
        pairingRetryCount = 0;
        wipeAuth();
        log("Phone did not confirm the pairing code — session reset. User should request a new code.");
        if (socketIO) socketIO.emit("whatsapp:pairing_dropped", { reason: "Phone did not accept the code. Please try again." });
      } else if (droppedPairingPhone && hadCode) {
        // ── Code was shown; WhatsApp closed the pairing WS (expected after IQ is sent) ──
        // DO NOT wipe auth and do NOT auto-generate a new code — that causes rate-limiting.
        // Wait quietly, then attempt ONE reconnect with the saved creds.
        // If the phone confirmed → "open". If not yet → show the code again and wait.
        pairingRetryCount = 0;
        isVerifyingLink = true;
        shouldReconnect = false;
        log("Code was shown — WS dropped (expected). Keeping code visible. Will check if phone confirmed in 15s…");
        // Do NOT emit anything — the frontend already has the code from the pairing_code event.
        // It will keep showing it while isWaitingForCode stays false (code already displayed).
        setTimeout(() => {
          if (!isVerifyingLink) return; // user already clicked "try again"
          log("Attempting silent reconnect to verify link acceptance…");
          connectSocket().catch((err) => {
            isVerifyingLink = false;
            log(`Verify-reconnect failed: ${err.message}`);
          });
        }, 15_000);
      } else if (droppedPairingPhone && !hadCode && pairingRetryCount < MAX_PAIRING_RETRIES) {
        // No code obtained before drop → retry with delay (rate-limit protection)
        pairingRetryCount++;
        const delay = 5000 + pairingRetryCount * 4000; // 9s, 13s
        log(`No code obtained — pairing retry ${pairingRetryCount}/${MAX_PAIRING_RETRIES} in ${delay / 1000}s…`);
        if (socketIO) socketIO.emit("whatsapp:pairing_refreshing", { attempt: pairingRetryCount });
        setTimeout(() => {
          connectSocket(droppedPairingPhone).catch((err) =>
            log(`Auto-retry pairing failed: ${err.message}`)
          );
        }, delay);
      } else if (droppedPairingPhone && !hadCode) {
        pairingRetryCount = 0;
        log("Pairing failed — could not obtain code after retries");
        if (socketIO) socketIO.emit("whatsapp:pairing_dropped", { reason: "WhatsApp did not send a code. Wait a few minutes and try again, or use QR code." });
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
  isVerifyingLink = false;
  connectSocket().catch((err) => log(`startQR error: ${err.message}`));
}

/** Start pairing code flow — fully non-blocking. Code appears via getPairingCode() / polling. */
export function startPairingCode(phone: string): void {
  shouldReconnect = false;
  pairingRetryCount = 0;
  isVerifyingLink = false;
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
