/**
 * server/baileys.ts
 *
 * WhatsApp integration via @whiskeysockets/baileys (free, open-source).
 *
 * Key design decisions:
 *  - Sessions are stored in the `baileys_sessions` DB table (not filesystem)
 *    so they survive Koyeb's ephemeral container restarts.
 *  - 401/403/405 are treated as PERMANENT failures — session is cleared and
 *    no further reconnect attempts are made (prevents the infinite 401 loop).
 *  - Auto-connect is skipped on Replit dev (routes.ts guards with REPL_ID).
 *  - Socket.IO is used to push QR/pairing/status events to the frontend.
 */

import { Server as SocketIOServer } from "socket.io";
import { pool, dbDialect } from "./db";

// ── Status codes that mean the session is permanently revoked ────────────────
const PERMANENT_FAILURE_CODES = new Set([401, 403, 405]);
const MAX_RECONNECT_ATTEMPTS = 5;

// ── Module-level state ───────────────────────────────────────────────────────
let sock: any = null;
let currentQRDataUrl: string | null = null;
let currentPairingCode: string | null = null;
let pairingCodeExpiresAt: number | null = null;
let lastPairingError: string | null = null;
let status: "disconnected" | "connecting" | "qr" | "pairing" | "open" = "disconnected";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let shouldReconnect = false;
let reconnectAttempt = 0;
let ioInstance: SocketIOServer | null = null;
let incomingMessageHandler: ((jid: string, phone: string, text: string, imageBase64?: string, imageMimeType?: string, isVoice?: boolean) => Promise<void>) | null = null;

function log(msg: string) {
  console.log(`[Baileys] ${msg}`);
}

function emitStatus() {
  if (ioInstance) {
    ioInstance.emit("whatsapp:status", {
      status,
      connected: status === "open",
      phone: sock?.user?.id?.split(":")[0] ?? undefined,
      qr: currentQRDataUrl,
      pairingCode: currentPairingCode,
      pairingCodeExpiresAt,
      pairingError: lastPairingError,
    });
  }
}

// ── DB-backed auth state ─────────────────────────────────────────────────────

async function dbGet(id: string): Promise<any | null> {
  try {
    if (dbDialect === "mysql") {
      const conn = await pool.getConnection();
      const [rows]: any = await conn.query(
        "SELECT data FROM baileys_sessions WHERE id = ? LIMIT 1",
        [id]
      );
      conn.release();
      if (Array.isArray(rows) && rows.length > 0) return JSON.parse(rows[0].data);
    } else {
      const r = await pool.query("SELECT data FROM baileys_sessions WHERE id = $1 LIMIT 1", [id]);
      if (r.rows && r.rows.length > 0) return JSON.parse(r.rows[0].data);
    }
  } catch {}
  return null;
}

