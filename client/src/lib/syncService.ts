import {
  getSyncQueue,
  removeFromSyncQueue,
  updateSyncQueueItem,
  setLastSyncTime,
  saveToOfflineStore,
  getFromOfflineStore,
  addToSyncQueue,
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
      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: item.body ? JSON.stringify(item.body) : undefined,
        credentials: 'include',
      });

      if (response.ok || response.status === 201 || response.status === 204) {
        await removeFromSyncQueue(item.id);
        success++;
      } else if (response.status >= 400 && response.status < 500) {
        await removeFromSyncQueue(item.id);
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
        if (Array.isArray(data)) {
          await saveToOfflineStore(store, data);
        }
      }
    } catch (error) {
      console.warn(`Failed to cache ${store}:`, error);
    }
  });

  await Promise.all(promises);
  await setLastSyncTime(Date.now());
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
