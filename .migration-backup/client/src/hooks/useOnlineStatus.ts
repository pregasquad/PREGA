import { useState, useEffect, useCallback } from 'react';
import { getSyncQueueCount } from '@/lib/offlineDb';
import { onSyncStatusChange, syncPendingChanges, refreshAndCacheData } from '@/lib/syncService';

type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncPendingChanges().then(() => {
        refreshAndCacheData();
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = onSyncStatusChange((status, count) => {
      setSyncStatus(status);
      setPendingCount(count);
      if (status === 'success') {
        setLastSyncTime(new Date());
      }
    });

    getSyncQueueCount().then(setPendingCount);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const manualSync = useCallback(async () => {
    if (!isOnline) return;
    
    setSyncStatus('syncing');
    const result = await syncPendingChanges();
    await refreshAndCacheData();
    
    return result;
  }, [isOnline]);

  return {
    isOnline,
    syncStatus,
    pendingCount,
    lastSyncTime,
    manualSync,
  };
}