async function dbSet(id: string, value: any): Promise<void> {
  const data = JSON.stringify(value);
  try {
    if (dbDialect === "mysql") {
      const conn = await pool.getConnection();
      await conn.query(
        "INSERT INTO baileys_sessions (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP",
        [id, data]
      );
      conn.release();
    } else {
      await pool.query(
        `INSERT INTO baileys_sessions (id, data) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [id, data]
      );
    }
  } catch (e: any) {
    log(`DB set error (${id}): ${e.message}`);
  }
}

async function dbDel(id: string): Promise<void> {
  try {
    if (dbDialect === "mysql") {
      const conn = await pool.getConnection();
      await conn.query("DELETE FROM baileys_sessions WHERE id = ?", [id]);
      conn.release();
    } else {
      await pool.query("DELETE FROM baileys_sessions WHERE id = $1", [id]);
    }
  } catch {}
}

async function dbDelAll(): Promise<void> {
  try {
    if (dbDialect === "mysql") {
      const conn = await pool.getConnection();
      await conn.query("DELETE FROM baileys_sessions");
      conn.release();
    } else {
      await pool.query("DELETE FROM baileys_sessions");
    }
  } catch {}
}

async function dbHasSession(): Promise<boolean> {
  try {
    if (dbDialect === "mysql") {
      const conn = await pool.getConnection();
      const [rows]: any = await conn.query(
        "SELECT id FROM baileys_sessions WHERE id = 'creds' LIMIT 1"
      );
      conn.release();
      return Array.isArray(rows) && rows.length > 0;
    } else {
      const r = await pool.query(
        "SELECT id FROM baileys_sessions WHERE id = 'creds' LIMIT 1"
      );
      return r.rows && r.rows.length > 0;
    }
  } catch {}
  return false;
}

/** Custom DB-backed auth state (replaces useMultiFileAuthState) */
async function useDatabaseAuthState() {
  const { initAuthCreds, BufferJSON, proto } = await import("@whiskeysockets/baileys");

  let creds = await dbGet("creds");
  if (!creds) creds = initAuthCreds();

  const keys: any = {};

  const state = {
    creds,
    keys: {
      get: async (type: string, ids: string[]) => {
        const data: any = {};
        for (const id of ids) {
          let value = keys[`${type}-${id}`] ?? (await dbGet(`key-${type}-${id}`));
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          data[id] = value;
        }
        return data;
      },
      set: async (dataMap: any) => {
        const writes: Promise<void>[] = [];
        for (const [type, ids] of Object.entries(dataMap)) {
          for (const [id, value] of Object.entries(ids as any)) {
            const k = `key-${type}-${id}`;
            keys[`${type}-${id}`] = value;
            if (value) {
              writes.push(dbSet(k, value));
            } else {
              writes.push(dbDel(k));
            }
          }
        }
        await Promise.all(writes);
      },
    },
  };

  const saveCreds = async () => {
    await dbSet("creds", state.creds);
  };

  return { state, saveCreds };
}

// ── Session management ───────────────────────────────────────────────────────

async function clearSession() {
  currentQRDataUrl = null;
  currentPairingCode = null;
  pairingCodeExpiresAt = null;
  lastPairingError = null;
  await dbDelAll();
  log("Session cleared from DB");
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (!shouldReconnect) return;

  reconnectAttempt++;
  if (reconnectAttempt > MAX_RECONNECT_ATTEMPTS) {
    log(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached — giving up. Re-link via the WhatsApp page.`);
    shouldReconnect = false;
    status = "disconnected";
    emitStatus();
    return;
  }

  const delayMs = Math.min(10_000 * Math.pow(2, reconnectAttempt - 1), 180_000);
  log(`Reconnect attempt ${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS} in ${delayMs / 1000}s…`);

  reconnectTimer = setTimeout(() => {
    connectSocket().catch(err => log(`Reconnect failed: ${err.message}`));
  }, delayMs);
}

async function connectSocket(pairingPhone?: string): Promise<void> {
  if (sock) { try { sock.end(); } catch {} sock = null; }

  const {
    makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
  } = await import("@whiskeysockets/baileys");
  const pino = (await import("pino")).default;

  const { state, saveCreds } = await useDatabaseAuthState();
  const { version, isLatest } = await fetchLatestBaileysVersion();

  log(`Connecting… WA version: ${version} (latest: ${isLatest})`);
  status = "connecting";
  currentQRDataUrl = null;
  currentPairingCode = null;
  pairingCodeExpiresAt = null;
  lastPairingError = null;
  emitStatus();

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
    connectTimeoutMs: 30_000,
    keepAliveIntervalMs: 30_000,
    retryRequestDelayMs: 5_000,
  });

  sock.ev.on("creds.update", saveCreds);

  // Pairing code mode
  if (pairingPhone && !state.creds.registered) {
    status = "pairing";
    emitStatus();
    setTimeout(async () => {
      try {
        const cleanPhone = pairingPhone.replace(/[^0-9]/g, "");
        const code: string = await sock.requestPairingCode(cleanPhone);
        currentPairingCode = code;
        pairingCodeExpiresAt = Date.now() + 60_000; // codes expire in ~60 s
        lastPairingError = null;
        log(`Pairing code issued: ${code}`);
        emitStatus();
      } catch (err: any) {
        lastPairingError = err.message;
        log(`Pairing code error: ${err.message}`);
        emitStatus();
      }
    }, 3_000);
  }

  sock.ev.on("connection.update", async (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !pairingPhone) {
      status = "qr";
      try {
        const QRCode = await import("qrcode");
        currentQRDataUrl = await QRCode.default.toDataURL(qr, { width: 280, margin: 2 });
        log("QR code ready for scanning");
        emitStatus();
      } catch (err: any) {
        log(`QR error: ${err.message}`);
      }
    }

    if (connection === "open") {
      status = "open";
      currentQRDataUrl = null;
      currentPairingCode = null;
      pairingCodeExpiresAt = null;
      reconnectAttempt = 0;
      shouldReconnect = true;
      log(`Connected as +${sock?.user?.id?.split(":")[0] ?? "?"}`);
      emitStatus();
    }

    if (connection === "close") {
      const raw = lastDisconnect?.error;
      const code: number =
        (raw as any)?.output?.statusCode ?? (raw as any)?.statusCode ?? 0;
      const message: string =
        (raw as any)?.output?.payload?.message ??
        (raw as any)?.message ??
        String(raw ?? "unknown");

      log(`Connection closed. Code: ${code}. Message: "${message}"`);
      status = "disconnected";
      sock = null;
      emitStatus();

      if (PERMANENT_FAILURE_CODES.has(code)) {
        log(`Permanent auth failure (${code}) — clearing session. Please re-link via the WhatsApp page.`);
        shouldReconnect = false;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        await clearSession();
        emitStatus();
      } else if (shouldReconnect) {
        scheduleReconnect();
      } else {
        log("Not reconnecting (shouldReconnect=false)");
      }
    }
  });

  // Incoming message handler
  sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
    if (type !== "notify") return;
    if (!incomingMessageHandler) return;

    for (const msg of messages) {
      if (msg.key?.fromMe) continue;
      const remoteJid: string = msg.key?.remoteJid ?? "";
      if (!remoteJid) continue;

      // Extract phone number from JID
      const phone = remoteJid.replace(/@.*$/, "").replace(/[^0-9]/g, "");

      let text = "";
      let imageBase64: string | undefined;
      let imageMimeType: string | undefined;
      let isVoice = false;

      const m = msg.message;
      if (!m) continue;

      if (m.conversation) {
        text = m.conversation;
      } else if (m.extendedTextMessage?.text) {
        text = m.extendedTextMessage.text;
      } else if (m.imageMessage) {
        text = m.imageMessage.caption || "";
        try {
          const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
          const buffer = await downloadMediaMessage(msg, "buffer", {});
          imageBase64 = (buffer as Buffer).toString("base64");
          imageMimeType = m.imageMessage.mimetype || "image/jpeg";
        } catch (e: any) {
          log(`Image download error: ${e.message}`);
        }
      } else if (m.audioMessage) {
        isVoice = m.audioMessage.ptt === true;
        text = "[voice message]";
      } else if (m.documentMessage) {
        text = m.documentMessage.caption || m.documentMessage.fileName || "[document]";
      } else if (m.stickerMessage) {
        text = "[sticker]";
      }

      try {
        await incomingMessageHandler(remoteJid, phone, text, imageBase64, imageMimeType, isVoice);
      } catch (e: any) {
        log(`Incoming handler error: ${e.message}`);
      }
    }
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Receives the Socket.IO server instance for real-time frontend updates */
export function setSocketIO(io: SocketIOServer): void {
  ioInstance = io;
}

