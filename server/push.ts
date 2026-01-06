import webpush from 'web-push';
import { db } from './db';
import { pushSubscriptions } from '@shared/schema';
import { eq } from 'drizzle-orm';

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
    const subscriptions = await db.select().from(pushSubscriptions);
    
    const payload = JSON.stringify({
      title,
      body,
      url: url || '/planning',
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
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
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
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

export { vapidPublicKey };
