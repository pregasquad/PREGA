import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { MonthlyGoalBanner } from "@/components/MonthlyGoalBanner";

// ── Drag sound effects via Web Audio API ──────────────────────────────────────
function playDragPickup() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(520, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => ctx.close();
  } catch {}
}

function playErrorSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    // Two-pulse low "thud" — descending minor third
    const notes = [220, 185];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const t0 = now + i * 0.09;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.18, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
      osc.start(t0);
      osc.stop(t0 + 0.14);
      if (i === notes.length - 1) osc.onended = () => ctx.close();
    });
  } catch {}
}

function playDragDrop() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(480, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.20, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.22);
    osc.onended = () => ctx.close();
  } catch {}
}

// Payment confirmed — ascending "cha-ching" two-note chime + haptic pulse
function playPaymentSuccess() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    // C5 → E5 → G5 quick ascending arpeggio
    const notes = [
      { freq: 523.25, t: 0.00 },   // C5
      { freq: 659.25, t: 0.09 },   // E5
      { freq: 783.99, t: 0.18 },   // G5
    ];
    notes.forEach(({ freq, t }, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + t);
      gain.gain.linearRampToValueAtTime(0.28, now + t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.30);
      osc.start(now + t);
      osc.stop(now + t + 0.30);
      if (i === notes.length - 1) osc.onended = () => ctx.close();
    });
  } catch {}
  // Haptic: short tap → pause → strong pulse (feels like "confirmed")
  try { if (navigator.vibrate) navigator.vibrate([40, 60, 120]); } catch {}
}
// ─────────────────────────────────────────────────────────────────────────────
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { format, addDays, startOfToday, parseISO, subDays, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { calcAppointmentCommission } from "@/lib/commissionCalc";
import { getWorkDayDate } from "@/lib/workday";
import { useTranslation } from "react-i18next";
import { useAppointments, useStaff, useServices, useCreateAppointment, useUpdateAppointment, useDeleteAppointment, useBusinessSettings } from "@/hooks/use-salon-data";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { refreshSalariesBackground } from "@/lib/salariesRefresher";
import { getAppSocket } from "@/lib/appSocket";
import { onSyncStatusChange } from "@/lib/syncService";
import { getSyncQueueCount } from "@/lib/offlineDb";
import { useSearch, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CalendarIcon, ChevronLeft, ChevronRight, Plus, Trash2, Check, X, Search, Star, RefreshCw, Sparkles, CreditCard, Settings2, Scissors, Clock, User, ChevronsUpDown, ListTodo, Bell, UserCheck, Gift, AlertCircle, AlertTriangle, Wallet, Users, Package, Lock, ShieldCheck, CheckCircle, UserMinus, ChevronDown, Pencil, ArrowDownLeft, Undo2, Bot, WifiOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SpinningLogo } from "@/components/ui/spinning-logo";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertAppointmentSchema, insertStaffSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { autoPrint } from "@/lib/printReceipt";
import { connectQz, openCashDrawer, isQzConnected, checkPrintStationAsync, remoteOpenDrawer } from "@/lib/qzPrint";

// Smoothly animates a number from its previous value to the new one (400 ms ease-out)
function useAnimatedNumber(target: number | null, duration = 400): number | null {
  const [displayed, setDisplayed] = React.useState<number | null>(target);
  const rafRef = React.useRef<number | null>(null);
  const startRef = React.useRef<number | null>(null);
  const fromRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (target === null) { setDisplayed(null); return; }
    const from = displayed ?? target;
    fromRef.current = from;
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target]);

  return displayed;
}

// Sub-component: boss net profit circle with animated number + pulse on change
function BossNetProfitCircle({
  ownerNetProfit,
  ownerPhoto,
  currency,
  isSyncing = false,
}: {
  ownerNetProfit: number;
  ownerPhoto: string | null;
  currency: string;
  isSyncing?: boolean;
}) {
  const animatedValue = useAnimatedNumber(ownerNetProfit);
  const display = animatedValue ?? ownerNetProfit;
  const profitColor = ownerNetProfit >= 0 ? "#10b981" : "#ef4444";

  // Pulse ring whenever the value changes
  const [pulsing, setPulsing] = React.useState(false);
  const prevValueRef = React.useRef<number>(ownerNetProfit);
  React.useEffect(() => {
    if (prevValueRef.current !== ownerNetProfit) {
      prevValueRef.current = ownerNetProfit;
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [ownerNetProfit]);

  return (
    <div className="flex flex-col items-center gap-0.5 w-full px-0.5">
      <div className="relative">
        {pulsing && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ backgroundColor: profitColor, opacity: 0.35 }}
          />
        )}
        {ownerPhoto ? (
          <img
            src={ownerPhoto}
            alt="Boss"
            className="w-9 h-9 rounded-full object-cover border-2 shadow-sm relative"
            style={{ borderColor: profitColor }}
          />
        ) : (
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm border-2 relative"
            style={{
              background: ownerNetProfit >= 0
                ? "linear-gradient(135deg,#10b981,#059669)"
                : "linear-gradient(135deg,#ef4444,#dc2626)",
              borderColor: profitColor,
            }}
          >
            <Wallet className="w-4 h-4 text-white" />
          </div>
        )}
        {/* Live sync dot — top-right corner of the avatar */}
        {isSyncing && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-sky-400 animate-ping"
            style={{ opacity: 0.85 }}
          />
        )}
      </div>
      <span
        className="text-[8px] font-black leading-none text-center w-full truncate tabular-nums"
        style={{ color: profitColor }}
      >
        {display >= 0 ? "+" : ""}{display}
      </span>
      {/* "syncing…" label replaces currency label while updating */}
      {isSyncing ? (
        <span className="text-[7px] text-sky-400 leading-none animate-pulse">syncing…</span>
      ) : (
        <span className="text-[7px] text-muted-foreground leading-none">{currency}</span>
      )}
    </div>
  );
}

const DEFAULT_HOURS = [
  "10:00","10:15","10:30","10:45","11:00","11:15","11:30","11:45",
  "12:00","12:15","12:30","12:45","13:00","13:15","13:30","13:45",
  "14:00","14:15","14:30","14:45","15:00","15:15","15:30","15:45",
  "16:00","16:15","16:30","16:45","17:00","17:15","17:30","17:45",
  "18:00","18:15","18:30","18:45","19:00","19:15","19:30","19:45",
  "20:00","20:15","20:30","20:45","21:00","21:15","21:30","21:45",
  "22:00","22:15","22:30","22:45","23:00","23:15","23:30","23:45",
  "00:00","00:15","00:30","00:45","01:00","01:15","01:30","01:45",
  "02:00","02:15","02:30","02:45","03:00"
];