/** Registers the handler called for every incoming WhatsApp message */
export function setIncomingMessageHandler(
  handler: (jid: string, phone: string, text: string, imageBase64?: string, imageMimeType?: string, isVoice?: boolean) => Promise<void>
): void {
  incomingMessageHandler = handler;
}

/** Called at server start — only connects if a saved DB session exists */
export async function initBaileys(): Promise<void> {
  const hasSession = await dbHasSession();
  if (hasSession) {
    log("Saved session found in DB — reconnecting…");
    shouldReconnect = true;
    reconnectAttempt = 0;
    await connectSocket();
  } else {
    log("No saved session — waiting for user to connect via QR or pairing code");
  }
}

/** Start a fresh QR-code connection */
export async function startQR(): Promise<void> {
  shouldReconnect = false;
  reconnectAttempt = 0;
  connectSocket().catch(err => log(`startQR error: ${err.message}`));
}

/** Start a pairing-code connection for the given phone number (non-blocking) */
export async function startPairingCode(phone: string): Promise<void> {
  shouldReconnect = false;
  reconnectAttempt = 0;
  lastPairingError = null;
  connectSocket(phone).catch(err => log(`startPairingCode error: ${err.message}`));
}

export function getQRDataUrl(): string | null { return currentQRDataUrl; }
export function getPairingCode(): string | null { return currentPairingCode; }
export function getPairingCodeExpiresAt(): number | null { return pairingCodeExpiresAt; }
export function getLastPairingError(): string | null { return lastPairingError; }

