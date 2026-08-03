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
import { spawn } from "child_process";

// ── Status codes that mean the session is permanently revoked ────────────────
const PERMANENT_FAILURE_CODES = new Set([401, 403, 405]);
// 440 = "Stream Errored (conflict)" — another instance holds the session.
// Allow a few retries before giving up (in case the other instance is restarting).
const CONFLICT_CODES = new Set([440]);
const MAX_CONFLICT_ATTEMPTS = 4;
const MAX_RECONNECT_ATTEMPTS = 5;

// ── LID → real-phone map — populated from contacts.upsert on connect ─────────
// WhatsApp uses opaque LID identifiers for newer accounts. When Baileys syncs
// contacts it fires contacts.upsert with objects that may contain both
// `id` (real JID like 2126...@s.whatsapp.net) and `lid` (LID JID).
// We capture that mapping here so the message handler can resolve the real phone.
const lidToPhoneMap = new Map<string, string>(); // "85715031466043" → "212600000000"

/** Resolve a raw LID number to its real phone (E.164 digits only), or null. */
export function resolvePhoneFromLid(lid: string): string | null {
  const digits = lid.replace(/[^0-9]/g, "");
  return lidToPhoneMap.get(digits) ?? null;
}

/** Expose the full map so the routes repair endpoint can iterate over it. */
export function getLidPhoneMap(): ReadonlyMap<string, string> {
  return lidToPhoneMap;
}

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
let conflictAttempt = 0;
let ioInstance: SocketIOServer | null = null;
let incomingMessageHandler: ((jid: string, phone: string, text: string, imageBase64?: string, imageMimeType?: string, isVoice?: boolean, audioBase64?: string, audioMimeType?: string, pushName?: string) => Promise<void>) | null = null;
let outgoingMessageHandler: ((jid: string, text: string) => void) | null = null;

// Track message IDs sent by the bot itself so we can ignore those fromMe events.
// Capped at 200 entries to avoid unbounded growth.
const botSentMessageIds = new Set<string>();
function trackBotMessageId(id: string | undefined | null): void {
  if (!id) return;
  botSentMessageIds.add(id);
  if (botSentMessageIds.size > 200) {
    // Remove the oldest entry (first inserted)
    const first = botSentMessageIds.values().next().value;
    if (first) botSentMessageIds.delete(first);
  }
}

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
// Baileys credentials contain Buffer objects (binary keys, nonces, etc.).
// Plain JSON.stringify/parse silently corrupts them — always use BufferJSON.

let BufferJSON: any = null;
let proto: any = null;

async function loadBaileysUtils() {
  if (!BufferJSON || !proto) {
    const mod = await import("@whiskeysockets/baileys");
    BufferJSON = mod.BufferJSON;
    proto = mod.proto;
  }
}

// Returns the live pool object (pool export is a getter function)
function getDbPool(): any {
  return (pool as any)();
}

async function dbGet(id: string): Promise<any | null> {
  await loadBaileysUtils();
  try {
    const p = getDbPool();
    if (dbDialect === "mysql") {
      const [rows]: any = await p.query(
        "SELECT data FROM baileys_sessions WHERE id = ? LIMIT 1",
        [id]
      );
      if (Array.isArray(rows) && rows.length > 0 && rows[0].data) {
        return JSON.parse(rows[0].data, BufferJSON.reviver);
      }
    } else {
      const r = await p.query(
        "SELECT data FROM baileys_sessions WHERE id = $1 LIMIT 1",
        [id]
      );
      if (r.rows && r.rows.length > 0 && r.rows[0].data) {
        return JSON.parse(r.rows[0].data, BufferJSON.reviver);
      }
    }
  } catch (e: any) {
    log(`DB get error (${id}): ${e.message}`);
  }
  return null;
}

