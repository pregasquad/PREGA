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
  // Check kebab-case endpoints first (more specific)
  if (url.includes('/staff-deductions')) return 'staffDeductions';
  if (url.includes('/staff-commissions')) return 'staffCommissions';
  if (url.includes('/business-settings')) return 'businessSettings';
  // Then check regular endpoints
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
      
      // Extract offline timestamp for conflict detection
      const offlineUpdatedAt = bodyToSend?._offlineUpdatedAt || bodyToSend?.updatedAt;
      
      // Clean metadata from body before sending to server
      if (bodyToSend) {
        delete bodyToSend._tempId;
        delete bodyToSend._store;
        delete bodyToSend._offlineUpdatedAt;
      }

      // Conflict detection for PUT operations
      if (item.method === 'PUT') {
        const itemId = bodyToSend?.id || extractIdFromUrl(item.url);
        if (itemId) {
          try {
            // Build GET URL based on store type for reliable endpoint construction
            const storeToEndpoint: Record<string, string> = {
              'appointments': '/api/appointments',
              'services': '/api/services',
              'categories': '/api/categories',
              'staff': '/api/staff',
              'clients': '/api/clients',
              'charges': '/api/charges',
              'products': '/api/products',
              'staffDeductions': '/api/staff-deductions',
              'staffCommissions': '/api/staff-commissions',
              'businessSettings': '/api/business-settings',
            };
            // Get base endpoint, fallback to extracting from item.url
            let baseEndpoint = storeToEndpoint[storeName];
            if (!baseEndpoint) {
              // Try to extract base endpoint from item.url (e.g., /api/appointments/123 -> /api/appointments)
              const urlMatch = item.url.match(/^(\/api\/[^\/]+)/);
              if (urlMatch) {
                baseEndpoint = urlMatch[1];
                console.warn(`[Sync] Unknown store ${storeName}, using URL-derived endpoint: ${baseEndpoint}`);
              } else {
                console.warn(`[Sync] Unknown store ${storeName} and could not parse URL, skipping conflict check`);
              }
            }
            
            if (baseEndpoint) {
              const checkUrl = `${baseEndpoint}/${itemId}`;
              
              const serverCheck = await fetch(checkUrl, { 
                method: 'GET', 
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
              });
              
              if (serverCheck.ok) {
                // Verify response is JSON before parsing
                const contentType = serverCheck.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                  console.warn(`[Sync] Conflict check got non-JSON response for ${storeName} ${itemId}, skipping check`);
                  // Continue with the update without conflict check
                } else {
                  const serverData = await serverCheck.json();
                  const serverUpdatedAt = serverData?.updatedAt;
                  
                  // Only do conflict check if we have both timestamps
                  if (serverUpdatedAt && offlineUpdatedAt) {
                    const serverTime = new Date(serverUpdatedAt).getTime();
                    const offlineTime = new Date(offlineUpdatedAt).getTime();
                    
                    // Server version is newer - skip this update and use server data
                    if (serverTime > offlineTime) {
                      console.log(`[Sync] Conflict detected for ${storeName} ${itemId}: server is newer (${serverUpdatedAt} > ${offlineUpdatedAt}), using server data`);
                      await removeFromSyncQueue(item.id);
                      await addItemToOfflineStore(storeName, serverData);
                      success++;
                      continue; // Skip to next queue item
                    }
                    console.log(`[Sync] No conflict for ${storeName} ${itemId}: offline is newer or equal, applying update`);
                  } else if (!offlineUpdatedAt) {
                    // No offline timestamp - apply update but log warning
                    console.warn(`[Sync] No offline timestamp for ${storeName} ${itemId}, applying update without conflict check`);
                  }
                }
              } else if (serverCheck.status === 404) {
                // Item doesn't exist on server - skip this update
                console.log(`[Sync] Item ${storeName} ${itemId} not found on server, removing from queue`);
                await removeFromSyncQueue(item.id);
                await deleteItemFromOfflineStore(storeName, itemId).catch(() => {});
                failed++;
                continue;
              }
            }
          } catch (e) {
            // If conflict check fails due to network, requeue for later
            console.warn(`[Sync] Conflict check failed for ${storeName} ${itemId}:`, e);
            item.retries++;
            if (item.retries >= MAX_RETRIES) {
              await removeFromSyncQueue(item.id);
              failed++;
              console.error(`[Sync] Giving up on ${storeName} ${itemId} after ${MAX_RETRIES} retries`);
              continue;
            } else {
              await updateSyncQueueItem(item);
              continue; // Skip to next item, will retry later
            }
          }
        }
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
        // For POST with tempId, clean up the failed offline item
        if (item.method === 'POST' && tempId) {
          await removeFromSyncQueue(item.id);
          await deleteItemFromOfflineStore(storeName, tempId).catch(() => {});
          failed++;
          console.error(`[Sync] POST failed for ${item.url}: ${response.status}, cleaned up temp item`);
        } else if (item.method === 'PUT') {
          // For PUT failures, try to fetch server data to reconcile
          const itemId = bodyToSend?.id || extractIdFromUrl(item.url);
          let reconciled = false;
          if (itemId) {
            try {
              // Try to get fresh server data to reconcile local state
              const storeToEndpoint: Record<string, string> = {
                'appointments': '/api/appointments',
                'services': '/api/services',
                'categories': '/api/categories',
                'staff': '/api/staff',
                'clients': '/api/clients',
                'charges': '/api/charges',
                'products': '/api/products',
                'staffDeductions': '/api/staff-deductions',
                'staffCommissions': '/api/staff-commissions',
                'businessSettings': '/api/business-settings',
              };
              // Get base endpoint, fallback to extracting from item.url
              let baseEndpoint = storeToEndpoint[storeName];
              if (!baseEndpoint) {
                const urlMatch = item.url.match(/^(\/api\/[^\/]+)/);
                if (urlMatch) baseEndpoint = urlMatch[1];
              }
              if (baseEndpoint) {
                const refreshUrl = `${baseEndpoint}/${itemId}`;
                const refreshRes = await fetch(refreshUrl, { method: 'GET', credentials: 'include' });
                if (refreshRes.ok) {
                  const serverData = await refreshRes.json();
                  await addItemToOfflineStore(storeName, serverData);
                  console.log(`[Sync] PUT failed for ${storeName} ${itemId}, reconciled with server data`);
                  reconciled = true;
                }
              }
            } catch (e) {
              console.warn(`[Sync] PUT failed and could not reconcile ${storeName} ${itemId}`);
            }
          }
          if (reconciled) {
            await removeFromSyncQueue(item.id);
            failed++;
            console.error(`[Sync] PUT failed for ${item.url}: ${response.status}, reconciled`);
          } else {
            // Could not reconcile - keep in queue for retry
            item.retries++;
            if (item.retries >= MAX_RETRIES) {
              await removeFromSyncQueue(item.id);
              failed++;
              console.error(`[Sync] PUT failed for ${item.url}: ${response.status}, giving up after ${MAX_RETRIES} retries`);
            } else {
              await updateSyncQueueItem(item);
              console.warn(`[Sync] PUT failed for ${item.url}: ${response.status}, will retry (attempt ${item.retries})`);
            }
          }
        } else {
          // For DELETE and other methods, just remove from queue
          await removeFromSyncQueue(item.id);
          failed++;
          console.error(`[Sync] ${item.method} failed for ${item.url}: ${response.status}`);
        }
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
    { url: '/api/business-settings', store: 'businessSettings' as const },
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
