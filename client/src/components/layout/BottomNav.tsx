import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef, useCallback } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useBusinessName } from "@/hooks/use-salon-data";
import { getAppSocket } from "@/lib/appSocket";
import { SHORTCUT_OPTIONS, normalizePlanningShortcuts, type ShortcutOption } from "@/lib/shortcuts";
import { useNavigationPermissions } from "@/hooks/use-navigation-permissions";
import {
  MoreHorizontal, LogOut, ShieldCheck, UserCircle,
  Bell, X, ExternalLink,
} from "lucide-react";

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
  const touchStartYRef = useRef<number | null>(null);
  const [sheetDragY, setSheetDragY] = useState(0);
  const SWIPE_CLOSE_THRESHOLD = 80;

  const handleSheetTouchStart = useCallback((e: React.TouchEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relativeY = e.touches[0].clientY - rect.top;
    if (relativeY < 80) {
      touchStartYRef.current = e.touches[0].clientY;
    }
  }, []);

  const handleSheetTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const delta = e.touches[0].clientY - touchStartYRef.current;
    if (delta > 0) setSheetDragY(delta);
  }, []);

  const handleSheetTouchEnd = useCallback(() => {
    if (sheetDragY > SWIPE_CLOSE_THRESHOLD) {
      setMoreOpen(false);
      setTimeout(() => setSheetDragY(0), 300);
    } else {
      setSheetDragY(0);
    }
    touchStartYRef.current = null;
  }, [sheetDragY]);
  const [notifications, setNotifications] = useState<BookingNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const businessName = useBusinessName();

  const { hasPermission, currentUserName, isAdmin } = useNavigationPermissions();

  const { data: businessSettings } = useQuery<{ planningShortcuts?: string[] }>({
    queryKey: ["/api/business-settings"],
  });

  useEffect(() => {
    const socket = getAppSocket();

    const onBookingCreated = (booking: BookingNotification) => {
      setNotifications(prev => [booking, ...prev].slice(0, 20));
    };
    const onWaDisconnected = () => setWaDisconnected(true);
    const onWaConnected    = () => setWaDisconnected(false);
    const onWaStatus       = (data: { connected: boolean }) => setWaDisconnected(!data.connected);

    socket.on("booking:created",       onBookingCreated);
    socket.on("whatsapp:disconnected", onWaDisconnected);
    socket.on("whatsapp:logged_out",   onWaDisconnected);
    socket.on("whatsapp:connected",    onWaConnected);
    socket.on("whatsapp:status",       onWaStatus);

    return () => {
      socket.off("booking:created",       onBookingCreated);
      socket.off("whatsapp:disconnected", onWaDisconnected);
      socket.off("whatsapp:logged_out",   onWaDisconnected);
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

  const handleNavClick = (route: string) => {
    setMoreOpen(false);
    setLocation(route);
  };

  // ── Compute primary tabs from business settings ──────────────────
  const configuredKeys = normalizePlanningShortcuts(businessSettings?.planningShortcuts);

  const primaryTabs = configuredKeys
    .map(key => SHORTCUT_OPTIONS.find(o => o.key === key))
    .filter((opt): opt is ShortcutOption => opt !== undefined && hasPermission(opt.permission));

  // More = everything NOT chosen as a primary tab, filtered by permission
  const moreItems = SHORTCUT_OPTIONS.filter(
    opt => !configuredKeys.includes(opt.key) && hasPermission(opt.permission)
  );

  const isMoreActive = moreItems.some(opt => location === opt.route);
  const waInMore     = moreItems.some(opt => opt.key === "whatsapp");
  const hasBadge     = (waInMore && waDisconnected) || notifications.length > 0;

  return (
    <>
      {/* ── Bottom Tab Bar (mobile only) ─────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          background: "rgba(2,12,27,0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(125,211,252,0.12)",
          boxShadow: "0 -8px 32px rgba(0,100,200,0.12)",
        }}
        data-testid="bottom-nav"
      >
        {/* Top water shimmer line */}
        <div
          className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent 0%, rgba(56,189,248,0.4) 30%, rgba(125,211,252,0.6) 50%, rgba(56,189,248,0.4) 70%, transparent 100%)" }}
        />

        <div className="flex items-stretch h-16">

          {primaryTabs.map((tab) => {
            const isActive = location === tab.route || (tab.route === "/planning" && location === "/");
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleNavClick(tab.route)}
                className="flex-1 flex flex-col items-center justify-center gap-1 relative transition-all duration-200"
                style={{ color: isActive ? "#7dd3fc" : "rgba(148,163,184,0.65)" }}
                data-testid={`bottom-nav-${tab.key}`}
              >
                {/* Glass water active pill */}
                {isActive && (
                  <span
                    className="absolute inset-x-1.5 inset-y-1 rounded-xl pointer-events-none"
                    style={{
                      background: "linear-gradient(180deg, rgba(56,189,248,0.18) 0%, rgba(14,165,233,0.06) 100%)",
                      border: "1px solid rgba(125,211,252,0.22)",
                      boxShadow: "0 0 14px rgba(56,189,248,0.18), inset 0 1px 0 rgba(255,255,255,0.07)",
                    }}
                  />
                )}
                {/* Top glow line */}
                {isActive && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full"
                    style={{
                      background: "linear-gradient(90deg, transparent, #38bdf8, transparent)",
                      boxShadow: "0 0 8px #38bdf8",
                    }}
                  />
                )}
                <tab.icon
                  className="w-5 h-5 relative"
                  style={{
                    transform: isActive ? "scale(1.15) translateY(-1px)" : "scale(1)",
                    transition: "transform 0.2s",
                    filter: isActive ? "drop-shadow(0 0 5px rgba(56,189,248,0.8))" : "none",
                  }}
                  strokeWidth={isActive ? 2.5 : 1.75}
                />
                <span
                  className="text-[10px] font-medium leading-none relative"
                  style={{ textShadow: isActive ? "0 0 8px rgba(56,189,248,0.7)" : "none" }}
                >
                  {t(tab.labelKey)}
                </span>
              </button>
            );
          })}

          {/* ── More button ─────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 relative transition-all duration-200"
            style={{ color: isMoreActive ? "#7dd3fc" : "rgba(148,163,184,0.65)" }}
            data-testid="bottom-nav-more"
          >
            {isMoreActive && (
              <span
                className="absolute inset-x-1.5 inset-y-1 rounded-xl pointer-events-none"
                style={{
                  background: "linear-gradient(180deg, rgba(56,189,248,0.18) 0%, rgba(14,165,233,0.06) 100%)",
                  border: "1px solid rgba(125,211,252,0.22)",
                  boxShadow: "0 0 14px rgba(56,189,248,0.18), inset 0 1px 0 rgba(255,255,255,0.07)",
                }}
              />
            )}
            {isMoreActive && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full"
                style={{
                  background: "linear-gradient(90deg, transparent, #38bdf8, transparent)",
                  boxShadow: "0 0 8px #38bdf8",
                }}
              />
            )}
            <div className="relative">
              <MoreHorizontal
                className="w-5 h-5"
                strokeWidth={isMoreActive ? 2.5 : 1.75}
                style={{ filter: isMoreActive ? "drop-shadow(0 0 5px rgba(56,189,248,0.8))" : "none" }}
              />
              {hasBadge && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-background" />
              )}
            </div>
            <span
              className="text-[10px] font-medium leading-none relative"
              style={{ textShadow: isMoreActive ? "0 0 8px rgba(56,189,248,0.7)" : "none" }}
            >
              {t("nav.more")}
            </span>
          </button>

        </div>
      </nav>

      {/* ── More Sheet ───────────────────────────────────────── */}
      <Sheet open={moreOpen} onOpenChange={(open) => { if (!open) { setSheetDragY(0); } setMoreOpen(open); }}>
        <SheetContent
          side="bottom"
          hideClose
          className="max-h-[85vh] rounded-t-3xl p-0 border-0 shadow-2xl overflow-hidden"
          dir={isRtl ? "rtl" : "ltr"}
          style={{
            transform: sheetDragY > 0 ? `translateY(${sheetDragY}px)` : undefined,
            transition: sheetDragY === 0 ? "transform 0.3s ease" : "none",
          }}
        >
          <SheetTitle className="sr-only">{t("nav.more")}</SheetTitle>

          <div
            className="overflow-y-auto"
            style={{ maxHeight: "85vh" }}
            onTouchStart={handleSheetTouchStart}
            onTouchMove={handleSheetTouchMove}
            onTouchEnd={handleSheetTouchEnd}
          >
            <div className="p-5 pb-10">

              {/* Handle bar — drag here to close */}
              <div className="w-10 h-1 bg-muted-foreground/25 rounded-full mx-auto mb-5 cursor-grab" />

              {/* Header row */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center overflow-hidden shadow-sm border border-border/30">
                    <img src="/logo.png" alt={businessName} className="w-full h-full object-contain" />
                  </div>
                  <span className="text-sm font-bold text-primary">{businessName}</span>
                </div>

                <div className="flex items-center gap-2">
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

              {/* Inline notification list */}
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

              {/* Nav grid — all items NOT in the bottom tabs */}
              {moreItems.length > 0 ? (
                <div className="grid grid-cols-3 gap-2.5 mb-5">
                  {moreItems.map((opt) => {
                    const isActive = location === opt.route;
                    const isWA     = opt.key === "whatsapp";
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => handleNavClick(opt.route)}
                        className={cn(
                          "flex flex-col items-center gap-2 p-3.5 rounded-2xl transition-all active:scale-95",
                          isActive
                            ? "bg-primary/10 text-primary shadow-sm"
                            : "bg-muted/40 text-foreground hover:bg-muted"
                        )}
                        data-testid={`more-nav-${opt.key}`}
                      >
                        <div className="relative">
                          <opt.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                          {isWA && waDisconnected && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-background animate-pulse" />
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-center leading-tight">
                          {t(opt.labelKey)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground mb-5 py-4">
                  {t("admin.planningShortcutsDesc")}
                </p>
              )}

              {/* Booking portal external link */}
              <a
                href="/booking"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-muted/40 text-muted-foreground mb-5 active:scale-95 transition-all"
              >
                <ExternalLink className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium">{t("nav.booking")}</span>
              </a>

              {/* User info + logout */}
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
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