async function dbSet(id: string, value: any): Promise<void> {
  await loadBaileysUtils();
  const data = JSON.stringify(value, BufferJSON.replacer);
  try {
    const p = getDbPool();
    if (dbDialect === "mysql") {
      await p.query(
        `INSERT INTO baileys_sessions (id, data)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
        [id, data]
      );
    } else {
      await p.query(
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
    const p = getDbPool();
    if (dbDialect === "mysql") {
      await p.query("DELETE FROM baileys_sessions WHERE id = ?", [id]);
    } else {
      await p.query("DELETE FROM baileys_sessions WHERE id = $1", [id]);
    }
  } catch (e: any) {
    log(`DB del error (${id}): ${e.message}`);
  }
}

async function dbDelAll(): Promise<void> {
  try {
    const p = getDbPool();
    if (dbDialect === "mysql") {
      await p.query("DELETE FROM baileys_sessions");
    } else {
      await p.query("DELETE FROM baileys_sessions");
    }
  } catch (e: any) {
    log(`DB delAll error: ${e.message}`);
  }
}

async function dbHasSession(): Promise<boolean> {
  try {
    const p = getDbPool();
    if (dbDialect === "mysql") {
      const [rows]: any = await p.query(
        "SELECT id FROM baileys_sessions WHERE id = 'creds' LIMIT 1"
      );
      return Array.isArray(rows) && rows.length > 0;
    } else {
      const r = await p.query(
        "SELECT id FROM baileys_sessions WHERE id = 'creds' LIMIT 1"
      );
      return r.rows && r.rows.length > 0;
    }
  } catch (e: any) {
    log(`dbHasSession error: ${e.message}`);
  }
  return false;
}

/**
 * DB-backed drop-in replacement for useMultiFileAuthState.
 *
 * Every credential and signal key is serialised with Baileys' own BufferJSON
 * (which round-trips Buffer objects correctly) and stored in the
 * `baileys_sessions` table.  This survives ephemeral-filesystem restarts
 * (Koyeb, Railway, Heroku, etc.).
 */
async function useDatabaseAuthState() {
  const { initAuthCreds } = await import("@whiskeysockets/baileys");
  await loadBaileysUtils();

  // Load persisted creds from DB, or start fresh
  let creds = await dbGet("creds");
  if (!creds) creds = initAuthCreds();

  const state = {
    creds,
    keys: {
      get: async (type: string, ids: string[]) => {
        const data: any = {};
        await Promise.all(
          ids.map(async (id) => {
            let value = await dbGet(`key-${type}-${id}`);
            // app-state-sync-key entries must be decoded from proto
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          })
        );
        return data;
      },
      set: async (dataMap: any) => {
        const writes: Promise<void>[] = [];
        for (const [type, ids] of Object.entries(dataMap)) {
          for (const [id, value] of Object.entries(ids as any)) {
            if (value) {
              writes.push(dbSet(`key-${type}-${id}`, value));
            } else {
              writes.push(dbDel(`key-${type}-${id}`));
            }
          }
        }
        await Promise.all(writes);
      },
    },
  };

  // saveCreds is called by Baileys whenever creds change
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
    log(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached — clearing session. Re-link via the WhatsApp page.`);
    shouldReconnect = false;
    status = "disconnected";
    // Clear the stale session so the user gets a clean re-link prompt
    // (same behaviour as a permanent 401 failure — don't keep a broken session)
    clearSession().catch(err => log(`clearSession after max retries failed: ${err.message}`));
    emitStatus();
    return;
  }

  // Exponential back-off: 10s → 20s → 40s → 80s → 160s (capped at 3 min)
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
    initAuthCreds,
    Browsers,
  } = await import("@whiskeysockets/baileys");
  const pino = (await import("pino")).default;

  // When starting a pairing-code flow, always wipe any stale session first.
  // If creds.registered is true from a previous attempt Baileys silently skips
  // requestPairingCode — clearing ensures we always start fresh.
  if (pairingPhone) {
    await dbDelAll();
    log("Pairing flow — cleared stale session from DB");
  }

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
    browser: Browsers.macOS("Chrome"),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 120_000,
    keepAliveIntervalMs: 25_000,
    retryRequestDelayMs: 3_000,
    mobile: false,
  });

  sock.ev.on("creds.update", saveCreds);

  // ── Contact sync — builds LID → real-phone map AND persists to DB ──────────
  // WhatsApp fires contacts.upsert on every connect with the full contact list.
  // Entries for newer accounts have both:
  //   id  = "212600000000@s.whatsapp.net"  (real phone JID)
  //   lid = "85715031466043@lid"           (internal WhatsApp LID)
  // We capture the mapping in memory AND immediately persist it to
  // bot_client_memory + clients so the sync endpoint never needs it from memory.
  sock.ev.on("contacts.upsert", (contacts: any[]) => {
    // Collect all new LID→phone pairs first (sync loop — no async)
    const newPairs: Array<{ lid: string; phone: string }> = [];

    for (const c of contacts) {
      const rawId: string  = c.id  ?? "";
      const rawLid: string = c.lid ?? "";

      let phone = "";
      let lid   = "";

      if (rawId.endsWith("@s.whatsapp.net") && rawLid.endsWith("@lid")) {
        phone = rawId.replace("@s.whatsapp.net", "").replace(/[^0-9]/g, "");
        lid   = rawLid.replace("@lid", "").replace(/[^0-9]/g, "");
      } else if (rawId.endsWith("@lid") && rawLid.endsWith("@s.whatsapp.net")) {
        // Some Baileys builds swap the fields
        phone = rawLid.replace("@s.whatsapp.net", "").replace(/[^0-9]/g, "");
        lid   = rawId.replace("@lid", "").replace(/[^0-9]/g, "");
      }

      if (phone && lid && phone.length >= 7 && phone.length <= 15 && lid.length >= 10) {
        if (!lidToPhoneMap.has(lid)) {
          lidToPhoneMap.set(lid, phone);
          newPairs.push({ lid, phone });
        }
      }
    }

    if (newPairs.length === 0) return;
    log(`contacts.upsert: ${newPairs.length} new LID→phone pair(s), total=${lidToPhoneMap.size} — persisting to DB…`);

    // Persist asynchronously so we don't block the event loop
    (async () => {
      try {
        const { getBotMemory, saveBotMemory } = await import("./db.js");
        const { storage: st } = await import("./storage.js");

        for (const { lid, phone } of newPairs) {
          const lidJid = `${lid}@lid`;
          try {
            // 1. Persist phone into bot_client_memory for this LID JID.
            //    Create a minimal row if none exists — that is the deadlock breaker:
            //    previously we only updated existing rows, so the first message from
            //    a LID contact (which hasn't sent anything before) was never saved,
            //    and the sync loop's `if (!mem.phone) continue` always skipped it.
            const mem = await getBotMemory(lidJid).catch(() => null);
            if (!mem) {
              await saveBotMemory({
                jid: lidJid, phone,
                clientName: null, language: "unknown",
                preferredServices: [], personalityNotes: null,
                convHistory: [], visitCount: 0, botBlocked: false, lastSeen: null,
              });
              log(`contacts.upsert: created new bot_client_memory row for ${lidJid} with phone=${phone}`);
            } else if (!mem.phone) {
              await saveBotMemory({ ...mem, phone });
              log(`contacts.upsert: updated phone ${phone} → bot_client_memory[${lidJid}]`);
            }

            // 2. Fix any client whose phone is the LID digits (14+ digit number)
            const allClients = await st.getClients();
            for (const c of allClients) {
              const cp = (c.phone ?? "").replace(/[^0-9]/g, "");
              if (cp !== lid) continue;

              // Check if a client with the real phone already exists
              const existing = await st.getClientByPhone(phone);
              if (existing && existing.id !== c.id) {
                // Merge: keep the better name, delete the LID ghost
                const betterName = (c.name && c.name !== c.phone && c.name !== lid)
                  ? c.name
                  : (existing.name && existing.name !== existing.phone ? existing.name : null);
                if (betterName && (!existing.name || existing.name === existing.phone)) {
                  await st.updateClient(existing.id, { name: betterName } as any);
                }
                await st.deleteClient(c.id);
                log(`contacts.upsert: merged LID client "${c.name}" (${lid}) → real client (${phone})`);
              } else {
                // Update this client's phone to the real number
                const updates: Record<string, string> = { phone };
                if ((c.name === c.phone || c.name === lid) && mem?.clientName) {
                  updates.name = mem.clientName;
                }
                await st.updateClient(c.id, updates as any);
                log(`contacts.upsert: fixed client "${c.name}" phone ${lid} → ${phone}`);
              }
            }
          } catch (pairErr: any) {
            log(`contacts.upsert: error processing LID ${lid}: ${pairErr.message}`);
          }
        }
      } catch (err: any) {
        log(`contacts.upsert: DB persist error: ${err.message}`);
      }
    })();
  });

  // Pairing code mode — request code after WS handshake with WhatsApp servers
  if (pairingPhone) {
    status = "pairing";
    emitStatus();

    let pairingCodeRequested = false;

    const requestCode = async () => {
      if (pairingCodeRequested) return;
      pairingCodeRequested = true;
      try {
        // Strip everything except digits — WhatsApp expects raw international number
        const cleanPhone = pairingPhone.replace(/[^0-9]/g, "");
        log(`Requesting pairing code for +${cleanPhone}…`);
        const code: string = await sock.requestPairingCode(cleanPhone);
        currentPairingCode = code;
        pairingCodeExpiresAt = Date.now() + 60_000;
        lastPairingError = null;
        log(`Pairing code issued: ${code}`);
        // Enable reconnect NOW — if the WS drops while the user is entering the
        // code, the saved creds will allow the session to resume automatically.
        shouldReconnect = true;
        emitStatus();
        if (ioInstance) {
          ioInstance.emit("whatsapp:pairing_code", { code, expiresAt: pairingCodeExpiresAt });
        }
        // Notify frontend when code expires
        setTimeout(() => {
          if (currentPairingCode === code && ioInstance) {
            currentPairingCode = null;
            pairingCodeExpiresAt = null;
            ioInstance.emit("whatsapp:pairing_code_expired");
          }
        }, 60_000);
      } catch (err: any) {
        lastPairingError = err.message;
        log(`Pairing code error: ${err.message}`);
        emitStatus();
        if (ioInstance) {
          ioInstance.emit("whatsapp:pairing_error", { error: err.message });
        }
      }
    };

    // Request code after the WS handshake with WhatsApp is established.
    // Add a 1.5s delay after "connecting" fires to let the handshake fully
    // settle before calling requestPairingCode — prevents premature 401s.
    sock.ev.on("connection.update", (update: any) => {
      if (update.connection === "connecting" && !pairingCodeRequested) {
        setTimeout(() => { if (!pairingCodeRequested) requestCode(); }, 1_500);
      }
    });

    // Safety net in case connection.update fires before we attach the listener
    setTimeout(() => { if (!pairingCodeRequested) requestCode(); }, 5_000);
  }

  sock.ev.on("connection.update", async (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    // Verbose logging to track pairing handshake progress
    if (connection) log(`Connection state → ${connection}`);

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
      conflictAttempt = 0;
      shouldReconnect = true;
      log(`Connected as +${sock?.user?.id?.split(":")[0] ?? "?"}`);
      emitStatus();
      if (ioInstance) ioInstance.emit("whatsapp:connected");
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
        // Notify frontend — permanent logout (device removed / session revoked)
        if (ioInstance) ioInstance.emit("whatsapp:logged_out", { reason: "device_removed" });
      } else if (CONFLICT_CODES.has(code)) {
        // Another instance holds the session (e.g. Koyeb prod).
        // Retry up to MAX_CONFLICT_ATTEMPTS times, then give up.
        conflictAttempt++;
        if (conflictAttempt <= MAX_CONFLICT_ATTEMPTS) {
          const delayMs = Math.min(10_000 * Math.pow(2, conflictAttempt - 1), 120_000);
          log(`Session conflict (${code}) — attempt ${conflictAttempt}/${MAX_CONFLICT_ATTEMPTS}, retrying in ${delayMs / 1000}s…`);
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            connectSocket().catch(err => log(`Conflict reconnect failed: ${err.message}`));
          }, delayMs);
        } else {
          log(`Session conflict (${code}) — reached max ${MAX_CONFLICT_ATTEMPTS} attempts. Giving up. Re-link manually if needed.`);
          conflictAttempt = 0;
          shouldReconnect = false;
          if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        }
        emitStatus();
        if (ioInstance) ioInstance.emit("whatsapp:disconnected");
      } else if (shouldReconnect) {
        scheduleReconnect();
        if (ioInstance) ioInstance.emit("whatsapp:disconnected");
      } else {
        log("Not reconnecting (shouldReconnect=false)");
        if (ioInstance) ioInstance.emit("whatsapp:disconnected");
      }
    }
  });

  // Incoming message handler
  sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
    if (type !== "notify") return;
    if (!incomingMessageHandler) return;

    for (const msg of messages) {
      if (msg.key?.fromMe) {
        // Ignore messages that Wissal sent herself — only act on boss's manual replies
        const msgId: string = msg.key?.id ?? "";
        if (!botSentMessageIds.has(msgId)) {
          const jid: string = msg.key?.remoteJid ?? "";
          if (jid && !jid.endsWith("@g.us") && outgoingMessageHandler) {
            // Extract text so Wissal can record what the boss wrote in conversation history
            const om = msg.message;
            let bossText = "";
            if (om?.conversation) {
              bossText = om.conversation;
            } else if (om?.extendedTextMessage?.text) {
              bossText = om.extendedTextMessage.text;
            } else if (om?.imageMessage?.caption) {
              bossText = om.imageMessage.caption;
            } else if (om?.documentMessage?.caption) {
              bossText = om.documentMessage.caption;
            }
            outgoingMessageHandler(jid, bossText);
          }
        }
        continue;
      }
      const remoteJid: string = msg.key?.remoteJid ?? "";
      if (!remoteJid) continue;

      // Extract phone number from JID.
      // For @lid JIDs the raw digits are a LID, not a real phone.
      // Try to resolve the real phone from the contacts map first.
      const rawLidDigits = remoteJid.replace(/@.*$/, "").replace(/[^0-9]/g, "");
      const resolvedFromContacts = remoteJid.endsWith("@lid")
        ? (lidToPhoneMap.get(rawLidDigits) ?? null)
        : null;
      const phone = resolvedFromContacts ?? rawLidDigits;
      if (resolvedFromContacts) {
        log(`@lid resolved from contacts map: ${rawLidDigits} → ${resolvedFromContacts}`);
      }

      let text = "";
      let imageBase64: string | undefined;
      let imageMimeType: string | undefined;
      let isVoice = false;
      let audioBase64: string | undefined;
      let audioMimeType: string | undefined;

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
        audioMimeType = m.audioMessage.mimetype || "audio/ogg; codecs=opus";
        try {
          const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
          const buffer = await downloadMediaMessage(msg, "buffer", {});
          audioBase64 = (buffer as Buffer).toString("base64");
          log(`Audio downloaded: ${(buffer as Buffer).length} bytes, mime=${audioMimeType}`);
        } catch (e: any) {
          log(`Audio download error: ${e.message}`);
        }
      } else if (m.documentMessage) {
        text = m.documentMessage.caption || m.documentMessage.fileName || "[document]";
      } else if (m.stickerMessage) {
        text = "[sticker]";
      }

      try {
        const pushName: string | undefined = msg.pushName || undefined;
        await incomingMessageHandler(remoteJid, phone, text, imageBase64, imageMimeType, isVoice, audioBase64, audioMimeType, pushName);
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
  handler: (jid: string, phone: string, text: string, imageBase64?: string, imageMimeType?: string, isVoice?: boolean, audioBase64?: string, audioMimeType?: string, pushName?: string) => Promise<void>
): void {
  incomingMessageHandler = handler;
}

