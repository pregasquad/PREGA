let isDatabaseOffline = false;
let lastStatusCheck = 0;
const STATUS_CHECK_INTERVAL = 30000; // Check every 30 seconds for better performance

export function setDatabaseOffline(offline: boolean): void {
  if (isDatabaseOffline !== offline) {
    isDatabaseOffline = offline;
    console.log(`[DatabaseStatus] Mode changed to: ${offline ? 'OFFLINE' : 'ONLINE'}`);
  }
}

export function getDatabaseOffline(): boolean {
  return isDatabaseOffline;
}

export function isEffectivelyOffline(): boolean {
  // Only rely on actual database status check, not navigator.onLine
  // navigator.onLine is unreliable in iframes/webviews
  return isDatabaseOffline;
}

export async function checkDatabaseStatus(): Promise<boolean> {
  const now = Date.now();
  if (now - lastStatusCheck < STATUS_CHECK_INTERVAL) {
    return !isDatabaseOffline;
  }
  
  lastStatusCheck = now;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch('/api/status/database', {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      setDatabaseOffline(true);
      return false;
    }
    
    const data = await res.json();
    const isOnline = data.online === true && data.mode === 'online';
    setDatabaseOffline(!isOnline);
    return isOnline;
  } catch (error) {
    setDatabaseOffline(true);
    return false;
  }
}

export async function initDatabaseStatusCheck(): Promise<void> {
  await checkDatabaseStatus();
  
  // Always check status, don't rely on navigator.onLine
  setInterval(() => {
    checkDatabaseStatus();
  }, STATUS_CHECK_INTERVAL);
}
