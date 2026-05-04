import path from "path";
import fs from "fs";

const AUTH_FOLDER = path.join(process.cwd(), "baileys_auth");

type Status = "disconnected" | "connecting" | "qr" | "open";

let sock: any = null;
let currentQRDataUrl: string | null = null;
let status: Status = "disconnected";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let shouldReconnect = true;

function log(msg: string) {
  console.log(`[Baileys] ${msg}`);
}

function scheduleReconnect(delayMs = 5000) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (!shouldReconnect) return;
  reconnectTimer = setTimeout(() => {
    log("Reconnecting…");
    initBaileys().catch((err) => log(`Reconnect failed: ${err.message}`));
  }, delayMs);
}

export async function initBaileys(): Promise<void> {
  try {
    if (sock) {
      try { sock.end(); } catch {}
      sock = null;
    }

    if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });

    const { useMultiFileAuthState, makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = await import("@whiskeysockets/baileys");
    const { Boom } = await import("@hapi/boom");
    const pino = (await import("pino")).default;
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();

    status = "connecting";
    currentQRDataUrl = null;

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

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        status = "qr";
        try {
          const QRCode = await import("qrcode");
          currentQRDataUrl = await QRCode.default.toDataURL(qr, { width: 300, margin: 2 });
          log("QR code ready for scanning");
        } catch (err: any) {
          log(`QR code generation error: ${err.message}`);
        }
      }

      if (connection === "open") {
        status = "open";
        currentQRDataUrl = null;
        log("Connected to WhatsApp");
      }

      if (connection === "close") {
        const reason = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = reason === DisconnectReason.loggedOut;
        log(`Connection closed. Reason: ${reason}. Logged out: ${loggedOut}`);
        status = "disconnected";
        sock = null;

        if (loggedOut) {
          shouldReconnect = false;
          try { fs.rmSync(AUTH_FOLDER, { recursive: true, force: true }); } catch {}
          log("Logged out — session cleared");
        } else {
          scheduleReconnect(5000);
        }
      }
    });
  } catch (err: any) {
    log(`Init error: ${err.message}`);
    status = "disconnected";
    scheduleReconnect(10000);
  }
}

export function getQRDataUrl(): string | null {
  return currentQRDataUrl;
}

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
    return { success: false, error: "WhatsApp not connected. Please scan the QR code first." };
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
  if (!sock || status !== "open") {
    return { success: false, error: "WhatsApp not connected" };
  }
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
  log("Disconnected and session cleared");
}

export async function reconnect(): Promise<void> {
  shouldReconnect = true;
  await initBaileys();
}

export async function sendAppointmentReminder(
  clientPhone: string,
  clientName: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName: string,
  salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || "PREGASQUAD";
  const message = `مرحباً ${clientName}! 💇‍♀️\n\n⏳ تذكير: موعدك بعد قليل!\n\n📅 التاريخ: ${appointmentDate}\n⏰ الوقت: ${appointmentTime}\n💅 الخدمة: ${serviceName}\n\nنتطلع لرؤيتك في ${salon}! 🌸`;
  return sendWhatsAppMessage(clientPhone, message);
}

export async function sendBookingConfirmation(
  clientPhone: string,
  clientName: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName: string,
  salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || "PREGASQUAD";
  const message = `مرحباً ${clientName}! ✨\n\nتم تأكيد حجزك بنجاح:\n📅 التاريخ: ${appointmentDate}\n⏰ الوقت: ${appointmentTime}\n💅 الخدمة: ${serviceName}\n\nشكراً لاختيارك ${salon}! 💕`;
  return sendWhatsAppMessage(clientPhone, message);
}

export async function sendWaitlistNotification(
  clientPhone: string,
  clientName: string,
  availableDate: string,
  availableTime: string,
  salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || "PREGASQUAD";
  const message = `مرحباً ${clientName}! 🎉\n\nأخبار سارة! أصبح لدينا موعد متاح:\n📅 التاريخ: ${availableDate}\n⏰ الوقت: ${availableTime}\n\n${salon} 💕`;
  return sendWhatsAppMessage(clientPhone, message);
}

export async function sendGiftCardNotification(
  recipientPhone: string,
  recipientName: string,
  giftCardCode: string,
  amount: number,
  senderName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const from = senderName ? `من ${senderName}` : "";
  const message = `مرحباً ${recipientName}! 🎁\n\nلقد تلقيت بطاقة هدية ${from}!\n💳 رمز البطاقة: ${giftCardCode}\n💰 القيمة: ${amount} درهم\n\nيمكنك استخدام هذه البطاقة في موعدك القادم. 💕`;
  return sendWhatsAppMessage(recipientPhone, message);
}

export async function getConnectionStatus(): Promise<{ connected: boolean; status?: string; error?: string }> {
  const s = getStatus();
  return { connected: s.connected, status: s.status };
}
