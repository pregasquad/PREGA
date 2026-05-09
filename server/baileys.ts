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
let currentPairingCodeExpiresAt: number | null = null;
let lastPairingError: string | null = null;
let status: Status = "disconnected";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let shouldReconnect = false;
let reconnectAttempts = 0;       // exponential backoff counter (resets on open)
let sessionRestoreAttempts = 0;  // how many times we've tried to reconnect via saved DB session
const MAX_SESSION_RESTORE = 3;   // give up and clear session after this many consecutive failures
let socketIO: any = null;
let pendingPairingPhone: string | null = null;

// Deduplication: Map<msgId, processedAt ms> — per-entry TTL, never wipe the whole set
// so a reconnect near the clear boundary can't replay already-processed messages.
const processedMessageIds = new Map<string, number>();
const MSG_DEDUP_TTL = 10 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - MSG_DEDUP_TTL;
  for (const [id, ts] of processedMessageIds) {
    if (ts < cutoff) processedMessageIds.delete(id);
  }
}, 2 * 60 * 1000);

export function setSocketIO(io: any): void {
  socketIO = io;
}

// remoteJid = full JID (e.g. "212713446214@s.whatsapp.net" or "85715031466043@lid")
// phone     = best-effort numeric phone extracted from JID (may not match for LID accounts)
// imageBase64 / imageMimeType = set when the message contains a photo
// isVoice = true when the message originated from a WhatsApp voice note
type IncomingMessageHandler = (
  remoteJid: string,
  phone: string,
  text: string,
  imageBase64?: string,
  imageMimeType?: string,
  isVoice?: boolean
) => Promise<void>;
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

// Exponential backoff: 5s → 10s → 20s → 40s → 60s (cap)
// Each call also increments sessionRestoreAttempts.
// After MAX_SESSION_RESTORE consecutive failures the session is cleared and we stop.
async function scheduleReconnect(delayMs?: number) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (!shouldReconnect) return;

  sessionRestoreAttempts++;

  if (sessionRestoreAttempts > MAX_SESSION_RESTORE) {
    log(`Session restore failed after ${MAX_SESSION_RESTORE} attempts — clearing session and waiting for user re-link`);
    shouldReconnect = false;
    wipeAuth();
    status = "disconnected";
    sessionRestoreAttempts = 0;
    reconnectAttempts = 0;
    if (socketIO) socketIO.emit("whatsapp:session_expired", {
      reason: `Automatic reconnect failed ${MAX_SESSION_RESTORE} times. Please re-link your WhatsApp.`
    });
    return;
  }

  // Before reconnecting, re-sync session from DB in case it was updated elsewhere
  // (e.g. a Koyeb dyno was replaced while another was already connected)
  if (!hasExistingSession()) {
    log(`No local session — attempting DB restore (attempt ${sessionRestoreAttempts}/${MAX_SESSION_RESTORE})…`);
    const restored = await loadAuthFromDb();
    if (!restored) {
      log("DB restore returned nothing — scheduling next retry");
    }
  }

  const backoffMs = delayMs ?? Math.min(5000 * Math.pow(2, reconnectAttempts), 60000);
  reconnectAttempts++;
  log(`Reconnecting in ${Math.round(backoffMs / 1000)}s (session attempt ${sessionRestoreAttempts}/${MAX_SESSION_RESTORE}, backoff attempt ${reconnectAttempts})…`);
  reconnectTimer = setTimeout(() => {
    connectSocket().catch((err) => log(`Reconnect failed: ${err.message}`));
  }, backoffMs);
}

