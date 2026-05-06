import path from "path";
import fs from "fs";

const AUTH_FOLDER = path.join(process.cwd(), "baileys_auth");
const CREDS_FILE = path.join(AUTH_FOLDER, "creds.json");
const SESSION_DB_ID = "default";

// ── DB session persistence (survives Koyeb / ephemeral FS restarts) ─────────

async function getDbPool(): Promise<any | null> {
  try {
    const { getPool } = await import("./db");
    return getPool();
  } catch {
    return null;
  }
}

async function saveAuthToDb(): Promise<void> {
  try {
    if (!fs.existsSync(AUTH_FOLDER)) return;
    const files = fs.readdirSync(AUTH_FOLDER);
    if (files.length === 0) return;

    const snapshot: Record<string, string> = {};
    for (const file of files) {
      const filePath = path.join(AUTH_FOLDER, file);
      try { snapshot[file] = fs.readFileSync(filePath, "utf8"); } catch {}
    }

    const pool = await getDbPool();
    if (!pool) return;

    const json = JSON.stringify(snapshot);
    const { dbDialect } = await import("./db");
    if (dbDialect === "mysql") {
      const conn = await pool.getConnection();
      await conn.query(
        `INSERT INTO baileys_sessions (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
        [SESSION_DB_ID, json]
      );
      conn.release();
    } else {
      await pool.query(
        `INSERT INTO baileys_sessions (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
        [SESSION_DB_ID, json]
      );
    }
    log("Session snapshot saved to DB");
  } catch (err: any) {
    log(`saveAuthToDb error: ${err.message}`);
  }
}

async function loadAuthFromDb(): Promise<boolean> {
  try {
    const pool = await getDbPool();
    if (!pool) return false;

    const { dbDialect } = await import("./db");
    let rows: any[];
    if (dbDialect === "mysql") {
      const conn = await pool.getConnection();
      const [result] = await conn.query(`SELECT data FROM baileys_sessions WHERE id = ?`, [SESSION_DB_ID]);
      conn.release();
      rows = result as any[];
    } else {
      const result = await pool.query(`SELECT data FROM baileys_sessions WHERE id = $1`, [SESSION_DB_ID]);
      rows = result.rows;
    }

    if (!rows || rows.length === 0) return false;

    const snapshot: Record<string, string> = JSON.parse(rows[0].data);
    if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    for (const [file, content] of Object.entries(snapshot)) {
      fs.writeFileSync(path.join(AUTH_FOLDER, file), content, "utf8");
    }
    log("Session restored from DB");
    return true;
  } catch (err: any) {
    log(`loadAuthFromDb error: ${err.message}`);
    return false;
  }
}

async function clearAuthFromDb(): Promise<void> {
  try {
    const pool = await getDbPool();
    if (!pool) return;
    const { dbDialect } = await import("./db");
    if (dbDialect === "mysql") {
      const conn = await pool.getConnection();
      await conn.query(`DELETE FROM baileys_sessions WHERE id = ?`, [SESSION_DB_ID]);
      conn.release();
    } else {
      await pool.query(`DELETE FROM baileys_sessions WHERE id = $1`, [SESSION_DB_ID]);
    }
    log("Session cleared from DB");
  } catch (err: any) {
    log(`clearAuthFromDb error: ${err.message}`);
  }
}

type Status = "disconnected" | "connecting" | "qr" | "pairing" | "open";

let sock: any = null;
let currentQRDataUrl: string | null = null;
let currentPairingCode: string | null = null;
let lastPairingError: string | null = null;
let status: Status = "disconnected";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let verifyReconnectTimer: ReturnType<typeof setTimeout> | null = null; // stored so we cancel before re-scheduling
let shouldReconnect = false;
let socketIO: any = null;
let pendingPairingPhone: string | null = null;
let pairingRetryCount = 0;
const MAX_PAIRING_RETRIES = 2; // keep low — too many attempts triggers WhatsApp rate-limiting
let isVerifyingLink = false;   // true while we reconnect to check if phone confirmed the code
let verifyRetryCount = 0;      // how many verify-reconnects have been attempted
const MAX_VERIFY_RETRIES = 3;  // stop looping after this many failed verify reconnects

// Deduplication: track processed message IDs to avoid handling the same message twice
// (Baileys can fire messages.upsert multiple times on reconnect/sync)
const processedMessageIds = new Set<string>();
// Clear old IDs every 10 minutes to avoid unbounded memory growth
setInterval(() => processedMessageIds.clear(), 10 * 60 * 1000);

export function setSocketIO(io: any): void {
  socketIO = io;
}

// remoteJid = full JID (e.g. "212713446214@s.whatsapp.net" or "85715031466043@lid")
// phone     = best-effort numeric phone extracted from JID (may not match for LID accounts)
type IncomingMessageHandler = (remoteJid: string, phone: string, text: string) => Promise<void>;
let incomingMessageHandler: IncomingMessageHandler | null = null;

export function setIncomingMessageHandler(handler: IncomingMessageHandler): void {
  incomingMessageHandler = handler;
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
  clearAuthFromDb().catch(() => {}); // also wipe from DB (non-blocking)
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

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    saveAuthToDb().catch(() => {}); // persist to DB so session survives restarts
  });

  // ── Incoming message handler (bot replies) ──────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages: msgs, type }: any) => {
    if (type !== "notify") return;
    for (const msg of msgs) {
      // Skip own messages, groups, broadcasts, and status updates
      if (msg.key.fromMe) continue;
      if (!msg.key.remoteJid) continue;
      if (msg.key.remoteJid.endsWith("@g.us")) continue;
      if (msg.key.remoteJid.includes("broadcast")) continue;
      if (msg.key.remoteJid === "status@broadcast") continue;

      // Deduplicate — Baileys can fire the same message event multiple times on reconnect
      const msgId = msg.key.id;
      if (msgId && processedMessageIds.has(msgId)) {
        log(`Skipping duplicate message ${msgId}`);
        continue;
      }
      if (msgId) processedMessageIds.add(msgId);

      const remoteJid = msg.key.remoteJid;
      // Best-effort numeric phone (works for @s.whatsapp.net; won't be a real phone for @lid)
      const rawPhone = remoteJid.replace(/@(s\.whatsapp\.net|lid|c\.us)$/, "");
      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        ""
      ).trim();

      if (!rawPhone || !text) continue;

      log(`Incoming message from ${remoteJid}: "${text.slice(0, 60)}"`);

      if (incomingMessageHandler) {
        try {
          await incomingMessageHandler(remoteJid, rawPhone, text);
        } catch (err: any) {
          log(`Incoming handler error: ${err.message}`);
        }
      }
    }
  });

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
      isVerifyingLink = false;
      verifyRetryCount = 0;
      if (verifyReconnectTimer) { clearTimeout(verifyReconnectTimer); verifyReconnectTimer = null; }
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

      if (loggedOut && droppedPairingPhone) {
        // 401 during pairing (before or after code shown) — WhatsApp rejected the attempt.
        // NOT a real logout — wipe bad partial creds then auto-retry a fresh code.
        wipeAuth();
        if (pairingRetryCount < MAX_PAIRING_RETRIES) {
          pairingRetryCount++;
          log(`WhatsApp rejected pairing (401) — auto-retry ${pairingRetryCount}/${MAX_PAIRING_RETRIES} in 3s…`);
          if (socketIO) socketIO.emit("whatsapp:pairing_refreshing", { attempt: pairingRetryCount });
          setTimeout(() => {
            connectSocket(droppedPairingPhone).catch((err) =>
              log(`Auto-retry after 401 failed: ${err.message}`)
            );
          }, 3000);
        } else {
          pairingRetryCount = 0;
          log("WhatsApp kept rejecting pairing after retries — ask user to try again later");
          if (socketIO) socketIO.emit("whatsapp:pairing_dropped", { reason: "WhatsApp rejected the link. Wait a minute then try again." });
        }
      } else if (loggedOut && wasVerifying) {
        // 401 during link-verification → phone didn't accept the code.
        // Wipe partial creds and let user try a fresh code.
        pairingRetryCount = 0;
        verifyRetryCount = 0;
        if (verifyReconnectTimer) { clearTimeout(verifyReconnectTimer); verifyReconnectTimer = null; }
        wipeAuth();
        log("Phone did not confirm the pairing code — session reset. User should request a new code.");
        if (socketIO) socketIO.emit("whatsapp:pairing_dropped", { reason: "Phone did not accept the code. Please try again." });
      } else if (loggedOut && !wasVerifying) {
        // Genuine logout / device removal — wipe session
        shouldReconnect = false;
        pairingRetryCount = 0;
        verifyRetryCount = 0;
        if (verifyReconnectTimer) { clearTimeout(verifyReconnectTimer); verifyReconnectTimer = null; }
        wipeAuth();
        if (isDeviceRemoved) {
          log("Device removed by WhatsApp — session cleared");
          if (socketIO) socketIO.emit("whatsapp:logged_out", { reason: "device_removed" });
        } else {
          log("Logged out — session cleared");
          if (socketIO) socketIO.emit("whatsapp:logged_out", { reason: "logged_out" });
        }
      } else if (droppedPairingPhone && hadCode) {
        // ── Code was shown; WhatsApp closed the pairing WS (expected after IQ is sent) ──
        // DO NOT wipe auth and do NOT auto-generate a new code — that causes rate-limiting.
        // Wait, then attempt a reconnect with the saved creds so WA can push credentials.
        // IMPORTANT: cancel any pending verify timer before scheduling a new one —
        // without this, overlapping timers stack up and rapid cycling triggers a 401.
        pairingRetryCount = 0;
        shouldReconnect = false;

        if (verifyReconnectTimer) {
          clearTimeout(verifyReconnectTimer);
          verifyReconnectTimer = null;
        }

        if (!isVerifyingLink) {
          // First verify attempt — reset counter
          verifyRetryCount = 0;
        }

        if (verifyRetryCount >= MAX_VERIFY_RETRIES) {
          // Too many verify reconnects without success — stop and tell the user
          isVerifyingLink = false;
          verifyRetryCount = 0;
          log(`Verify-reconnect limit reached (${MAX_VERIFY_RETRIES}) — giving up. User should try pairing again.`);
          wipeAuth();
          if (socketIO) socketIO.emit("whatsapp:pairing_dropped", { reason: "Could not verify pairing. Please request a new code and try again." });
        } else {
          isVerifyingLink = true;
          verifyRetryCount++;
          // Increase delay with each retry to avoid hammering WhatsApp
          const verifyDelay = 3000 + (verifyRetryCount - 1) * 5000; // 3s, 8s, 13s
          log(`Code was shown — WS dropped (expected). Verify reconnect ${verifyRetryCount}/${MAX_VERIFY_RETRIES} in ${verifyDelay / 1000}s…`);
          verifyReconnectTimer = setTimeout(() => {
            verifyReconnectTimer = null;
            if (!isVerifyingLink) return; // user already clicked "try again" or gave up
            log("Attempting silent reconnect to verify link acceptance…");
            connectSocket().catch((err) => {
              isVerifyingLink = false;
              verifyRetryCount = 0;
              log(`Verify-reconnect failed: ${err.message}`);
            });
          }, verifyDelay);
        }
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
      } else if (reason === DR.restartRequired && shouldReconnect) {
        // 515 = WhatsApp server requested a restart — completely normal, especially right
        // after QR/pairing-code linking.  The session is still valid; just reconnect fast.
        // Keep status as "connecting" so the frontend never flashes "Disconnected" and
        // the user doesn't panic-click "Generate QR" which would wipe the linked session.
        status = "connecting";
        log("WhatsApp restart required (515) — reconnecting in 2s with saved session");
        scheduleReconnect(2000);
      } else {
        if (socketIO) socketIO.emit("whatsapp:disconnected", { reason });
        if (shouldReconnect) {
          scheduleReconnect(20000);
        }
      }
    }
  });
}

