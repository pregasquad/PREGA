import webpush from 'web-push';
import { getDb } from './db';
import { pushSubscriptions } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { storage } from './storage';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    'mailto:contact@pregasquad.com',
    vapidPublicKey,
    vapidPrivateKey
  );
}

export async function sendPushNotification(
  title: string,
  body: string,
  url?: string
) {
  try {
    const db = getDb();
    const subscriptions = await db.select().from(pushSubscriptions);
    
    const payload = JSON.stringify({
      title,
      body,
      url: url || '/planning',
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub: any) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload,
            {
              TTL: 300,
              urgency: 'normal',
            }
          );
          return { success: true, id: sub.id };
        } catch (error: any) {
          if (error.statusCode === 410 || error.statusCode === 404) {
            await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          }
          return { success: false, id: sub.id, error: error.message };
        }
      })
    );

    return results;
  } catch (error) {
    console.error('Error sending push notifications:', error);
    return [];
  }
}

export async function checkAndNotifyExpiringProducts(): Promise<void> {
  try {
    const expiringProducts = await storage.getExpiringProducts();
    
    if (expiringProducts.length === 0) {
      return;
    }
    
    const today = new Date();
    const expiredProducts = expiringProducts.filter((p: any) => {
      const expiryDate = new Date(p.expiryDate);
      return expiryDate <= today;
    });
    
    const soonExpiringProducts = expiringProducts.filter((p: any) => {
      const expiryDate = new Date(p.expiryDate);
      return expiryDate > today;
    });
    
    if (expiredProducts.length > 0) {
      const names = expiredProducts.slice(0, 3).map((p: any) => p.name).join(', ');
      const more = expiredProducts.length > 3 ? ` +${expiredProducts.length - 3} more` : '';
      await sendPushNotification(
        'Products Expired!',
        `${names}${more} have expired and need attention`,
        '/inventory'
      );
    }
    
    if (soonExpiringProducts.length > 0) {
      const names = soonExpiringProducts.slice(0, 3).map((p: any) => p.name).join(', ');
      const more = soonExpiringProducts.length > 3 ? ` +${soonExpiringProducts.length - 3} more` : '';
      await sendPushNotification(
        'Products Expiring Soon',
        `${names}${more} will expire soon`,
        '/inventory'
      );
    }
  } catch (error) {
    console.error('Error checking expiring products:', error);
  }
}

export async function checkAndNotifyLowStock(): Promise<void> {
  try {
    const lowStockProducts = await storage.getLowStockProducts();
    
    if (lowStockProducts.length === 0) {
      return;
    }
    
    const names = lowStockProducts.slice(0, 3).map((p: any) => p.name).join(', ');
    const more = lowStockProducts.length > 3 ? ` +${lowStockProducts.length - 3} more` : '';
    await sendPushNotification(
      'Low Stock Alert',
      `${names}${more} need restocking`,
      '/inventory'
    );
  } catch (error) {
    console.error('Error checking low stock products:', error);
  }
}

function getLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

let lastClosingReminderDate = '';

export async function sendClosingReminderNow(): Promise<void> {
  await sendPushNotification(
    'Closing Day Reminder',
    'Time to check your closing day checklist before you leave!',
    '/'
  );
}

export async function checkAndSendClosingReminder(): Promise<void> {
  try {
    const settings = await storage.getBusinessSettings();
    if (!settings) return;

    const now = new Date();
    const todayDate = getLocalDateString(now);

    if (lastClosingReminderDate === todayDate) return;

    const closingTime = settings.closingTime || '19:00';
    const [closingHour, closingMin] = closingTime.split(':').map(Number);

    const closingMinutes = closingHour * 60 + closingMin;
    const reminderMinutes = Math.max(0, closingMinutes - 30);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (currentMinutes >= reminderMinutes && currentMinutes <= closingMinutes) {
      lastClosingReminderDate = todayDate;
      await sendClosingReminderNow();
      console.log(`[Push] Sent closing day reminder for ${todayDate}`);
    }
  } catch (error) {
    console.error('[Push] Error sending closing reminder:', error);
  }
}

const sentReminderIds = new Set<number>();

