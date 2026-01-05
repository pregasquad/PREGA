import { Sidebar } from "./Sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

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
