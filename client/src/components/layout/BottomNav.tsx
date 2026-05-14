import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useBusinessName } from "@/hooks/use-salon-data";
import { getAppSocket } from "@/lib/appSocket";
import {
  Home, CalendarDays, Users, DollarSign, MoreHorizontal,
  History, Scissors, PackageOpen, Package, BarChart3,
  Wallet, Gift, MessageCircle, Sparkles, Settings,
  ExternalLink, User, Percent, TrendingUp,
  LogOut, ShieldCheck, UserCircle, Bell, X,
} from "lucide-react";

const PRIMARY_TABS = [
  { labelKey: "nav.home",     href: "/home",     icon: Home,         permission: "view_home" },
  { labelKey: "nav.planning", href: "/planning",  icon: CalendarDays, permission: "view_planning" },
  { labelKey: "nav.clients",  href: "/clients",   icon: Users,        permission: "view_clients" },
  { labelKey: "nav.salaries", href: "/salaries",  icon: DollarSign,   permission: "view_salaries" },
];

const MORE_ITEMS = [
  { labelKey: "nav.bookingHistory",  href: "/booking-history",  icon: History,       permission: "view_booking_history" },
  { labelKey: "nav.services",        href: "/services",          icon: Scissors,      permission: "view_services" },
  { labelKey: "nav.packages",        href: "/packages",          icon: PackageOpen,   permission: "view_packages" },
  { labelKey: "nav.inventory",       href: "/inventory",         icon: Package,       permission: "view_inventory" },
  { labelKey: "nav.expenses",        href: "/charges",           icon: Wallet,        permission: "view_expenses" },
  { labelKey: "nav.reports",         href: "/reports",           icon: BarChart3,     permission: "view_reports" },
  { labelKey: "nav.loyaltyRewards",  href: "/loyalty-rewards",   icon: Gift,          permission: "view_loyalty" },
  { labelKey: "nav.whatsapp",        href: "/whatsapp",          icon: MessageCircle, permission: "admin_settings" },
  { labelKey: "nav.tombola",         href: "/tombola",           icon: Sparkles,      permission: null },
  { labelKey: "nav.adminSettings",   href: "/admin-settings",    icon: Settings,      permission: "admin_settings" },
];

const STAFF_ITEMS = [
  { labelKey: "nav.staffManagement",  href: "/staff",              icon: User,        permission: "view_staff" },
  { labelKey: "nav.staffCommissions", href: "/staff-commissions",  icon: Percent,     permission: "view_salaries" },
  { labelKey: "nav.staffPerformance", href: "/staff-performance",  icon: TrendingUp,  permission: "view_staff_performance" },
];

interface BookingNotification {
  id: number;
  client: string;
  service: string;
  date: string;
  startTime: string;
}

