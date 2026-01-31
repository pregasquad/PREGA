import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getFromOfflineStore, saveToOfflineStore, addToSyncQueue, addItemToOfflineStore, updateItemInOfflineStore, deleteItemFromOfflineStore } from "./offlineDb";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

const urlToStoreMap: Record<string, string> = {
  '/api/appointments/all': 'appointments',
  '/api/appointments': 'appointments',
  '/api/services': 'services',
  '/api/categories': 'categories',
  '/api/staff': 'staff',
  '/api/clients': 'clients',
  '/api/charges': 'charges',
  '/api/staff-deductions': 'staffDeductions',
  '/api/staff-commissions': 'staffCommissions',
  '/api/products': 'products',
};

function getStoreNameFromUrl(url: string): string | null {
  for (const [pattern, store] of Object.entries(urlToStoreMap)) {
    if (url === pattern || url.startsWith(pattern + '?')) {
      return store;
    }
  }
  return null;
}

function getStoreAndIdFromMutationUrl(url: string): { store: string | null; id: number | null } {
  const patterns = [
    { pattern: /^\/api\/appointments\/(\d+)$/, store: 'appointments' },
    { pattern: /^\/api\/services\/(\d+)$/, store: 'services' },
    { pattern: /^\/api\/categories\/(\d+)$/, store: 'categories' },
    { pattern: /^\/api\/staff\/(\d+)$/, store: 'staff' },
    { pattern: /^\/api\/clients\/(\d+)$/, store: 'clients' },
    { pattern: /^\/api\/charges\/(\d+)$/, store: 'charges' },
    { pattern: /^\/api\/staff-deductions\/(\d+)$/, store: 'staffDeductions' },
    { pattern: /^\/api\/staff-commissions\/(\d+)$/, store: 'staffCommissions' },
    { pattern: /^\/api\/products\/(\d+)$/, store: 'products' },
  ];

  for (const { pattern, store } of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { store, id: parseInt(match[1], 10) };
    }
  }

  const createPatterns = [
    { pattern: /^\/api\/appointments$/, store: 'appointments' },
    { pattern: /^\/api\/services$/, store: 'services' },
    { pattern: /^\/api\/categories$/, store: 'categories' },
    { pattern: /^\/api\/staff$/, store: 'staff' },
    { pattern: /^\/api\/clients$/, store: 'clients' },
    { pattern: /^\/api\/charges$/, store: 'charges' },
    { pattern: /^\/api\/staff-deductions$/, store: 'staffDeductions' },
    { pattern: /^\/api\/staff-commissions$/, store: 'staffCommissions' },
    { pattern: /^\/api\/products$/, store: 'products' },
  ];

  for (const { pattern, store } of createPatterns) {
    if (pattern.test(url)) {
      return { store, id: null };
    }
  }

  return { store: null, id: null };
}

async function updateLocalCacheForOfflineMutation(
  method: string,
  url: string,
  data: any
): Promise<void> {
  const { store, id } = getStoreAndIdFromMutationUrl(url);
  if (!store) return;

  try {
    if (method === 'POST' && data) {
      const tempId = Date.now();
      await addItemToOfflineStore(store as any, { ...data, id: tempId, _offline: true });
    } else if (method === 'PUT' && id && data) {
      await updateItemInOfflineStore(store as any, id, data);
    } else if (method === 'DELETE' && id) {
      await deleteItemFromOfflineStore(store as any, id);
    }
  } catch (error) {
    console.warn(`[Offline] Failed to update local cache for ${method} ${url}:`, error);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  if (!navigator.onLine && method !== 'GET') {
    await addToSyncQueue({
      method: method as 'POST' | 'PUT' | 'DELETE',
      url,
      body: data,
    });
    
    await updateLocalCacheForOfflineMutation(method, url, data);
    
    return new Response(JSON.stringify({ queued: true, _offline: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const storeName = getStoreNameFromUrl(url);

    if (!navigator.onLine && storeName) {
      try {
        const offlineData = await getFromOfflineStore(storeName as any);
        if (offlineData && offlineData.length > 0) {
          console.log(`[Offline] Returning cached data for ${storeName}`);
          return offlineData as unknown;
        }
      } catch (e) {
        console.warn(`[Offline] Failed to get cached data for ${storeName}:`, e);
      }
    }

    try {
      const res = await fetch(url, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      const data = await res.json();

      if (storeName && Array.isArray(data)) {
        saveToOfflineStore(storeName as any, data).catch(e => 
          console.warn(`[Offline] Failed to cache ${storeName}:`, e)
        );
      }

      return data;
    } catch (error) {
      if (!navigator.onLine && storeName) {
        try {
          const offlineData = await getFromOfflineStore(storeName as any);
          if (offlineData && offlineData.length > 0) {
            console.log(`[Offline] Returning cached data for ${storeName} after network failure`);
            return offlineData as unknown;
          }
        } catch (e) {
          console.warn(`[Offline] Failed to get cached data for ${storeName}:`, e);
        }
      }
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