async function fetchVersionWithFallback() {
  // Updated regularly — use latest verified working version if fetch fails
  const FALLBACK_VERSION: [number, number, number] = [2, 3000, 1023505673];
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
  currentPairingCodeExpiresAt = null;

  const pinoLogger = pino({ level: "warn" });
  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    logger: pinoLogger,
    browser: Browsers.ubuntu("Chrome"),
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

      // Deduplicate — per-entry TTL prevents replay on reconnect
      const msgId = msg.key.id;
      if (msgId && processedMessageIds.has(msgId)) {
        log(`Skipping duplicate message ${msgId}`);
        continue;
      }
      if (msgId) processedMessageIds.set(msgId, Date.now());

      // ── Filter non-conversational message types ──────────────────────────
      const msgType = Object.keys(msg.message || {})[0] || "";
      // Stickers
      if (msgType === "stickerMessage") continue;
      // Reactions (👍❤️ etc.)
      if (msgType === "reactionMessage") continue;
      // Protocol / ephemeral / key-distribution (internal WA housekeeping)
      if (msgType === "protocolMessage") continue;
      if (msgType === "ephemeralMessage") continue;
      if (msgType === "senderKeyDistributionMessage") continue;
      // Status updates from others
      if (msgType === "statusJidList") continue;

      const remoteJid = msg.key.remoteJid;
      // Best-effort numeric phone (works for @s.whatsapp.net; won't be a real phone for @lid)
      const rawPhone = remoteJid.replace(/@(s\.whatsapp\.net|lid|c\.us)$/, "");

      const isImageMsg = !!msg.message?.imageMessage;
      const isAudioMsg = !!(msg.message?.audioMessage?.url || msg.message?.audioMessage?.directPath);

      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.ephemeralMessage?.message?.conversation ||
        msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
        ""
      ).trim();

      // Skip if there is no text, no image, and no audio — truly empty message
      if (!rawPhone || (!text && !isImageMsg && !isAudioMsg)) continue;

      // Download image if present — pass as base64 to the handler for vision analysis
      let imageBase64: string | undefined;
      let imageMimeType: string | undefined;
      if (isImageMsg) {
        try {
          const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
          const buffer = await downloadMediaMessage(msg, "buffer", {}) as Buffer;
          imageBase64 = buffer.toString("base64");
          imageMimeType = msg.message?.imageMessage?.mimetype || "image/jpeg";
          log(`Image downloaded (${Math.round(buffer.length / 1024)} KB, ${imageMimeType})`);
        } catch (imgErr: any) {
          log(`Image download failed: ${imgErr.message} — continuing with text only`);
        }
      }

      // Transcribe voice note if present — result is added to the text context
      let effectiveText = text;
      if (isAudioMsg) {
        try {
          const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
          const buffer = await downloadMediaMessage(msg, "buffer", {}) as Buffer;
          const audioMime = msg.message?.audioMessage?.mimetype || "audio/ogg; codecs=opus";
          log(`Voice note received (${Math.round(buffer.length / 1024)} KB) — transcribing…`);
          const { transcribeAudio } = await import("./gemini");
          const transcription = await transcribeAudio(buffer.toString("base64"), audioMime);
          if (transcription) {
            // Wrap so the AI knows it came from a voice message
            effectiveText = text
              ? `${text}\n🎙️ رسالة صوتية: "${transcription}"`
              : `🎙️ رسالة صوتية: "${transcription}"`;
            log(`Voice transcribed: "${transcription.slice(0, 80)}"`);
          } else {
            // Transcription failed — tell AI there was a voice note it couldn't hear
            effectiveText = text || "🎙️ (رسالة صوتية — لم أتمكن من سماعها)";
            log("Voice transcription failed — passing fallback text");
          }
        } catch (audioErr: any) {
          log(`Voice note error: ${audioErr.message}`);
          effectiveText = text || "🎙️ (رسالة صوتية — خطأ في التحويل)";
        }
      }

      // Skip if still nothing usable after all processing
      if (!effectiveText && !imageBase64) continue;

      log(`Incoming from ${remoteJid}: "${effectiveText.slice(0, 60)}"${isImageMsg ? " [+image]" : ""}${isAudioMsg ? " [+voice]" : ""}`);

      if (incomingMessageHandler) {
        try {
          await incomingMessageHandler(remoteJid, rawPhone, effectiveText, imageBase64, imageMimeType, isAudioMsg);
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

    let codeRequested = false;

    const CODE_EXPIRY_MS = 90_000; // WhatsApp codes are valid ~60-90s
    let codeExpiryTimer: ReturnType<typeof setTimeout> | null = null;

    const doRequestCode = async () => {
      if (codeRequested) return;
      if (!sock || pendingPairingPhone !== pairingPhone) return;
      codeRequested = true;
      log(`Requesting pairing code for ${cleanPhone}…`);
      try {
        const code = await sock.requestPairingCode(cleanPhone);
        currentPairingCode = code;
        currentPairingCodeExpiresAt = Date.now() + CODE_EXPIRY_MS;
        lastPairingError = null;
        log(`Pairing code obtained: ${code} (expires in ${CODE_EXPIRY_MS / 1000}s)`);
        if (socketIO) socketIO.emit("whatsapp:pairing_code", { code, expiresAt: currentPairingCodeExpiresAt });

        // Auto-expire: clear code on server after expiry so polling reflects reality
        if (codeExpiryTimer) clearTimeout(codeExpiryTimer);
        codeExpiryTimer = setTimeout(() => {
          if (currentPairingCode === code && pendingPairingPhone === pairingPhone) {
            log(`Pairing code ${code} expired — resetting state`);
            currentPairingCode = null;
            currentPairingCodeExpiresAt = null;
            lastPairingError = "Code expired — please request a new one";
            status = "disconnected";
            pendingPairingPhone = null;
            wipeAuth();
            if (socketIO) socketIO.emit("whatsapp:pairing_code_expired", {});
          }
        }, CODE_EXPIRY_MS);
      } catch (err: any) {
        log(`requestPairingCode failed: ${err.message}`);
        lastPairingError = err.message;
        currentPairingCode = null;
        currentPairingCodeExpiresAt = null;
        status = "disconnected";
        pendingPairingPhone = null;
        wipeAuth();
        if (socketIO) socketIO.emit("whatsapp:pairing_error", { error: err.message });
      }
    };

    // Fire as soon as the noise handshake finishes ("connecting" event).
    // Give the frame layer 1 second to be ready, then a 5s failsafe in case
    // the event fires late or the listener races with it.
    const onConnectingForPairing = (update: any) => {
      if (update.connection === "connecting") {
        sock?.ev?.off("connection.update", onConnectingForPairing);
        log(`Noise handshake done — requesting pairing code in 1s for ${cleanPhone}`);
        setTimeout(doRequestCode, 1000);
      }
    };
    sock.ev.on("connection.update", onConnectingForPairing);
    setTimeout(doRequestCode, 5000); // failsafe if "connecting" event was already emitted

    // Hard timeout: if no code in 25s, give up cleanly.
    setTimeout(() => {
      if (!codeRequested && pendingPairingPhone === pairingPhone) {
        const error = lastPairingError ?? "Timed out — please try again";
        log(`Pairing timed out: ${error}`);
        lastPairingError = error;
        currentPairingCode = null;
        status = "disconnected";
        pendingPairingPhone = null;
        wipeAuth();
        if (socketIO) socketIO.emit("whatsapp:pairing_error", { error });
      }
    }, 25000);
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
      currentPairingCodeExpiresAt = null;
      pendingPairingPhone = null;
      lastPairingError = null;
      shouldReconnect = true;
      reconnectAttempts = 0;       // reset backoff on successful connect
      sessionRestoreAttempts = 0;  // reset restore counter — session is healthy
      const phone = sock?.user?.id?.split(":")[0] ?? "?";
      log(`Connected as +${phone}`);
      if (socketIO) socketIO.emit("whatsapp:connected", { phone });
      // Persist session to DB immediately so any restart can restore it
      saveAuthToDb().catch(() => {});
    }

    if (connection === "close") {
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;
      const errorMsg = (lastDisconnect?.error as any)?.message ?? "";
      const { DisconnectReason: DR } = await import("@whiskeysockets/baileys");
      const loggedOut    = reason === DR.loggedOut;       // 401
      const restartReq   = reason === DR.restartRequired; // 515
      const wasPairing   = !!pendingPairingPhone;
      // Capture BEFORE clearing — code being set means we showed it to the user
      const hadCode      = currentPairingCode !== null;

      log(`Connection closed. Code: ${reason}. WasPairing: ${wasPairing}. HadCode: ${hadCode}. Error: "${errorMsg}"`);
      status = "disconnected";
      sock = null;
      pendingPairingPhone = null;
      currentPairingCode = null;
      currentPairingCodeExpiresAt = null;

      if (wasPairing) {
        // ── Drop during pairing ──────────────────────────────────────────
        // Pairing reconnects are NOT counted against sessionRestoreAttempts —
        // they are expected/transient drops during the linking handshake.
        if (restartReq) {
          // 515 = WhatsApp confirmed the code and pushed credentials — reconnect now
          // with saved creds to complete the link (goes to "open").
          status = "connecting";
          shouldReconnect = true;
          sessionRestoreAttempts = 0; // fresh link — reset the counter
          log("Pairing code accepted — WhatsApp restart (515). Reconnecting in 2s…");
          // Schedule directly (bypassing sessionRestoreAttempts accounting — this is a known-good path)
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => connectSocket().catch((err) => log(`Reconnect failed: ${err.message}`)), 2000);
        } else if (loggedOut) {
          // 401 = WhatsApp rejected the pairing attempt (wrong code, expired, rate-limited)
          wipeAuth();
          log("Pairing rejected by WhatsApp (401) — please try again");
          if (socketIO) socketIO.emit("whatsapp:pairing_error", { error: "WhatsApp rejected the pairing. Please wait a moment and try again." });
        } else if (hadCode) {
          // Expected: socket drops after the pairing IQ is sent (normal WA behaviour).
          // The user still has the code on screen — reconnect silently so WhatsApp
          // can push the full credentials once the user enters the code on their phone.
          // Do NOT wipe auth here; the partial creds on disk are still needed.
          status = "connecting";
          shouldReconnect = true;
          log("Code sent — socket dropped (expected). Reconnecting in 2s to await user entering code…");
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => connectSocket().catch((err) => log(`Reconnect failed: ${err.message}`)), 2000);
        } else {
          // No code was obtained before the drop — nothing useful was saved, wipe cleanly.
          wipeAuth();
          log(`Pairing failed before code obtained (code ${reason ?? "unknown"}): ${errorMsg}`);
          if (socketIO) socketIO.emit("whatsapp:pairing_error", { error: "Connection lost during pairing — please try again." });
        }
      } else if (restartReq && shouldReconnect) {
        // ── 515 after a normal connected session (QR link or periodic WA push) ──
        // 515 is a WhatsApp-initiated refresh — not a real failure, don't count it
        status = "connecting";
        log("WhatsApp restart required (515) — reconnecting in 2s with saved session");
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => connectSocket().catch((err) => log(`Reconnect failed: ${err.message}`)), 2000);
      } else if (loggedOut) {
        // ── Genuine logout or device removed ────────────────────────────
        shouldReconnect = false;
        sessionRestoreAttempts = 0;
        reconnectAttempts = 0;
        wipeAuth();
        const isDeviceRemoved = errorMsg.toLowerCase().includes("conflict") || errorMsg.toLowerCase().includes("device_removed");
        log(isDeviceRemoved ? "Device removed by WhatsApp — session cleared" : "Logged out — session cleared");
        if (socketIO) socketIO.emit("whatsapp:logged_out", { reason: isDeviceRemoved ? "device_removed" : "logged_out" });
      } else {
        // ── Other disconnect — session may be bad, count against restore budget ──
        // This covers network drops, WA server errors, etc.
        if (socketIO) socketIO.emit("whatsapp:disconnected", { reason });
        if (shouldReconnect) await scheduleReconnect(); // increments sessionRestoreAttempts; wipes after 3 failures
      }
    }
  });
}