export function BottomNav() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [location, setLocation] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [waDisconnected, setWaDisconnected] = useState(false);
  const [notifications, setNotifications] = useState<BookingNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const businessName = useBusinessName();

  const currentUserName = typeof window !== "undefined" ? sessionStorage.getItem("current_user") : null;
  const isAdmin = typeof window !== "undefined" ? sessionStorage.getItem("admin_authenticated") === "true" : false;

  const { data: adminRoles = [] } = useQuery<Array<{ id: number; name: string; role: string; permissions: string[] }>>({
    queryKey: ["/api/admin-roles"],
  });

  const currentUser = adminRoles.find(r => r.name === currentUserName);

  const hasPermission = (permission: string | null) => {
    if (!permission) return true;
    if (!currentUserName || currentUserName === "Setup") return true;
    if (!currentUser) return true;
    if (currentUser.role === "owner") return true;
    if (currentUser.permissions.length === 0) return true;
    return currentUser.permissions.includes(permission);
  };

  useEffect(() => {
    const socket = getAppSocket();

    const onBookingCreated = (booking: BookingNotification) => {
      setNotifications(prev => [booking, ...prev].slice(0, 20));
    };
    const onWaDisconnected = () => setWaDisconnected(true);
    const onWaConnected    = () => setWaDisconnected(false);
    const onWaStatus       = (data: { connected: boolean }) => setWaDisconnected(!data.connected);

    socket.on("booking:created",        onBookingCreated);
    socket.on("whatsapp:disconnected",  onWaDisconnected);
    socket.on("whatsapp:connected",     onWaConnected);
    socket.on("whatsapp:status",        onWaStatus);

    return () => {
      socket.off("booking:created",       onBookingCreated);
      socket.off("whatsapp:disconnected", onWaDisconnected);
      socket.off("whatsapp:connected",    onWaConnected);
      socket.off("whatsapp:status",       onWaStatus);
    };
  }, []);

  const handleLogout = () => {
    sessionStorage.clear();
    localStorage.removeItem("user_authenticated");
    localStorage.removeItem("current_user");
    window.location.href = "/";
  };

  const filteredPrimary = PRIMARY_TABS.filter(tab => hasPermission(tab.permission));
  const filteredMore    = MORE_ITEMS.filter(item => hasPermission(item.permission));
  const filteredStaff   = STAFF_ITEMS.filter(item => hasPermission(item.permission));

  const isMoreActive = [...filteredMore, ...filteredStaff].some(item => location === item.href);
  const hasBadge     = waDisconnected || notifications.length > 0;

  const handleNavClick = (href: string) => {
    setMoreOpen(false);
    setLocation(href);
  };

  return (
    <>
      {/* ── Bottom Tab Bar (mobile only) ─────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        data-testid="bottom-nav"
      >
        <div className="flex items-stretch h-16">

          {filteredPrimary.map((tab) => {
            const isActive = location === tab.href || (tab.href === "/planning" && location === "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors no-underline",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
                data-testid={`bottom-nav-${tab.href.replace("/", "")}`}
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full bg-primary" />
                )}
                <tab.icon
                  className="w-5 h-5"
                  style={{ transform: isActive ? "scale(1.1)" : "scale(1)", transition: "transform 0.15s" }}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span className="text-[10px] font-medium leading-none">{t(tab.labelKey)}</span>
              </Link>
            );
          })}

          {/* ── More button ─────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors",
              isMoreActive ? "text-primary" : "text-muted-foreground"
            )}
            data-testid="bottom-nav-more"
          >
            {isMoreActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full bg-primary" />
            )}
            <div className="relative">
              <MoreHorizontal className="w-5 h-5" strokeWidth={isMoreActive ? 2.5 : 2} />
              {hasBadge && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-background" />
              )}
            </div>
            <span className="text-[10px] font-medium leading-none">{t("nav.more")}</span>
          </button>

        </div>
      </nav>

      {/* ── More Sheet ───────────────────────────────────────── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          hideClose
          className="h-[88vh] rounded-t-3xl p-0 border-0 shadow-2xl"
          dir={isRtl ? "rtl" : "ltr"}
        >
          {/* Required for accessibility — visually hidden */}
          <SheetTitle className="sr-only">{t("nav.more")}</SheetTitle>

          <ScrollArea className="h-full">
            <div className="p-5 pb-10">

              {/* ── Handle bar ─────────────────────────────── */}
              <div className="w-10 h-1 bg-muted-foreground/25 rounded-full mx-auto mb-5" />

              {/* ── Header row ─────────────────────────────── */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center overflow-hidden shadow-sm border border-border/30">
                    <img src="/logo.png" alt={businessName} className="w-full h-full object-contain" />
                  </div>
                  <span className="text-sm font-bold text-primary">{businessName}</span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Notification bell — only when there are new bookings */}
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setNotifOpen(v => !v)}
                      className="relative p-2 rounded-full bg-muted/50 text-muted-foreground"
                    >
                      <Bell className="w-4 h-4" />
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                        {notifications.length > 9 ? "9+" : notifications.length}
                      </span>
                    </button>
                  )}

                  {/* Close button */}
                  <button
                    type="button"
                    onClick={() => setMoreOpen(false)}
                    className="p-2 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* ── Inline notification list ────────────────── */}
              {notifOpen && notifications.length > 0 && (
                <div className="mb-5 rounded-xl border border-border overflow-hidden">
                  {notifications.slice(0, 5).map((n, i) => (
                    <div
                      key={`${n.id}-${i}`}
                      className="flex items-start gap-2 p-3 border-b border-border/50 last:border-0 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => { handleNavClick("/booking-history"); setNotifOpen(false); }}
                    >
                      <Bell className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">{n.client}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {n.service} · {n.date} {n.startTime}
                        </p>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setNotifications([]); setNotifOpen(false); }}
                    className="w-full text-[10px] text-muted-foreground py-2 hover:text-destructive transition-colors"
                  >
                    {t("sidebar.clearAll")}
                  </button>
                </div>
              )}

              {/* ── Main nav grid ───────────────────────────── */}
              <div className="grid grid-cols-3 gap-2.5 mb-5">
                {filteredMore.map((item) => {
                  const isActive = location === item.href;
                  const isWA    = item.href === "/whatsapp";
                  return (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => handleNavClick(item.href)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3.5 rounded-2xl transition-all active:scale-95",
                        isActive
                          ? "bg-primary/10 text-primary shadow-sm"
                          : "bg-muted/40 text-foreground hover:bg-muted"
                      )}
                      data-testid={`more-nav-${item.href.replace("/", "")}`}
                    >
                      <div className="relative">
                        <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                        {isWA && waDisconnected && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-background animate-pulse" />
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-center leading-tight">
                        {t(item.labelKey)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* ── Staff section ───────────────────────────── */}
              {filteredStaff.length > 0 && (
                <div className="mb-5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2.5 px-0.5">
                    {t("nav.staff")}
                  </p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {filteredStaff.map((item) => {
                      const isActive = location === item.href;
                      return (
                        <button
                          key={item.href}
                          type="button"
                          onClick={() => handleNavClick(item.href)}
                          className={cn(
                            "flex flex-col items-center gap-2 p-3.5 rounded-2xl transition-all active:scale-95",
                            isActive
                              ? "bg-primary/10 text-primary shadow-sm"
                              : "bg-muted/40 text-foreground hover:bg-muted"
                          )}
                        >
                          <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                          <span className="text-[10px] font-medium text-center leading-tight">
                            {t(item.labelKey)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Booking portal link ─────────────────────── */}
              <a
                href="/booking"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-muted/40 text-muted-foreground mb-5 active:scale-95 transition-all"
              >
                <ExternalLink className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium">{t("nav.booking")}</span>
              </a>

              {/* ── User info + logout ──────────────────────── */}
              <div className="border-t border-border/50 pt-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                    isAdmin ? "bg-emerald-500/10 text-emerald-500" : "bg-primary/10 text-primary"
                  )}>
                    {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <UserCircle className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{currentUserName || "User"}</p>
                    <p className="text-[10px] text-emerald-500 leading-tight">{t("sidebar.fullAccess")}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-full"
                  onClick={handleLogout}
                  data-testid="button-logout-mobile"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>

            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
