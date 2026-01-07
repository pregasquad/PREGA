// Push notification service worker

self.addEventListener('push', function(event) {
  console.log('[SW] Push event received:', event);
  
  let data = { title: 'PREGA SQUAD', body: 'Nouveau rendez-vous!' };
  
  if (event.data) {
    try {
      data = event.data.json();
      console.log('[SW] Push data:', data);
    } catch (e) {
      console.log('[SW] Push data as text:', event.data.text());
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'prega-squad-notification',
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || '/planning',
      dateOfArrival: Date.now()
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

self.addEventListener('install', function(event) {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[SW] Activating...');
  event.waitUntil(clients.claim());
});

// For workbox inject manifest (production build)
if (typeof self.__WB_MANIFEST !== 'undefined') {
  // This will be replaced by workbox during build
  console.log('[SW] Workbox manifest available');
}
