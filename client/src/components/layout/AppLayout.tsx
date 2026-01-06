import { Sidebar } from "./Sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PushNotifications } from "@/components/PushNotifications";
import { useLocation } from "wouter";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [location] = useLocation();
  const isPlanning = location === "/planning";

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
          <main className={`flex-1 p-2 md:p-4 overflow-auto ${isPlanning ? 'h-0' : ''}`}>
            <div className={isPlanning ? 'h-full flex flex-col' : 'min-h-full'}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
