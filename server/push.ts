import webpush from 'web-push';
import { getDb } from './db';
import { pushSubscriptions } from '@shared/schema';
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

    const { sendAppointmentReminder } = await import('./wawp');

    for (const apt of allAppointments) {
      if (sentReminderIds.has(apt.id)) continue;

      const phone = apt.phone;
      if (!phone) continue;

      const [aptHour, aptMin] = apt.startTime.split(':').map(Number);
      let aptTotalMinutes = aptHour * 60 + aptMin;
      if (apt.date === tomorrowDate) {
        aptTotalMinutes += 24 * 60;
      }

      const minutesUntil = aptTotalMinutes - currentMinutes;

      if (minutesUntil > 0 && minutesUntil <= 120) {
        sentReminderIds.add(apt.id);
        try {
          const clientName = apt.client?.split(' (')[0] || 'Client';
          const serviceName = apt.service || 'RDV';
          await sendAppointmentReminder(
            phone,
            clientName,
            apt.date,
            apt.startTime,
            serviceName
          );
          console.log(`[Reminder] Sent WhatsApp reminder for appointment ${apt.id} (${clientName} at ${apt.startTime})`);
        } catch (err) {
          console.error(`[Reminder] Failed to send for appointment ${apt.id}:`, err);
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

export { vapidPublicKey };
