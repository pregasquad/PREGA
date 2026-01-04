import { Sidebar } from "./Sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [startY, setStartY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [location] = useLocation();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        setStartY(e.touches[0].pageY);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Disable pull-to-refresh on planning page
      if (location === "/planning") return;
      
      // Disable pull-to-refresh if a dialog/modal is open
      if (document.querySelector('[role="dialog"]')) return;

      const y = e.touches[0].pageY;
      if (window.scrollY === 0 && y > startY + 150 && !isRefreshing) {
        setIsRefreshing(true);
        window.location.reload();
      }
    };

    window.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchmove", handleTouchMove);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [startY, isRefreshing, location]);

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-mobile": "18rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-hidden bg-background safe-area-p" dir={isRtl ? "rtl" : "ltr"}>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 relative">
          <header className="flex h-12 items-center justify-between px-4 border-b bg-background shrink-0 z-20">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              {isRefreshing && <span className="text-xs text-muted-foreground animate-pulse">{t("common.loading")}</span>}
              <LanguageSwitcher />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
            <div className="max-w-7xl mx-auto h-full flex flex-col">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
