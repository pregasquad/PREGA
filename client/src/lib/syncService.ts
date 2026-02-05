import {
  getSyncQueue,
  removeFromSyncQueue,
  updateSyncQueueItem,
  setLastSyncTime,
  saveToOfflineStore,
  getFromOfflineStore,
  addToSyncQueue,
  addItemToOfflineStore,
  deleteItemFromOfflineStore,
  initOfflineDb,
} from './offlineDb';

const MAX_RETRIES = 3;

type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';

let syncStatus: SyncStatus = 'idle';
let syncListeners: ((status: SyncStatus, pendingCount: number) => void)[] = [];

export function onSyncStatusChange(callback: (status: SyncStatus, pendingCount: number) => void) {
  syncListeners.push(callback);
  return () => {
    syncListeners = syncListeners.filter(l => l !== callback);
  };
}

function notifyListeners(status: SyncStatus, pendingCount: number) {
  syncStatus = status;
  syncListeners.forEach(l => l(status, pendingCount));
}

type OfflineStoreName = 'appointments' | 'services' | 'categories' | 'staff' | 'clients' | 'charges' | 'products' | 'staffDeductions' | 'staffCommissions' | 'businessSettings';

// Extract ID from URL pattern like /api/appointments/123
function extractIdFromUrl(url: string): number | null {
  const match = url.match(/\/(\d+)(?:\?|$)/);
  return match ? parseInt(match[1], 10) : null;
}

// Determine which store to use based on URL or explicit _store field
function getStoreFromUrl(url: string, body?: any): OfflineStoreName {
  if (body?._store) return body._store as OfflineStoreName;
  if (url.includes('/appointments')) return 'appointments';
  if (url.includes('/services')) return 'services';
  if (url.includes('/categories')) return 'categories';
  if (url.includes('/staff')) return 'staff';
  if (url.includes('/clients')) return 'clients';
  if (url.includes('/charges')) return 'charges';
  if (url.includes('/products')) return 'products';
  return 'appointments'; // default
}

export async function syncPendingChanges(): Promise<{ success: number; failed: number }> {
  if (!navigator.onLine) {
    return { success: 0, failed: 0 };
  }

  const queue = await getSyncQueue();
  
  if (queue.length === 0) {
    return { success: 0, failed: 0 };
  }

  notifyListeners('syncing', queue.length);

  let success = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      // Extract metadata from body
      const bodyToSend = item.body ? { ...item.body } : undefined;
      const tempId = bodyToSend?._tempId;
      const storeName = getStoreFromUrl(item.url, bodyToSend);
      
      // Clean metadata from body before sending to server
      if (bodyToSend) {
        delete bodyToSend._tempId;
        delete bodyToSend._store;
      }

      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: bodyToSend ? JSON.stringify(bodyToSend) : undefined,
        credentials: 'include',
      });

      if (response.ok || response.status === 201 || response.status === 204) {
        await removeFromSyncQueue(item.id);
        
        // Handle POST (create) - always delete temp item first, then add server data if available
        if (item.method === 'POST' && tempId) {
          // Delete temp item FIRST to prevent duplicates regardless of response parsing
          await deleteItemFromOfflineStore(storeName, tempId).catch(() => {});
          
          try {
            const serverData = await response.json();
            if (serverData && serverData.id) {
              await addItemToOfflineStore(storeName, serverData);
              console.log(`[Sync] Replaced offline ${storeName} ${tempId} with server ID ${serverData.id}`);
            }
          } catch (e) {
            // Response might not have JSON body - temp item already deleted, that's OK
            console.log(`[Sync] Deleted offline ${storeName} ${tempId}, no server data to store`);
          }
        }
        
        // Handle PUT (update) - update offline item with server data if available
        if (item.method === 'PUT') {
          const itemId = bodyToSend?.id || extractIdFromUrl(item.url);
          try {
            const serverData = await response.json();
            if (serverData && serverData.id) {
              await addItemToOfflineStore(storeName, serverData);
              console.log(`[Sync] Updated offline ${storeName} with server data`);
            }
          } catch (e) {
            // Server returned 204 or empty response - keep local updated data
            if (itemId && bodyToSend) {
              const existingData = await getFromOfflineStore(storeName);
              const existingItem = existingData.find((d: any) => d.id === itemId);
              if (existingItem) {
                await addItemToOfflineStore(storeName, { ...existingItem, ...bodyToSend, id: itemId });
                console.log(`[Sync] Retained local ${storeName} update for ID ${itemId}`);
              }
            }
          }
        }
        
        // Handle DELETE - ensure item is removed from offline store
        if (item.method === 'DELETE') {
          const deleteId = bodyToSend?.id || extractIdFromUrl(item.url);
          if (deleteId) {
            await deleteItemFromOfflineStore(storeName, deleteId).catch(() => {});
            console.log(`[Sync] Deleted offline ${storeName} ${deleteId}`);
          }
        }
        
        success++;
      } else if (response.status >= 400 && response.status < 500) {
        await removeFromSyncQueue(item.id);
        // Clean up failed offline item to avoid stale data
        if (tempId) {
          await deleteItemFromOfflineStore(storeName, tempId).catch(() => {});
        }
        failed++;
        console.error(`Sync failed for ${item.url}: ${response.status}`);
      } else {
        item.retries++;
        if (item.retries >= MAX_RETRIES) {
          await removeFromSyncQueue(item.id);
          failed++;
          console.error(`Sync failed after ${MAX_RETRIES} retries: ${item.url}`);
        } else {
          await updateSyncQueueItem(item);
        }
      }
    } catch (error) {
      item.retries++;
      if (item.retries >= MAX_RETRIES) {
        await removeFromSyncQueue(item.id);
        failed++;
        console.error(`Sync failed after ${MAX_RETRIES} retries:`, error);
      } else {
        await updateSyncQueueItem(item);
      }
    }
  }

  const remainingQueue = await getSyncQueue();
  notifyListeners(failed > 0 ? 'error' : 'success', remainingQueue.length);

  return { success, failed };
}