/** Registers the handler called when the boss manually sends a message to a client */
export function setOutgoingMessageHandler(handler: (jid: string, text: string) => void): void {
  outgoingMessageHandler = handler;
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

export function formatJid(phone: string): string {
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
    trackBotMessageId(result?.key?.id);
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
    trackBotMessageId(result?.key?.id);
    return { success: true, messageId: result?.key?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Convert raw PCM (signed 16-bit LE, mono) to OGG/Opus using ffmpeg-static.
 * WhatsApp PTT voice notes MUST be real OGG/Opus — sending WAV mislabelled as
 * OGG causes "This audio is no longer available" on the recipient's end.
 */
async function pcmToOggOpus(pcmBuffer: Buffer, sampleRate: number, speed = 1.0): Promise<Buffer> {
  const ffmpegBin = (await import("ffmpeg-static")).default as string;
  // atempo range is 0.5–2.0; guard NaN/Infinity then clamp and round to 2 decimal places
  const safeSpeed = Number.isFinite(speed) ? speed : 1.0;
  const clampedSpeed = Math.round(Math.min(2.0, Math.max(0.5, safeSpeed)) * 100) / 100;
  const audioFilter = clampedSpeed !== 1.0 ? `atempo=${clampedSpeed}` : "anull";
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegBin, [
      "-f", "s16le",           // input: signed 16-bit little-endian PCM
      "-ar", String(sampleRate), // input sample rate
      "-ac", "1",              // mono
      "-i", "pipe:0",          // read from stdin
      "-af", audioFilter,      // speed adjustment (or no-op if 1.0×)
      "-c:a", "libopus",       // encode with Opus codec
      "-b:a", "32k",           // 32 kbps — plenty for voice
      "-vbr", "on",
      "-f", "ogg",             // container: OGG
      "pipe:1",                // write to stdout
    ]);

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    ff.stdout.on("data", (c: Buffer) => chunks.push(c));
    ff.stderr.on("data", (c: Buffer) => errChunks.push(c));
    ff.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        const errMsg = Buffer.concat(errChunks).toString().slice(-300);
        reject(new Error(`ffmpeg exited ${code}: ${errMsg}`));
      }
    });
    ff.on("error", reject);
    ff.stdin.write(pcmBuffer);
    ff.stdin.end();
  });
}