export async function checkAndSendAppointmentReminders(): Promise<void> {
  try {
    const now = new Date();
    const todayDate = getLocalDateString(now);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = getLocalDateString(tomorrow);

    const todayAppointments = await storage.getAppointments(todayDate);
    const allAppointments = [...(todayAppointments || [])];

    if (currentMinutes >= 22 * 60) {
      const tomorrowAppointments = await storage.getAppointments(tomorrowDate);
      if (tomorrowAppointments) {
        allAppointments.push(...tomorrowAppointments);
      }
    }

    if (allAppointments.length === 0) return;

    const { sendAppointmentReminder } = await import('./baileys.js');

    for (const apt of allAppointments) {
      if (sentReminderIds.has(apt.id)) continue;

      // Only remind pending or confirmed bookings (skip cancelled)
      if ((apt as any).bookingStatus === 'cancelled') continue;

      // Try apt.phone first, fall back to phone embedded in client string "Name (0612345678)"
      const phone = apt.phone || apt.client?.match(/\(([^)]+)\)/)?.[1] || null;
      if (!phone) continue;

      const [aptHour, aptMin] = apt.startTime.split(':').map(Number);
      let aptTotalMinutes = aptHour * 60 + aptMin;
      if (apt.date === tomorrowDate) {
        aptTotalMinutes += 24 * 60;
      }

      const minutesUntil = aptTotalMinutes - currentMinutes;

      // Fire when appointment is between 40 and 55 minutes away.
      // Window is wider than the 5-min check interval to survive server restarts
      // and scheduling jitter. sentReminderIds prevents duplicate sends.
      if (minutesUntil >= 40 && minutesUntil < 55) {
        sentReminderIds.add(apt.id);
        try {
          const clientName = apt.client?.split(' (')[0]?.trim() || 'Client';
          const serviceName = apt.service || 'RDV';
          await sendAppointmentReminder(
            phone,
            clientName,
            apt.date,
            apt.startTime,
            serviceName
          );
          console.log(`[Reminder] Sent WhatsApp reminder for appointment ${apt.id} (${clientName} at ${apt.startTime}, ${minutesUntil} min away)`);
        } catch (err) {
          console.error(`[Reminder] Failed to send for appointment ${apt.id}:`, err);
          sentReminderIds.delete(apt.id); // allow retry on next cycle if send failed
        }
      }
    }

    if (currentMinutes < 5) {
      sentReminderIds.clear();
    }
  } catch (error) {
    console.error('[Reminder] Error checking appointment reminders:', error);
  }
}

// ── 24h appointment reminder scheduler ───────────────────────────────────────
const sent24hReminderIds = new Set<number>();
let last24hCheckDate = "";

export async function checkAndSend24hReminders(): Promise<void> {
  try {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Only run between 09:00 and 21:00
    if (currentMinutes < 9 * 60 || currentMinutes > 21 * 60) return;

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;

    const tomorrowAppointments = await storage.getAppointments(tomorrowDate);
    if (!tomorrowAppointments || tomorrowAppointments.length === 0) return;

    const { sendAppointmentReminderWithOptions } = await import('./baileys.js');
    const { pool } = await import('./db.js');
    const settings = await storage.getBusinessSettings().catch(() => null);
    const salonName = (settings as any)?.businessName || "PREGA SQUAD";

    for (const apt of tomorrowAppointments) {
      if (sent24hReminderIds.has(apt.id)) continue;
      if ((apt as any).bookingStatus === 'cancelled') continue;
      if ((apt as any).reminderSent) continue;

      const phone = apt.phone || apt.client?.match(/\(([^)]+)\)/)?.[1] || null;
      if (!phone) continue;

      sent24hReminderIds.add(apt.id);
      try {
        const clientName = apt.client?.split(' (')[0]?.trim() || 'Client';
        const serviceName = apt.service || 'RDV';
        await sendAppointmentReminderWithOptions(phone, clientName, apt.date, apt.startTime, serviceName, salonName);
        // Mark reminder_sent in DB
        await pool.query(`UPDATE appointments SET reminder_sent = TRUE WHERE id = $1`, [apt.id]).catch(() => {});
        console.log(`[24hReminder] Sent to ${clientName} for ${apt.date} at ${apt.startTime}`);
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        console.error(`[24hReminder] Failed for appointment ${apt.id}:`, err);
        sent24hReminderIds.delete(apt.id);
      }
    }

    // Reset daily
    const todayStr = getLocalDateString(now);
    if (last24hCheckDate !== todayStr) last24hCheckDate = todayStr;
  } catch (error) {
    console.error('[24hReminder] Error:', error);
  }
}

// ── Morning WhatsApp Status — post available slots at opening ─────────────────
let lastMorningStatusDate = "";