export function getStatus(): { status: string; connected: boolean; phone?: string } {
  return {
    status,
    connected: status === "open",
    phone: sock?.user?.id?.split(":")[0] ?? undefined,
  };
}

export async function reconnect(): Promise<void> {
  shouldReconnect = true;
  reconnectAttempt = 0;
  await connectSocket();
}

export async function disconnect(): Promise<void> {
  shouldReconnect = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (sock) {
    try { await sock.logout(); } catch {}
    try { sock.end(); } catch {}
    sock = null;
  }
  await clearSession();
  status = "disconnected";
  emitStatus();
  log("Disconnected and session cleared");
}

/** Clears the session only when not currently connected (safe for the UI reset button) */
export function clearSessionIfDisconnected(): void {
  if (status !== "open") {
    clearSession().catch(err => log(`clearSession error: ${err.message}`));
    status = "disconnected";
    emitStatus();
    log("Session cleared (was not connected)");
  } else {
    log("clearSessionIfDisconnected: skipped — currently connected");
  }
}

// ── JID / phone helpers ──────────────────────────────────────────────────────

function formatJid(phone: string): string {
  let n = phone.replace(/[^0-9]/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("0") && n.length === 10) n = "212" + n.slice(1);
  if (n.length === 9) n = "212" + n;
  return n + "@s.whatsapp.net";
}

// ── Presence helpers ─────────────────────────────────────────────────────────

export async function sendTypingPresence(jid: string): Promise<void> {
  if (!sock || status !== "open") return;
  try { await sock.sendPresenceUpdate("composing", jid); } catch {}
}

export async function stopTypingPresence(jid: string): Promise<void> {
  if (!sock || status !== "open") return;
  try { await sock.sendPresenceUpdate("paused", jid); } catch {}
}

// ── Message senders ──────────────────────────────────────────────────────────

