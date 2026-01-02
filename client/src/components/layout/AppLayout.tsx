import { Sidebar } from "./Sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-mobile": "100vw",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-hidden bg-background safe-area-p" dir="rtl">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 relative">
          <header className="flex h-16 items-center justify-between px-4 border-b bg-card shrink-0">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              {/* Theme toggle could be added here if needed */}
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