/** Called at server start — restores session from DB (survives ephemeral FS), then connects */
export async function initBaileys(): Promise<void> {
  // Try restoring session from DB first (Koyeb / ephemeral filesystem)
  if (!hasExistingSession()) {
    const restored = await loadAuthFromDb();
    if (restored) {
      log("Session restored from DB — connecting…");
    }
  }
  if (hasExistingSession()) {
    log("Existing session found — connecting…");
    shouldReconnect = true;
    await connectSocket();
  } else {
    log("No saved session — waiting for user to connect");
  }
}

/** Wipe saved session when no phone is paired (safe to call when disconnected) */
export function clearSessionIfDisconnected(): void {
  if (status === "open") return; // never wipe an active connection
  log("Clearing old session (no paired phone)");
  wipeAuth();
}

/** Start QR flow — non-blocking. Wipes stale auth so QR always starts fresh. */
export function startQR(): void {
  shouldReconnect = false;
  pendingPairingPhone = null;
  isVerifyingLink = false;
  verifyRetryCount = 0;
  if (verifyReconnectTimer) { clearTimeout(verifyReconnectTimer); verifyReconnectTimer = null; }
  log("QR flow requested — clearing auth for fresh start");
  wipeAuth();
  connectSocket().catch((err) => log(`startQR error: ${err.message}`));
}

