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

export { vapidPublicKey };
