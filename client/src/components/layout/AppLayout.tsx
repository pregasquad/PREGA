import { useEffect } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
        <div className="flex-1 flex flex-col min-w-0 relative">
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
                ? "flex-1 min-h-0 overflow-hidden p-0 flex flex-col"
                : "flex-1 min-h-0 overflow-auto p-2 md:p-4"
            }
          >
            {isPlanning ? (
              children
            ) : (
              <div
                className="flex flex-col"
                style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}
              >
                {children}
              </div>
            )}
          </main>

          {/* Mobile bottom tab bar — hidden on md+ (desktop uses sidebar) */}
          <BottomNav />
        </div>
        <OfflineIndicator />
      </div>
    </SidebarProvider>
  );
}