export async function checkAndSendMorningStatus(): Promise<void> {
  try {
    const now = new Date();
    const todayDate = getLocalDateString(now);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Fire once per day between 09:00 and 09:10
    if (lastMorningStatusDate === todayDate) return;
    if (currentMinutes < 9 * 60 || currentMinutes > 9 * 60 + 10) return;
    lastMorningStatusDate = todayDate;

    const settings = await storage.getBusinessSettings().catch(() => null);
    if (!(settings as any)?.morningStatusEnabled) return;

    const salonName = (settings as any)?.businessName || "PREGA SQUAD";
    const todayAppointments = (await storage.getAppointments(todayDate)) || [];

    // Build list of booked time slots
    const bookedSlots = new Set(todayAppointments.map((a: any) => a.startTime));

    // Generate available half-hour slots between opening and closing
    const openingTime: string = (settings as any)?.openingTime || "09:00";
    const closingTime: string = (settings as any)?.closingTime || "20:00";
    const [openH, openM] = openingTime.split(':').map(Number);
    const [closeH, closeM] = closingTime.split(':').map(Number);
    const openMin = openH * 60 + openM;
    const closeMin = closeH * 60 + closeM;

    const available: string[] = [];
    for (let m = openMin; m < closeMin; m += 30) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      const slot = `${hh}:${mm}`;
      if (!bookedSlots.has(slot)) available.push(slot);
    }

    if (available.length === 0) return;

    // Format day name in Arabic
    const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const dayName = days[now.getDay()];
    const dateFormatted = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}`;

    const slotLines = available.slice(0, 12).join('  •  ');
    const statusText = `🌸 *${salonName}*\n\n✨ مواعيد متاحة اليوم — ${dayName} ${dateFormatted}\n\n⏰ ${slotLines}\n\n📲 للحجز راسليني هنا 💕`;

    const { sendWhatsAppStatus } = await import('./baileys.js');
    const result = await sendWhatsAppStatus(statusText);
    if (result.success) {
      console.log(`[MorningStatus] Posted ${available.length} available slots`);
    }
  } catch (error) {
    console.error('[MorningStatus] Error:', error);
  }
}

const sentRebookingJids = new Set<string>();
let lastRebookingCheckDate = "";

/**
 * Once per day (at ~10:00), check all bot memory records.
 * Clients who haven't been seen in X weeks and have a phone → send a "we miss you" WhatsApp.
 * Default threshold: 3 weeks (21 days). Configurable via business settings.
 */
export async function checkAndSendRebookingReminders(): Promise<void> {
  try {
    const now = new Date();
    const todayDate = getLocalDateString(now);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Fire once per day between 10:00 and 10:10
    if (lastRebookingCheckDate === todayDate) return;
    if (currentMinutes < 10 * 60 || currentMinutes > 10 * 60 + 10) return;
    lastRebookingCheckDate = todayDate;

    const settings = await storage.getBusinessSettings();
    const salonName = settings?.businessName || "صالوننا";
    const bookingUrl = (settings as any)?.bookingUrl || "";

    const { getAllBotMemories } = await import("./db");
    const memories = await getAllBotMemories();

    const { sendWhatsAppMessage } = await import("./baileys.js");

    const WEEKS = 3;
    const thresholdMs = WEEKS * 7 * 24 * 60 * 60 * 1000;

    for (const mem of memories) {
      if (!mem.phone) continue;
      if (mem.botBlocked) continue;
      if (sentRebookingJids.has(mem.jid)) continue;
      if (!mem.lastSeen) continue;

      const msSinceSeen = Date.now() - new Date(mem.lastSeen).getTime();
      if (msSinceSeen < thresholdMs) continue;

      // Build a personalised message in the client's language
      const name = mem.clientName ? ` ${mem.clientName}` : "";
      const lang = mem.language || "darija";

      let msg: string;
      if (lang === "french") {
        msg = `Bonjour${name} 🌸\n\nCela fait un moment qu'on ne vous a pas vue chez ${salonName} — vous nous manquez ! 💖\n\nSi vous souhaitez reprendre soin de vous, on est là pour vous accueillir avec plaisir 😊${bookingUrl ? `\n\n📲 Réservez ici : ${bookingUrl}` : ""}`;
      } else {
        // Darija / Arabic default
        msg = `مرحبا${name} 🌸\n\nوحشتينا بزاف! مزال ما جيتيش لـ${salonName} 💖\n\nكنا غير نتمنى تكوني بخير — وكي تحبي ترجعي كنا مستنياك هنا 😊${bookingUrl ? `\n\n📲 حجزي rendez-vousك هنا: ${bookingUrl}` : ""}`;
      }

      try {
        await sendWhatsAppMessage(mem.jid, msg);
        sentRebookingJids.add(mem.jid);
        console.log(`[Rebooking] Sent reminder to ${mem.clientName || mem.jid} (last seen ${Math.round(msSinceSeen / (24 * 60 * 60 * 1000))} days ago)`);
      } catch (err) {
        console.error(`[Rebooking] Failed to send to ${mem.jid}:`, err);
      }

      // Small delay between messages to avoid WhatsApp rate-limiting
      await new Promise(r => setTimeout(r, 2000));
    }

    // Reset sent set daily so new clients who went inactive can receive next cycle
    if (currentMinutes < 5) sentRebookingJids.clear();

  } catch (error) {
    console.error('[Rebooking] Error checking rebooking reminders:', error);
  }
}

export { vapidPublicKey };
