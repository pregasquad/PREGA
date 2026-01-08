import { useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PushNotifications } from "@/components/PushNotifications";

function SwipeableContent({ children, isRtl }: { children: React.ReactNode; isRtl: boolean }) {
  const { openMobile, setOpenMobile, isMobile } = useSidebar();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isMobile || touchStartX.current === null || touchStartY.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX.current;
    const deltaY = touchEndY - touchStartY.current;

    // Only trigger if horizontal swipe is dominant and significant
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (isRtl) {
        // RTL: swipe left opens, swipe right closes
        if (deltaX < 0 && !openMobile) {
          setOpenMobile(true);
        } else if (deltaX > 0 && openMobile) {
          setOpenMobile(false);
        }
      } else {
        // LTR: swipe right opens, swipe left closes
        if (deltaX > 0 && !openMobile) {
          setOpenMobile(true);
        } else if (deltaX < 0 && openMobile) {
          setOpenMobile(false);
        }
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
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
  
  // Planning page handles its own scrolling - disable outer scroll
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
          <header className="flex h-12 items-center justify-between px-4 border-b bg-background shrink-0 z-20">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div className="flex items-center gap-2 md:hidden">
                <img src="/logo.png" alt="PREGA SQUAD" className="w-8 h-8 rounded-full object-cover" />
                <span className="text-sm font-bold text-orange-500">PREGA SQUAD</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PushNotifications />
              <LanguageSwitcher />
            </div>
          </header>
          <main className={`flex-1 min-h-0 ${isPlanning ? 'overflow-hidden p-0' : 'overflow-auto p-2 md:p-4'}`}>
            <div className="h-full flex flex-col min-h-0">
              {children}
            </div>
          </main>
        </SwipeableContent>
      </div>
    </SidebarProvider>
  );
}