/** Start pairing code flow — fully non-blocking. Code appears via getPairingCode() / polling. */
export function startPairingCode(phone: string): void {
  shouldReconnect = false;
  pairingRetryCount = 0;
  isVerifyingLink = false;
  verifyRetryCount = 0;
  if (verifyReconnectTimer) { clearTimeout(verifyReconnectTimer); verifyReconnectTimer = null; }
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
  // If it's already a full JID (contains @), use it as-is — never reconstruct a LID
  if (phone.includes("@")) return phone;
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
  clientPhone: string, _clientName: string, _appointmentDate: string,
  appointmentTime: string, serviceName: string, _salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const msg = `Petit rappel ⏰\n\nVotre rendez-vous approche :\n\n✨ ${serviceName}\n🕒 ${appointmentTime}\n\nNous avons hâte de vous recevoir 💖\nÀ très bientôt au salon 🌸`;
  return sendWhatsAppMessage(clientPhone, msg);
}

export async function sendBookingConfirmation(
  clientPhone: string, _clientName: string, _appointmentDate: string,
  appointmentTime: string, serviceName: string, _salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const msg = `PREGASQUAD, BONJOUR! 💖\n\nNous vous confirmons votre rendez-vous au salon :\n\n✨ Service : ${serviceName}\n🕒 Heure : ${appointmentTime}\n\nMerci de confirmer votre présence en répondant :\n\n1️⃣ Confirmer\n2️⃣ Annuler\n3️⃣ Modifier\n\nNous restons à votre disposition 🌸`;
  return sendWhatsAppMessage(clientPhone, msg);
}

export async function sendBotConfirmed(
  clientPhone: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const msg = `Merci pour votre confirmation 💖\n\nVotre rendez-vous est bien confirmé ✅\nNous avons hâte de vous accueillir au salon 🌸`;
  return sendWhatsAppMessage(clientPhone, msg);
}

export async function sendBotCancelled(
  clientPhone: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const msg = `Votre rendez-vous a été annulé ❌\n\nN'hésitez pas à nous recontacter pour un nouveau créneau 🌸\nNous serons ravis de vous accueillir à nouveau 💖`;
  return sendWhatsAppMessage(clientPhone, msg);
}

export async function sendBotModify(
  clientPhone: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const msg = `Parfait ✨\n\nMerci de nous indiquer l'horaire qui vous convient le mieux 🕒\nNous ferons le nécessaire pour vous proposer une nouvelle disponibilité 💖`;
  return sendWhatsAppMessage(clientPhone, msg);
}

export async function sendBotError(
  clientPhone: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const msg = `Nous n'avons pas bien compris votre réponse 😊\n\nMerci de répondre avec :\n\n1️⃣ Confirmer\n2️⃣ Annuler\n3️⃣ Modifier`;
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