/** Called at server start — restores session from DB (survives ephemeral FS), then connects.
 *  Retries DB restore up to MAX_SESSION_RESTORE times with a 3s pause between attempts
 *  so transient DB connection delays at boot don't prevent reconnection. */
export async function initBaileys(): Promise<void> {
  if (!hasExistingSession()) {
    let restored = false;
    for (let attempt = 1; attempt <= MAX_SESSION_RESTORE; attempt++) {
      log(`DB session restore attempt ${attempt}/${MAX_SESSION_RESTORE}…`);
      restored = await loadAuthFromDb();
      if (restored) {
        log(`Session restored from DB on attempt ${attempt} — connecting…`);
        break;
      }
      if (attempt < MAX_SESSION_RESTORE) {
        log(`DB restore failed (attempt ${attempt}) — retrying in 3s…`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!restored) {
      log("DB restore failed after all attempts — waiting for user to connect");
    }
  }

  if (hasExistingSession()) {
    log("Existing session found — connecting…");
    shouldReconnect = true;
    sessionRestoreAttempts = 0;
    await connectSocket();
  } else {
    log("No saved session — waiting for user to connect manually");
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
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  log("QR flow requested — clearing auth for fresh start");
  wipeAuth();
  connectSocket().catch((err) => log(`startQR error: ${err.message}`));
}

/** Start pairing code flow — fully non-blocking. Code appears via Socket.IO whatsapp:pairing_code. */
export function startPairingCode(phone: string): void {
  shouldReconnect = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  connectSocket(phone).catch((err) => log(`startPairingCode error: ${err.message}`));
}

export function getQRDataUrl(): string | null { return currentQRDataUrl; }
export function getPairingCode(): string | null { return currentPairingCode; }
export function getPairingCodeExpiresAt(): number | null { return currentPairingCodeExpiresAt; }
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

/**
 * Convert raw PCM audio (from Gemini TTS) to OGG/Opus via ffmpeg,
 * then send as a WhatsApp voice note (ptt=true).
 * pcmBase64 = base64-encoded signed 16-bit little-endian PCM
 * sampleRate = sample rate in Hz (typically 24000 from Gemini TTS)
 */
export async function sendWhatsAppVoiceNote(
  to: string,
  pcmBase64: string,
  sampleRate: number = 24000
): Promise<{ success: boolean; error?: string }> {
  if (!sock || status !== "open") {
    return { success: false, error: "WhatsApp not connected" };
  }
  try {
    const pcmBuffer = Buffer.from(pcmBase64, "base64");

    // Convert raw PCM → OGG/Opus using ffmpeg (required by WhatsApp for voice notes)
    const oggBuffer = await new Promise<Buffer>((resolve, reject) => {
      const { spawn } = require("child_process") as typeof import("child_process");

      // ffmpeg-static bundles a pre-built ffmpeg binary — works on any platform/deployment
      const bundledFfmpeg: string | null = require("ffmpeg-static");
      const ffmpegBin = process.env.FFMPEG_PATH || bundledFfmpeg || "ffmpeg";

      const proc = spawn(ffmpegBin, [
        "-f", "s16le",          // input format: signed 16-bit little-endian PCM
        "-ar", String(sampleRate), // sample rate
        "-ac", "1",             // mono
        "-i", "pipe:0",         // read from stdin
        "-c:a", "libopus",      // encode as Opus
        "-b:a", "32k",          // 32 kbps — good quality for voice
        "-vbr", "on",
        "-compression_level", "10",
        "-f", "ogg",            // OGG container
        "pipe:1",               // write to stdout
      ]);
      const chunks: Buffer[] = [];
      proc.stdout.on("data", (c: Buffer) => chunks.push(c));
      proc.stderr.on("data", () => {}); // suppress ffmpeg output
      proc.on("close", (code: number) => {
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      proc.on("error", reject);
      proc.stdin.write(pcmBuffer);
      proc.stdin.end();
    });

    const jid = formatJid(to);
    const result = await sock.sendMessage(jid, {
      audio: oggBuffer,
      mimetype: "audio/ogg; codecs=opus",
      ptt: true, // sends as voice note, not regular audio file
    });
    log(`Voice note sent to ${to} (${Math.round(oggBuffer.length / 1024)} KB OGG)`);
    return { success: true };
  } catch (err: any) {
    log(`sendWhatsAppVoiceNote error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/** Show "typing…" indicator to the client — call before sending a reply */
export async function sendTypingPresence(jid: string): Promise<void> {
  if (!sock || status !== "open") return;
  try { await sock.sendPresenceUpdate("composing", jid); } catch {}
}

/** Clear typing indicator */
export async function stopTypingPresence(jid: string): Promise<void> {
  if (!sock || status !== "open") return;
  try { await sock.sendPresenceUpdate("paused", jid); } catch {}
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

export async function sendWhatsAppImageBuffer(
  to: string,
  base64: string,
  mimeType: string,
  caption?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!sock || status !== "open") return { success: false, error: "WhatsApp not connected" };
  try {
    const jid = formatJid(to);
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
  currentPairingCodeExpiresAt = null;
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
  const msg = `Votre rendez-vous a été annulé ✅\n\nN'hésitez pas à nous contacter pour réserver un nouveau créneau 🌸\nNous serons ravis de vous accueillir à nouveau 💖`;
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