export async function sendWhatsAppMessage(
  to: string, message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!sock || status !== "open")
    return { success: false, error: "WhatsApp not connected. Please link your phone first." };
  try {
    // Accept both raw phone numbers and full JIDs (jid already contains @)
    const jid = to.includes("@") ? to : formatJid(to);
    const result = await sock.sendMessage(jid, { text: message });
    return { success: true, messageId: result?.key?.id };
  } catch (err: any) {
    log(`Send error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

export async function sendWhatsAppImage(
  to: string, imageUrl: string, caption?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!sock || status !== "open") return { success: false, error: "WhatsApp not connected" };
  try {
    const jid = to.includes("@") ? to : formatJid(to);
    const result = await sock.sendMessage(jid, { image: { url: imageUrl }, caption: caption || "" });
    return { success: true, messageId: result?.key?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendWhatsAppImageBuffer(
  to: string, base64: string, mimeType: string, caption?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!sock || status !== "open") return { success: false, error: "WhatsApp not connected" };
  try {
    const jid = to.includes("@") ? to : formatJid(to);
    const buffer = Buffer.from(base64, "base64");
    const result = await sock.sendMessage(jid, {
      image: buffer,
      mimetype: mimeType,
      caption: caption || "",
    });
    return { success: true, messageId: result?.key?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Bot quick-reply functions ─────────────────────────────────────────────────
// These are called from routes.ts when the client replies 1/2/3 to a booking.

export async function sendBotConfirmed(jid: string): Promise<void> {
  await sendTypingPresence(jid);
  await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
  await stopTypingPresence(jid);
  await sendWhatsAppMessage(
    jid,
    "شكراً لتأكيدك! 🌸\nموعدك مؤكد ✅\nنتطلع لرؤيتك. أي سؤال راسليني هنا 💖"
  );
}

export async function sendBotCancelled(jid: string): Promise<void> {
  await sendTypingPresence(jid);
  await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
  await stopTypingPresence(jid);
  await sendWhatsAppMessage(
    jid,
    "تم إلغاء موعدك ✅\nإذا أردتِ حجز وقت آخر، أخبريني وسيتواصل معكِ الفريق 🌸\nنتمنى نراكِ قريباً 💖"
  );
}

export async function sendBotModify(jid: string): Promise<void> {
  await sendTypingPresence(jid);
  await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
  await stopTypingPresence(jid);
  await sendWhatsAppMessage(
    jid,
    "تم استلام طلب التعديل ✅\nسيتواصل معكِ أحد الفريق قريباً لتحديد الوقت المناسب 🌸\nشكراً لتفهمك 💖"
  );
}

export async function sendBotError(jid: string): Promise<void> {
  await sendTypingPresence(jid);
  await new Promise(r => setTimeout(r, 600));
  await stopTypingPresence(jid);
  await sendWhatsAppMessage(
    jid,
    "عذراً، حدث خطأ مؤقت 🙏\nسيتواصل معكِ الفريق في أقرب وقت 🌸"
  );
}

// ── Notification helpers ──────────────────────────────────────────────────────

export async function sendAppointmentReminder(
  clientPhone: string, clientName: string, appointmentDate: string,
  appointmentTime: string, serviceName: string, salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || "PREGASQUAD";
  return sendWhatsAppMessage(
    clientPhone,
    `مرحباً ${clientName}! 💇‍♀️\n\n⏳ تذكير: موعدك بعد قليل!\n\n📅 ${appointmentDate}\n⏰ ${appointmentTime}\n💅 ${serviceName}\n\nنتطلع لرؤيتك في ${salon}! 🌸`
  );
}

export async function sendBookingConfirmation(
  clientPhone: string, clientName: string, appointmentDate: string,
  appointmentTime: string, serviceName: string, salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || "PREGASQUAD";
  return sendWhatsAppMessage(
    clientPhone,
    `مرحباً ${clientName}! ✨\n\nتم تأكيد حجزك:\n📅 ${appointmentDate}\n⏰ ${appointmentTime}\n💅 ${serviceName}\n\nشكراً لاختيارك ${salon}! 💕`
  );
}

export async function sendWaitlistNotification(
  clientPhone: string, clientName: string, availableDate: string,
  availableTime: string, salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || "PREGASQUAD";
  return sendWhatsAppMessage(
    clientPhone,
    `مرحباً ${clientName}! 🎉\n\nموعد متاح:\n📅 ${availableDate}\n⏰ ${availableTime}\n\n${salon} 💕`
  );
}

export async function sendGiftCardNotification(
  recipientPhone: string, recipientName: string, giftCardCode: string,
  amount: number, senderName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const from = senderName ? `من ${senderName}` : "";
  return sendWhatsAppMessage(
    recipientPhone,
    `مرحباً ${recipientName}! 🎁\n\nبطاقة هدية ${from}!\n💳 ${giftCardCode}\n💰 ${amount} درهم\n\nاستخدمها في موعدك القادم 💕`
  );
}

export async function getConnectionStatus(): Promise<{ connected: boolean; status?: string; error?: string }> {
  const s = getStatus();
  return { connected: s.connected, status: s.status };
}
