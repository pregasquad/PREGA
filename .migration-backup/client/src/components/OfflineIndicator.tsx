import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, CloudOff, RefreshCw, Cloud, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const { t } = useTranslation();
  const { isOnline, syncStatus, pendingCount, manualSync } = useOnlineStatus();

  if (isOnline && pendingCount === 0 && syncStatus !== 'syncing') {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm transition-all',
        !isOnline
          ? 'bg-sky-500/90 text-white backdrop-blur-sm'
          : syncStatus === 'syncing'
          ? 'bg-pink-500/90 text-white backdrop-blur-sm'
          : pendingCount > 0
          ? 'bg-pink-400/90 text-white backdrop-blur-sm'
          : 'bg-green-500/90 text-white backdrop-blur-sm'
      )}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-4 w-4" />
          <span>{t('offline.offline')}</span>
          {pendingCount > 0 && (
            <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
              {pendingCount} {t('offline.pending')}
            </span>
          )}
        </>
      ) : syncStatus === 'syncing' ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>{t('offline.syncing')}</span>
        </>
      ) : pendingCount > 0 ? (
        <>
          <Cloud className="h-4 w-4" />
          <span>
            {pendingCount} {t('offline.pending')}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-white hover:bg-white/20"
            onClick={() => manualSync()}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </>
      ) : (
        <>
          <CheckCircle className="h-4 w-4" />
          <span>{t('offline.synced')}</span>
        </>
      )}
    </div>
  );
}