export async function refreshAndCacheData(): Promise<void> {
  if (!navigator.onLine) return;

  await initOfflineDb();

  const endpoints = [
    { url: '/api/appointments/all', store: 'appointments' as const },
    { url: '/api/services', store: 'services' as const },
    { url: '/api/categories', store: 'categories' as const },
    { url: '/api/staff', store: 'staff' as const },
    { url: '/api/clients', store: 'clients' as const },
    { url: '/api/charges', store: 'charges' as const },
    { url: '/api/staff-deductions', store: 'staffDeductions' as const },
    { url: '/api/staff-commissions', store: 'staffCommissions' as const },
    { url: '/api/products', store: 'products' as const },
  ];

  const promises = endpoints.map(async ({ url, store }) => {
    try {
      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          await saveToOfflineStore(store, data);
          console.log(`[Sync] Cached ${data.length} items for ${store}`);
        }
      }
    } catch (error) {
      console.warn(`[Sync] Failed to cache ${store}:`, error);
    }
  });

  await Promise.all(promises);
  await setLastSyncTime(Date.now());
  console.log('[Sync] Data refresh complete');
}

export async function getOfflineData<T>(store: string): Promise<T[]> {
  try {
    return await getFromOfflineStore(store as any);
  } catch (error) {
    console.warn(`Failed to get offline data for ${store}:`, error);
    return [];
  }
}

export async function queueOfflineMutation(
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: any
): Promise<void> {
  await addToSyncQueue({ method, url, body });
  
  const queue = await getSyncQueue();
  notifyListeners('idle', queue.length);
}

export function getSyncStatus(): SyncStatus {
  return syncStatus;
}

let syncInterval: NodeJS.Timeout | null = null;

export function startAutoSync(intervalMs: number = 30000): void {
  if (syncInterval) return;
  
  syncInterval = setInterval(async () => {
    if (navigator.onLine) {
      await syncPendingChanges();
    }
  }, intervalMs);

  window.addEventListener('online', async () => {
    console.log('[Sync] Online - syncing pending changes');
    await syncPendingChanges();
    await refreshAndCacheData();
  });
}

export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