export async function sendWhatsAppVoiceNote(
  to: string, pcmBase64: string, sampleRate: number, speed = 1.0
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!sock || status !== "open") return { success: false, error: "WhatsApp not connected" };
  try {
    const jid = to.includes("@") ? to : formatJid(to);
    const pcmBuffer = Buffer.from(pcmBase64, "base64");

    // Encode PCM → real OGG/Opus (required by WhatsApp for voice notes)
    const oggBuffer = await pcmToOggOpus(pcmBuffer, sampleRate, speed);
    log(`Voice note encoded: ${Math.round(oggBuffer.length / 1024)} KB OGG/Opus`);

    const result = await sock.sendMessage(jid, {
      audio: oggBuffer,
      mimetype: "audio/ogg; codecs=opus",
      ptt: true,
    });
    trackBotMessageId(result?.key?.id);
    return { success: true, messageId: result?.key?.id };
  } catch (err: any) {
    log(`Voice note send error: ${err.message}`);
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
    trackBotMessageId(result?.key?.id);
    return { success: true, messageId: result?.key?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Date helper ───────────────────────────────────────────────────────────────

function formatRelativeDate(dateStr: string): string {
  const today = new Date();
  const target = new Date(dateStr);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "اليوم";
  if (diffDays === 1) return "غدا";
  const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  return dayNames[target.getDay()];
}

// ── Bot quick-reply functions ─────────────────────────────────────────────────
// These are called from routes.ts when the client replies 1/2/3 to a booking.

export async function sendBotConfirmed(
  jid: string,
  clientName?: string,
  serviceName?: string,
  date?: string,
  time?: string,
  language?: string
): Promise<void> {
  await sendTypingPresence(jid);
  await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
  await stopTypingPresence(jid);
  const isFrench = language === "french";
  if (clientName && serviceName && date && time) {
    const firstName = clientName.split(" ")[0];
    const relativeDate = formatRelativeDate(date);
    await sendWhatsAppMessage(
      jid,
      isFrench
        ? `Avec plaisir ${firstName} 🌸\n\nC'est bon ! Ton rendez-vous pour "${serviceName}" est confirmé ${relativeDate} à ${time} inch'Allah. On t'attend avec impatience 🌸✨`
        : `العفو يا ${firstName}، هانية حبيبتي! 🌸\n\nصافي، الrendez-vous ديالك لـ "${serviceName}" تأكد ${relativeDate} إن شاء الله مع ${time}. نتسناوك تنورينا في الصالون، ومرحبا بيك 🌸✨`
    );
  } else {
    await sendWhatsAppMessage(
      jid,
      isFrench
        ? "Merci pour ta confirmation ! 🌸\nTon rendez-vous est confirmé ✅\nOn a hâte de te voir. N'hésite pas si tu as des questions 💖"
        : "شكراً لتأكيدك! 🌸\nrendez-vousك مؤكد ✅\nنتطلع لرؤيتك. أي سؤال راسليني هنا 💖"
    );
  }
}

export async function sendBotCancelled(jid: string, language?: string): Promise<void> {
  await sendTypingPresence(jid);
  await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
  await stopTypingPresence(jid);
  const isFrench = language === "french";
  await sendWhatsAppMessage(
    jid,
    isFrench
      ? "Ton rendez-vous a bien été annulé ✅\nSi tu souhaites réserver à un autre moment, dis-le moi et l'équipe te contactera 🌸\nOn espère te revoir bientôt 💖"
      : "تم إلغاء rendez-vousك ✅\nإذا أردتِ حجز وقت آخر، أخبريني وسيتواصل معكِ الفريق 🌸\nنتمنى نراكِ قريباً 💖"
  );
}

export async function sendBotModify(jid: string, language?: string): Promise<void> {
  await sendTypingPresence(jid);
  await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
  await stopTypingPresence(jid);
  const isFrench = language === "french";
  await sendWhatsAppMessage(
    jid,
    isFrench
      ? "Demande de modification reçue ✅\nUn membre de l'équipe te contactera prochainement pour fixer le nouveau créneau 🌸\nMerci pour ta compréhension 💖"
      : "تم استلام طلب التعديل ✅\nسيتواصل معكِ أحد الفريق قريباً لتحديد الوقت المناسب 🌸\nشكراً لتفهمك 💖"
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
  appointmentTime: string, serviceName: string, salonName?: string,
  language?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || "PREGASQUAD";
  const msg = language === "french"
    ? `Bonjour ${clientName} ! 💇‍♀️\n\n⏳ Rappel : votre rendez-vous est bientôt !\n\n📅 ${appointmentDate}\n⏰ ${appointmentTime}\n💅 ${serviceName}\n\nNous avons hâte de vous accueillir chez ${salon} ! 🌸`
    : `مرحباً ${clientName}! 💇‍♀️\n\n⏳ تذكير: rendez-vousك بعد قليل!\n\n📅 ${appointmentDate}\n⏰ ${appointmentTime}\n💅 ${serviceName}\n\nنتطلع لرؤيتك في ${salon}! 🌸`;
  return sendWhatsAppMessage(clientPhone, msg);
}

export async function sendBookingConfirmation(
  clientPhone: string, clientName: string, appointmentDate: string,
  appointmentTime: string, serviceName: string, _salonName?: string,
  language?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const firstName = clientName.split(" ")[0];
  const relativeDate = formatRelativeDate(appointmentDate);
  const msg = language === "french"
    ? `Bonjour ${firstName} 🌸\n\nVotre rendez-vous a bien été confirmé ✅\n\n📋 Prestation : ${serviceName}\n📅 Date : ${relativeDate}\n⏰ Heure : ${appointmentTime}\n\nNous avons hâte de vous accueillir 💕`
    : `مرحبا ${firstName} 🌸\n\nتم تأكيد rendez-vousك بنجاح ✅\n\n📋 الخدمة: ${serviceName}\n📅 التاريخ: ${relativeDate}\n⏰ الوقت: ${appointmentTime}\n\nنتطلع لاستقبالك 💕`;
  return sendWhatsAppMessage(clientPhone, msg);
}

export async function sendWaitlistNotification(
  clientPhone: string, clientName: string, availableDate: string,
  availableTime: string, salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || "PREGASQUAD";
  return sendWhatsAppMessage(
    clientPhone,
    `مرحباً ${clientName}! 🎉\n\nrendez-vous متاح:\n📅 ${availableDate}\n⏰ ${availableTime}\n\n${salon} 💕`
  );
}

export async function sendGiftCardNotification(
  recipientPhone: string, recipientName: string, giftCardCode: string,
  amount: number, senderName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const from = senderName ? `من ${senderName}` : "";
  return sendWhatsAppMessage(
    recipientPhone,
    `مرحباً ${recipientName}! 🎁\n\nبطاقة هدية ${from}!\n💳 ${giftCardCode}\n💰 ${amount} درهم\n\nاستخدمها في rendez-vousك القادم 💕`
  );
}

export async function getConnectionStatus(): Promise<{ connected: boolean; status?: string; error?: string }> {
  const s = getStatus();
  return { connected: s.connected, status: s.status };
}

// ── 24h appointment reminder with 1/2/3 reply options ─────────────────────
export async function sendAppointmentReminderWithOptions(
  clientPhone: string,
  clientName: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName: string,
  salonName?: string,
  language?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || "PREGA SQUAD";
  const firstName = clientName.split(" ")[0];
  const relDate = formatRelativeDate(appointmentDate);
  const isFrench = language === "french";
  const msg = isFrench
    ? `Bonjour ${firstName} 🌸\n\nRappel : votre rendez-vous est *demain* !\n\n📅 ${relDate}\n⏰ ${appointmentTime}\n💅 ${serviceName}\n\nchez ${salon} 💕\n\nRépondez :\n*1* ✅ Confirmer\n*2* ❌ Annuler\n*3* 🔄 Modifier`
    : `مرحبا ${firstName} 🌸\n\nتذكير : rendez-vousك *غدًا* !\n\n📅 ${relDate}\n⏰ ${appointmentTime}\n💅 ${serviceName}\n\nفي ${salon} 💕\n\nردّي بـ :\n*1* ✅ تأكيد\n*2* ❌ إلغاء\n*3* 🔄 تعديل`;
  return sendWhatsAppMessage(clientPhone, msg);
}

// ── WhatsApp Status (Today's available slots) ─────────────────────────────
export async function sendWhatsAppStatus(
  text: string
): Promise<{ success: boolean; error?: string }> {
  if (!sock) return { success: false, error: "WhatsApp not connected" };
  try {
    await sock.sendMessage("status@broadcast", { text });
    console.log("[Status] Posted WhatsApp status");
    return { success: true };
  } catch (err: any) {
    console.error("[Status] Failed to post WhatsApp status:", err.message);
    return { success: false, error: err.message };
  }
}
