import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PushNotifications } from "@/components/PushNotifications";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { GlobalSearch } from "@/components/GlobalSearch";
import { initOfflineDb } from "@/lib/offlineDb";
import { startAutoSync, refreshAndCacheData } from "@/lib/syncService";
import { useBusinessName } from "@/hooks/use-salon-data";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { queryClient, prefetchCoreData } from "@/lib/queryClient";

function MobileBusinessName() {
  const businessName = useBusinessName();
  const [, setLocation] = useLocation();
  return (
    <div
      className="flex items-center gap-2 md:hidden cursor-pointer"
      onClick={() => setLocation("/planning")}
      data-testid="link-home-logo"
    >
      <div className="w-8 h-8 rounded-full bg-white shrink-0 flex items-center justify-center overflow-hidden shadow-sm">
        <img src="/logo.png" alt={businessName} className="w-full h-full object-contain" />
      </div>
      <span className="text-sm font-bold text-pink-500">{businessName}</span>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [location] = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const initOffline = async () => {
      await initOfflineDb();
      startAutoSync(30000);
      if (navigator.onLine) {
        refreshAndCacheData();
      }
    };
    initOffline();
  }, []);

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      prefetchCoreData(),
      // Invalidate all appointment key variants used across the app
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/bot-confirmed"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/bot-confirmed/count"] }),
      // Recalculation data
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/owner-withdrawals"] }),
    ]);
  }, []);

  const { pullY, isRefreshing } = usePullToRefresh(mainRef, handleRefresh);

  const isPlanning = location === "/" || location === "/planning";

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-mobile": "18rem",
  };

  const showIndicator = pullY > 4;
  const progress = Math.min(pullY / 72, 1);

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-hidden bg-background safe-area-p" dir={isRtl ? "rtl" : "ltr"}>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Top header — on mobile: logo + lang switcher only (no hamburger) */}
          <header className="flex h-12 items-center justify-between px-4 border-b bg-background shrink-0 z-20">
            <div className="flex items-center gap-3">
              {/* Hamburger only on desktop to toggle the sidebar */}
              <SidebarTrigger className="hidden md:inline-flex" />
              <MobileBusinessName />
            </div>
            <div className="flex items-center gap-2">
              <GlobalSearch />
              <PushNotifications />
              <LanguageSwitcher />
            </div>
          </header>

          {/* Pull-to-refresh indicator — only visible on mobile while pulling */}
          {showIndicator && (
            <div
              className="md:hidden absolute left-0 right-0 flex items-center justify-center z-30 pointer-events-none"
              style={{
                top: 48,
                height: 48,
                transform: `translateY(${pullY - 48}px)`,
                transition: isRefreshing ? "transform 0.2s ease-out" : "none",
              }}
            >
              <div className="bg-background border border-border rounded-full shadow-md w-9 h-9 flex items-center justify-center">
                {isRefreshing ? (
                  <svg
                    className="w-5 h-5 text-pink-500 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 100 10z" />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-pink-500 transition-transform"
                    style={{ transform: `rotate(${progress * 180}deg)` }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </div>
            </div>
          )}

          <main
            ref={mainRef}
            className={
              isPlanning
                ? "flex-1 min-h-0 overflow-hidden p-0"
                : "flex-1 min-h-0 overflow-auto p-2 md:p-4"
            }
          >
            <div
              className={isPlanning ? "h-full flex flex-col" : "min-h-full flex flex-col"}
              style={!isPlanning ? { paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" } : undefined}
            >
              {children}
            </div>
          </main>

          {/* Mobile bottom tab bar — hidden on md+ (desktop uses sidebar) */}
          <BottomNav />
        </div>
        <OfflineIndicator />
      </div>
    </SidebarProvider>
  );
}
