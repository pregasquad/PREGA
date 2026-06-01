import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useTranslation } from 'react-i18next';
import { WifiOff, RefreshCw, Cloud, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function OfflineIndicator() {
  const { t } = useTranslation();
  const { isOnline, syncStatus, pendingCount, lastSyncTime, manualSync } = useOnlineStatus();

  const hidden = isOnline && pendingCount === 0 && syncStatus !== 'syncing' && syncStatus !== 'success';
  if (hidden) return null;

  return (
    <div
      className={cn(
        'fixed bottom-20 left-3 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-xs transition-all duration-300',
        !isOnline
          ? 'bg-sky-500/90 text-white backdrop-blur-sm'
          : syncStatus === 'syncing'
          ? 'bg-amber-500/90 text-white backdrop-blur-sm'
          : pendingCount > 0
          ? 'bg-pink-500/90 text-white backdrop-blur-sm'
          : 'bg-green-500/90 text-white backdrop-blur-sm'
      )}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">{t('offline.offline')}</span>
          {pendingCount > 0 && (
            <span className="bg-white/25 px-1.5 py-0.5 rounded-full">
              {pendingCount} {t('offline.pending')}
            </span>
          )}
        </>
      ) : syncStatus === 'syncing' ? (
        <>
          <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span className="font-medium">{t('offline.syncing')}</span>
          {pendingCount > 0 && (
            <span className="bg-white/25 px-1.5 py-0.5 rounded-full">{pendingCount}</span>
          )}
        </>
      ) : pendingCount > 0 ? (
        <>
          <Cloud className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">{pendingCount} {t('offline.pending')}</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-5 w-5 p-0 text-white hover:bg-white/20 rounded-full"
            onClick={() => manualSync()}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </>
      ) : (
        <>
          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">{t('offline.synced')}</span>
          {lastSyncTime && (
            <span className="opacity-80">{timeAgo(lastSyncTime)}</span>
          )}
        </>
      )}
    </div>
  );
}
