import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { 
  Home,
  CalendarDays, 
  Scissors, 
  Package,
  BarChart3, 
  UserCircle,
  ExternalLink,
  Wallet,
  LogOut,
  ShieldCheck,
  Bell,
  Clock,
  User,
  DollarSign
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const NAV_ITEMS = [
  { label: "الرئيسية", href: "/", icon: Home },
  { label: "التخطيط", href: "/planning", icon: CalendarDays },
  { label: "الخدمات", href: "/services", icon: Scissors },
  { label: "المخزون", href: "/inventory", icon: Package },
  { label: "المصاريف", href: "/charges", icon: Wallet },
  { label: "الرواتب", href: "/salaries", icon: DollarSign },
  { label: "التقارير", href: "/reports", icon: BarChart3 },
  { label: "صفحة الحجز", href: "/booking", icon: ExternalLink, external: true },
];

interface StoredNotification {
  id: number;
  client: string;
  service: string;
  date: string;
  startTime: string;
  total: number;
  receivedAt: string;
}

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const queryClient = useQueryClient();
  const isAdmin = typeof window !== 'undefined' && sessionStorage.getItem("admin_authenticated") === "true";
  const [newBookingFlash, setNewBookingFlash] = useState(false);
  const [notifications, setNotifications] = useState<StoredNotification[]>(() => {
    const stored = localStorage.getItem("booking_notifications");
    return stored ? JSON.parse(stored) : [];
  });

  const { data: allAppointments = [] } = useQuery<any[]>({
    queryKey: ["/api/appointments/all"],
    queryFn: async () => {
      const res = await fetch("/api/appointments/all");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Play notification sound
  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
      console.log("Audio not supported");
    }
  };

  // Real-time Socket.IO connection for instant notifications
  useEffect(() => {
    const socket: Socket = io();
    
    socket.on("booking:created", (newBooking: any) => {
      // Instantly refresh appointments data
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      
      // Play notification sound
      playNotificationSound();
      
      // Add to persistent notifications
      const newNotification: StoredNotification = {
        id: newBooking.id,
        client: newBooking.client || "عميل",
        service: newBooking.service,
        date: newBooking.date,
        startTime: newBooking.startTime,
        total: newBooking.total,
        receivedAt: new Date().toISOString()
      };
      
      setNotifications(prev => {
        const updated = [newNotification, ...prev].slice(0, 50); // Keep last 50
        localStorage.setItem("booking_notifications", JSON.stringify(updated));
        return updated;
      });
      
      // Flash effect for new booking
      setNewBookingFlash(true);
      setTimeout(() => setNewBookingFlash(false), 3000);
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const clearNotifications = () => {
    setNotifications([]);
    localStorage.removeItem("booking_notifications");
  };

  const unpaidReservations = allAppointments.filter(app => !app.paid);

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem("admin_authenticated");
    setLocation("/planning");
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <ShadcnSidebar side="right" dir="rtl">
      <SidebarHeader className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              PREGAS<span className="font-sans font-light text-foreground">MGR</span>
            </h1>
            <p className="text-[10px] text-muted-foreground tracking-wide uppercase">Beauty</p>
          </div>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn(
                  "relative h-10 w-10 transition-all duration-300",
                  newBookingFlash && "bg-red-500/20 ring-2 ring-red-500 animate-bounce"
                )}
              >
                <Bell className={cn("w-5 h-5", newBookingFlash && "text-red-500")} />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {notifications.length > 9 ? "9+" : notifications.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start" side="left">
              <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <Bell className="w-4 h-4" />
                    الإشعارات
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {notifications.length} إشعار
                  </p>
                </div>
                {notifications.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={clearNotifications}
                  >
                    مسح الكل
                  </Button>
                )}
              </div>
              <ScrollArea className="max-h-[350px]">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    لا توجد إشعارات
                  </div>
                ) : (
                  <div className="p-2 space-y-2">
                    {notifications.map((notif, index) => (
                      <div 
                        key={`${notif.id}-${index}`} 
                        className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                        onClick={() => {
                          setLocation("/planning");
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {notif.client}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {notif.service}
                            </p>
                          </div>
                          <div className="text-left shrink-0">
                            <p className="text-xs font-bold text-primary">{notif.total} DH</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span>{notif.date} - {notif.startTime}</span>
                          </div>
                          <span className="text-[9px] text-muted-foreground/70">
                            {new Date(notif.receivedAt).toLocaleTimeString("ar-MA", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              {notifications.length > 0 && (
                <div className="p-2 border-t">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => {
                      setLocation("/planning");
                      if (isMobile) setOpenMobile(false);
                    }}
                  >
                    عرض الكل في التخطيط
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarMenu>
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href;
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.label}
                  onClick={handleNavClick}
                  className={cn(
                    "h-12 rounded-xl transition-all duration-200 px-4",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 hover:text-primary-foreground" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {item.external ? (
                    <a href={item.href} target="_blank" rel="noopener noreferrer">
                      <item.icon className={cn("w-5 h-5", isActive ? "stroke-[2.5]" : "stroke-[2]")} />
                      <span className="font-medium text-base">{item.label}</span>
                    </a>
                  ) : (
                    <Link href={item.href}>
                      <item.icon className={cn("w-5 h-5", isActive ? "stroke-[2.5]" : "stroke-[2]")} />
                      <span className="font-medium text-base">{item.label}</span>
                    </Link>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border bg-muted/20">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            isAdmin ? "bg-emerald-500/10 text-emerald-500" : "bg-primary/10 text-primary"
          )}>
            {isAdmin ? <ShieldCheck className="w-6 h-6" /> : <UserCircle className="w-6 h-6" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-foreground">
              {isAdmin ? "مدير" : "مستخدم"}
            </p>
            {isAdmin && (
              <p className="text-[10px] text-emerald-500">صلاحيات كاملة</p>
            )}
          </div>
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleAdminLogout}
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>
      </SidebarFooter>
    </ShadcnSidebar>
  );
}