function generateTimeSlots(openingTime: string, closingTime: string): string[] {
  const slots: string[] = [];
  
  const [openHour, openMin] = openingTime.split(":").map(Number);
  const [closeHour, closeMin] = closingTime.split(":").map(Number);
  
  const openingMinutes = openHour * 60 + openMin;
  let closingMinutes = closeHour * 60 + closeMin;
  
  if (closingMinutes <= openingMinutes) {
    closingMinutes += 24 * 60;
  }
  
  for (let mins = openingMinutes; mins < closingMinutes; mins += 15) {
    const normalizedMins = mins % (24 * 60);
    const h = Math.floor(normalizedMins / 60);
    const m = normalizedMins % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  
  return slots;
}

const formSchema = insertAppointmentSchema.extend({
  price: z.coerce.number().min(0),
  duration: z.coerce.number().min(1),
  total: z.coerce.number().min(0),
  privateRoom: z.boolean().optional(),
});

type AppointmentFormValues = z.infer<typeof formSchema>;


export default function Planning() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const isMobile = useIsMobile();
  const [date, setDate] = useState<Date>(getWorkDayDate());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    const refreshPending = () => getSyncQueueCount().then(n => setPendingSyncCount(n)).catch(() => {});
    refreshPending();
    const unsub = onSyncStatusChange((_status, count) => { setPendingSyncCount(count); });
    const onOnline = () => { setIsOnline(true); refreshPending(); };
    const onOffline = () => { setIsOnline(false); refreshPending(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const interval = setInterval(refreshPending, 10000);
    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, []);
  
  // Check if user has permission to edit the cardboard
  const canEditCardboard = useMemo(() => {
    try {
      const permissions = JSON.parse(sessionStorage.getItem("current_user_permissions") || "[]");
      if (permissions.length === 0) return true;
      return permissions.includes("edit_cardboard") && permissions.includes("manage_appointments");
    } catch {
      return true;
    }
  }, []);

  const currentUserRole = typeof window !== 'undefined' ? sessionStorage.getItem("current_user_role") : null;
  const canViewNetProfit = useMemo(() => {
    if (currentUserRole === "owner") return true;
    try {
      const permissions = JSON.parse(sessionStorage.getItem("current_user_permissions") || "[]");
      if (permissions.length === 0) return true;
      return permissions.includes("view_net_profit");
    } catch {
      return false;
    }
  }, [currentUserRole]);
  const canEditPastAppointments = useMemo(() => {
    if (currentUserRole === "owner") return true;
    try {
      const permissions = JSON.parse(sessionStorage.getItem("current_user_permissions") || "[]");
      if (permissions.length === 0) return true;
      return permissions.includes("edit_past_appointments");
    } catch {
      return true;
    }
  }, [currentUserRole]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [drawerState, setDrawerState] = useState<"idle" | "opening" | "success" | "fail">("idle");
  const boardRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const liveLineRef = useRef<HTMLDivElement>(null);
  
  // Track if user manually scrolled - pause auto-scroll for 30s after user interaction
  const userScrollPauseRef = useRef<number>(0);
  // Guard against re-entrant scroll during smooth animation
  const isScrollingRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dialogCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update time using setInterval (more efficient than requestAnimationFrame)
  useEffect(() => {
    setCurrentTime(new Date());
    const updateInterval = isMobile ? 60000 : 30000;
    
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, updateInterval);
    
    // Handle visibility change for PWA - update immediately when app becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setCurrentTime(new Date());
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isMobile]);

  // Refresh data — socket.io delivers instant invalidation; polling is just a safety net.
  useEffect(() => {
    const socket = getAppSocket();

    // Any booking event → refresh appointments + net profit circle immediately.
    const onBookingChange = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
    };
    // For booking:created specifically, skip the invalidation if we have an active
    // create/update mutation — our mutation's own onSettled handles the cache update.
    // This prevents the socket event (which the server emits before sending its HTTP
    // response back to us) from triggering a refetch that races with the optimistic
    // update and makes the new appointment flash/disappear.
    const onBookingCreated = () => {
      if (queryClient.isMutating() > 0) return;
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
    };
    socket.on("booking:created",      onBookingCreated);
    socket.on("booking:updated",      onBookingChange);
    socket.on("appointment:updated",  onBookingChange);
    socket.on("appointment:paid",     onBookingChange);
    socket.on("appointment:deleted",  onBookingChange);

    // Mobile: refresh every 2 minutes, Desktop: every 90 seconds as fallback
    const refreshInterval = isMobile ? 120_000 : 90_000;
    
    const intervalId = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      // salary/compute is expensive — background-refetch at a slower rate (3 min)
    }, refreshInterval);

    const salaryIntervalId = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner-withdrawals"] });
    }, 180_000);
    
    // Refresh on visibility change (when returning to PWA) - throttled
    let lastRefresh = 0;
    const handleVisibilityRefresh = () => {
      const now = Date.now();
      if (document.visibilityState === 'visible' && now - lastRefresh > 5000) {
        lastRefresh = now;
        queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
        queryClient.invalidateQueries({ queryKey: ["/api/owner-withdrawals"] });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityRefresh);
    
    return () => {
      socket.off("booking:created",      onBookingChange);
      socket.off("booking:updated",      onBookingChange);
      socket.off("appointment:updated",  onBookingChange);
      socket.off("appointment:paid",     onBookingChange);
      socket.off("appointment:deleted",  onBookingChange);
      clearInterval(intervalId);
      clearInterval(salaryIntervalId);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [isMobile]);

  // These must be declared before any useCallback/useMemo that references them in dependency arrays
  const [localSlotHeight, setLocalSlotHeight] = useState<number | null>(null);

  const { data: businessSettings } = useQuery<{
    loyaltyPointsPerDh: number;
    loyaltyPointsValue: number;
    loyaltyEnabled: boolean;
    openingTime?: string;
    closingTime?: string;
    workingDays?: number[];
    autoLockEnabled?: boolean;
    planningShortcuts?: string[];
    planningSlotHeight?: number;
  }>({
    queryKey: ["/api/business-settings"],
  });

  const getCurrentTimePosition = useCallback((hoursArray: string[], openingTime?: string, closingTime?: string) => {
    if (hoursArray.length === 0) return -1;
    
    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    
    // Compute opening minutes from opening time or first slot
    let openingMinutes: number;
    if (openingTime) {
      const [openH, openM] = openingTime.split(":").map(Number);
      openingMinutes = openH * 60 + openM;
    } else {
      const firstSlot = hoursArray[0];
      const [firstH, firstM] = firstSlot.split(":").map(Number);
      openingMinutes = firstH * 60 + firstM;
    }
    
    // Compute closing minutes from closing time directly (not last slot)
    // This fixes the overnight window bug where last slot is 00:30 but closing is 01:00
    let closingMinutes: number;
    if (closingTime) {
      const [closeH, closeM] = closingTime.split(":").map(Number);
      closingMinutes = closeH * 60 + closeM;
    } else {
      // Fallback to last slot + 15 if no closing time provided
      const lastSlot = hoursArray[hoursArray.length - 1];
      const [lastH, lastM] = lastSlot.split(":").map(Number);
      closingMinutes = lastH * 60 + lastM + 15;
    }
    
    // Handle overnight windows (closing time is earlier than opening time)
    if (closingMinutes <= openingMinutes) {
      closingMinutes += 24 * 60;
    }
    
    let currentTotalMinutes = currentHour * 60 + currentMinutes;
    // If current time is before opening and it's early morning, add 24 hours (overnight)
    if (currentTotalMinutes < openingMinutes && currentHour < 12) {
      currentTotalMinutes += 24 * 60;
    }
    
    // Check if current time is within business hours
    if (currentTotalMinutes < openingMinutes || currentTotalMinutes > closingMinutes) {
      return -1;
    }
    
    const minutesSinceOpen = currentTotalMinutes - openingMinutes;
    const slotHeight = localSlotHeight ?? (businessSettings?.planningSlotHeight ?? 44);
    const position = (minutesSinceOpen / 15) * slotHeight;
    return position;
  }, [currentTime, businessSettings?.planningSlotHeight, localSlotHeight]);

  // Scroll to live line using boardRef.scrollTo for reliable control
  const scrollToLiveLine = useCallback((smooth = false, force = false) => {
    // Prevent re-entrant scroll during animation
    if (isScrollingRef.current && !force) {
      return false;
    }
    
    // Check if user recently interacted (pause for 30s) - unless forced
    const now = Date.now();
    if (!force && now - userScrollPauseRef.current < 30000) {
      return false; // User interacted recently, skip auto-scroll
    }
    
    const board = boardRef.current;
    if (!board) return false;
    
    // Helper to set in-flight guard with proper cleanup
    const setScrollGuard = () => {
      if (smooth) {
        // Clear any existing timeout
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        isScrollingRef.current = true;
        scrollTimeoutRef.current = setTimeout(() => { 
          isScrollingRef.current = false;
          scrollTimeoutRef.current = null;
        }, 600);
      }
    };
    
    // Calculate target scroll position from live line element
    if (liveLineRef.current) {
      const liveLineRect = liveLineRef.current.getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();
      const currentScrollTop = board.scrollTop;
      
      // Calculate where live line is relative to board's scroll position
      const liveLineOffsetInBoard = liveLineRect.top - boardRect.top + currentScrollTop;
      const targetScroll = liveLineOffsetInBoard - (board.clientHeight / 2);
      
      setScrollGuard();
      board.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: smooth ? 'smooth' : 'auto'
      });
      return true;
    }
    
    // Fallback: use calculated position based on current time
    const position = getCurrentTimePosition(DEFAULT_HOURS);
    if (position >= 0) {
      const targetScroll = position - (board.clientHeight / 2);
      
      setScrollGuard();
      board.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: smooth ? 'smooth' : 'auto'
      });
      return true;
    }
    
    return false;
  }, [getCurrentTimePosition]);
  
  // Cleanup scroll timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      isScrollingRef.current = false;
    };
  }, []);

  const [isEditFavoritesOpen, setIsEditFavoritesOpen] = useState(false);
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
  const [servicePopoverOpen, setServicePopoverOpen] = useState(false);
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
  const [appointmentSearch, setAppointmentSearch] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [draggedAppointment, setDraggedAppointment] = useState<any>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{staff: string, time: string} | null>(null);
  const [resizingBooking, setResizingBooking] = useState<any>(null);
  // Hold-to-drag ghost (appearance only — position set directly on DOM)
  const [pDragGhost, setPDragGhost] = useState<{
    w: number; h: number; color: string; label: string;
  } | null>(null);
  const [holdingCardId, setHoldingCardId] = useState<number | null>(null);
  const ghostElRef = useRef<HTMLDivElement>(null);
  const pDragRef = useRef<{
    appointment: any; offsetX: number; offsetY: number;
    targetStaff: string; targetTime: string;
  } | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const dragJustCompleted = useRef(false);
  const scrollJustCancelled = useRef(false);
  const resizeStartY = useRef<number>(0);
  const resizeStartSpan = useRef<number>(1);
  const [resizeCurrentSpan, setResizeCurrentSpan] = useState<number>(1);
  const pageRef = useRef<HTMLDivElement>(null);
  
  // Swipe gesture state for mobile date navigation
  const swipeDateStartX = useRef<number | null>(null);
  const swipeThreshold = 60; // minimum px to trigger date swipe

  // Pinch-to-zoom state
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartHeight = useRef<number>(44);
  const [pinchHint, setPinchHint] = useState(false);
  const pinchHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SLOT_SIZES = [32, 44, 60, 76];

  const getPinchDist = (touches: React.TouchList) =>
    Math.hypot(
      touches[1].clientX - touches[0].clientX,
      touches[1].clientY - touches[0].clientY
    );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Two-finger pinch starting — record distance and current height
      pinchStartDist.current = getPinchDist(e.touches);
      pinchStartHeight.current = localSlotHeight ?? (businessSettings?.planningSlotHeight ?? 44);
      return;
    }
  }, [localSlotHeight, businessSettings?.planningSlotHeight]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2 || pinchStartDist.current === null) return;
    e.preventDefault();
    const dist = getPinchDist(e.touches);
    const ratio = dist / pinchStartDist.current;
    const raw = Math.round(pinchStartHeight.current * ratio);
    // Clamp to our defined sizes
    const clamped = Math.max(SLOT_SIZES[0], Math.min(SLOT_SIZES[SLOT_SIZES.length - 1], raw));
    // Snap to nearest defined size
    const snapped = SLOT_SIZES.reduce((prev, curr) =>
      Math.abs(curr - clamped) < Math.abs(prev - clamped) ? curr : prev
    );
    setLocalSlotHeight(snapped);
    // Show hint overlay briefly
    setPinchHint(true);
    if (pinchHintTimer.current) clearTimeout(pinchHintTimer.current);
    pinchHintTimer.current = setTimeout(() => setPinchHint(false), 1200);
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (pinchStartDist.current !== null && e.touches.length < 2) {
      // Pinch ended — persist to server
      const finalHeight = localSlotHeight ?? (businessSettings?.planningSlotHeight ?? 44);
      pinchStartDist.current = null;
      if (finalHeight !== (businessSettings?.planningSlotHeight ?? 44)) {
        fetch("/api/business-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planningSlotHeight: finalHeight }),
          credentials: "include",
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/business-settings"] });
        }).catch(() => {});
      }
      return;
    }
  }, [isRtl, localSlotHeight, businessSettings?.planningSlotHeight]);
  const [favoriteIds, setFavoriteIds] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem('favoriteServiceIds');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [selectedServices, setSelectedServices] = useState<Array<{id: string, name: string, price: number, duration: number}>>([]);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [totalInputValue, setTotalInputValue] = useState<string>("0");
  const [manualTotalOverride, setManualTotalOverride] = useState<boolean>(false);
  const [selectedPackage, setSelectedPackage] = useState<{id: number; name: string; discountedPrice: number; originalPrice: number} | null>(null);
  const [appliedLoyaltyPoints, setAppliedLoyaltyPoints] = useState<{clientId: number; points: number; discountAmount: number} | null>(null);
  const [appliedGiftCardBalance, setAppliedGiftCardBalance] = useState<{clientId: number; amount: number; discountAmount: number} | null>(null);
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Staff Wallet Portal state
  const [walletStaffId, setWalletStaffId] = useState<number | null>(null);
  const [walletShowAdd, setWalletShowAdd] = useState(false);
  const [walletDeductForm, setWalletDeductForm] = useState<{
    type: "advance" | "loan" | "penalty" | "other";
    description: string;
    amount: string;
  }>({ type: "advance", description: "", amount: "" });
  const [walletOpenDeductions, setWalletOpenDeductions] = useState(false);

  const { toast } = useToast();
  const { data: salonSettings } = useBusinessSettings();

  const formattedDate = format(date, "yyyy-MM-dd");

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
    queryClient.invalidateQueries({ queryKey: ["/api/business-settings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
    queryClient.invalidateQueries({ queryKey: ["/api/owner-withdrawals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
    queryClient.invalidateQueries({ queryKey: ["/api/staff-commissions"] });
  }, []);
  
  const { data: appointments = [], isLoading: loadingApps } = useAppointments(formattedDate);
  const { data: allAppointments = [], isFetching: fetchingAllApts } = useAppointments();
  const { data: staffList = [], isLoading: loadingStaff, error: staffError } = useStaff();
  const { data: services = [], isLoading: loadingServices, error: servicesError } = useServices();
  const { data: clients = [] } = useQuery<Array<{id: number, name: string, phone: string | null, loyaltyPoints: number, usePoints: boolean, loyaltyEnrolled: boolean, totalSpent: number, giftCardBalance: number, useGiftCardBalance: boolean}>>({
    queryKey: ["/api/clients"],
  });

  // O(1) client lookup by name — rebuilt only when clients list changes.
  // First-match semantics (no overwrite) matches Array.find() on duplicate names.
  const clientsByName = useMemo(() => {
    const m = new Map<string, typeof clients[number]>();
    for (const c of clients) {
      if (!m.has(c.name)) m.set(c.name, c);
    }
    return m;
  }, [clients]);
  
  const slotHeight = localSlotHeight ?? (businessSettings?.planningSlotHeight ?? 44);

  // Sync localSlotHeight back to null when server setting changes (so server value takes effect)
  const prevServerHeight = useRef<number | null>(null);
  useEffect(() => {
    const serverH = businessSettings?.planningSlotHeight ?? 44;
    if (prevServerHeight.current !== null && prevServerHeight.current !== serverH) {
      setLocalSlotHeight(null);
    }
    prevServerHeight.current = serverH;
  }, [businessSettings?.planningSlotHeight]);

  const { data: adminRoles = [] } = useQuery<Array<{id: number; name: string; role: string; permissions: string[]; photoUrl?: string | null}>>({
    queryKey: ["/api/admin-roles"],
  });

  // Salary data: only fetched when the wallet portal is open (heavy endpoint).
  // Net profit circle uses lightweight parallel queries instead (see below).
  const salaryMonthFrom = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const salaryMonthTo   = format(endOfMonth(new Date()),   "yyyy-MM-dd");
  const { data: salaryData, isFetching: salaryDataFetching } = useQuery<{
    staff: any[]; services: any[]; staffCommissions: any[];
    appointments: any[]; charges: any[]; deductions: any[];
    staffPayments: any[]; salonPayments: any[];
  }>({
    queryKey: ["/api/salaries/compute", salaryMonthFrom, salaryMonthTo],
    queryFn: async () => {
      const res = await fetch(
        `/api/salaries/compute?from=${salaryMonthFrom}&to=${salaryMonthTo}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!walletStaffId,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
    placeholderData: (prev: any) => prev,
  });

  // Fast parallel queries for the net profit circle — loaded immediately on page open
  // without waiting for the heavy /api/salaries/compute endpoint.
  const { data: monthCharges = [], isFetching: fetchingCharges } = useQuery<any[]>({
    queryKey: ["/api/charges"],
    enabled: canViewNetProfit,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
    placeholderData: (prev: any) => prev ?? [],
  });

  const { data: allStaffCommissions = [], isFetching: fetchingCommissions } = useQuery<any[]>({
    queryKey: ["/api/staff-commissions"],
    enabled: canViewNetProfit,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev: any) => prev ?? [],
  });

  // Owner withdrawals for net profit circle
  const { data: ownerWithdrawals = [], isFetching: fetchingWithdrawals } = useQuery<any[]>({
    queryKey: ["/api/owner-withdrawals"],
    enabled: canViewNetProfit,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
    placeholderData: (prev: any) => prev ?? [],
  });

  // True while any of the four fast queries that power the profit circle are refetching
  const isProfitSyncing = canViewNetProfit && (fetchingAllApts || fetchingCharges || fetchingCommissions || fetchingWithdrawals);

  const createDeductionMutation = useMutation({
    mutationFn: async (data: { staffName: string; type: string; description: string; amount: number; date: string }) => {
      const res = await apiRequest("POST", "/api/staff-deductions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
      setWalletShowAdd(false);
      setWalletDeductForm({ type: "advance", description: "", amount: "" });
      toast({ title: t("salaries.deductions") });
    },
  });

  const markStaffPaidMutation = useMutation({
    mutationFn: async (data: { staffId: number; staffName: string; amount: number }) => {
      const res = await apiRequest("POST", "/api/staff-payments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
      toast({ title: t("salaries.markAsPaid") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const revertStaffPaymentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/staff-payments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
      toast({ title: t("planning.paymentReverted") || "تم إلغاء الدفع" });
    },
  });

  const clearWalletDeductionMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/staff-deductions/${id}/clear`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
    },
  });

  // Compute wallet data for the selected staff member
  const walletPortalData = useMemo(() => {
    if (!walletStaffId || !salaryData) return null;
    const s = salaryData.staff?.find((st: any) => st.id === walletStaffId);
    if (!s) return null;

    const staffPaymentsList: any[] = (salaryData.staffPayments || []).filter((p: any) => Number(p.staffId) === walletStaffId);
    const lastPayment = staffPaymentsList.sort((a: any, b: any) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())[0];
    const lastPaymentDate = lastPayment ? new Date(lastPayment.paidAt) : null;

    let sinceDate: string | null = null;
    if (lastPaymentDate) {
      const openMins = businessSettings?.openingTime
        ? parseInt(businessSettings.openingTime.split(':')[0]) * 60 + parseInt(businessSettings.openingTime.split(':')[1])
        : 0;
      const dateMins = lastPaymentDate.getHours() * 60 + lastPaymentDate.getMinutes();
      const adjusted = dateMins < openMins ? subDays(lastPaymentDate, 1) : lastPaymentDate;
      sinceDate = `${adjusted.getFullYear()}-${String(adjusted.getMonth() + 1).padStart(2, "0")}-${String(adjusted.getDate()).padStart(2, "0")}`;
    }

    // Match the exact same commission logic as Salaries.tsx getServiceCommission
    const getCommission = (serviceName: string): number => {
      const service = (salaryData.services || []).find((sv: any) => sv.name === serviceName);
      if (!service) return 50;
      // Check for a custom per-staff commission rate
      const customComm = (salaryData.staffCommissions || []).find(
        (c: any) => c.staffId === s.id && c.serviceId === service.id
      );
      if (customComm) return customComm.percentage;
      // Fall back to the service's default commission percent
      return service.commissionPercent ?? 50;
    };

    const walletAppts = (salaryData.appointments || []).filter((apt: any) => {
      if (!apt.paid) return false;
      const match = Number(apt.staffId) === walletStaffId || (!apt.staffId && apt.staff === s.name);
      if (!match) return false;
      if (sinceDate) return apt.date > sinceDate;
      return true;
    });

    let walletRevenue = 0;
    let walletCommission = 0;
    walletAppts.forEach((apt: any) => {
      const total = Number(apt.total) || 0;
      walletRevenue += total;
      // Multi-service: calculate per-service commission weighted by price, then scale to actual total
      let parsedServices: { name: string; price: number }[] | null = null;
      if (apt.servicesJson) {
        try {
          const raw = typeof apt.servicesJson === 'string' ? JSON.parse(apt.servicesJson) : apt.servicesJson;
          if (Array.isArray(raw) && raw.length > 0) parsedServices = raw;
        } catch { /* ignore */ }
      }
      if (parsedServices && parsedServices.length > 0) {
        const sumPrices = parsedServices.reduce((a, sv) => a + Number(sv.price || 0), 0);
        const discountRatio = sumPrices > 0 && total >= 0 && total < sumPrices ? total / sumPrices : 1;
        for (const sv of parsedServices) {
          const effectivePrice = Number(sv.price || 0) * discountRatio;
          walletCommission += (effectivePrice * getCommission(sv.name)) / 100;
        }
      } else {
        walletCommission += (total * getCommission(apt.service || "Unknown")) / 100;
      }
    });

    const pendingDeductions: any[] = (salaryData.deductions || []).filter((d: any) =>
      !d.cleared && (Number(d.staffId) === walletStaffId || (!d.staffId && d.staffName === s.name))
    );
    const pendingTotal = pendingDeductions.reduce((sum: number, d: any) => sum + Math.max(0, d.amount - (d.paidBack || 0)), 0);

    const recentPayments: any[] = staffPaymentsList
      .sort((a: any, b: any) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
      .slice(0, 5);

    return {
      staffName: s.name,
      walletRevenue,
      walletCommission,
      walletBalance: walletCommission - pendingTotal,
      sinceDate,
      lastPaymentDate,
      apptCount: walletAppts.length,
      deductions: pendingDeductions,
      recentPayments,
    };
  }, [walletStaffId, salaryData, businessSettings]);

  const currentUserName = typeof window !== 'undefined' ? sessionStorage.getItem("current_user") : null;
  const currentUser = useMemo(
    () => adminRoles.find(role => role.name === currentUserName),
    [adminRoles, currentUserName]
  );
  const hasPermission = useCallback((permission: string) => {
    if (!currentUserName || currentUserName === "Setup") return true;
    if (!currentUser) return true;
    if (currentUser.role === "owner") return true;
    if ((currentUser.permissions || []).length === 0) return true;
    return (currentUser.permissions || []).includes(permission);
  }, [currentUserName, currentUser]);
  
  // Re-adjust date once business settings are loaded (in case initial load used wrong cutoff)
  const settingsLoadedRef = useRef(false);
  useEffect(() => {
    if (businessSettings?.openingTime && businessSettings?.closingTime && !settingsLoadedRef.current) {
      settingsLoadedRef.current = true;
      const correctWorkDay = getWorkDayDate(businessSettings.openingTime, businessSettings.closingTime);
      // Only adjust if it's different from the current date
      if (format(correctWorkDay, "yyyy-MM-dd") !== format(date, "yyyy-MM-dd")) {
        setDate(correctWorkDay);
      }
    }
  }, [businessSettings?.openingTime, businessSettings?.closingTime]);
  
  // Check if we're viewing the current "work day" (accounting for overnight closing)
  const isToday = useMemo(() => {
    const workDayDate = getWorkDayDate(businessSettings?.openingTime, businessSettings?.closingTime);
    return format(date, "yyyy-MM-dd") === format(workDayDate, "yyyy-MM-dd");
  }, [date, currentTime, businessSettings?.openingTime, businessSettings?.closingTime]);

  const isDateAutoLocked = useCallback((checkDate: Date) => {
    if (!businessSettings?.autoLockEnabled) return false;
    if (canEditPastAppointments) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const openingTime = businessSettings?.openingTime || "09:00";
    const closingTime = businessSettings?.closingTime || "19:00";
    const [openH, openM] = openingTime.split(":").map(Number);
    const [closeH, closeM] = closingTime.split(":").map(Number);
    const openingMinutes = openH * 60 + openM;
    const closingMinutes = closeH * 60 + closeM;
    const isOvernight = closingMinutes < openingMinutes;

    const currentWorkDay = getWorkDayDate(openingTime, closingTime);
    const currentWorkDayStr = format(currentWorkDay, "yyyy-MM-dd");
    const viewingDateStr = format(checkDate, "yyyy-MM-dd");

    if (viewingDateStr < currentWorkDayStr) return true;

    if (viewingDateStr === currentWorkDayStr) {
      if (isOvernight) {
        return currentMinutes >= closingMinutes && currentMinutes < openingMinutes;
      } else {
        return currentMinutes >= closingMinutes;
      }
    }

    return false;
  }, [businessSettings?.autoLockEnabled, businessSettings?.closingTime, businessSettings?.openingTime, canEditPastAppointments]);

  const isAutoLocked = useMemo(() => isDateAutoLocked(date), [date, currentTime, isDateAutoLocked]);

  const canEdit = canEditCardboard && !isAutoLocked;
  
  // INITIAL AUTO-SCROLL: Scroll once when all data loads (staff + business settings ready)
  const initialScrollDoneRef = useRef(false);
  
  const readyForScroll = staffList.length > 0 && !loadingServices && !loadingStaff;
  
  useEffect(() => {
    if (!isToday || initialScrollDoneRef.current || !readyForScroll) return;
    
    const timers: NodeJS.Timeout[] = [];
    let cancelled = false;
    
    const tryScroll = (attempt: number) => {
      if (cancelled || initialScrollDoneRef.current) return;
      
      if (liveLineRef.current && boardRef.current) {
        initialScrollDoneRef.current = true;
        scrollToLiveLine(true, true);
      } else if (attempt < 10) {
        const retryTimer = setTimeout(() => tryScroll(attempt + 1), 200);
        timers.push(retryTimer);
      }
    };
    
    const initialTimer = setTimeout(() => tryScroll(0), 150);
    timers.push(initialTimer);
    
    return () => {
      cancelled = true;
      timers.forEach(t => clearTimeout(t));
    };
  }, [isToday, readyForScroll, scrollToLiveLine]);

  const isFirstRender = useRef(true);
  
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!isToday || !initialScrollDoneRef.current) return;
    scrollToLiveLine(true);
  }, [isToday, currentTime, scrollToLiveLine]);

  // Scroll when visibility changes (returning from background in PWA)
  // Always register listeners, but no-op inside handler if not ready
  useEffect(() => {
    let visibilityTimers: NodeJS.Timeout[] = [];
    let cancelled = false;
    
    const handleVisibility = () => {
      visibilityTimers.forEach(t => clearTimeout(t));
      visibilityTimers = [];
      
      if (document.visibilityState === 'visible' && isToday && readyForScroll) {
        userScrollPauseRef.current = 0;
        
        const tryScroll = (attempt: number) => {
          if (cancelled) return;
          if (liveLineRef.current && boardRef.current) {
            scrollToLiveLine(true, true);
          } else if (attempt < 5) {
            const timer = setTimeout(() => tryScroll(attempt + 1), 150);
            visibilityTimers.push(timer);
          }
        };
        
        const initialTimer = setTimeout(() => tryScroll(0), 100);
        visibilityTimers.push(initialTimer);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    window.addEventListener('pageshow', handleVisibility);
    
    return () => {
      cancelled = true;
      visibilityTimers.forEach(t => clearTimeout(t));
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      window.removeEventListener('pageshow', handleVisibility);
    };
  }, [isToday, readyForScroll, scrollToLiveLine]);
  
  const hours = useMemo(() => {
    if (businessSettings?.openingTime && businessSettings?.closingTime) {
      return generateTimeSlots(businessSettings.openingTime, businessSettings.closingTime);
    }
    return DEFAULT_HOURS;
  }, [businessSettings?.openingTime, businessSettings?.closingTime]);
  
  const isNonWorkingDay = useMemo(() => {
    if (!businessSettings?.workingDays || businessSettings.workingDays.length === 0) {
      return false;
    }
    const dayOfWeek = date.getDay();
    return !businessSettings.workingDays.includes(dayOfWeek);
  }, [date, businessSettings?.workingDays]);
  
  const { data: packages = [] } = useQuery<Array<{
    id: number;
    name: string;
    description: string | null;
    services: number[];
    originalPrice: number;
    discountedPrice: number;
    validFrom: string | null;
    validUntil: string | null;
    isActive: boolean;
  }>>({
    queryKey: ["/api/packages"],
  });
  
  const { data: waitlistEntries = [], refetch: refetchWaitlist } = useQuery<Array<{
    id: number;
    clientName: string;
    clientPhone: string | null;
    requestedDate: string;
    requestedTime: string | null;
    servicesDescription: string | null;
    staffName: string | null;
    status: string;
    createdAt: string;
    expiresAt: string | null;
  }>>({
    queryKey: ["/api/waitlist"],
  });
  
  // Show loading state only on initial load (not when cached data exists)
  // This prevents flashing when navigating back with cached data
  const isDataLoading = (loadingStaff && staffList.length === 0) || (loadingServices && services.length === 0);
  // Only treat as auth error on explicit 401 — not offline/network failures
  const hasAuthError = staffError?.message === "UNAUTHORIZED_401" || servicesError?.message === "UNAUTHORIZED_401";
  const isAdmin = sessionStorage.getItem("admin_authenticated") === "true";

  // ── Owner net profit for the current month ──
  // Uses fast parallel queries (charges, commissions, withdrawals) + appointments already
  // on the page — no dependency on the heavy /api/salaries/compute endpoint.
  const ownerNetProfit = useMemo(() => {
    if (!canViewNetProfit) return null;
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const monthApts = (allAppointments as any[]).filter((a: any) => {
      if (!a.paid || !a.date) return false;
      try { return isWithinInterval(parseISO(a.date), { start: monthStart, end: monthEnd }); }
      catch { return false; }
    });

    let totalRevenue = 0;
    let totalCommissions = 0;
    for (const app of monthApts) {
      totalRevenue += Number(app.total || 0);
      totalCommissions += calcAppointmentCommission(app, services, staffList, allStaffCommissions);
    }
    const monthRevenue = totalRevenue - totalCommissions;

    const totalCharges = (monthCharges as any[])
      .filter((c: any) => {
        try { return isWithinInterval(parseISO(c.date), { start: monthStart, end: monthEnd }); }
        catch { return false; }
      })
      .reduce((s: number, c: any) => s + Number(c.amount || 0), 0);

    const totalWithdrawals = (ownerWithdrawals as any[])
      .filter((w: any) => {
        try { return isWithinInterval(parseISO(w.date), { start: monthStart, end: monthEnd }); }
        catch { return false; }
      })
      .reduce((s: number, w: any) => s + Number(w.amount || 0), 0);

    return monthRevenue - totalWithdrawals - totalCharges;
  }, [canViewNetProfit, allAppointments, services, staffList, allStaffCommissions, monthCharges, ownerWithdrawals]);

  // Sync horizontal scroll between header and board
  // Re-attaches when loading finishes so refs are connected to actual DOM
  useEffect(() => {
    if (isDataLoading) return;
    const board = boardRef.current;
    if (!board) return;

    const handleScroll = () => {
      if (headerRef.current) {
        headerRef.current.scrollLeft = board.scrollLeft;
      }
    };

    board.addEventListener('scroll', handleScroll, { passive: true });
    return () => board.removeEventListener('scroll', handleScroll);
  }, [isDataLoading]);

  // Detect user interaction (wheel/touch/pointer/keyboard) to pause auto-scroll
  useEffect(() => {
    if (isDataLoading) return;
    const board = boardRef.current;
    if (!board) return;
    
    const markUserInteraction = () => {
      userScrollPauseRef.current = Date.now();
    };
    
    const handleKeydown = (e: KeyboardEvent) => {
      const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
      if (scrollKeys.includes(e.key)) {
        markUserInteraction();
      }
    };
    
    board.addEventListener('wheel', markUserInteraction, { passive: true });
    board.addEventListener('touchstart', markUserInteraction, { passive: true });
    board.addEventListener('pointerdown', markUserInteraction, { passive: true });
    window.addEventListener('wheel', markUserInteraction, { passive: true });
    document.addEventListener('keydown', handleKeydown);
    
    return () => {
      board.removeEventListener('wheel', markUserInteraction);
      board.removeEventListener('touchstart', markUserInteraction);
      board.removeEventListener('pointerdown', markUserInteraction);
      window.removeEventListener('wheel', markUserInteraction);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [isDataLoading]);

  // Show login screen if session expired — no page reload (avoids blank screen)
  useEffect(() => {
    if (hasAuthError) {
      sessionStorage.clear();
      localStorage.removeItem("user_authenticated");
      localStorage.removeItem("current_user");
      localStorage.removeItem("current_user_role");
      localStorage.removeItem("current_user_permissions");
      // Signal FirstLogin to reset to login screen without a full-page reload
      window.dispatchEvent(new Event("auth:session-expired"));
    }
  }, [hasAuthError]);

  const createMutation = useCreateAppointment();
  const updateMutation = useUpdateAppointment();
  const deleteMutation = useDeleteAppointment();

  const playSuccessSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = ctx.currentTime;
      // Two-note ascending "ding" — C5 then G5
      const notes = [523.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t0 = now + i * 0.10;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.22, t0 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
        osc.start(t0);
        osc.stop(t0 + 0.45);
        if (i === notes.length - 1) osc.onended = () => ctx.close();
      });
    } catch {}
  };

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: formattedDate,
      startTime: "09:00",
      duration: 30,
      client: "",
      service: "",
      staff: "",
      price: 0,
      total: 0,
      paid: false,
      privateRoom: false,
    },
  });

  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const pendingAppointmentId = useRef<string | null>(null);

  useEffect(() => {
    if (!searchString) return;
    
    const params = new URLSearchParams(searchString);
    const dateParam = params.get("date");
    const appointmentId = params.get("appointmentId");
    
    if (dateParam && appointmentId) {
      pendingAppointmentId.current = appointmentId;
      try {
        const targetDate = parseISO(dateParam);
        setDate(targetDate);
      } catch (e) {
        console.error("Invalid date param:", dateParam);
        pendingAppointmentId.current = null;
      }
      setLocation("/planning", { replace: true });
    }
  }, [searchString, setLocation]);

  useEffect(() => {
    if (!pendingAppointmentId.current || loadingApps) return;
    
    const targetApp = appointments.find((app: any) => app.id === parseInt(pendingAppointmentId.current!));
    if (targetApp) {
      const appDate = parseISO(targetApp.date);
      if (canEditCardboard && !isDateAutoLocked(appDate)) {
        openAppointmentForEdit(targetApp);
      }
      pendingAppointmentId.current = null;
    } else if (appointments.length > 0) {
      pendingAppointmentId.current = null;
    }
  }, [loadingApps, appointments]);

  const stats = useMemo(() => {
    const paidAppointments = appointments.filter((app: any) => app.paid);
    const total = paidAppointments.reduce((sum: number, app: any) => sum + (app.total || 0), 0);
    const perStaff = staffList.map(s => {
      const staffTotal = paidAppointments
        .filter((app: any) => app.staffId === s.id || (!app.staffId && app.staff === s.name))
        .reduce((sum: number, app: any) => sum + (app.total || 0), 0);
      return { ...s, total: staffTotal };
    });
    return { total, perStaff };
  }, [appointments, staffList]);

  const searchResults = useMemo(() => {
    if (!appointmentSearch.trim()) return { matches: [], total: 0, count: 0 };
    const searchLower = appointmentSearch.toLowerCase();
    const matches = allAppointments.filter(app => 
      app.client?.toLowerCase().includes(searchLower) ||
      app.service?.toLowerCase().includes(searchLower) ||
      app.staff?.toLowerCase().includes(searchLower)
    ).sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });
    const total = matches.reduce((sum, app) => sum + (app.total || 0), 0);
    return { matches, total, count: matches.length };
  }, [allAppointments, appointmentSearch]);

  // Watch the staff field so the service dropdown filters by that staff's category
  const watchedStaff = form.watch("staff");

  // Watch the client field to trigger recalculation when client changes
  const watchedClient = form.watch("client");
  
  // Clear discounts and restore base total when client changes or is cleared
  const prevClientRef = useRef<string>("");
  useEffect(() => {
    if (!isDialogOpen) return;
    const currentClient = watchedClient || "";
    if (prevClientRef.current && currentClient !== prevClientRef.current) {
      const baseTotal = computeBaseTotal();
      setAppliedLoyaltyPoints(null);
      setAppliedGiftCardBalance(null);
      setManualTotalOverride(false);
      setTotalInputValue(String(baseTotal));
      form.setValue("total", baseTotal);
      form.setValue("price", baseTotal);
    }
    prevClientRef.current = currentClient;
  }, [watchedClient, isDialogOpen]);

  // Helper function to parse services from an appointment
  const parseAppointmentServices = (app: any): Array<{id: string, name: string, price: number, duration: number}> => {
    let parsedServices: Array<{id?: string, name: string, price: number, duration: number}> = [];
    if (app.servicesJson) {
      try {
        parsedServices = typeof app.servicesJson === 'string' 
          ? JSON.parse(app.servicesJson) 
          : app.servicesJson;
      } catch {
        parsedServices = [];
      }
    }
    // Fall back to single service if no servicesJson - use stored appointment price, not catalog price
    if (parsedServices.length === 0 && app.service) {
      parsedServices = [{ 
        name: app.service, 
        price: app.price || 0, 
        duration: app.duration || 60 
      }];
    }
    // Ensure each service has a unique ID
    return parsedServices.map((s, i) => ({
      ...s,
      id: s.id || `svc-${Date.now()}-${i}`
    }));
  };

  // Helper function to open an appointment for editing
  const openAppointmentForEdit = (app: any) => {
    const parsedServices = parseAppointmentServices(app);
    setSelectedPackage(null);
    setManualTotalOverride(false);
    setSelectedServices(parsedServices);
    const newPriceInputs: Record<string, string> = {};
    parsedServices.forEach(s => {
      newPriceInputs[s.id] = String(s.price);
    });
    setPriceInputs(newPriceInputs);
    
    const loyaltyDiscount = Number(app.loyaltyDiscountAmount) || 0;
    const loyaltyPointsUsed = Number(app.loyaltyPointsRedeemed) || 0;
    const giftCardDiscount = Number(app.giftCardDiscountAmount) || 0;
    
    if (loyaltyDiscount > 0 && loyaltyPointsUsed > 0 && app.clientId) {
      setAppliedLoyaltyPoints({ clientId: app.clientId, points: loyaltyPointsUsed, discountAmount: loyaltyDiscount });
    } else {
      setAppliedLoyaltyPoints(null);
    }
    if (giftCardDiscount > 0 && app.clientId) {
      setAppliedGiftCardBalance({ clientId: app.clientId, amount: giftCardDiscount, discountAmount: giftCardDiscount });
    } else {
      setAppliedGiftCardBalance(null);
    }
    
    form.reset({
      date: app.date,
      startTime: app.startTime,
      duration: app.duration,
      client: app.client,
      service: app.service || "",
      staff: app.staff,
      price: app.price,
      total: app.total,
      paid: app.paid,
      privateRoom: app.privateRoom || false,
    });
    setTotalInputValue(String(app.total));
    setEditingAppointment(app);
    setIsDialogOpen(true);
  };

  const handleSlotClick = (staffName: string, time: string) => {
    if (!canEdit) return;
    form.reset({
      date: formattedDate,
      startTime: time,
      duration: 60,
      client: "",
      service: "",
      staff: staffName,
      price: 0,
      total: 0,
      paid: true,
    });
    setSelectedServices([]);
    setPriceInputs({});
    setSelectedPackage(null);
    setAppliedLoyaltyPoints(null);
    setAppliedGiftCardBalance(null);
    setManualTotalOverride(false);
    setEditingAppointment(null);
    setIsDialogOpen(true);
  };

  const handleAppointmentClick = (e: React.MouseEvent, app: any) => {
    e.stopPropagation();
    if (!canEdit) return;
    openAppointmentForEdit(app);
  };

  const onSubmit = async (data: AppointmentFormValues) => {
    if (!canEdit) return;
    // Track most used services for quick access
    const stored = localStorage.getItem('mostUsedServices');
    const mostUsed = stored ? JSON.parse(stored) : {};
    
    // Handle multi-service or single service tracking
    if (selectedServices.length > 0) {
      // Track each selected service individually
      selectedServices.forEach(svc => {
        mostUsed[svc.name] = (mostUsed[svc.name] || 0) + 1;
      });
    } else if (data.service) {
      mostUsed[data.service] = (mostUsed[data.service] || 0) + 1;
    }
    localStorage.setItem('mostUsedServices', JSON.stringify(mostUsed));

    // Build product needs list synchronously (no awaits — stock check runs in background after save)
    const servicesToCheck = selectedServices.length > 0 
      ? selectedServices.map(s => services.find(svc => svc.name === s.name)).filter(Boolean)
      : [services.find(s => s.name === data.service)].filter(Boolean);

    const allProductNeeds: Array<{productId: number, quantity: number}> = [];
    for (const selectedService of servicesToCheck) {
      const rawIds = (selectedService as any)?.linkedProductIds;
      const linkedItems: Array<{productId: number, quantity: number}> = Array.isArray(rawIds) && rawIds.length > 0
        ? rawIds.map((item: any) => typeof item === "number" ? { productId: item, quantity: 1 } : { productId: item.productId, quantity: item.quantity ?? 1 })
        : ((selectedService as any)?.linkedProductId ? [{ productId: (selectedService as any).linkedProductId, quantity: 1 }] : []);
      for (const { productId, quantity } of linkedItems) {
        const existing = allProductNeeds.find(n => n.productId === productId);
        if (existing) existing.quantity += quantity;
        else allProductNeeds.push({ productId, quantity });
      }
    }

    // Find the client ID from the clients list — O(1) map lookup
    const selectedClient = clientsByName.get(data.client ?? "") ?? null;
    const clientId = selectedClient?.id || (data as any).clientId || null;

    // Read prices from React state (priceInputs tracks individual service prices)
    const servicesToSave = selectedServices.map(s => {
      const inputValue = priceInputs[s.id];
      const price = inputValue !== undefined ? (parseFloat(inputValue) || s.price) : s.price;
      return { name: s.name, price, duration: s.duration };
    });
    
    // Read total price from state (user can override the calculated total)
    // Guard against NaN from invalid input (e.g. "-", empty, text)
    const parsedCustom = totalInputValue ? Number(totalInputValue) : NaN;
    const customTotal = Number.isFinite(parsedCustom) ? parsedCustom : null;
    // Use package discounted price if a package is selected, otherwise sum of services
    const calculatedTotal = selectedPackage 
      ? selectedPackage.discountedPrice 
      : servicesToSave.reduce((sum, s) => sum + s.price, 0);
    const finalTotal = customTotal !== null ? customTotal : calculatedTotal;
    
    const serviceDescription = selectedPackage 
      ? `${selectedPackage.name} (${servicesToSave.map(s => s.name).join(', ')})`
      : (servicesToSave.length > 0 ? servicesToSave.map(s => s.name).join(', ') : data.service);
    
    const submitData = {
      ...data,
      clientId,
      servicesJson: servicesToSave.length > 0 ? servicesToSave : undefined,
      service: serviceDescription,
      duration: servicesToSave.length > 0 ? servicesToSave.reduce((sum, s) => sum + s.duration, 0) : data.duration,
      price: finalTotal,
      total: finalTotal,
      loyaltyDiscountAmount: appliedLoyaltyPoints?.discountAmount || 0,
      loyaltyPointsRedeemed: appliedLoyaltyPoints?.points || 0,
      giftCardDiscountAmount: appliedGiftCardBalance?.discountAmount || 0,
      privateRoom: data.privateRoom || false,
    };

    if (editingAppointment) {
      // Pre-validate loyalty/gift card balances before saving edit
      if (appliedLoyaltyPoints) {
        const client = clients.find(c => c.id === appliedLoyaltyPoints.clientId);
        if (!client) {
          playErrorSound();
          toast({ title: t("common.error"), description: t("planning.clientNotFound", "Client not found for loyalty discount"), variant: "destructive" });
          return;
        }
        const oldPoints = Number(editingAppointment.loyaltyPointsRedeemed) || 0;
        const newPoints = appliedLoyaltyPoints.points;
        const delta = newPoints - oldPoints;
        if (delta > 0 && client.loyaltyPoints < delta) {
          playErrorSound();
          toast({ title: t("common.error"), description: t("planning.insufficientPoints", "Insufficient loyalty points"), variant: "destructive" });
          return;
        }
      }
      if (appliedGiftCardBalance) {
        const client = clients.find(c => c.id === appliedGiftCardBalance.clientId);
        if (!client) {
          playErrorSound();
          toast({ title: t("common.error"), description: t("planning.clientNotFound", "Client not found for gift card discount"), variant: "destructive" });
          return;
        }
        const oldGiftCard = Number(editingAppointment.giftCardDiscountAmount) || 0;
        const newGiftCard = appliedGiftCardBalance.discountAmount;
        const delta = newGiftCard - oldGiftCard;
        if (delta > 0 && Number(client.giftCardBalance) < delta) {
          playErrorSound();
          toast({ title: t("common.error"), description: t("planning.insufficientGiftCard", "Insufficient gift card balance"), variant: "destructive" });
          return;
        }
      }
    }

    const capturedLoyalty = appliedLoyaltyPoints ? { ...appliedLoyaltyPoints } : null;
    const capturedGiftCard = appliedGiftCardBalance ? { ...appliedGiftCardBalance } : null;
    const capturedEditingAppointment = editingAppointment ? { ...editingAppointment } : null;
    const capturedDate = format(date, "yyyy-MM-dd");

    const performDeductions = async () => {
      if (capturedEditingAppointment) {
        const oldGiftCardDiscount = Number(capturedEditingAppointment.giftCardDiscountAmount) || 0;
        const newGiftCardDiscount = capturedGiftCard?.discountAmount || 0;

        if (capturedGiftCard && capturedEditingAppointment.clientId && capturedEditingAppointment.clientId !== capturedGiftCard.clientId) {
          try {
            if (oldGiftCardDiscount > 0) {
              await apiRequest("PATCH", `/api/clients/${capturedEditingAppointment.clientId}/gift-card-balance`, {
                amount: oldGiftCardDiscount
              });
            }
            if (newGiftCardDiscount > 0) {
              await apiRequest("PATCH", `/api/clients/${capturedGiftCard.clientId}/gift-card-balance`, {
                amount: -newGiftCardDiscount
              });
              await apiRequest("PATCH", `/api/clients/${capturedGiftCard.clientId}/use-gift-card-balance`, {
                useGiftCardBalance: false
              });
            }
            queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
          } catch (e) {
            console.error("Gift card balance client-change adjustment failed:", e);
            playErrorSound();
            toast({ title: t("common.error"), description: t("planning.giftCardDeductionError", "Gift card deduction failed"), variant: "destructive" });
          }
        } else {
          const giftCardDelta = newGiftCardDiscount - oldGiftCardDiscount;
          if (giftCardDelta !== 0 && (capturedGiftCard || oldGiftCardDiscount > 0)) {
            try {
              const clientId = capturedGiftCard?.clientId || capturedEditingAppointment.clientId;
              if (clientId) {
                await apiRequest("PATCH", `/api/clients/${clientId}/gift-card-balance`, {
                  amount: -giftCardDelta
                });
                if (newGiftCardDiscount > 0) {
                  await apiRequest("PATCH", `/api/clients/${clientId}/use-gift-card-balance`, {
                    useGiftCardBalance: false
                  });
                }
                queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
              }
            } catch (e) {
              console.error("Gift card balance delta adjustment failed:", e);
              playErrorSound();
              toast({ title: t("common.error"), description: t("planning.giftCardDeductionError", "Gift card deduction failed"), variant: "destructive" });
            }
          }
        }

        const oldLoyaltyPoints = Number(capturedEditingAppointment.loyaltyPointsRedeemed) || 0;
        const newLoyaltyPoints = capturedLoyalty?.points || 0;

        if (capturedLoyalty && capturedEditingAppointment.clientId && capturedEditingAppointment.clientId !== capturedLoyalty.clientId) {
          try {
            if (oldLoyaltyPoints > 0 && capturedEditingAppointment.clientId) {
              await apiRequest("PATCH", `/api/clients/${capturedEditingAppointment.clientId}/restore-loyalty-points`, {
                points: oldLoyaltyPoints
              });
            }
            if (newLoyaltyPoints > 0) {
              await apiRequest("POST", "/api/loyalty-redemptions", {
                clientId: capturedLoyalty.clientId,
                pointsUsed: newLoyaltyPoints,
                rewardDescription: `Réduction (modifié): -${Number(capturedLoyalty.discountAmount ?? 0).toFixed(2)} DH`,
                date: capturedDate
              });
              await apiRequest("PATCH", `/api/clients/${capturedLoyalty.clientId}/use-points`, {
                usePoints: false
              });
            }
            queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
            queryClient.invalidateQueries({ queryKey: ["/api/loyalty-redemptions"] });
          } catch (e) {
            console.error("Loyalty points client-change adjustment failed:", e);
          }
        } else {
          const loyaltyDelta = newLoyaltyPoints - oldLoyaltyPoints;
          if (loyaltyDelta > 0 && capturedLoyalty) {
            try {
              await apiRequest("POST", "/api/loyalty-redemptions", {
                clientId: capturedLoyalty.clientId,
                pointsUsed: loyaltyDelta,
                rewardDescription: `Réduction (modifié): -${Number(capturedLoyalty.discountAmount ?? 0).toFixed(2)} DH`,
                date: capturedDate
              });
              await apiRequest("PATCH", `/api/clients/${capturedLoyalty.clientId}/use-points`, {
                usePoints: false
              });
              queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
              queryClient.invalidateQueries({ queryKey: ["/api/loyalty-redemptions"] });
            } catch (e) {
              console.error("Loyalty points delta deduction failed:", e);
            }
          } else if (loyaltyDelta < 0 && capturedEditingAppointment.clientId) {
            try {
              await apiRequest("PATCH", `/api/clients/${capturedEditingAppointment.clientId}/restore-loyalty-points`, {
                points: Math.abs(loyaltyDelta)
              });
              queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
            } catch (e) {
              console.error("Loyalty points restore failed:", e);
            }
          }
        }
      } else {
        if (capturedGiftCard && capturedGiftCard.discountAmount > 0) {
          try {
            await apiRequest("PATCH", `/api/clients/${capturedGiftCard.clientId}/gift-card-balance`, {
              amount: -capturedGiftCard.discountAmount
            });
            await apiRequest("PATCH", `/api/clients/${capturedGiftCard.clientId}/use-gift-card-balance`, {
              useGiftCardBalance: false
            });
            queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
          } catch (e) {
            console.error("Gift card balance deduction failed:", e);
            playErrorSound();
            toast({ title: t("common.error"), description: t("planning.giftCardDeductionError", "Gift card deduction failed"), variant: "destructive" });
          }
        }

        if (capturedLoyalty && capturedLoyalty.points > 0) {
          try {
            await apiRequest("POST", "/api/loyalty-redemptions", {
              clientId: capturedLoyalty.clientId,
              pointsUsed: capturedLoyalty.points,
              rewardDescription: `Réduction automatique: -${Number(capturedLoyalty.discountAmount ?? 0).toFixed(2)} DH`,
              date: capturedDate
            });
            await apiRequest("PATCH", `/api/clients/${capturedLoyalty.clientId}/use-points`, {
              usePoints: false
            });
            queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
            queryClient.invalidateQueries({ queryKey: ["/api/loyalty-redemptions"] });
          } catch (e) {
            console.error("Loyalty points deduction failed:", e);
            playErrorSound();
            toast({ title: t("common.error"), description: t("planning.loyaltyDeductionError", "Loyalty points deduction failed"), variant: "destructive" });
          }
        }
      }
    };

    if (editingAppointment) {
      updateMutation.mutate({ id: editingAppointment.id, ...submitData }, {
        onSuccess: async () => { await performDeductions(); }
      });
      setSelectedServices([]);
      setPriceInputs({});
      setSelectedPackage(null);
      setAppliedLoyaltyPoints(null);
      setAppliedGiftCardBalance(null);
      setManualTotalOverride(false);
      setEditingAppointment(null);
      setTotalInputValue("0");
      setIsDialogOpen(false);
    } else {
      // ─── OPTIMISTIC CREATE ───────────────────────────────────────────────
      // Capture everything needed for post-save work BEFORE resetting state
      const capturedProductNeeds = [...allProductNeeds];
      const submittingUser = sessionStorage.getItem("current_user") || "Unknown";
      const printData = {
        businessName: salonSettings?.businessName || "PREGASQUAD SALON",
        currency: salonSettings?.currencySymbol || "DH",
        clientName: (submitData.client || data.client || "").replace(/\s*\([^)]*\)\s*$/, ""),
        clientPhone: (submitData.client || data.client || "").match(/\(([^)]+)\)/)?.[1] || "",
        services: serviceDescription || "",
        staffName: data.staff || "",
        date: format(date, "dd/MM/yyyy"),
        time: data.startTime || "",
        duration: submitData.duration || 0,
        total: finalTotal,
      };

      // Close dialog and reset state immediately — card appears via onMutate below
      setSelectedServices([]);
      setPriceInputs({});
      setSelectedPackage(null);
      setAppliedLoyaltyPoints(null);
      setAppliedGiftCardBalance(null);
      setManualTotalOverride(false);
      setEditingAppointment(null);
      setTotalInputValue("0");
      setIsDialogOpen(false);
      // Sound plays in onSuccess so it only fires on confirmed save (not on error)

      createMutation.mutate({ ...submitData, createdBy: submittingUser }, {
        onSuccess: async (result: any) => {
          const isOffline = !!(result as any)._offline;

          // Confirmed save — play sound now (not before, to avoid false positives)
          playSuccessSound();

          // Skip all network-dependent post-save work for offline-queued appointments;
          // stock, deductions and printing will be reconciled when the queue syncs.
          if (isOffline) return;

          // Background stock check + decrement (appointment card is already visible)
          if (capturedProductNeeds.length > 0) {
            const productQuantities: Record<number, {current: number, name: string}> = {};
            let stockFailed = false;

            for (const { productId, quantity } of capturedProductNeeds) {
              try {
                if (!productQuantities[productId]) {
                  const res = await apiRequest("GET", `/api/products/${productId}`);
                  const product = await res.json();
                  productQuantities[productId] = { current: product.quantity, name: product.name };
                }
                const info = productQuantities[productId];
                const newQty = info.current - quantity;
                if (newQty < 0) {
                  playErrorSound();
                  toast({
                    title: `⚠️ مخزون غير كافٍ لـ ${info.name}`,
                    description: `متوفر: ${info.current}، مطلوب: ${quantity}`,
                    variant: "destructive",
                  });
                  // Deterministic rollback: delete the appointment we just created
                  if (result?.id) {
                    try {
                      await apiRequest("DELETE", `/api/appointments/${result.id}`);
                    } catch (deleteErr) {
                      console.error("Rollback DELETE failed:", deleteErr);
                      // Delete failed — force a hard refetch so the board reflects server truth
                      playErrorSound();
                      toast({
                        title: t("common.error"),
                        description: t("planning.rollbackFailed", "Could not remove appointment — please refresh"),
                        variant: "destructive",
                      });
                    }
                    queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
                  }
                  stockFailed = true;
                  break;
                }
                productQuantities[productId].current = newQty;
              } catch (e) {
                console.error("Stock check failed:", e);
              }
            }

            if (!stockFailed) {
              for (const { productId } of capturedProductNeeds) {
                try {
                  await apiRequest("PATCH", `/api/products/${productId}/quantity`, {
                    quantity: productQuantities[productId].current,
                  });
                } catch (e) {
                  console.error("Stock decrement failed:", e);
                }
              }
              queryClient.invalidateQueries({ queryKey: ["/api/products"] });
            }

            if (stockFailed) return;
          }

          // Loyalty points earned (for receipt)
          let loyaltyPointsEarned = 0;
          let loyaltyPointsBalance = 0;
          try {
            const clientStr = submitData.client || data.client || "";
            const clientMatch = clients.find(c => clientStr.includes(c.name));
            if (clientMatch?.loyaltyEnrolled) {
              loyaltyPointsEarned = Math.floor(finalTotal * (businessSettings?.loyaltyPointsPerDh ?? 1));
              const res = await fetch(`/api/clients/${clientMatch.id}`, {
                headers: { "x-user-pin": sessionStorage.getItem("user_pin") || "" },
              });
              if (res.ok) loyaltyPointsBalance = (await res.json()).loyaltyPoints ?? 0;
            }
          } catch (e) {
            console.error("Failed to fetch loyalty points:", e);
          }

          if (submitData.paid) {
            autoPrint({
              ...printData,
              appointmentId: result?.id,
              loyaltyPointsEarned: loyaltyPointsEarned > 0 ? loyaltyPointsEarned : undefined,
              loyaltyPointsBalance: loyaltyPointsBalance > 0 ? loyaltyPointsBalance : undefined,
            }).catch(err => console.error("[print-relay] autoPrint failed:", err));
          }
          await performDeductions();
        },
        onError: () => {
          // Mutation failed — the optimistic card is rolled back by the hook;
          // play error sound to signal the failure.
          playErrorSound();
        },
      });
    }
  };

  const computeBaseTotal = (svcList?: typeof selectedServices, prices?: Record<string, string>, pkg?: typeof selectedPackage) => {
    const svcs = svcList ?? selectedServices;
    const pInputs = prices ?? priceInputs;
    const pkgSel = pkg !== undefined ? pkg : selectedPackage;
    if (pkgSel) return pkgSel.discountedPrice;
    return svcs.reduce((sum, s) => {
      const p = pInputs[s.id];
      return sum + (p !== undefined ? (parseFloat(p) || 0) : s.price);
    }, 0);
  };

  const recalcTotalWithDiscounts = (baseTotal: number) => {
    if (manualTotalOverride) return parseFloat(totalInputValue || "0");
    let runningTotal = baseTotal;
    let newLoyalty: typeof appliedLoyaltyPoints = null;
    let newGiftCard: typeof appliedGiftCardBalance = null;
    
    if (appliedLoyaltyPoints) {
      const clientName = form.getValues("client");
      const client = clientName ? (clientsByName.get(clientName) ?? null) : null;
      if (client && client.loyaltyPoints > 0 && businessSettings?.loyaltyEnabled) {
        const pointsValue = businessSettings?.loyaltyPointsValue || 0.1;
        const maxDiscount = client.loyaltyPoints * pointsValue;
        const discountAmount = Math.min(maxDiscount, runningTotal);
        const pointsUsed = Math.ceil(discountAmount / pointsValue);
        if (discountAmount > 0) {
          newLoyalty = { clientId: client.id, points: pointsUsed, discountAmount };
          runningTotal = Math.max(0, runningTotal - discountAmount);
        }
      }
    }
    
    if (appliedGiftCardBalance) {
      const discountAmount = Math.min(appliedGiftCardBalance.amount, runningTotal);
      if (discountAmount > 0) {
        newGiftCard = { ...appliedGiftCardBalance, discountAmount };
        runningTotal = Math.max(0, runningTotal - discountAmount);
      }
    }
    
    setAppliedLoyaltyPoints(newLoyalty);
    setAppliedGiftCardBalance(newGiftCard);
    return runningTotal;
  };

  const handleAddService = (service: {name: string, price: number, duration: number}) => {
    const serviceId = `svc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newService = {
      ...service,
      id: serviceId
    };
    const updated = [...selectedServices, newService];
    setSelectedServices(updated);
    setSelectedPackage(null);
    const updatedPrices = { ...priceInputs, [serviceId]: String(service.price) };
    setPriceInputs(updatedPrices);
    setManualTotalOverride(false);
    const totalDuration = updated.reduce((sum, s) => sum + s.duration, 0);
    const totalPrice = updated.reduce((sum, s) => {
      const p = updatedPrices[s.id];
      return sum + (p !== undefined ? (parseFloat(p) || 0) : s.price);
    }, 0);
    form.setValue("service", updated.map(s => s.name).join(', '));
    form.setValue("duration", totalDuration);
    form.setValue("price", totalPrice);
    const finalTotal = recalcTotalWithDiscounts(totalPrice);
    form.setValue("total", finalTotal);
    setTotalInputValue(String(finalTotal));
  };

  const handleRemoveService = (index: number) => {
    const removedService = selectedServices[index];
    const updated = selectedServices.filter((_, i) => i !== index);
    setSelectedServices(updated);
    setSelectedPackage(null);
    let newPriceInputs = { ...priceInputs };
    if (removedService) {
      const { [removedService.id]: _, ...rest } = newPriceInputs;
      newPriceInputs = rest;
    }
    setPriceInputs(newPriceInputs);
    setManualTotalOverride(false);
    const totalDuration = updated.reduce((sum, s) => sum + s.duration, 0);
    const totalPrice = updated.reduce((sum, s) => {
      const p = newPriceInputs[s.id];
      return sum + (p !== undefined ? (parseFloat(p) || 0) : s.price);
    }, 0);
    form.setValue("service", updated.map(s => s.name).join(', '));
    form.setValue("duration", totalDuration);
    form.setValue("price", totalPrice);
    const finalTotal = recalcTotalWithDiscounts(totalPrice);
    form.setValue("total", finalTotal);
    setTotalInputValue(String(finalTotal));
  };

  const handleSelectPackage = (pkg: {id: number; name: string; services: number[]; originalPrice: number; discountedPrice: number}) => {
    const packageServices = pkg.services
      .map(serviceId => services.find(s => s.id === serviceId))
      .filter((s): s is typeof services[number] => s !== undefined)
      .map(s => ({
        id: `pkg-svc-${s.id}-${Date.now()}`,
        name: s.name,
        price: s.price,
        duration: s.duration
      }));
    
    if (packageServices.length === 0) return;
    
    setSelectedPackage({ id: pkg.id, name: pkg.name, discountedPrice: pkg.discountedPrice, originalPrice: pkg.originalPrice });
    setSelectedServices(packageServices);
    
    const priceInputsMap: Record<string, string> = {};
    packageServices.forEach(s => {
      priceInputsMap[s.id] = String(s.price);
    });
    setPriceInputs(priceInputsMap);
    
    const totalDuration = packageServices.reduce((sum, s) => sum + s.duration, 0);
    form.setValue("service", packageServices.map(s => s.name).join(', '));
    form.setValue("duration", totalDuration);
    form.setValue("price", pkg.discountedPrice);
    setManualTotalOverride(false);
    const finalTotal = recalcTotalWithDiscounts(pkg.discountedPrice);
    form.setValue("total", finalTotal);
    setTotalInputValue(String(finalTotal));
  };

  const handleClearPackage = () => {
    setSelectedPackage(null);
    setSelectedServices([]);
    setPriceInputs({});
    setManualTotalOverride(false);
    setAppliedLoyaltyPoints(null);
    setAppliedGiftCardBalance(null);
    form.setValue("service", "");
    form.setValue("duration", 30);
    form.setValue("total", 0);
    setTotalInputValue("0");
  };

  const handleClearGiftCardBalance = () => {
    if (appliedGiftCardBalance) {
      const currentTotal = parseFloat(totalInputValue || "0");
      const newTotal = currentTotal + appliedGiftCardBalance.discountAmount;
      setTotalInputValue(String(newTotal));
      form.setValue("total", newTotal);
    }
    setAppliedGiftCardBalance(null);
  };

  const activePackages = useMemo(() => {
    const now = new Date();
    return packages.filter(pkg => {
      if (!pkg.isActive) return false;
      const validFrom = pkg.validFrom ? new Date(pkg.validFrom) : null;
      const validUntil = pkg.validUntil ? new Date(pkg.validUntil) : null;
      if (validFrom && now < validFrom) return false;
      if (validUntil && now > validUntil) return false;
      return true;
    });
  }, [packages]);

  const handlePriceInputChange = (serviceId: string, value: string) => {
    const newPrice = parseFloat(value.replace(',', '.')) || 0;
    
    setPriceInputs(prev => ({ ...prev, [serviceId]: value }));
    
    setSelectedServices(prev => {
      const updated = prev.map(s => 
        s.id === serviceId ? { ...s, price: newPrice } : s
      );
      const totalPrice = updated.reduce((sum, s) => sum + s.price, 0);
      form.setValue("price", totalPrice);
      form.setValue("total", totalPrice);
      return updated;
    });
  };

  const handleServiceChange = (serviceName: string) => {
    const service = services.find(s => s.name === serviceName);
    if (service) {
      handleAddService({ name: service.name, price: service.price, duration: service.duration });
    }
  };

  const revertPaidRef = React.useRef<number>(0);
  const handleRevertPaid = async (e: React.MouseEvent | React.TouchEvent, app: any) => {
    e.stopPropagation();
    e.preventDefault();
    if (!canEdit) return;
    const now = Date.now();
    if (now - revertPaidRef.current < 1000) return;
    revertPaidRef.current = now;

    const appId = typeof app.id === "string" ? parseInt(app.id) : app.id;
    if (appId < 0) return;

    try {
      const updateData: any = { paid: false };
      if (app.date) updateData.date = app.date;
      if (app.startTime) updateData.startTime = app.startTime;
      if (app.duration) updateData.duration = app.duration;
      if (app.service) updateData.service = app.service;
      if (app.staff) updateData.staff = app.staff;
      if (app.staffId) updateData.staffId = app.staffId;
      if (app.client) updateData.client = app.client;
      if (app.clientId) updateData.clientId = app.clientId;
      if (app.phone) updateData.phone = app.phone;
      if (app.total !== undefined) updateData.total = app.total;
      if (app.price !== undefined) updateData.price = app.price;
      if (app.servicesJson) {
        updateData.servicesJson = typeof app.servicesJson === "string"
          ? JSON.parse(app.servicesJson)
          : app.servicesJson;
      }

      await apiRequest("PUT", `/api/appointments/${appId}`, updateData);
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
      refreshSalariesBackground();
      toast({
        title: t("planning.paymentReverted") || "تم إلغاء الدفع",
        description: t("planning.paymentRevertedDesc") || "تم إعادة الrendez-vous إلى حالة غير مدفوع",
      });
    } catch (error) {
      console.error("Revert payment error:", error);
      playErrorSound();
      toast({ title: t("common.error"), description: t("planning.paymentError"), variant: "destructive" });
    }
  };

  const markPaidRef = React.useRef<number>(0);
  const handleMarkAsPaid = async (e: React.MouseEvent | React.TouchEvent, app: any) => {
    e.stopPropagation();
    e.preventDefault();
    if (!canEdit) return;
    
    const now = Date.now();
    if (now - markPaidRef.current < 1000) return;
    markPaidRef.current = now;
    
    const appId = typeof app.id === 'string' ? parseInt(app.id) : app.id;
    if (appId < 0) {
      toast({ 
        title: t("common.pleaseWait") || "Please wait", 
        description: t("planning.appointmentSyncing") || "Appointment is still syncing. Please try again in a moment.",
        variant: "default"
      });
      return;
    }
    
    try {
      const updateData: any = {
        paid: true,
      };
      if (app.date) updateData.date = app.date;
      if (app.startTime) updateData.startTime = app.startTime;
      if (app.duration) updateData.duration = app.duration;
      if (app.service) updateData.service = app.service;
      if (app.staff) updateData.staff = app.staff;
      if (app.staffId) updateData.staffId = app.staffId;
      if (app.client) updateData.client = app.client;
      if (app.clientId) updateData.clientId = app.clientId;
      if (app.phone) updateData.phone = app.phone;
      if (app.total !== undefined) updateData.total = app.total;
      if (app.price !== undefined) updateData.price = app.price;
      if (app.servicesJson) {
        updateData.servicesJson = typeof app.servicesJson === 'string' 
          ? JSON.parse(app.servicesJson) 
          : app.servicesJson;
      }

      await apiRequest("PUT", `/api/appointments/${appId}`, updateData);
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner-withdrawals"] });
      refreshSalariesBackground();
      playPaymentSuccess();
      toast({ title: t("planning.paymentConfirmed"), description: t("planning.paymentConfirmedDesc") });

      // Print receipt and open cash drawer
      try {
        const serviceLabel = (() => {
          if (app.servicesJson) {
            const parsed = typeof app.servicesJson === "string" ? JSON.parse(app.servicesJson) : app.servicesJson;
            if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((s: any) => s.name).join(", ");
          }
          return app.service || "";
        })();
        await autoPrint({
          businessName: salonSettings?.businessName || "PREGASQUAD SALON",
          currency: salonSettings?.currencySymbol || "DH",
          clientName: (app.client || "").replace(/\s*\([^)]*\)\s*$/, ""),
          clientPhone: (app.client || "").match(/\(([^)]+)\)/)?.[1] || app.phone || "",
          services: serviceLabel,
          staffName: app.staff || "",
          date: app.date ? format(new Date(app.date), "dd/MM/yyyy") : format(date, "dd/MM/yyyy"),
          time: app.startTime || "",
          duration: app.duration || 0,
          total: app.total ?? app.price ?? 0,
          appointmentId: appId,
        });
      } catch (printErr) {
        console.error("[print] Mark-paid print failed:", printErr);
      }
    } catch (error) {
      console.error("Payment error:", error);
      playErrorSound();
      toast({ title: t("common.error"), description: t("planning.paymentError"), variant: "destructive" });
    }
  };

  // Shared drop executor (used by pointer drag)
  const handleDropExec = async (appointment: any, staffName: string, newTime: string) => {
    const staffMember = staffList.find(s => s.name === staffName);
    if (!staffMember) return;
    let parsedServicesJson = appointment.servicesJson;
    if (typeof parsedServicesJson === 'string') {
      try { parsedServicesJson = JSON.parse(parsedServicesJson); } catch { parsedServicesJson = null; }
    }
    try {
      // Send only the changed fields — avoids overwriting newer server data with stale client copy
      await apiRequest("PUT", `/api/appointments/${appointment.id}`, {
        staff: staffName,
        staffId: staffMember.id,
        startTime: newTime,
        // Preserve current service/price/client fields so backend can compute stock+loyalty correctly
        service: appointment.service,
        servicesJson: parsedServicesJson,
        price: appointment.price,
        total: appointment.total,
        client: appointment.client,
        clientId: appointment.clientId,
        paid: appointment.paid,
        duration: appointment.duration,
        date: appointment.date,
        privateRoom: appointment.privateRoom,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
      toast({ title: t("planning.appointmentMoved"), description: `${appointment.client} → ${staffName} @ ${newTime}` });
      playSuccessSound();
    } catch {
      playErrorSound();
      toast({ title: t("common.error"), description: t("planning.moveError"), variant: "destructive" });
    }
  };

  // ─── Hold-to-drag: user must hold 500 ms before drag activates ─────────────
  // Phase 1 (hold): scroll is completely free — listeners are passive, nothing blocked.
  // Phase 2 (drag): pointer captured + touchmove blocked on board → clean drag.
  const handleCardPointerDown = useCallback((e: React.PointerEvent, booking: any, color: string) => {
    if (!canEdit || resizingBooking) return;
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;
    // Ignore non-primary mouse buttons
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const cardEl = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = cardEl.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    let dragActive = false;
    let cancelled = false;
    let lastPX = e.clientX;
    let lastPY = e.clientY;
    let edgeScrollRafId: number | null = null;
    let holdRingTimer: ReturnType<typeof setTimeout> | null = null;
    scrollJustCancelled.current = false;

    // ── Ghost position helper (no React re-render) ──
    const moveGhost = (px: number, py: number) => {
      const el = ghostElRef.current;
      if (!el) return;
      el.style.transform = `translate3d(${px - offsetX}px, ${py - offsetY}px, 0)`;
    };

    // ── Edge-auto-scroll loop while dragging ──
    const doEdgeScroll = () => {
      const board = boardRef.current;
      if (!board || !dragActive) { edgeScrollRafId = null; return; }
      const r = board.getBoundingClientRect();
      const EDGE = 80, SPD = 14;
      let sx = 0, sy = 0;
      if (lastPX - r.left  < EDGE) sx = -Math.ceil((1 - (lastPX - r.left)  / EDGE) * SPD);
      if (r.right - lastPX < EDGE) sx =  Math.ceil((1 - (r.right - lastPX) / EDGE) * SPD);
      if (lastPY - r.top   < EDGE) sy = -Math.ceil((1 - (lastPY - r.top)   / EDGE) * SPD);
      if (r.bottom - lastPY < EDGE) sy =  Math.ceil((1 - (r.bottom - lastPY) / EDGE) * SPD);
      if (sx) board.scrollLeft += sx;
      if (sy) board.scrollTop  += sy;
      moveGhost(lastPX, lastPY);
      edgeScrollRafId = requestAnimationFrame(doEdgeScroll);
    };

    // ── Block touch scroll on the board while dragging ──
    const blockTouchScroll = (te: TouchEvent) => te.preventDefault();

    // ── Full cleanup ──
    const cleanup = () => {
      window.removeEventListener('pointermove', onMoveHold);
      window.removeEventListener('pointermove', onMoveDrag);
      window.removeEventListener('pointerup',   onUp);
      window.removeEventListener('pointercancel', onCancel);
      boardRef.current?.removeEventListener('touchmove', blockTouchScroll);
      if (holdTimerRef !== null) { clearTimeout(holdTimerRef); }
      if (holdRingTimer !== null) { clearTimeout(holdRingTimer); holdRingTimer = null; }
      if (edgeScrollRafId !== null) cancelAnimationFrame(edgeScrollRafId);
      if (dragRafRef.current) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null; }
      try { cardEl.releasePointerCapture(pointerId); } catch {}
      document.body.style.userSelect = '';
      (document.body.style as any).webkitUserSelect = '';
      setHoldingCardId(null);
    };

    const serviceLabel = (() => {
      try {
        const svcs = typeof booking.servicesJson === 'string'
          ? JSON.parse(booking.servicesJson) : booking.servicesJson;
        return svcs?.[0]?.name || booking.service || booking.client;
      } catch { return booking.client; }
    })();

    // ── Activate drag after hold completes ──
    const activateDrag = () => {
      if (dragActive || cancelled) return;
      dragActive = true;

      // Phase 2: capture pointer so all future events route here
      try { cardEl.setPointerCapture(pointerId); } catch {}
      // Block touch scroll on the board (effective even mid-gesture)
      boardRef.current?.addEventListener('touchmove', blockTouchScroll, { passive: false });
      document.body.style.userSelect = 'none';
      (document.body.style as any).webkitUserSelect = 'none';
      window.getSelection()?.removeAllRanges();

      // Haptic pulse on mobile
      try { (navigator as any).vibrate?.(40); } catch {}

      // Sound: pickup
      playDragPickup();

      pDragRef.current = {
        appointment: booking, offsetX, offsetY,
        targetStaff: booking.staff, targetTime: booking.startTime,
      };
      setHoldingCardId(null);
      setDraggedAppointment(booking);
      setPDragGhost({ w: rect.width, h: rect.height, color, label: serviceLabel });
      // Position ghost after React mounts it
      requestAnimationFrame(() => moveGhost(lastPX, lastPY));

      // Switch from passive hold-listener to active drag-listener
      window.removeEventListener('pointermove', onMoveHold);
      window.addEventListener('pointermove', onMoveDrag, { passive: false });

      edgeScrollRafId = requestAnimationFrame(doEdgeScroll);
    };

    // ── Phase 1: hold listener — passive, scroll is FREE ──
    const onMoveHold = (me: PointerEvent) => {
      lastPX = me.clientX;
      lastPY = me.clientY;
      const dx = Math.abs(me.clientX - startX);
      const dy = Math.abs(me.clientY - startY);
      const dist = Math.hypot(dx, dy);
      // Cancel early if clearly a vertical scroll (dy dominates and > 12px),
      // or any direction > 30px — relaxed threshold so hand tremor during hold
      // doesn't cancel the gesture before 500 ms elapses.
      if ((dy > dx && dy > 12) || dist > 30) {
        cancelled = true;
        scrollJustCancelled.current = true;
        cleanup();
      }
    };

    // ── Phase 2: drag listener — non-passive, blocks scroll ──
    const onMoveDrag = (me: PointerEvent) => {
      me.preventDefault();
      lastPX = me.clientX;
      lastPY = me.clientY;
      if (!pDragRef.current) return;

      // Hit-test to find slot under cursor (ghost is pointer-events:none)
      const el = document.elementFromPoint(me.clientX, me.clientY) as HTMLElement | null;
      const slotEl = el?.closest('[data-slot-staff]') as HTMLElement | null;
      if (slotEl?.dataset.slotStaff && slotEl?.dataset.slotTime) {
        pDragRef.current.targetStaff = slotEl.dataset.slotStaff;
        pDragRef.current.targetTime  = slotEl.dataset.slotTime;
        setDragOverSlot({ staff: slotEl.dataset.slotStaff, time: slotEl.dataset.slotTime });
      }

      // Update ghost position directly on DOM — zero React re-renders
      if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = requestAnimationFrame(() => {
        moveGhost(me.clientX, me.clientY);
        dragRafRef.current = null;
      });
    };

    // ── Cancel (browser/OS stole the pointer) ──
    const onCancel = () => {
      cancelled = true;
      cleanup();
      if (dragActive) {
        pDragRef.current = null;
        setPDragGhost(null);
        setDraggedAppointment(null);
        setDragOverSlot(null);
      }
    };

    // ── Release ──
    const onUp = async () => {
      const wasDragging = dragActive;
      cleanup();

      if (!wasDragging) {
        // Short press without drag completing → let native click fire normally
        return;
      }

      dragJustCompleted.current = true;
      const drag = pDragRef.current;
      pDragRef.current = null;
      setPDragGhost(null);
      setDraggedAppointment(null);
      setDragOverSlot(null);

      // Sound: drop
      playDragDrop();

      if (drag && (drag.targetStaff !== drag.appointment.staff || drag.targetTime !== drag.appointment.startTime)) {
        await handleDropExec(drag.appointment, drag.targetStaff, drag.targetTime);
      }
    };

    // Show the hold ring only after 150 ms — avoids a flash on quick scrolls
    holdRingTimer = setTimeout(() => {
      holdRingTimer = null;
      if (!cancelled) setHoldingCardId(booking.id);
    }, 150);

    // Start 500 ms hold timer — only activates drag if finger/cursor stays still
    const holdTimerRef = setTimeout(() => {
      if (!cancelled) activateDrag();
    }, 500);

    // Phase 1 listeners (passive — scroll is completely free during hold)
    window.addEventListener('pointermove', onMoveHold, { passive: true });
    window.addEventListener('pointerup',   onUp,       { once: true });
    window.addEventListener('pointercancel', onCancel, { once: true });
  }, [canEdit, resizingBooking]);

  // ── Stable refs so the board touchstart effect always sees fresh data ──────
  // Updated every render; the effect never needs to re-register for data changes.
  const appointmentsRef = useRef<typeof appointments>(appointments);
  appointmentsRef.current = appointments;
  const staffListRef = useRef<typeof staffList>(staffList);
  staffListRef.current = staffList;
  const handleDropExecRef = useRef(handleDropExec);
  handleDropExecRef.current = handleDropExec;
  const resizingBookingRef = useRef(resizingBooking);
  resizingBookingRef.current = resizingBooking;
  // canEditRef must be declared BEFORE the useEffect that reads it
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;

  // ── Native PASSIVE touchstart on board ─────────────────────────────────────
  // React's onPointerDown is non-passive: the browser must wait for it before
  // deciding to scroll, so first-touch-on-card never starts a scroll.
  // By delegating touch hold/drag to a passive native listener here instead,
  // the browser is free to scroll immediately — our hold timer runs in parallel.
  useEffect(() => {
    const board = boardRef.current;
    if (!board || !isMobile) return;

    const onBoardTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (!canEditRef.current || resizingBookingRef.current) return;
      const touch = e.touches[0];
      const cardEl = (touch.target as HTMLElement).closest('[data-booking-id]') as HTMLElement | null;
      if (!cardEl) return;
      const bookingId = parseInt(cardEl.dataset.bookingId ?? '0', 10);
      const booking = appointmentsRef.current.find((a: any) => a.id === bookingId);
      if (!booking) return;
      const staff = staffListRef.current.find((s: any) => s.name === booking.staff);
      const color: string = staff?.color ?? '#888';

      const startX = touch.clientX;
      const startY = touch.clientY;
      const rect = cardEl.getBoundingClientRect();
      const offsetX = touch.clientX - rect.left;
      const offsetY = touch.clientY - rect.top;

      let dragActive = false;
      let cancelled = false;
      let lastPX = touch.clientX;
      let lastPY = touch.clientY;
      let edgeRaf: number | null = null;
      let holdRingTmr: ReturnType<typeof setTimeout> | undefined;
      let holdTmr: ReturnType<typeof setTimeout> | undefined;
      scrollJustCancelled.current = false;

      const moveGhost = (px: number, py: number) => {
        const el = ghostElRef.current;
        if (el) el.style.transform = `translate3d(${px - offsetX}px, ${py - offsetY}px, 0)`;
      };

      const doEdgeScroll = () => {
        const b = boardRef.current;
        if (!b || !dragActive) { edgeRaf = null; return; }
        const r = b.getBoundingClientRect();
        const EDGE = 80, SPD = 14;
        let sx = 0, sy = 0;
        if (lastPX - r.left  < EDGE) sx = -Math.ceil((1 - (lastPX - r.left)  / EDGE) * SPD);
        if (r.right - lastPX < EDGE) sx =  Math.ceil((1 - (r.right - lastPX) / EDGE) * SPD);
        if (lastPY - r.top   < EDGE) sy = -Math.ceil((1 - (lastPY - r.top)   / EDGE) * SPD);
        if (r.bottom - lastPY < EDGE) sy =  Math.ceil((1 - (r.bottom - lastPY) / EDGE) * SPD);
        if (sx) b.scrollLeft += sx;
        if (sy) b.scrollTop  += sy;
        moveGhost(lastPX, lastPY);
        edgeRaf = requestAnimationFrame(doEdgeScroll);
      };

      const blockScroll = (te: TouchEvent) => te.preventDefault();

      const cleanup = () => {
        if (holdRingTmr != null) { clearTimeout(holdRingTmr); holdRingTmr = undefined; }
        if (holdTmr     != null) { clearTimeout(holdTmr);     holdTmr = undefined; }
        window.removeEventListener('touchmove',   onMoveHold);
        window.removeEventListener('touchmove',   onMoveDrag);
        window.removeEventListener('touchend',    onUp as any);
        window.removeEventListener('touchcancel', onCancel);
        boardRef.current?.removeEventListener('touchmove', blockScroll);
        if (edgeRaf != null) { cancelAnimationFrame(edgeRaf); edgeRaf = null; }
        if (dragRafRef.current) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null; }
        document.body.style.userSelect = '';
        (document.body.style as any).webkitUserSelect = '';
        setHoldingCardId(null);
      };

      const serviceLabel = (() => {
        try {
          const svcs = typeof booking.servicesJson === 'string'
            ? JSON.parse(booking.servicesJson) : booking.servicesJson;
          return svcs?.[0]?.name || booking.service || booking.client;
        } catch { return booking.client; }
      })();

      const activateDrag = () => {
        if (dragActive || cancelled) return;
        dragActive = true;
        boardRef.current?.addEventListener('touchmove', blockScroll, { passive: false });
        document.body.style.userSelect = 'none';
        (document.body.style as any).webkitUserSelect = 'none';
        window.getSelection()?.removeAllRanges();
        try { (navigator as any).vibrate?.(40); } catch {}
        playDragPickup();
        pDragRef.current = { appointment: booking, offsetX, offsetY, targetStaff: booking.staff, targetTime: booking.startTime };
        setHoldingCardId(null);
        setDraggedAppointment(booking);
        setPDragGhost({ w: rect.width, h: rect.height, color, label: serviceLabel });
        requestAnimationFrame(() => moveGhost(lastPX, lastPY));
        window.removeEventListener('touchmove', onMoveHold);
        window.addEventListener('touchmove', onMoveDrag, { passive: false });
        edgeRaf = requestAnimationFrame(doEdgeScroll);
      };

      const onMoveHold = (te: TouchEvent) => {
        const t = te.touches[0]; if (!t) return;
        lastPX = t.clientX; lastPY = t.clientY;
        const dx = Math.abs(t.clientX - startX);
        const dy = Math.abs(t.clientY - startY);
        if ((dy > dx && dy > 12) || Math.hypot(dx, dy) > 30) {
          cancelled = true; scrollJustCancelled.current = true; cleanup();
        }
      };

      const onMoveDrag = (te: TouchEvent) => {
        te.preventDefault();
        const t = te.touches[0]; if (!t || !pDragRef.current) return;
        lastPX = t.clientX; lastPY = t.clientY;
        const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
        const slotEl = el?.closest('[data-slot-staff]') as HTMLElement | null;
        if (slotEl?.dataset.slotStaff && slotEl?.dataset.slotTime) {
          pDragRef.current.targetStaff = slotEl.dataset.slotStaff;
          pDragRef.current.targetTime  = slotEl.dataset.slotTime;
          setDragOverSlot({ staff: slotEl.dataset.slotStaff, time: slotEl.dataset.slotTime });
        }
        if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = requestAnimationFrame(() => { moveGhost(t.clientX, t.clientY); dragRafRef.current = null; });
      };

      const onCancel = () => {
        cancelled = true; cleanup();
        if (dragActive) { pDragRef.current = null; setPDragGhost(null); setDraggedAppointment(null); setDragOverSlot(null); }
      };

      const onUp = async () => {
        const wasDragging = dragActive; cleanup();
        if (!wasDragging) return;
        dragJustCompleted.current = true;
        const drag = pDragRef.current;
        pDragRef.current = null; setPDragGhost(null); setDraggedAppointment(null); setDragOverSlot(null);
        playDragDrop();
        if (drag && (drag.targetStaff !== drag.appointment.staff || drag.targetTime !== drag.appointment.startTime)) {
          await handleDropExecRef.current(drag.appointment, drag.targetStaff, drag.targetTime);
        }
      };

      holdRingTmr = setTimeout(() => { holdRingTmr = undefined; if (!cancelled) setHoldingCardId(booking.id); }, 150);
      holdTmr     = setTimeout(() => { if (!cancelled) activateDrag(); }, 500);
      window.addEventListener('touchmove',   onMoveHold, { passive: true });
      window.addEventListener('touchend',    onUp as any, { once: true, passive: true });
      window.addEventListener('touchcancel', onCancel,   { once: true });
    };

    board.addEventListener('touchstart', onBoardTouchStart, { passive: true });
    return () => board.removeEventListener('touchstart', onBoardTouchStart);
   
  }, [isMobile, canEdit]);

  // Resize appointment by dragging the bottom handle
  const resizeMutation = useMutation({
    mutationFn: async ({ id, duration }: { id: number; duration: number }) => {
      return apiRequest("PUT", `/api/appointments/${id}`, { duration });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner-withdrawals"] });
    },
    onError: () => {
      playErrorSound();
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!resizingBooking) return;
    const SLOT_H = slotHeight;
    const onMove = (e: PointerEvent) => {
      const deltaSlots = Math.round((e.clientY - resizeStartY.current) / SLOT_H);
      setResizeCurrentSpan(Math.max(1, resizeStartSpan.current + deltaSlots));
    };
    const onUp = (e: PointerEvent) => {
      const deltaSlots = Math.round((e.clientY - resizeStartY.current) / SLOT_H);
      const newSpan = Math.max(1, resizeStartSpan.current + deltaSlots);
      const newDuration = newSpan * 15;
      if (newDuration !== resizingBooking.duration) {
        resizeMutation.mutate({ id: resizingBooking.id, duration: newDuration });
      }
      setResizingBooking(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [resizingBooking]);

  const favoriteServices = useMemo(() => {
    const selectedStaffMember = staffList.find((s: any) => s.name === watchedStaff);
    const staffCategory = selectedStaffMember?.category as string | undefined;
    const all = favoriteIds.map(id => services.find(s => s.id === id)).filter(Boolean) as typeof services;
    if (staffCategory && staffCategory !== "general") {
      const filtered = all.filter((s: any) => (s.category || "").toLowerCase() === staffCategory.toLowerCase());
      if (filtered.length > 0) return filtered;
    }
    return all;
  }, [services, favoriteIds, staffList, watchedStaff]);

  // Memoized dialog summary — avoids two .reduce() calls in JSX on every render
  const dialogSummaryDuration = useMemo(
    () => selectedServices.reduce((sum, s) => sum + s.duration, 0),
    [selectedServices]
  );
  const dialogSummaryPrice = useMemo(
    () => selectedServices.reduce((sum, s) => {
      const inputVal = priceInputs[s.id];
      return sum + (inputVal !== undefined ? (parseFloat(inputVal.replace(',', '.')) || 0) : s.price);
    }, 0),
    [selectedServices, priceInputs]
  );

  const groupedServices = useMemo(() => {
    const groups: Record<string, typeof services> = {};
    // Find the category of the currently selected staff member
    const selectedStaffMember = staffList.find((s: any) => s.name === watchedStaff);
    const staffCategory = selectedStaffMember?.category as string | undefined;

    let list = serviceSearch.trim()
      ? services.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()))
      : services;

    // Filter to show only services matching the staff's category (if the staff has one)
    if (staffCategory && staffCategory !== "general" && !serviceSearch.trim()) {
      const filtered = list.filter((s: any) =>
        (s.category || "").toLowerCase() === staffCategory.toLowerCase()
      );
      // Fall back to all services if no match (e.g. salon hasn't set service categories yet)
      if (filtered.length > 0) list = filtered;
    }

    list.forEach(s => {
      const cat = s.category || t("common.other");
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    });
    return groups;
  }, [services, serviceSearch, staffList, watchedStaff, t]);

  const toggleFavorite = (serviceId: number) => {
    setFavoriteIds(prev => {
      let updated: number[];
      if (prev.includes(serviceId)) {
        updated = prev.filter(id => id !== serviceId);
      } else if (prev.length < 6) {
        updated = [...prev, serviceId];
      } else {
        playErrorSound();
        toast({ title: t("planning.maxFavorites"), variant: "destructive" });
        return prev;
      }
      localStorage.setItem('favoriteServiceIds', JSON.stringify(updated));
      return updated;
    });
  };

  // O(1) appointment lookup map keyed by "staffId_hour" (preferred) or "name_staffName_hour"
  // Only adds name key when staffId is absent — preserves original getBooking fallback semantics.
  // Uses first-match (no overwrite) to match Array.find() behaviour on duplicates.
  const appointmentMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of appointments) {
      if (a.staffId) {
        const k = `${a.staffId}_${a.startTime}`;
        if (!map.has(k)) map.set(k, a);
      } else if (a.staff) {
        const k = `name_${a.staff}_${a.startTime}`;
        if (!map.has(k)) map.set(k, a);
      }
    }
    return map;
  }, [appointments]);

  const getBooking = useCallback((staffId: number, staffName: string, hour: string) => {
    return appointmentMap.get(`${staffId}_${hour}`) ?? appointmentMap.get(`name_${staffName}_${hour}`);
  }, [appointmentMap]);

  const getBookingSpan = (app: any) => Math.ceil(app.duration / 15);

  // O(1) covered-slot lookup set keyed by "staffId_hour"
  const coveredSlotsSet = useMemo(() => {
    const covered = new Set<string>();
    for (const s of staffList) {
      for (let i = 0; i < hours.length; i++) {
        const a = appointmentMap.get(`${s.id}_${hours[i]}`) ?? appointmentMap.get(`name_${s.name}_${hours[i]}`);
        if (a) {
          const span = Math.ceil((a.duration || 30) / 15);
          for (let j = i + 1; j < i + span && j < hours.length; j++) {
            covered.add(`${s.id}_${hours[j]}`);
          }
        }
      }
    }
    return covered;
  }, [appointmentMap, staffList, hours]);

  const isSlotCovered = useCallback((staffId: number, _staffName: string, hour: string) => {
    return coveredSlotsSet.has(`${staffId}_${hour}`);
  }, [coveredSlotsSet]);

  // Detect scheduling conflicts: appointments for the same staff whose time ranges overlap
  const conflictingIds = useMemo(() => {
    const toMins = (t: string) => {
      const [h, m] = (t || "00:00").split(":").map(Number);
      const base = h * 60 + m;
      return h < 6 ? base + 24 * 60 : base;
    };
    const ids = new Set<number>();
    for (let i = 0; i < appointments.length; i++) {
      const a = appointments[i];
      const aStart = toMins(a.startTime);
      const aEnd = aStart + (a.duration || 30);
      for (let j = i + 1; j < appointments.length; j++) {
        const b = appointments[j];
        if (a.staffId !== b.staffId && !(a.staff && a.staff === b.staff)) continue;
        const bStart = toMins(b.startTime);
        const bEnd = bStart + (b.duration || 30);
        if (aStart < bEnd && aEnd > bStart) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    }
    return ids;
  }, [appointments]);

  // Show loading screen only while actively loading
  if (isDataLoading) {
    return (
      <div className="h-full loading-container liquid-gradient-subtle" dir={isRtl ? "rtl" : "ltr"}>
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            <SpinningLogo size="xl" />
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
          </div>
          <p className="text-muted-foreground font-medium">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  // Auth error: prevent blank board flash while redirect fires
  if (hasAuthError) {
    return (
      <div className="h-full loading-container liquid-gradient-subtle" dir={isRtl ? "rtl" : "ltr"}>
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            <SpinningLogo size="xl" />
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
          </div>
          <p className="text-muted-foreground font-medium">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  // Show empty state if no staff configured (skip if auth error - will auto-redirect)
  if (staffList.length === 0 && !hasAuthError) {
    return (
      <div className="h-full flex flex-col items-center justify-center liquid-gradient-subtle" dir={isRtl ? "rtl" : "ltr"}>
        <div className="flex flex-col items-center gap-5 text-center p-6 glass-card">
          <div className="w-20 h-20 rounded-3xl liquid-gradient flex items-center justify-center shadow-xl">
            <span className="text-4xl font-bold text-white">?</span>
          </div>
          <p className="text-muted-foreground font-medium">{t("planning.noStaff")}</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={pageRef}
      className="h-full overflow-hidden liquid-gradient-subtle px-2 pt-1 pb-2 md:px-4 md:pt-2 md:pb-3 flex flex-col animate-fade-in"
      dir={isRtl ? "rtl" : "ltr"}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
    >
      {/* Offline mode banner */}
      {!isOnline && (
        <div className="shrink-0 mb-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-medium">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>
            {isRtl ? "وضع بدون إنترنت" : "Offline mode"} —{" "}
            {isRtl
              ? "المواعيد تُحفظ محلياً وتُزامن عند الاتصال"
              : "appointments save locally and sync when connected"}
          </span>
          {pendingSyncCount > 0 && (
            <span className="ml-auto shrink-0 bg-amber-500/25 px-2 py-0.5 rounded-full font-bold">
              {pendingSyncCount} {isRtl ? "في الانتظار" : "pending"}
            </span>
          )}
        </div>
      )}

      {/* Pinch-to-zoom hint overlay */}
      {pinchHint && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[100] flex justify-center">
          <div className="liquid-gradient text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-xl flex items-center gap-2 animate-fade-in">
            <span className="text-base">🔍</span>
            {slotHeight === 32 && t("admin.slotCompact", { defaultValue: "صغير" })}
            {slotHeight === 44 && t("admin.slotNormal", { defaultValue: "عادي" })}
            {slotHeight === 60 && t("admin.slotComfortable", { defaultValue: "كبير" })}
            {slotHeight === 76 && t("admin.slotLarge", { defaultValue: "كبير جداً" })}
            <span className="opacity-70 text-xs font-normal">({slotHeight}px)</span>
          </div>
        </div>
      )}

      {/* Monthly Goal — admin only */}
      {isAdmin && (
        <div className="shrink-0 mb-1">
          <MonthlyGoalBanner />
        </div>
      )}

      {/* Header - Single row */}
      <div className="mb-1 shrink-0 overflow-x-auto overflow-y-visible">
        <div className="flex items-center gap-1.5 md:gap-2 w-max min-w-full">
          {/* Staff pills */}
          {stats.perStaff.map(s => {
            const staffMember = staffList.find(st => st.id === s.id);
            return (
              <div key={s.id} className="flex items-center gap-0.5 md:gap-1.5 glass-card px-1.5 md:px-2 py-0.5 md:py-1 rounded-full">
                <div 
                  className="w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-white text-[9px] md:text-xs font-bold overflow-hidden cursor-pointer active:scale-90 transition-transform"
                  style={{ backgroundColor: s.color }}
                  onClick={() => {
                    setWalletStaffId(s.id);
                    setWalletShowAdd(false);
                    setWalletOpenDeductions(false);
                    setWalletDeductForm({ type: "advance", description: "", amount: "" });
                  }}
                  data-testid={`button-staff-wallet-${s.id}`}
                >
                  {staffMember?.photoUrl ? (
                    <img src={staffMember.photoUrl} alt={s.name} className="w-full h-full object-cover" />
                  ) : (
                    s.name.charAt(0).toUpperCase()
                  )}
                </div>
                <span className="text-[10px] md:text-sm font-bold whitespace-nowrap" style={{ color: s.color }}>{s.total}</span>
              </div>
            );
          })}

          {/* Total */}
          <div className="liquid-gradient text-white px-2.5 md:px-4 py-0.5 md:py-1 rounded-full text-[11px] md:text-sm font-bold shadow-md whitespace-nowrap">
            {stats.total}
          </div>

          {/* Date nav — swipe left/right here to change day */}
          <div
            className="flex items-center gap-0.5 select-none touch-pan-y"
            data-testid="date-swipe-area"
            onTouchStart={(e) => { swipeDateStartX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (swipeDateStartX.current === null) return;
              const dx = e.changedTouches[0].clientX - swipeDateStartX.current;
              swipeDateStartX.current = null;
              if (Math.abs(dx) < swipeThreshold) return;
              if (isRtl) {
                if (dx < 0) setDate(d => addDays(d, -1)); else setDate(d => addDays(d, 1));
              } else {
                if (dx > 0) setDate(d => addDays(d, -1)); else setDate(d => addDays(d, 1));
              }
            }}
          >
            <Button variant="ghost" size="icon" className="h-8 w-8 md:h-9 md:w-9 rounded-full p-0 touch-manipulation" onClick={() => setDate(d => addDays(d, -1))} data-testid="button-prev-day">
              {isRtl ? <ChevronRight className="w-4 h-4 md:w-5 md:h-5" /> : <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />}
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" className="h-8 px-2 md:h-9 md:px-3 text-xs md:text-sm font-medium rounded-full touch-manipulation flex flex-col items-center gap-0 leading-none" data-testid="button-date-picker">
                  <span className="text-[9px] md:hidden text-muted-foreground font-normal -mb-0.5">
                    {format(date, "EEE")}
                  </span>
                  <span>{format(date, "dd/MM")}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-2xl glass-card shadow-xl" align="end">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" className="h-8 w-8 md:h-9 md:w-9 rounded-full p-0 touch-manipulation" onClick={() => setDate(d => addDays(d, 1))} data-testid="button-next-day">
              {isRtl ? <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" /> : <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />}
            </Button>
          </div>

          {!isToday && (
            <Button 
              variant="default"
              size="sm" 
              className="h-6 px-2 md:h-8 md:px-3 text-[10px] md:text-xs font-semibold rounded-full liquid-gradient text-white shadow-sm"
              onClick={() => setDate(getWorkDayDate(businessSettings?.openingTime, businessSettings?.closingTime))}
            >
              {t("common.today")}
            </Button>
          )}

          {isNonWorkingDay && (
            <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-sky-500 shrink-0" />
          )}

          {hasPermission("open_cash_drawer") && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 md:h-9 md:w-9 rounded-full p-0 transition-all duration-300",
                drawerState === "opening" && "animate-pulse opacity-70",
                drawerState === "success" && "text-emerald-500 scale-110",
                drawerState === "fail" && "text-red-400"
              )}
              disabled={drawerState === "opening"}
              onClick={async () => {
                setDrawerState("opening");
                let opened = false;
                try {
                  await connectQz();
                  if (isQzConnected()) {
                    await openCashDrawer();
                    opened = true;
                  }
                } catch {}
                if (!opened) {
                  const available = await checkPrintStationAsync();
                  if (available) {
                    await remoteOpenDrawer();
                    opened = true;
                  }
                }
                setDrawerState(opened ? "success" : "fail");
                setTimeout(() => setDrawerState("idle"), 1800);
              }}
              data-testid="button-open-cash-drawer"
            >
              {drawerState === "success" ? (
                <Check className="w-4 h-4 md:w-5 md:h-5" />
              ) : (
                <Wallet className="w-4 h-4 md:w-5 md:h-5" />
              )}
            </Button>
          )}

          {/* Search */}
          <div className="shrink-0" ref={searchContainerRef}>
            {showSearchInput ? (
              <div className="flex items-center gap-0.5 md:gap-1 glass-card px-1.5 md:px-2 py-0.5 md:py-1 rounded-full">
                <Input
                  type="text"
                  placeholder={t("common.search") + "..."}
                  value={appointmentSearch}
                  onChange={(e) => setAppointmentSearch(e.target.value)}
                  className="h-5 w-16 md:h-6 md:w-32 text-[10px] md:text-xs border-0 bg-transparent focus-visible:ring-0 px-1"
                  autoFocus
                />
                {appointmentSearch && searchResults.count > 0 && (
                  <span className="text-[9px] md:text-xs font-bold text-emerald-500 whitespace-nowrap">{searchResults.count}={searchResults.total}</span>
                )}
                <button className="p-0.5 md:p-1" onClick={() => { setShowSearchInput(false); setAppointmentSearch(""); }}>
                  <X className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <button className="p-2 md:p-1 rounded-full hover:bg-muted/50 touch-manipulation" onClick={() => setShowSearchInput(true)} data-testid="button-search-appointments">
                <Search className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
              </button>
            )}
          </div>

          <button
            className="p-2 md:p-1 shrink-0 rounded-full hover:bg-muted/50 touch-manipulation"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
              queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
              queryClient.invalidateQueries({ queryKey: ["/api/services"] });
              if (boardRef.current) {
                boardRef.current.scrollTop = 0;
              }
              toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
            }}
            data-testid="button-refresh-planning"
          >
            <RefreshCw className={cn("w-4 h-4 text-muted-foreground", loadingApps && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Waitlist Collapsible Section */}
      {waitlistEntries.length > 0 && (
        <Collapsible open={isWaitlistOpen} onOpenChange={setIsWaitlistOpen} className="mb-2 shrink-0">
          <CollapsibleTrigger className="w-full glass-card px-4 py-2 flex items-center justify-between hover:bg-muted/50 transition-all">
            <div className="flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">{t("waitlist.title")}</span>
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-bold">
                {waitlistEntries.filter(e => e.status === "waiting").length}
              </span>
            </div>
            <ChevronsUpDown className={cn("w-4 h-4 transition-transform", isWaitlistOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="glass-card mt-1 rounded-2xl overflow-hidden">
            <div className="max-h-[200px] overflow-auto">
              {waitlistEntries.map((entry) => (
                <div 
                  key={entry.id} 
                  className="p-3 border-b last:border-b-0 hover:bg-muted/30 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">{entry.clientName}</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0",
                        entry.status === "waiting" && "bg-sky-100 text-sky-700",
                        entry.status === "notified" && "bg-pink-100 text-pink-700",
                        entry.status === "booked" && "bg-green-100 text-green-700",
                        entry.status === "expired" && "bg-gray-100 text-gray-500"
                      )}>
                        {t(`waitlist.${entry.status}`)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span>{entry.requestedDate}</span>
                      {entry.requestedTime && <span>{entry.requestedTime}</span>}
                      {entry.servicesDescription && (
                        <span className="truncate max-w-[150px]">{entry.servicesDescription}</span>
                      )}
                      {entry.staffName && <span>• {entry.staffName}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {entry.status === "waiting" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 rounded-full hover:bg-primary/10"
                        onClick={async () => {
                          try {
                            await apiRequest("POST", `/api/waitlist/${entry.id}/notify`);
                            toast({ title: t("waitlist.notifySuccess"), description: t("waitlist.notifyMessage") });
                            refetchWaitlist();
                          } catch (err) {
                            console.error("Failed to notify:", err);
                          }
                        }}
                      >
                        <Bell className="w-3 h-3" />
                      </Button>
                    )}
                    {entry.status === "notified" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 rounded-full hover:bg-green-500/10"
                        onClick={async () => {
                          try {
                            await apiRequest("PATCH", `/api/waitlist/${entry.id}`, { status: "booked" });
                            toast({ title: t("waitlist.booked") });
                            refetchWaitlist();
                          } catch (err) {
                            console.error("Failed to mark booked:", err);
                          }
                        }}
                      >
                        <UserCheck className="w-3 h-3 text-green-600" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 rounded-full hover:bg-destructive/10"
                      onClick={async () => {
                        if (!confirm(t("waitlist.deleteConfirm"))) return;
                        try {
                          await apiRequest("DELETE", `/api/waitlist/${entry.id}`);
                          toast({ title: t("waitlist.deleted") });
                          refetchWaitlist();
                        } catch (err) {
                          console.error("Failed to delete:", err);
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Search Results - Inline */}
      {showSearchInput && appointmentSearch && searchResults.count > 0 && (
        <div className="flex-1 min-h-0 overflow-auto rounded-2xl border bg-background mb-2">
          <div className="p-2 border-b bg-muted/50 sticky top-0 z-10">
            <span className="text-xs font-medium text-muted-foreground">
              {searchResults.count} {t("common.results")}
            </span>
          </div>
          {searchResults.matches.map((app) => {
            const staffMember = staffList.find(s => s.name === app.staff);
            return (
              <div 
                key={app.id} 
                className="p-2 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer"
                onClick={() => {
                  const appDate = parseISO(app.date);
                  setDate(appDate);
                  if (canEditCardboard && !isDateAutoLocked(appDate)) {
                    openAppointmentForEdit(app);
                  }
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div 
                      className="w-2 h-2 rounded-full shrink-0" 
                      style={{ backgroundColor: staffMember?.color || '#666' }} 
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{app.client || "-"}</p>
                      <div className="text-xs text-muted-foreground">
                        {app.service?.includes(',') ? (
                          app.service.split(',').map((svc: string, idx: number) => (
                            <div key={idx} className="truncate">- {svc.trim()}</div>
                          ))
                        ) : (
                          <div className="truncate">{app.service}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">{app.total} DH</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(app.date), "dd/MM")} {app.startTime} {app.staff}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="p-2.5 bg-emerald-500/90 text-white sticky bottom-0">
            <div className="flex justify-between items-center text-sm font-bold">
              <span>Total</span>
              <span>{searchResults.total} DH</span>
            </div>
          </div>
        </div>
      )}

      {/* Board with sticky header */}
      <div className={cn("flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden border border-rose-100 dark:border-slate-700 shadow-lg bg-white dark:bg-slate-900", showSearchInput && appointmentSearch && searchResults.count > 0 && "hidden")} dir={isRtl ? "rtl" : "ltr"}>
        {/* Sticky Staff Headers */}
        <div 
          ref={headerRef}
          className="grid z-50 shrink-0 overflow-x-hidden bg-white dark:from-slate-800 dark:to-slate-850 border-b-2 border-slate-200 dark:border-slate-600"
          style={{ 
            gridTemplateColumns: `52px repeat(${staffList.length}, minmax(80px, 1fr))`,
          }}
        >
          {/* Time-column: boss net profit circle (admin only) or empty cell */}
          <div className={cn("bg-white dark:bg-slate-900 py-1 px-0 flex flex-col items-center justify-center gap-0.5 overflow-hidden", isRtl ? "border-l border-slate-200 dark:border-slate-600" : "border-r border-slate-200 dark:border-slate-600")}>
            {canViewNetProfit && ownerNetProfit !== null && (
              <BossNetProfitCircle
                ownerNetProfit={ownerNetProfit}
                ownerPhoto={adminRoles.find((r: any) => r.role === "owner")?.photoUrl ?? null}
                currency={salonSettings?.currencySymbol || "DH"}
                isSyncing={isProfitSyncing}
              />
            )}
          </div>
          {staffList.map((s, staffIndex) => (
            <div 
              key={s.id} 
              className={cn("py-2 px-0.5 font-semibold text-center text-[10px]", staffIndex < staffList.length - 1 && (isRtl ? "border-l border-slate-200 dark:border-slate-600" : "border-r border-slate-200 dark:border-slate-600"))}
              style={{ background: `linear-gradient(180deg, ${s.color}18 0%, ${s.color}08 100%)` }}
            >
              <div className="flex flex-col items-center justify-center gap-1">
                {s.photoUrl ? (
                  <div className="relative">
                    <img 
                      src={s.photoUrl} 
                      alt={s.name}
                      className="w-12 h-12 rounded-full object-cover border-2 shadow-sm"
                      style={{ borderColor: s.color }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (!target.src.includes('ui-avatars.com')) {
                          target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=${s.color.replace('#', '')}&color=fff`;
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div 
                    className="w-12 h-12 rounded-full shadow-sm flex items-center justify-center text-white font-bold text-sm border-2" 
                    style={{ backgroundColor: s.color, borderColor: s.color }}
                  >
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="font-bold text-[10px] leading-tight break-words max-w-[80px] truncate" style={{ color: s.color }}>{s.name}</span>
              </div>
            </div>
          ))}
        </div>

        {isAutoLocked && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm" data-testid="banner-auto-lock">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>{t("admin.appointmentsLocked")}</span>
          </div>
        )}

        {/* Scrollable content */}
        <div
          ref={boardRef}
          className={cn("flex-1 min-h-0 overflow-auto relative free-scroll planning-scroll bg-white dark:bg-slate-900", isMobile && "pb-24")}
          onTouchMove={handleTouchMove}
        >
          <div 
            className="grid relative"
            style={{ 
              gridTemplateColumns: `52px repeat(${staffList.length}, minmax(80px, 1fr))`,
              gridAutoRows: `${slotHeight}px`
            }}
          >
            {/* Current Time Line - iOS Liquid Glass Style */}
            {isToday && getCurrentTimePosition(hours, businessSettings?.openingTime, businessSettings?.closingTime) >= 0 && (
              <div 
                ref={liveLineRef}
                className="absolute z-[35] pointer-events-none transition-all duration-1000 ease-in-out"
                style={{ 
                  top: `${getCurrentTimePosition(hours, businessSettings?.openingTime, businessSettings?.closingTime)}px`,
                  left: 0,
                  right: 0,
                }}
              >
                {/* Main container with glow effect */}
                <div className="flex items-center">
                  {/* Time indicator badge on left - Liquid Glass Circle */}
                  <div 
                    className="shrink-0 z-[50] flex items-center justify-center"
                    style={{ width: '52px' }}
                  >
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full liquid-gradient shadow-xl flex items-center justify-center border-2 border-white/50 live-indicator">
                        <Clock className="w-4 h-4 text-white drop-shadow-md" />
                      </div>
                      <div className="absolute -inset-1 rounded-full liquid-gradient blur-lg opacity-40 animate-pulse" />
                    </div>
                  </div>
                  {/* Thick glowing line - Baby pink gradient */}
                  <div className="flex-1 relative">
                    <div 
                      className="h-1 rounded-full shadow-lg"
                      style={{
                        background: 'linear-gradient(to right, hsl(340, 82%, 55%), hsl(340, 90%, 65%), hsl(350, 80%, 70%))',
                        boxShadow: '0 0 16px rgba(236, 72, 153, 0.5), 0 0 32px rgba(236, 72, 153, 0.25)',
                      }}
                    />
                    <div 
                      className="absolute inset-0 h-1 rounded-full opacity-50 blur-sm"
                      style={{
                        background: 'linear-gradient(to right, hsl(340, 82%, 55%), hsl(340, 90%, 65%))',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Time rows */}
          {hours.map((hour, hourIndex) => {
            const rowNum = hourIndex + 1; // headers are now outside the grid
            return (
            <React.Fragment key={hour}>
              {(() => {
                const mm = Number(hour.split(":")[1]);
                const isHour = mm === 0;
                const isHalf = mm === 30;
                return (
                  <div
                    className={cn(
                      "sticky z-30 flex items-center justify-center overflow-visible px-0.5 bg-white dark:bg-slate-900",
                      isRtl ? "right-0 border-l-2 border-l-slate-200 dark:border-l-slate-600" : "left-0 border-r-2 border-r-slate-200 dark:border-r-slate-600",
                      isHour  && "border-t-2 border-t-slate-300 dark:border-t-slate-500",
                      isHalf  && "border-t border-t-slate-200 dark:border-t-slate-600",
                      !isHour && !isHalf && "border-t border-dashed border-t-slate-200/60 dark:border-t-slate-700/60"
                    )}
                    style={{ gridColumn: 1, gridRow: rowNum }}
                  >
                    {isHour && (
                      <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-300 tabular-nums leading-none" dir="ltr">{hour}</span>
                    )}
                    {isHalf && (
                      <span className="block text-[9px] font-medium text-slate-400/80 dark:text-slate-500 tabular-nums leading-none" dir="ltr">{hour}</span>
                    )}
                  </div>
                );
              })()}

              {staffList.map((s, staffIndex) => {
                const colNum = staffIndex + 2; // +2 because column 1 is time labels
                const booking = getBooking(s.id, s.name, hour);
                // Only treat as covered if there's no booking starting at this exact slot
                const isCovered = !booking && isSlotCovered(s.id, s.name, hour);

                // For covered slots (no booking here), render empty cell with just borders
                if (isCovered) {
                  const covMin = Number(hour.split(":")[1]);
                  const covIsHour = covMin === 0;
                  const covIsHalf = covMin === 30;
                  const covHourGroup = Math.floor(hourIndex / 4);
                  return (
                    <div
                      key={`${s.id}-${hour}-covered`}
                      className={cn(
                        "",
                        staffIndex < staffList.length - 1 && (isRtl ? "border-l border-slate-200 dark:border-slate-600" : "border-r border-slate-200 dark:border-slate-600"),
                        covIsHour && "border-t-2 border-t-slate-300 dark:border-t-slate-500",
                        covIsHalf && "border-t border-t-slate-200 dark:border-t-slate-600",
                        !covIsHour && !covIsHalf && "border-t border-dashed border-t-slate-200/60 dark:border-t-slate-700/60",
                        covHourGroup % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/60 dark:bg-slate-800/40"
                      )}
                      style={{ gridColumn: colNum, gridRow: rowNum }}
                      data-slot-staff={s.name}
                      data-slot-time={hour}
                    />
                  );
                }

                const isResizing = resizingBooking?.id === booking?.id;
                const span = booking ? (isResizing ? resizeCurrentSpan : getBookingSpan(booking)) : 1;
                const liveDuration = isResizing ? resizeCurrentSpan * 15 : booking?.duration;

                const isDragOver = dragOverSlot?.staff === s.name && dragOverSlot?.time === hour;
                const isDragging = draggedAppointment?.id === booking?.id;
                const isConflicting = booking ? conflictingIds.has(booking.id) : false;

                if (booking) {
                  return (
                    <div
                      key={`${s.id}-${hour}`}
                      className={cn("p-0.5 z-10", staffIndex < staffList.length - 1 && (isRtl ? "border-l border-slate-200 dark:border-slate-600" : "border-r border-slate-200 dark:border-slate-600"))}
                      style={{ 
                        gridColumn: colNum,
                        gridRow: `${rowNum} / span ${span}`
                      }}
                    >
                      <div 
                        className={cn(
                          booking.paid
                            ? "appointment-card h-full text-white relative rounded-md shadow-md"
                            : "appointment-card h-full relative rounded-md shadow-sm",
                          span <= 2 ? "flex items-center gap-1 px-1.5 py-0.5" : span <= 4 ? "flex flex-col px-1.5 py-1" : "flex flex-col px-2 py-1.5",
                          canEdit && !isResizing ? "cursor-grab active:cursor-grabbing" : "",
                          isDragging && "opacity-40 scale-95 saturate-50",
                          holdingCardId === booking.id && "scale-[1.03] brightness-110",
                          isResizing && "ring-2 ring-white/60 ring-inset shadow-xl",
                          isConflicting && "ring-2 ring-amber-400 ring-inset",
                          !isConflicting && !isResizing && booking.bookingStatus === "bot_confirmed" && "ring-2 ring-indigo-400/70 ring-inset"
                        )}
                        style={{ 
                          background: booking.paid
                            ? `linear-gradient(135deg, ${s.color}ee, ${s.color}cc)`
                            : `linear-gradient(135deg, ${s.color}77, ${s.color}55)`,
                          cursor: canEdit ? 'grab' : 'default',
                          border: booking.bookingStatus === "bot_confirmed" && !booking.paid
                            ? `1.5px dashed ${s.color}cc`
                            : booking.paid ? 'none' : `1.5px solid ${s.color}bb`,
                          transition: 'opacity 0.15s, transform 0.15s, filter 0.15s, scale 0.15s',
                          touchAction: (canEdit && !isResizing && !!draggedAppointment) ? 'none' : 'auto',
                        }}
                        data-booking-id={booking.id}
                        onPointerDown={(e) => { if (canEdit && !isResizing && e.pointerType !== 'touch') handleCardPointerDown(e, booking, s.color); }}
                        onClick={(e) => { if (!isResizing && !dragJustCompleted.current && !scrollJustCancelled.current) handleAppointmentClick(e, booking); dragJustCompleted.current = false; scrollJustCancelled.current = false; }}
                      >
                        <div className="water-shimmer absolute inset-0 opacity-30" />
                        {/* Hold-to-drag ring — animates in while user holds */}
                        {holdingCardId === booking.id && (
                          <div className="absolute inset-0 rounded-md pointer-events-none z-30 overflow-hidden">
                            <div
                              className="absolute inset-0 rounded-md"
                              style={{
                                boxShadow: `inset 0 0 0 2.5px white, 0 0 12px 3px ${s.color}99`,
                                animation: 'hold-ring-pulse 0.5s ease-out forwards',
                              }}
                            />
                          </div>
                        )}
                        {isConflicting && (
                          <div className="absolute top-0.5 right-0.5 z-20 pointer-events-none">
                            <div className="bg-amber-400 rounded-full p-0.5 shadow-md">
                              <AlertTriangle className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                            </div>
                          </div>
                        )}
                        {booking.privateRoom && (
                          <div className="absolute top-0.5 left-0.5 z-20 pointer-events-none">
                            <div className="bg-violet-500 rounded-full p-0.5 shadow-md">
                              <ShieldCheck className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                            </div>
                          </div>
                        )}
                        {booking.bookingStatus === "bot_confirmed" && (
                          <div className="absolute bottom-0.5 right-0.5 z-20 pointer-events-none">
                            <div className="bg-indigo-500 rounded-full p-0.5 shadow-md animate-pulse">
                              <Bot className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                            </div>
                          </div>
                        )}
                        {(() => {
                          let servicesList: Array<{name: string, price: number, duration: number}> = [];
                          if (booking.servicesJson) {
                            try {
                              servicesList = typeof booking.servicesJson === 'string' 
                                ? JSON.parse(booking.servicesJson) 
                                : booking.servicesJson;
                            } catch { servicesList = []; }
                          }
                          if (servicesList.length === 0 && booking.service) {
                            servicesList = [{ name: booking.service, price: booking.price || 0, duration: booking.duration || 30 }];
                          }

                          const paidButton = booking.paid ? (
                            booking.paypalOrderId ? (
                              <span
                                className="flex items-center gap-0.5 bg-blue-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm leading-none shrink-0"
                                role="status"
                                data-testid={`status-paid-${booking.id}`}
                                title={`PayPal: ${booking.paypalOrderId}`}
                              >
                                <svg viewBox="0 0 24 24" className="w-3 h-3 fill-white shrink-0" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z"/>
                                </svg>
                                Payé
                              </span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleRevertPaid(e, booking);
                                }}
                                onTouchEnd={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleRevertPaid(e, booking);
                                }}
                                className="group relative w-7 h-7 min-w-[28px] min-h-[28px] flex items-center justify-center shrink-0 rounded-full hover:bg-red-500/20 active:bg-red-500/30 transition-colors"
                                aria-label={t("planning.revertPayment") || "إلغاء الدفع"}
                                title={t("planning.revertPayment") || "إلغاء الدفع"}
                                data-testid={`button-revert-paid-${booking.id}`}
                              >
                                <CreditCard className="w-5 h-5 text-green-400 group-hover:hidden" />
                                <Check className="w-2.5 h-2.5 text-green-400 absolute -top-0.5 -right-0.5 stroke-[3] group-hover:hidden" />
                                <Undo2 className="w-4 h-4 text-red-400 hidden group-hover:block" />
                              </button>
                            )
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                handleMarkAsPaid(e, booking);
                              }}
                              onTouchEnd={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                handleMarkAsPaid(e, booking);
                              }}
                              className="w-8 h-8 min-w-[32px] min-h-[32px] bg-white/30 hover:bg-white/50 active:bg-white/60 rounded-full flex items-center justify-center transition-colors shrink-0 relative z-30"
                              aria-label={t("planning.markAsPaid")}
                              data-testid={`button-mark-paid-${booking.id}`}
                            >
                              <CreditCard className="w-4 h-4" />
                            </button>
                          );

                          return span <= 2 ? (
                            <div className="relative z-10 flex items-center w-full gap-1 min-w-0 pointer-events-auto overflow-hidden">
                              {span === 1 ? (
                                // Ultra-compact 15-min: just time + duration
                                <>
                                  <span className="text-[9px] opacity-90 shrink-0 tabular-nums">{booking.startTime}</span>
                                  <span className={cn("text-[9px] shrink-0 tabular-nums", isResizing ? "opacity-100 font-bold bg-white/30 px-0.5 rounded" : "opacity-60")}>{liveDuration}′</span>
                                  <span className="shrink-0" style={{ marginInlineStart: 'auto' }}></span>
                                </>
                              ) : (
                                // 30-min compact row: total, startTime, duration, paid
                                <>
                                  <span className="text-[10px] font-bold bg-white/25 px-1 py-0.5 rounded shrink-0 tabular-nums">{booking.total}</span>
                                  <span className="text-[9px] opacity-90 shrink-0">{booking.startTime}</span>
                                  <span className={cn("text-[9px] shrink-0 tabular-nums", isResizing ? "opacity-100 font-bold bg-white/30 px-1 rounded" : "opacity-70")}>{liveDuration}′</span>
                                  <span className="shrink-0" style={{ marginInlineStart: 'auto' }}>{paidButton}</span>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="relative z-10 flex flex-col h-full w-full min-h-0">
                              <div className="min-w-0 flex flex-col gap-0">
                                {servicesList.map((svc, idx) => (
                                  <div key={idx} className={cn(
                                    "font-semibold leading-tight break-words",
                                    span <= 2 ? "text-[11px]" : "text-xs"
                                  )} dir="auto">
                                    {svc.name}
                                  </div>
                                ))}
                              </div>
                              <div className="relative shrink-0 pointer-events-auto mt-auto pb-3" style={{ direction: 'ltr' }}>
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[11px] font-bold bg-white/25 px-1 py-0.5 rounded tabular-nums shrink-0">{booking.total}</span>
                                  <span className="text-[10px] opacity-80 shrink-0">{booking.startTime}</span>
                                  <span className={cn("text-[10px] shrink-0 tabular-nums", isResizing ? "opacity-100 font-bold bg-white/30 px-1 rounded" : "opacity-80")}>{liveDuration}′</span>
                                  <span className="shrink-0 ml-auto">{paidButton}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                        {/* Resize handle — drag to adjust appointment duration */}
                        {canEdit && (
                          <div
                            data-resize-handle="true"
                            className="absolute bottom-0 left-0 right-0 h-4 flex items-end justify-center pb-0.5 z-30 cursor-ns-resize touch-none"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const currentSpan = getBookingSpan(booking);
                              resizeStartY.current = e.clientY;
                              resizeStartSpan.current = currentSpan;
                              setResizeCurrentSpan(currentSpan);
                              setResizingBooking(booking);
                              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            }}
                          >
                            <div className="w-10 h-1 rounded-full bg-white/70 shadow-sm" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // Visual hierarchy for 15-min grid:
                // :00 → strong border, full label | :30 → medium border | :15/:45 → dotted/faint
                const [, slotMin] = hour.split(":").map(Number);
                const isHourSlot    = slotMin === 0;
                const isHalfSlot    = slotMin === 30;
                const isQuarterSlot = slotMin === 15 || slotMin === 45;
                // Alternate background by full-hour group (every 4 slots)
                const hourGroup = Math.floor(hourIndex / 4);
                return (
                  <div
                    key={`${s.id}-${hour}`}
                    className={cn(
                      "transition-colors duration-150 cursor-pointer",
                      staffIndex < staffList.length - 1 && (isRtl ? "border-l border-slate-200 dark:border-slate-600" : "border-r border-slate-200 dark:border-slate-600"),
                      isHourSlot    && "border-t-2 border-t-slate-300 dark:border-t-slate-500",
                      isHalfSlot    && "border-t border-t-slate-200 dark:border-t-slate-600",
                      !isHourSlot && !isHalfSlot && "border-t border-dashed border-t-slate-200/60 dark:border-t-slate-700/60",
                      "hover:bg-slate-50 dark:hover:bg-slate-700/50",
                      isDragOver && "bg-primary/8 dark:bg-slate-700 ring-2 ring-primary/40 ring-inset",
                      !isDragOver && (hourGroup % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/60 dark:bg-slate-800/40")
                    )}
                    style={{ 
                      gridColumn: colNum,
                      gridRow: rowNum
                    }}
                    data-slot-staff={s.name}
                    data-slot-time={hour}
                    onClick={() => handleSlotClick(s.name, hour)}
                  />
                );
              })}
            </React.Fragment>
          );})}
          </div>
        </div>
      </div>

      {/* Smooth drag ghost — position driven by direct DOM manipulation (no React re-render per frame) */}
      {pDragGhost && (
        <div
          ref={ghostElRef}
          className="fixed z-[9999] pointer-events-none select-none drag-ghost-enter"
          style={{
            left: 0,
            top: 0,
            width: pDragGhost.w,
            height: Math.max(pDragGhost.h, 36),
            willChange: 'transform',
            transform: 'translate3d(-9999px,-9999px,0)', // hidden until first moveGhost()
          }}
        >
          <div
            className="h-full w-full rounded-lg flex flex-col justify-center px-2 py-1 overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${pDragGhost.color}f0, ${pDragGhost.color}cc)`,
              border: `2px solid white`,
              boxShadow: `0 16px 40px ${pDragGhost.color}55, 0 4px 12px rgba(0,0,0,0.25), 0 0 0 1px ${pDragGhost.color}88`,
              transform: 'scale(1.06) rotate(-1.5deg)',
            }}
          >
            <div className="absolute inset-0 water-shimmer opacity-40" />
            <span className="relative z-10 text-white font-bold text-[11px] leading-tight truncate drop-shadow-sm">
              {pDragGhost.label}
            </span>
          </div>
        </div>
      )}

      {/* Appointment Dialog - iOS Liquid Glass */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsDialogOpen(false);
          // Clear any pending reset before scheduling a new one (prevents stale timer firing on rapid reopen)
          if (dialogCloseTimeoutRef.current) clearTimeout(dialogCloseTimeoutRef.current);
          dialogCloseTimeoutRef.current = setTimeout(() => {
            dialogCloseTimeoutRef.current = null;
            setIsEditFavoritesOpen(false);
            setSelectedServices([]);
            setPriceInputs({});
            setSelectedPackage(null);
            setAppliedLoyaltyPoints(null);
            setAppliedGiftCardBalance(null);
            setManualTotalOverride(false);
            setEditingAppointment(null);
            setTotalInputValue("0");
          }, 200);
        } else {
          // Cancel any pending reset when reopening before the timer fires
          if (dialogCloseTimeoutRef.current) {
            clearTimeout(dialogCloseTimeoutRef.current);
            dialogCloseTimeoutRef.current = null;
          }
          setIsDialogOpen(true);
        }
      }}>
        <DialogContent 
          className="w-[calc(100vw-16px)] max-w-[400px] max-h-[90dvh] p-0 border-0 rounded-3xl overflow-hidden animate-fade-in-scale flex flex-col rose-luxury-modal" 
          dir={isRtl ? "rtl" : "ltr"}
        >
          <Form {...form}>
            <form 
              onSubmit={form.handleSubmit(onSubmit)} 
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  const target = e.target as HTMLElement;
                  // Never intercept Enter inside textareas, popovers, comboboxes, or command lists
                  const insidePopover = !!target.closest('[role="listbox"],[role="option"],[data-radix-popper-content-wrapper],[cmdk-root],[cmdk-list]');
                  if (target.tagName !== 'TEXTAREA' && !insidePopover) {
                    e.preventDefault();
                    form.handleSubmit(onSubmit)();
                  }
                }
              }}
              className="flex flex-col flex-1 min-h-0"
            >
              {/* Header — Soft Rose Luxury */}
              <div className="rose-luxury-header px-4 py-4 shrink-0">
                <div className="relative z-10">
                  {/* Title row */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-white/25 backdrop-blur-sm flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-white font-semibold text-base truncate flex-1" style={{ fontFamily: "'Playfair Display', serif" }}>
                      {editingAppointment ? t("planning.editBooking") : t("planning.newBooking")}
                    </span>
                    {editingAppointment?.createdBy && (
                      <span className="text-[10px] text-white/70 truncate shrink-0">
                        {editingAppointment.createdBy}
                      </span>
                    )}
                  </div>
                  {/* Total + Paid row */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rose-luxury-total-pill flex items-center gap-2 px-3.5 py-2">
                      <span className="text-white/70 text-xs font-medium shrink-0">{t("common.total", "Total")}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={totalInputValue}
                        onChange={(e) => {
                          setTotalInputValue(e.target.value);
                          form.setValue("total", parseFloat(e.target.value) || 0);
                          setManualTotalOverride(true);
                          setAppliedLoyaltyPoints(null);
                          setAppliedGiftCardBalance(null);
                        }}
                        placeholder="0"
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.target.select()}
                        className="rose-luxury-total-input flex-1"
                        style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                      />
                      <span className="text-white/80 text-sm font-bold shrink-0">DH</span>
                    </div>
                    <FormField
                      control={form.control}
                      name="paid"
                      render={({ field }) => (
                        <FormItem className="space-y-0">
                          <FormControl>
                            <button
                              type="button"
                              aria-label={t("common.paid")}
                              aria-pressed={field.value}
                              onClick={() => field.onChange(!field.value)}
                              className={`rose-luxury-paid-btn ${field.value ? "paid" : "unpaid"}`}
                            >
                              {field.value
                                ? <Check className="w-3.5 h-3.5" />
                                : <span className="w-3.5 h-3.5 rounded-full border-2 border-white/60 inline-block shrink-0" />
                              }
                              {t("common.paid")}
                            </button>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
              
              {/* Form body */}
              <div className="px-3 py-3 space-y-2.5 overflow-y-auto flex-1 min-h-0 rose-luxury-body" style={{ WebkitOverflowScrolling: 'touch' }}>
                {/* Row 1: Client full width */}
                <FormField
                  control={form.control}
                  name="client"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={clientPopoverOpen}
                              className={cn(
                                "w-full h-10 justify-between rounded-xl text-sm font-medium shadow-sm hover:shadow transition-all rose-luxury-field",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              <span className="flex items-center gap-2 truncate">
                                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <User className="w-3.5 h-3.5 text-primary" />
                                </div>
                                {field.value || t("planning.client")}
                              </span>
                              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-40" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0 rounded-2xl glass-card shadow-xl" align="start" side={isMobile ? "top" : "bottom"} sideOffset={4} avoidCollisions={false}>
                          <Command>
                            <CommandInput placeholder={t("planning.searchClient")} />
                            <CommandList className="h-[200px] max-h-[200px]">
                              <CommandEmpty>{t("planning.noClientFound")}</CommandEmpty>
                              <CommandGroup>
                                {clients.map((client) => (
                                  <CommandItem
                                    key={client.id}
                                    value={client.name}
                                    onSelect={() => {
                                      field.onChange(client.name);
                                      form.setValue("clientId" as any, client.id);
                                      setClientPopoverOpen(false);
                                      
                                      const baseTotal = computeBaseTotal();
                                      
                                      setAppliedLoyaltyPoints(null);
                                      setAppliedGiftCardBalance(null);
                                      setManualTotalOverride(false);
                                      
                                      let runningTotal = baseTotal;
                                      
                                      if (client.usePoints && client.loyaltyPoints > 0 && businessSettings?.loyaltyEnabled) {
                                        const pointsValue = businessSettings?.loyaltyPointsValue || 0.1;
                                        const maxDiscount = client.loyaltyPoints * pointsValue;
                                        const discountAmount = Math.min(maxDiscount, runningTotal);
                                        const pointsUsed = Math.ceil(discountAmount / pointsValue);
                                        if (discountAmount > 0) {
                                          setAppliedLoyaltyPoints({ clientId: client.id, points: pointsUsed, discountAmount });
                                          runningTotal = Math.max(0, runningTotal - discountAmount);
                                          toast({ title: t("clients.pointsApplied", "Loyalty points applied!") + ` -${discountAmount.toFixed(0)} DH` });
                                        }
                                      }
                                      if (client.useGiftCardBalance && Number(client.giftCardBalance) > 0) {
                                        const discountAmount = Math.min(Number(client.giftCardBalance), runningTotal);
                                        if (discountAmount > 0) {
                                          setAppliedGiftCardBalance({ clientId: client.id, amount: Number(client.giftCardBalance), discountAmount });
                                          runningTotal = Math.max(0, runningTotal - discountAmount);
                                          toast({ title: t("giftCard.balanceApplied", "Gift card balance applied!") + ` -${discountAmount.toFixed(0)} DH` });
                                        }
                                      }
                                      
                                      setTotalInputValue(String(runningTotal));
                                      form.setValue("total", runningTotal);
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", field.value === client.name ? "opacity-100" : "opacity-0")} />
                                    <div className="flex flex-col">
                                      <span>{client.name}</span>
                                      {client.phone && <span className="text-xs text-muted-foreground">{client.phone}</span>}
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </FormItem>
                  )}
                />

                {/* Row 2: Staff + Time + Duration in 3 cols */}
                <div className="grid grid-cols-3 gap-1.5">
                  <FormField
                    control={form.control}
                    name="staff"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <span className="rose-luxury-section-label">{t("planning.staff")}</span>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-9 rounded-lg text-[11px] rose-luxury-field border-0">
                              <SelectValue placeholder={t("planning.staff")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-xl glass-card shadow-xl">
                            {staffList.map(s => (
                              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <span className="rose-luxury-section-label">{t("planning.time")}</span>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-9 rounded-lg text-[11px] rose-luxury-field border-0">
                              <SelectValue placeholder={t("planning.time")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-60 rounded-xl glass-card shadow-xl">
                            {hours.map(h => (
                              <SelectItem key={h} value={h}>{h}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <span className="rose-luxury-section-label">{t("common.duration")}</span>
                        <FormControl>
                          <Input type="number" inputMode="numeric" placeholder={t("common.duration")} className="h-9 rounded-lg text-[11px] rose-luxury-field border-0" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Packages - compact */}
                {activePackages.length > 0 && (
                  <Select
                    value={selectedPackage?.id?.toString() || ""}
                    onValueChange={(value) => {
                      if (value === "none") { handleClearPackage(); }
                      else { const pkg = activePackages.find(p => p.id.toString() === value); if (pkg) handleSelectPackage(pkg); }
                    }}
                  >
                    <SelectTrigger className="w-full h-9 rounded-lg text-[11px] border-0 bg-secondary/50">
                      <span className="flex items-center gap-1.5"><Gift className="w-3 h-3 text-primary shrink-0" /><SelectValue placeholder={t("booking.selectPackage", { defaultValue: "Forfait" })} /></span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none"><span className="text-muted-foreground">{t("booking.noPackage", { defaultValue: "Aucun" })}</span></SelectItem>
                      {activePackages.map(pkg => {
                        const savingsPercent = pkg.originalPrice > 0 ? Math.round(((pkg.originalPrice - pkg.discountedPrice) / pkg.originalPrice) * 100) : 0;
                        return (
                          <SelectItem key={pkg.id} value={pkg.id.toString()}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{pkg.name}</span>
                              <span className="text-[10px] font-bold text-emerald-600">-{savingsPercent}%</span>
                              <span className="text-primary font-bold">{pkg.discountedPrice} DH</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}

                {/* Loyalty & Gift Card toggles - show when client has available points/balance */}
                {(() => {
                  const clientName = form.getValues("client");
                  const client = clientName ? (clientsByName.get(clientName) ?? null) : null;
                  if (!client) return null;
                  const hasPoints = client.loyaltyEnrolled && client.loyaltyPoints > 0 && businessSettings?.loyaltyEnabled;
                  const hasGiftCard = Number(client.giftCardBalance) > 0;
                  if (!hasPoints && !hasGiftCard) return null;
                  return (
                    <div className="flex flex-wrap gap-1.5">
                      {hasPoints && (
                        <button
                          type="button"
                          data-testid="toggle-loyalty-points"
                          onClick={() => {
                            if (appliedLoyaltyPoints) {
                              const baseTotal = computeBaseTotal();
                              setAppliedLoyaltyPoints(null);
                              setManualTotalOverride(false);
                              if (appliedGiftCardBalance) {
                                const newGiftCardDiscount = Math.min(appliedGiftCardBalance.amount, baseTotal);
                                setAppliedGiftCardBalance({ ...appliedGiftCardBalance, discountAmount: newGiftCardDiscount });
                                setTotalInputValue(String(Math.max(0, baseTotal - newGiftCardDiscount)));
                                form.setValue("total", Math.max(0, baseTotal - newGiftCardDiscount));
                              } else {
                                setTotalInputValue(String(baseTotal));
                                form.setValue("total", baseTotal);
                              }
                            } else {
                              const pointsValue = businessSettings?.loyaltyPointsValue || 0.1;
                              const maxDiscount = client.loyaltyPoints * pointsValue;
                              const baseTotal = computeBaseTotal();
                              const discountAmount = Math.min(maxDiscount, baseTotal);
                              const pointsUsed = Math.ceil(discountAmount / pointsValue);
                              if (discountAmount > 0) {
                                setAppliedLoyaltyPoints({ clientId: client.id, points: pointsUsed, discountAmount });
                                setManualTotalOverride(false);
                                let runningTotal = Math.max(0, baseTotal - discountAmount);
                                if (appliedGiftCardBalance) {
                                  const newGiftCardDiscount = Math.min(appliedGiftCardBalance.amount, runningTotal);
                                  setAppliedGiftCardBalance({ ...appliedGiftCardBalance, discountAmount: newGiftCardDiscount });
                                  runningTotal = Math.max(0, runningTotal - newGiftCardDiscount);
                                }
                                setTotalInputValue(String(runningTotal));
                                form.setValue("total", runningTotal);
                              }
                            }
                          }}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                            appliedLoyaltyPoints
                              ? "bg-yellow-500/15 border border-yellow-500/30 text-yellow-700 dark:text-yellow-400"
                              : "bg-secondary/50 border border-transparent text-muted-foreground hover:bg-yellow-500/10 hover:border-yellow-500/20"
                          )}
                        >
                          <Star className="w-3 h-3 shrink-0" />
                          <span>{client.loyaltyPoints} pts</span>
                          {appliedLoyaltyPoints && <span className="text-yellow-600 dark:text-yellow-300">-{Number(appliedLoyaltyPoints.discountAmount ?? 0).toFixed(0)} DH</span>}
                          {appliedLoyaltyPoints && <X className="w-3 h-3 text-destructive" />}
                        </button>
                      )}
                      {hasGiftCard && (
                        <button
                          type="button"
                          data-testid="toggle-gift-card"
                          onClick={() => {
                            if (appliedGiftCardBalance) {
                              const baseTotal = computeBaseTotal();
                              setAppliedGiftCardBalance(null);
                              setManualTotalOverride(false);
                              const finalTotal = appliedLoyaltyPoints
                                ? Math.max(0, baseTotal - appliedLoyaltyPoints.discountAmount)
                                : baseTotal;
                              setTotalInputValue(String(finalTotal));
                              form.setValue("total", finalTotal);
                            } else {
                              const baseTotal = computeBaseTotal();
                              let afterLoyalty = baseTotal;
                              if (appliedLoyaltyPoints) {
                                afterLoyalty = Math.max(0, baseTotal - appliedLoyaltyPoints.discountAmount);
                              }
                              const discountAmount = Math.min(Number(client.giftCardBalance), afterLoyalty);
                              if (discountAmount > 0) {
                                setAppliedGiftCardBalance({ clientId: client.id, amount: Number(client.giftCardBalance), discountAmount });
                                setManualTotalOverride(false);
                                const newTotal = Math.max(0, afterLoyalty - discountAmount);
                                setTotalInputValue(String(newTotal));
                                form.setValue("total", newTotal);
                              }
                            }
                          }}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                            appliedGiftCardBalance
                              ? "bg-green-500/15 border border-green-500/30 text-green-700 dark:text-green-400"
                              : "bg-secondary/50 border border-transparent text-muted-foreground hover:bg-green-500/10 hover:border-green-500/20"
                          )}
                        >
                          <Gift className="w-3 h-3 shrink-0" />
                          <span>{Number(client.giftCardBalance).toFixed(0)} DH</span>
                          {appliedGiftCardBalance && <span className="text-green-600 dark:text-green-300">-{Number(appliedGiftCardBalance.discountAmount ?? 0).toFixed(0)} DH</span>}
                          {appliedGiftCardBalance && <X className="w-3 h-3 text-destructive" />}
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* Private Room toggle */}
                <FormField
                  control={form.control}
                  name="privateRoom"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormControl>
                        <button
                          type="button"
                          data-testid="toggle-private-room"
                          onClick={() => field.onChange(!field.value)}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all border",
                            field.value
                              ? "bg-violet-500/15 border-violet-500/40 text-violet-700 dark:text-violet-300"
                              : "bg-secondary/50 border-transparent text-muted-foreground hover:bg-violet-500/10 hover:border-violet-500/20"
                          )}
                        >
                          <ShieldCheck className={cn("w-4 h-4 shrink-0", field.value ? "text-violet-500" : "text-muted-foreground")} />
                          <span className="flex-1 text-start">غرفة خاصة — نساء فقط</span>
                          <span className="text-[10px] opacity-70">Private Room</span>
                          {field.value && <Check className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
                        </button>
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Services section - compact */}
                <div className="space-y-1.5">
                  {selectedServices.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-2 bg-rose-50/60 dark:bg-rose-950/20 rounded-xl border border-rose-100/60 dark:border-rose-900/30">
                      {selectedServices.map((s, index) => (
                        <div key={s.id} className="flex items-center gap-1 px-2.5 py-1.5 rose-luxury-chip rounded-full text-[11px]">
                          <span className="rose-luxury-chip-text truncate max-w-[80px]">{s.name}</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            id={`price-input-${s.id}`}
                            value={priceInputs[s.id] ?? String(s.price)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const newVal = e.target.value;
                              const updatedPrices = { ...priceInputs, [s.id]: newVal };
                              setPriceInputs(updatedPrices);
                              if (!manualTotalOverride) {
                                const baseTotal = selectedServices.reduce((sum, svc) => {
                                  const p = svc.id === s.id ? newVal : (updatedPrices[svc.id] ?? String(svc.price));
                                  return sum + (parseFloat(p) || 0);
                                }, 0);
                                form.setValue("price", baseTotal);
                                const finalTotal = recalcTotalWithDiscounts(baseTotal);
                                setTotalInputValue(String(finalTotal));
                                form.setValue("total", finalTotal);
                              }
                            }}
                            onBlur={(e) => {
                              if (e.target.value === '' || isNaN(parseFloat(e.target.value))) {
                                const updatedPrices = { ...priceInputs, [s.id]: String(s.price) };
                                setPriceInputs(updatedPrices);
                                if (!manualTotalOverride) {
                                  const baseTotal = selectedServices.reduce((sum, svc) => {
                                    const p = updatedPrices[svc.id] ?? String(svc.price);
                                    return sum + (parseFloat(p) || 0);
                                  }, 0);
                                  form.setValue("price", baseTotal);
                                  const finalTotal = recalcTotalWithDiscounts(baseTotal);
                                  setTotalInputValue(String(finalTotal));
                                  form.setValue("total", finalTotal);
                                }
                              }
                            }}
                            className="w-14 h-6 px-1 text-[11px] text-center font-bold rounded border border-primary/40 bg-white dark:bg-slate-800 focus:ring-1 focus:ring-primary focus:outline-none"
                            style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                          />
                          <button type="button" onClick={() => handleRemoveService(index)} className="w-4 h-4 rounded-full bg-destructive/20 flex items-center justify-center">
                            <X className="w-2.5 h-2.5 text-destructive" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {selectedServices.length > 0 && (
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rose-luxury-service-strip text-[11px]">
                      <span className="text-rose-400 font-medium">{selectedServices.length} {t("common.services")} · {dialogSummaryDuration}min</span>
                      <span className="font-bold text-rose-600 dark:text-rose-400">
                        {dialogSummaryPrice} DH
                      </span>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="service"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <Popover open={servicePopoverOpen} onOpenChange={setServicePopoverOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" role="combobox" className="h-10 w-full justify-between rounded-xl text-sm font-medium transition-colors rose-luxury-add-btn">
                                <span className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                                    <Plus className="w-3.5 h-3.5" />
                                  </div>
                                  {t("planning.addService")}
                                </span>
                                <Search className="h-4 w-4 shrink-0 text-primary/40" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent 
                            className="w-[calc(100vw-48px)] max-w-[376px] p-0 rounded-xl glass-card shadow-2xl" 
                            align="center" 
                            side={isMobile ? "top" : "bottom"}
                            sideOffset={4}
                            avoidCollisions={false}
                          >
                            <div className="p-2 border-b border-white/20 liquid-gradient-subtle rounded-t-xl">
                              <Input
                                placeholder={t("planning.searchService")}
                                value={serviceSearch}
                                onChange={(e) => setServiceSearch(e.target.value)}
                                className="h-9 text-sm rounded-lg border-0 bg-white/80 dark:bg-slate-800/80"
                              />
                            </div>
                            <div 
                              className="h-[180px] overflow-y-auto p-1.5"
                              style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
                              onTouchStart={(e) => e.stopPropagation()}
                              onTouchMove={(e) => e.stopPropagation()}
                            >
                              {Object.entries(groupedServices).map(([category, categoryServices]) => (
                                <div key={category}>
                                  <div className="px-2 py-1 text-[10px] font-bold gradient-text uppercase glass-subtle rounded-md mb-0.5 sticky top-0">{category}</div>
                                  {categoryServices.map(s => (
                                    <div
                                      key={s.id}
                                      className={cn(
                                        "flex items-center justify-between gap-2 px-2 py-2 rounded-lg cursor-pointer text-xs mb-0.5",
                                        "hover:bg-primary/5 dark:hover:bg-primary/10",
                                        selectedServices.some(sel => sel.name === s.name) && "bg-primary/10 dark:bg-primary/20"
                                      )}
                                      onClick={() => { handleServiceChange(s.name); setServicePopoverOpen(false); setTimeout(() => setServiceSearch(""), 200); }}
                                    >
                                      <span className="truncate">{s.name}</span>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="text-[11px] font-bold gradient-text">{s.isStartingPrice ? `${t("services.startingFrom")} ` : ''}{s.price} DH</span>
                                        <Plus className="w-3.5 h-3.5 text-primary" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Quick Favorites - compact */}
                {!editingAppointment && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {favoriteServices.slice(0, 4).map((s: any) => {
                      const isActive = selectedServices.some(sel => sel.name === s.name);
                      return (
                        <Button
                          key={s.id}
                          type="button"
                          variant={isActive ? "default" : "outline"}
                          size="sm"
                          className={cn(
                            "h-7 text-[10px] px-2.5 rounded-full font-medium whitespace-nowrap",
                            isActive
                              ? "liquid-gradient border-0 text-white shadow-sm"
                              : "border-0 bg-secondary/50"
                          )}
                          onClick={() => handleServiceChange(s.name)}
                        >
                          {s.name}
                        </Button>
                      );
                    })}
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => setIsEditFavoritesOpen(!isEditFavoritesOpen)}>
                      <Settings2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                
                {isEditFavoritesOpen && (
                  <div className="border border-dashed border-primary/30 rounded-lg p-2 glass-subtle">
                    <ScrollArea className="h-[60px]">
                      <div className="flex flex-wrap gap-1">
                        {services.map((s) => (
                          <Button
                            key={s.id}
                            type="button"
                            variant={favoriteIds.includes(s.id) ? "default" : "outline"}
                            size="sm"
                            className={cn(
                              "h-6 text-[9px] px-2 rounded-full",
                              favoriteIds.includes(s.id) ? "liquid-gradient border-0 text-white" : "border-0 bg-white/50 dark:bg-slate-800/50"
                            )}
                            onClick={() => toggleFavorite(s.id)}
                          >
                            {s.name}
                          </Button>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>

              {/* Action Buttons - fixed bottom */}
              <div className="flex gap-2 px-3 py-2.5 shrink-0 rose-luxury-footer">
                {editingAppointment && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="h-10 w-10 rounded-xl shrink-0"
                    onClick={() => {
                      if (!canEdit) return;
                      if (confirm(t("planning.deleteConfirm"))) {
                        deleteMutation.mutate(editingAppointment.id);
                        setSelectedServices([]);
                        setPriceInputs({});
                        setSelectedPackage(null);
                        setAppliedLoyaltyPoints(null);
                        setAppliedGiftCardBalance(null);
                        setManualTotalOverride(false);
                        setEditingAppointment(null);
                        setTotalInputValue("0");
                        setIsDialogOpen(false);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
                <Button 
                  type="submit" 
                  className="flex-1 h-11 text-sm font-bold rounded-2xl rose-luxury-confirm-btn active:scale-[0.98]" 
                  disabled={!canEdit || createMutation.isPending || updateMutation.isPending}
                >
                  <Sparkles className="w-4 h-4 ml-1" />
                  {editingAppointment ? t("planning.updateBooking") : t("planning.confirmBooking")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* ── Staff Wallet Portal Dialog ── */}
      <Dialog open={!!walletStaffId} onOpenChange={(open) => { if (!open) { setWalletStaffId(null); setWalletShowAdd(false); } }}>
        <DialogContent className="max-w-sm w-[95vw] rounded-2xl p-0 overflow-hidden bg-background border border-border shadow-2xl flex flex-col max-h-[85dvh]" dir={isRtl ? "rtl" : "ltr"}>
          {(() => {
            const ws = walletStaffId ? staffList.find(s => s.id === walletStaffId) : null;
            const cur = salonSettings?.currencySymbol || "DH";
            const fmt = (n: number) => `${Math.abs(n).toFixed(0)} ${cur}`;
            const deductLabel = (type: string) => {
              if (type === "advance") return t("salaries.advance");
              if (type === "penalty") return t("salaries.penalty");
              if (type === "loan") return "Loan";
              return type;
            };
            const today = format(getWorkDayDate(businessSettings?.openingTime, businessSettings?.closingTime), "yyyy-MM-dd");
            const canManage = hasPermission("manage_salaries");

            return (
              <>
                {/* Header — sticky */}
                <div className="shrink-0 p-4 pb-3 flex items-center gap-3 border-b border-border bg-background">
                  <Avatar className="h-12 w-12 border-2" style={{ borderColor: ws?.color || "#ccc" }}>
                    <AvatarImage src={ws?.photoUrl || undefined} alt={ws?.name} />
                    <AvatarFallback className="text-white text-lg font-bold" style={{ backgroundColor: ws?.color || "#999" }}>
                      {ws?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base truncate">{ws?.name}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Wallet className="w-3 h-3" />
                      <span>{t("salaries.walletBalance")}</span>
                    </div>
                  </div>
                  {canManage && walletPortalData && walletPortalData.walletBalance > 0 && (
                    <button
                      disabled={markStaffPaidMutation.isPending}
                      onClick={() => markStaffPaidMutation.mutate({ staffId: walletStaffId!, staffName: walletPortalData.staffName, amount: Math.max(0, walletPortalData.walletBalance) })}
                      className="shrink-0 flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white transition-all shadow-md disabled:opacity-60"
                      data-testid="button-wallet-mark-paid-header"
                      title={t("salaries.markAsPaid")}
                    >
                      {markStaffPaidMutation.isPending
                        ? <RefreshCw className="w-5 h-5 animate-spin" />
                        : <CheckCircle className="w-5 h-5" />
                      }
                      <span className="text-[9px] font-bold leading-tight">{(walletPortalData.walletBalance).toFixed(0)}</span>
                    </button>
                  )}
                </div>

                {/* Wallet cards — scrollable */}
                {walletPortalData ? (
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-muted/40 p-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground mb-1">{t("salaries.totalRevenue")}</p>
                        <p className="text-xs font-bold tabular-nums">{fmt(walletPortalData.walletRevenue)}</p>
                      </div>
                      <div className="rounded-xl bg-green-50/80 dark:bg-green-950/20 p-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground mb-1">{t("salaries.staffCommissions")}</p>
                        <p className="text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(walletPortalData.walletCommission)}</p>
                      </div>
                      <div className="rounded-xl bg-primary/5 dark:bg-primary/10 p-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground mb-1">{t("salaries.walletBalance")}</p>
                        <p className={`text-xs font-bold tabular-nums ${walletPortalData.walletBalance < 0 ? "text-red-600 dark:text-red-400" : walletPortalData.walletBalance > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                          {walletPortalData.walletBalance < 0 ? "- " : ""}{fmt(walletPortalData.walletBalance)}
                        </p>
                      </div>
                    </div>

                    {/* Since / count info */}
                    <p className="text-[10px] text-muted-foreground text-center">
                      {walletPortalData.apptCount} rdv
                      {walletPortalData.sinceDate ? ` · ${t("salaries.lastPaid")}: ${format(parseISO(walletPortalData.sinceDate), "d/M/yy")}` : ""}
                    </p>

                    {/* Mark as Paid */}
                    {canManage && walletPortalData.walletBalance > 0 && (
                      <button
                        disabled={markStaffPaidMutation.isPending || salaryDataFetching}
                        onClick={() => markStaffPaidMutation.mutate({ staffId: walletStaffId!, staffName: walletPortalData.staffName, amount: Math.max(0, walletPortalData.walletBalance) })}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white text-sm font-semibold transition-all shadow-sm disabled:opacity-60"
                        data-testid="button-wallet-mark-paid"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {t("salaries.markAsPaid")} · {fmt(walletPortalData.walletBalance)}
                      </button>
                    )}

                    {/* Recent Payments — with undo buttons */}
                    {canManage && walletPortalData.recentPayments.length > 0 && (
                      <div className="rounded-xl overflow-hidden border border-emerald-200/50 dark:border-emerald-800/30">
                        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50/80 dark:bg-emerald-950/20">
                          <Wallet className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex-1 text-start">
                            {t("salaries.paymentHistory")}
                          </span>
                        </div>
                        <div className="px-3 py-1 bg-emerald-50/30 dark:bg-emerald-950/10 divide-y divide-emerald-100/50 dark:divide-emerald-900/20">
                          {walletPortalData.recentPayments.map((p: any) => (
                            <div key={p.id} className="flex items-center justify-between gap-1 py-1.5">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400">+ {fmt(p.amount)}</p>
                                <p className="text-[10px] text-muted-foreground">{format(parseISO(p.paidAt), "d/M/yy · HH:mm")}</p>
                              </div>
                              <button
                                onClick={() => revertStaffPaymentMutation.mutate(p.id)}
                                disabled={revertStaffPaymentMutation.isPending}
                                className="group flex items-center justify-center h-6 w-6 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
                                title={t("planning.revertPayment") || "إلغاء الدفع"}
                                data-testid={`button-revert-staff-payment-${p.id}`}
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Deductions section */}
                    <div className="rounded-xl overflow-hidden border border-orange-200/50 dark:border-orange-800/30">
                      <button
                        type="button"
                        onClick={() => setWalletOpenDeductions(v => !v)}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-orange-50/80 dark:bg-orange-950/20 hover:bg-orange-100/60 dark:hover:bg-orange-900/30 transition-colors"
                      >
                        <UserMinus className="h-3 w-3 text-orange-600 dark:text-orange-400 shrink-0" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400 flex-1 text-start">
                          {t("staffPortal.allDeductions")}
                          {walletPortalData.deductions.length > 0 && <span className="ms-1 text-orange-500/70">({walletPortalData.deductions.length})</span>}
                        </span>
                        {canManage && (
                          <span
                            className="flex items-center justify-center h-5 w-5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 hover:bg-orange-200 transition-colors"
                            onClick={(e) => { e.stopPropagation(); setWalletShowAdd(v => !v); setWalletOpenDeductions(true); }}
                            data-testid="button-wallet-add-deduction"
                          >
                            <Plus className="h-3 w-3" />
                          </span>
                        )}
                        <ChevronDown className={`h-3 w-3 text-orange-500 transition-transform duration-200 ${walletOpenDeductions ? "rotate-180" : ""}`} />
                      </button>

                      {walletOpenDeductions && (
                        <div className="px-3 py-2 bg-orange-50/40 dark:bg-orange-950/10 space-y-1">
                          {/* Add deduction inline form */}
                          {walletShowAdd && canManage && (
                            <div className="bg-background rounded-xl p-3 space-y-2 mb-2 border border-orange-200/40">
                              <p className="text-[11px] font-semibold text-orange-700 dark:text-orange-400">{t("salaries.deductionType")}</p>
                              <Select value={walletDeductForm.type} onValueChange={(v) => setWalletDeductForm(f => ({ ...f, type: v as any }))}>
                                <SelectTrigger className="h-8 text-xs rounded-lg">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="advance">{t("salaries.advance")}</SelectItem>
                                  <SelectItem value="loan">Loan</SelectItem>
                                  <SelectItem value="penalty">{t("salaries.penalty")}</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                className="h-8 text-xs rounded-lg"
                                placeholder={t("salaries.deductionDescription")}
                                value={walletDeductForm.description}
                                onChange={(e) => setWalletDeductForm(f => ({ ...f, description: e.target.value }))}
                              />
                              <Input
                                type="number"
                                className="h-8 text-xs rounded-lg"
                                placeholder={`${t("common.amount")} (${cur})`}
                                value={walletDeductForm.amount}
                                onChange={(e) => setWalletDeductForm(f => ({ ...f, amount: e.target.value }))}
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    const amount = parseFloat(walletDeductForm.amount);
                                    if (!amount || amount <= 0) return;
                                    createDeductionMutation.mutate({
                                      staffName: walletPortalData.staffName,
                                      type: walletDeductForm.type,
                                      description: walletDeductForm.description,
                                      amount,
                                      date: today,
                                    });
                                  }}
                                  disabled={createDeductionMutation.isPending || !walletDeductForm.amount}
                                  className="flex-1 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                                  data-testid="button-wallet-save-deduction"
                                >
                                  {createDeductionMutation.isPending ? "..." : t("common.save")}
                                </button>
                                <button
                                  onClick={() => setWalletShowAdd(false)}
                                  className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs font-semibold transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Deduction list */}
                          {walletPortalData.deductions.length === 0 ? (
                            <p className="text-[10px] text-muted-foreground text-center py-1">{t("salaries.noDeductionsForPeriod")}</p>
                          ) : (
                            walletPortalData.deductions.map((d: any) => {
                              const remaining = Math.max(0, d.amount - (d.paidBack || 0));
                              return (
                                <div key={d.id} className="flex items-center justify-between gap-1 py-1.5 border-t border-orange-200/30 dark:border-orange-800/20 first:border-0">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium">{deductLabel(d.type)}{d.description ? ` · ${d.description}` : ""}</p>
                                    <p className="text-[10px] text-red-600 dark:text-red-400 tabular-nums">- {fmt(remaining)} · {format(parseISO(d.date), "d/M/yy")}</p>
                                  </div>
                                  {canManage && (
                                    <button
                                      onClick={() => clearWalletDeductionMutation.mutate(d.id)}
                                      disabled={clearWalletDeductionMutation.isPending}
                                      className="flex items-center justify-center h-6 w-6 rounded-full hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 transition-colors disabled:opacity-50"
                                      data-testid={`button-wallet-clear-deduction-${d.id}`}
                                    >
                                      <CheckCircle className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Floating "Go to Now" button - iOS Liquid Glass Style */}
      {isToday && getCurrentTimePosition(hours, businessSettings?.openingTime, businessSettings?.closingTime) >= 0 && (
        <button
          onClick={() => scrollToLiveLine(true, true)}
          className={cn(
            "fixed z-50 rounded-full liquid-gradient shadow-xl flex items-center justify-center text-white transition-all active:scale-95 live-indicator",
            isMobile ? "w-11 h-11 bottom-14" : "w-14 h-14 bottom-20",
            isRtl ? "left-4" : "right-4"
          )}
          aria-label="Go to current time"
        >
          <Clock className={cn(isMobile ? "w-5 h-5" : "w-6 h-6")} />
        </button>
      )}

    </div>
  );
}
