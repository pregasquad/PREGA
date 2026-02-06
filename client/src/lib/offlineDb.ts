const DB_NAME = 'pregasquad-offline';
const DB_VERSION = 1;

interface OfflineStore {
  appointments: any[];
  services: any[];
  categories: any[];
  staff: any[];
  clients: any[];
  charges: any[];
  staffDeductions: any[];
  staffCommissions: any[];
  products: any[];
  businessSettings: any;
}

interface SyncQueueItem {
  id: string;
  method: 'POST' | 'PUT' | 'DELETE';
  url: string;
  body?: any;
  timestamp: number;
  retries: number;
}

let db: IDBDatabase | null = null;

export async function initOfflineDb(): Promise<IDBDatabase> {
  if (db) return db;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      const stores = [
        'appointments', 'services', 'categories', 'staff', 
        'clients', 'charges', 'staffDeductions', 'staffCommissions', 
        'products', 'businessSettings'
      ];
      
      stores.forEach(storeName => {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'id', autoIncrement: false });
        }
      });
      
      if (!database.objectStoreNames.contains('syncQueue')) {
        database.createObjectStore('syncQueue', { keyPath: 'id' });
      }
      
      if (!database.objectStoreNames.contains('metadata')) {
        database.createObjectStore('metadata', { keyPath: 'key' });
      }
    };
  });
}

export async function saveToOfflineStore<T extends { id?: any }>(
  storeName: keyof OfflineStore,
  data: T[]
): Promise<void> {
  try {
    const database = await initOfflineDb();
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      
      store.clear();
      
      data.forEach(item => {
        if (item && item.id !== undefined && item.id !== null) {
          store.put(item);
        }
      });
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.warn(`[OfflineDB] Error saving to ${storeName}:`, error);
  }
}

export async function addItemToOfflineStore<T extends { id?: any }>(
  storeName: keyof OfflineStore,
  item: T
): Promise<void> {
  try {
    const database = await initOfflineDb();
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      
      if (item && item.id !== undefined && item.id !== null) {
        store.put(item);
      }
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.warn(`[OfflineDB] Error adding item to ${storeName}:`, error);
  }
}

export async function updateItemInOfflineStore(
  storeName: keyof OfflineStore,
  id: any,
  updates: Record<string, any>
): Promise<void> {
  try {
    const database = await initOfflineDb();
    const existing = await getFromOfflineStore<any>(storeName);
    const updated = existing.map(item => 
      item.id === id ? { ...item, ...updates } : item
    );
    await saveToOfflineStore(storeName, updated);
  } catch (error) {
    console.warn(`[OfflineDB] Error updating item in ${storeName}:`, error);
  }
}

export async function deleteItemFromOfflineStore(
  storeName: keyof OfflineStore,
  id: any
): Promise<void> {
  try {
    const database = await initOfflineDb();
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      
      store.delete(id);
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.warn(`[OfflineDB] Error deleting from ${storeName}:`, error);
  }
}

export async function getFromOfflineStore<T>(
  storeName: keyof OfflineStore
): Promise<T[]> {
  const database = await initOfflineDb();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retries'>): Promise<void> {
  const database = await initOfflineDb();
  
  const queueItem: SyncQueueItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    retries: 0,
  };
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('syncQueue', 'readwrite');
    const store = transaction.objectStore('syncQueue');
    
    store.add(queueItem);
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const database = await initOfflineDb();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('syncQueue', 'readonly');
    const store = transaction.objectStore('syncQueue');
    const request = store.getAll();
    
    request.onsuccess = () => {
      const items = request.result || [];
      items.sort((a, b) => a.timestamp - b.timestamp);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function removeFromSyncQueue(id: string): Promise<void> {
  const database = await initOfflineDb();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('syncQueue', 'readwrite');
    const store = transaction.objectStore('syncQueue');
    
    store.delete(id);
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function updateSyncQueueItem(item: SyncQueueItem): Promise<void> {
  const database = await initOfflineDb();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('syncQueue', 'readwrite');
    const store = transaction.objectStore('syncQueue');
    
    store.put(item);
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function clearSyncQueue(): Promise<void> {
  const database = await initOfflineDb();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('syncQueue', 'readwrite');
    const store = transaction.objectStore('syncQueue');
    
    store.clear();
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function setLastSyncTime(time: number): Promise<void> {
  const database = await initOfflineDb();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('metadata', 'readwrite');
    const store = transaction.objectStore('metadata');
    
    store.put({ key: 'lastSync', value: time });
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getLastSyncTime(): Promise<number | null> {
  const database = await initOfflineDb();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('metadata', 'readonly');
    const store = transaction.objectStore('metadata');
    const request = store.get('lastSync');
    
    request.onsuccess = () => resolve(request.result?.value || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getSyncQueueCount(): Promise<number> {
  const queue = await getSyncQueue();
  return queue.length;
}
