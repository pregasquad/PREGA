import { useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PushNotifications } from "@/components/PushNotifications";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { initOfflineDb } from "@/lib/offlineDb";
import { startAutoSync, refreshAndCacheData } from "@/lib/syncService";
import { useBusinessName } from "@/hooks/use-salon-data";

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

function SwipeableContent({ children, isRtl }: { children: React.ReactNode; isRtl: boolean }) {
  const { openMobile, setOpenMobile, isMobile } = useSidebar();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isEdgeSwipe = useRef<boolean>(false);

  const EDGE_THRESHOLD = 30;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const startX = e.touches[0].clientX;
    const screenWidth = window.innerWidth;
    
    touchStartX.current = startX;
    touchStartY.current = e.touches[0].clientY;
    
    if (isRtl) {
      isEdgeSwipe.current = !openMobile 
        ? startX > screenWidth - EDGE_THRESHOLD
        : startX < EDGE_THRESHOLD;
    } else {
      isEdgeSwipe.current = !openMobile 
        ? startX < EDGE_THRESHOLD
        : startX > screenWidth - EDGE_THRESHOLD;
    }
  }, [isRtl, openMobile]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isMobile || touchStartX.current === null || touchStartY.current === null || !isEdgeSwipe.current) {
      touchStartX.current = null;
      touchStartY.current = null;
      isEdgeSwipe.current = false;
      return;
    }

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX.current;
    const deltaY = touchEndY - touchStartY.current;

    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (isRtl) {
        if (deltaX < 0 && !openMobile) {
          setOpenMobile(true);
        } else if (deltaX > 0 && openMobile) {
          setOpenMobile(false);
        }
      } else {
        if (deltaX > 0 && !openMobile) {
          setOpenMobile(true);
        } else if (deltaX < 0 && openMobile) {
          setOpenMobile(false);
        }
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
    isEdgeSwipe.current = false;
  }, [isMobile, isRtl, openMobile, setOpenMobile]);

  return (
    <div 
      className="flex-1 flex flex-col min-w-0 relative"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [location] = useLocation();
  
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
  
  const isPlanning = location === "/" || location === "/planning";

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-mobile": "18rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-hidden bg-background safe-area-p" dir={isRtl ? "rtl" : "ltr"}>
        <Sidebar />
        <SwipeableContent isRtl={isRtl}>
          {/* Top header — on mobile: logo + lang switcher only (no hamburger) */}
          <header className="flex h-12 items-center justify-between px-4 border-b bg-background shrink-0 z-20">
            <div className="flex items-center gap-3">
              {/* Hamburger only on desktop to toggle the sidebar */}
              <SidebarTrigger className="hidden md:inline-flex" />
              <MobileBusinessName />
            </div>
            <div className="flex items-center gap-2">
              <PushNotifications />
              <LanguageSwitcher />
            </div>
          </header>

          <main
            className={
              isPlanning
                ? "flex-1 min-h-0 overflow-hidden p-0"
                : "flex-1 min-h-0 overflow-auto p-2 pb-20 md:p-4 md:pb-4"
            }
          >
            <div className="h-full flex flex-col min-h-0">
              {children}
            </div>
          </main>

          {/* Mobile bottom tab bar — hidden on md+ (desktop uses sidebar) */}
          <BottomNav />
        </SwipeableContent>
        <OfflineIndicator />
      </div>
    </SidebarProvider>
  );
}
