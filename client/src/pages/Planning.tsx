import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { format, addDays, startOfToday, parseISO, subDays } from "date-fns";
import { useTranslation } from "react-i18next";
import { useAppointments, useStaff, useServices, useCreateAppointment, useUpdateAppointment, useDeleteAppointment, useBusinessSettings } from "@/hooks/use-salon-data";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { refreshSalariesBackground } from "@/lib/salariesRefresher";
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
import { CalendarIcon, ChevronLeft, ChevronRight, Plus, Trash2, Check, X, Search, Star, RefreshCw, Sparkles, CreditCard, Settings2, Scissors, Clock, User, ChevronsUpDown, ListTodo, Bell, UserCheck, Gift, AlertCircle, AlertTriangle, Wallet, Users, Package, Lock, ShieldCheck, CheckCircle, UserMinus, ChevronDown, Pencil, ArrowDownLeft } from "lucide-react";
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

const DEFAULT_HOURS = [
  "10:00","10:30","11:00","11:30","12:00","12:30",
  "13:00","13:30","14:00","14:30","15:00","15:30",
  "16:00","16:30","17:00","17:30","18:00","18:30",
  "19:00","19:30","20:00","20:30","21:00","21:30",
  "22:00","22:30","23:00","23:30","00:00","00:30",
  "01:00","01:30","02:00","02:30","03:00"
];

function generateTimeSlots(openingTime: string, closingTime: string): string[] {
  const slots: string[] = [];
  
  const [openHour, openMin] = openingTime.split(":").map(Number);
  const [closeHour, closeMin] = closingTime.split(":").map(Number);
  
  let openingMinutes = openHour * 60 + openMin;
  let closingMinutes = closeHour * 60 + closeMin;
  
  if (closingMinutes <= openingMinutes) {
    closingMinutes += 24 * 60;
  }
  
  for (let mins = openingMinutes; mins < closingMinutes; mins += 30) {
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

// Get the "work day" date - work day runs 10am to 2am, so before 2am is still previous day
function getWorkDayDate(openingTime?: string, closingTime?: string): Date {
  const now = new Date();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  const currentTotalMinutes = hour * 60 + minutes;
  
  // Determine overnight cutoff from business settings
  let overnightCutoffMinutes = 2 * 60; // Default 2 AM fallback
  
  if (openingTime && closingTime) {
    const [openH, openM] = openingTime.split(":").map(Number);
    const [closeH, closeM] = closingTime.split(":").map(Number);
    const openingMinutes = openH * 60 + openM;
    const closingMinutes = closeH * 60 + closeM;
    
    // If closing time is before opening time, it's an overnight business
    if (closingMinutes < openingMinutes) {
      overnightCutoffMinutes = closingMinutes;
    }
  }
  
  // If we're past midnight but before the overnight cutoff, consider it still the previous work day
  if (currentTotalMinutes < overnightCutoffMinutes) {
    return subDays(startOfToday(), 1);
  }
  return startOfToday();
}

export default function Planning() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const isMobile = useIsMobile();
  const [date, setDate] = useState<Date>(getWorkDayDate());
  
  // Check if user has permission to edit the cardboard
  const canEditCardboard = useMemo(() => {
    try {
      const permissions = JSON.parse(sessionStorage.getItem("current_user_permissions") || "[]");
      if (permissions.length === 0) return true;
      return permissions.includes("edit_cardboard");
    } catch {
      return true;
    }
  }, []);

  const currentUserRole = typeof window !== 'undefined' ? sessionStorage.getItem("current_user_role") : null;
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

  // Refresh data - rely on socket.io for real-time updates, use long interval as fallback
  // Socket.io in Sidebar handles instant notifications, this is just a safety net
  useEffect(() => {
    // Mobile: refresh every 1 minute, Desktop: every 45 seconds for better sync
    const refreshInterval = isMobile ? 60000 : 45000;
    
    const intervalId = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
    }, refreshInterval);
    
    // Refresh on visibility change (when returning to PWA) - throttled
    let lastRefresh = 0;
    const handleVisibilityRefresh = () => {
      const now = Date.now();
      if (document.visibilityState === 'visible' && now - lastRefresh > 5000) {
        lastRefresh = now;
        queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityRefresh);
    
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [isMobile]);

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
      // Fallback to last slot + 30 if no closing time provided
      const lastSlot = hoursArray[hoursArray.length - 1];
      const [lastH, lastM] = lastSlot.split(":").map(Number);
      closingMinutes = lastH * 60 + lastM + 30;
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
    const slotHeight = 52;
    const position = (minutesSinceOpen / 30) * slotHeight;
    return position;
  }, [currentTime]);

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
  const pageRef = useRef<HTMLDivElement>(null);
  
  // Swipe gesture state for mobile date navigation
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swipeThreshold = 80; // minimum px to trigger swipe
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);
  
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX.current;
    const deltaY = touchEndY - touchStartY.current;
    
    // Only trigger if horizontal swipe is greater than vertical (avoid scroll conflicts)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > swipeThreshold) {
      if (isRtl) {
        // RTL: swipe left = previous day, swipe right = next day
        if (deltaX < 0) {
          setDate(d => addDays(d, -1));
        } else {
          setDate(d => addDays(d, 1));
        }
      } else {
        // LTR: swipe right = previous day, swipe left = next day  
        if (deltaX > 0) {
          setDate(d => addDays(d, -1));
        } else {
          setDate(d => addDays(d, 1));
        }
      }
    }
    
    touchStartX.current = null;
    touchStartY.current = null;
  }, [isRtl]);
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
  }, []);
  
  const { data: appointments = [], isLoading: loadingApps } = useAppointments(formattedDate);
  const { data: allAppointments = [] } = useAppointments();
  const { data: staffList = [], isLoading: loadingStaff, isError: staffError } = useStaff();
  const { data: services = [], isLoading: loadingServices, isError: servicesError } = useServices();
  const { data: clients = [] } = useQuery<Array<{id: number, name: string, phone: string | null, loyaltyPoints: number, usePoints: boolean, loyaltyEnrolled: boolean, totalSpent: number, giftCardBalance: number, useGiftCardBalance: boolean}>>({
    queryKey: ["/api/clients"],
  });
  
  const { data: businessSettings } = useQuery<{
    loyaltyPointsPerDh: number;
    loyaltyPointsValue: number;
    loyaltyEnabled: boolean;
    openingTime?: string;
    closingTime?: string;
    workingDays?: number[];
    autoLockEnabled?: boolean;
    planningShortcuts?: string[];
  }>({
    queryKey: ["/api/business-settings"],
  });

  const { data: adminRoles = [] } = useQuery<Array<{id: number; name: string; role: string; permissions: string[]}>>({
    queryKey: ["/api/admin-roles"],
  });

  // Salary data for wallet portal (fetched lazily when wallet opens)
  const { data: salaryData } = useQuery<{
    staff: any[]; services: any[]; staffCommissions: any[];
    appointments: any[]; charges: any[]; deductions: any[];
    staffPayments: any[]; salonPayments: any[];
  }>({
    queryKey: ["/api/salaries/compute"],
    enabled: !!walletStaffId,
  });

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
      if (sinceDate) return apt.date >= sinceDate;
      return true;
    });

    let walletRevenue = 0;
    let walletCommission = 0;
    walletAppts.forEach((apt: any) => {
      const total = apt.total || 0;
      walletRevenue += total;
      const serviceName = apt.service || "Unknown";
      walletCommission += (total * getCommission(serviceName)) / 100;
    });

    const pendingDeductions: any[] = (salaryData.deductions || []).filter((d: any) =>
      !d.cleared && (Number(d.staffId) === walletStaffId || (!d.staffId && d.staffName === s.name))
    );
    const pendingTotal = pendingDeductions.reduce((sum: number, d: any) => sum + Math.max(0, d.amount - (d.paidBack || 0)), 0);

    return {
      staffName: s.name,
      walletRevenue,
      walletCommission,
      walletBalance: walletCommission - pendingTotal,
      sinceDate,
      lastPaymentDate,
      apptCount: walletAppts.length,
      deductions: pendingDeductions,
    };
  }, [walletStaffId, salaryData, businessSettings]);

  const currentUserName = typeof window !== 'undefined' ? sessionStorage.getItem("current_user") : null;
  const currentUser = adminRoles.find(role => role.name === currentUserName);
  const hasPermission = (permission: string) => {
    if (!currentUserName || currentUserName === "Setup") return true;
    if (!currentUser) return true;
    if (currentUser.role === "owner") return true;
    if (currentUser.permissions.length === 0) return true;
    return (currentUser.permissions || []).includes(permission);
  };
  
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
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const currentTotalMinutes = hour * 60 + minutes;
    
    // Determine overnight cutoff from business settings
    let overnightCutoffMinutes = 2 * 60; // Default 2 AM fallback
    
    if (businessSettings?.openingTime && businessSettings?.closingTime) {
      const [openH, openM] = businessSettings.openingTime.split(":").map(Number);
      const [closeH, closeM] = businessSettings.closingTime.split(":").map(Number);
      const openingMinutes = openH * 60 + openM;
      const closingMinutes = closeH * 60 + closeM;
      
      // If closing time is before opening time, it's an overnight business
      if (closingMinutes < openingMinutes) {
        overnightCutoffMinutes = closingMinutes;
      }
    }
    
    // If we're past midnight but before the overnight cutoff, consider it still the previous work day
    const workDayDate = currentTotalMinutes < overnightCutoffMinutes ? subDays(now, 1) : now;
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
  const hasAuthError = (staffError || servicesError) && staffList.length === 0;
  const isAdmin = sessionStorage.getItem("admin_authenticated") === "true";

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

  // Auto-redirect to login if session expired
  useEffect(() => {
    if (hasAuthError) {
      sessionStorage.clear();
      localStorage.removeItem("user_authenticated");
      localStorage.removeItem("current_user");
      window.location.href = "/";
    }
  }, [hasAuthError]);

  const createMutation = useCreateAppointment();
  const updateMutation = useUpdateAppointment();
  const deleteMutation = useDeleteAppointment();

  const playSuccessSound = () => {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleVQ2d4u9oYh+dGl4hpOOiYGAg4yWo6OblJWboqShmZGNjpSdp6qnop6bnJ+ipKSioJ6dn6CgoJ6cm5ucnZ+hoJ6bmp2goqSkoqCenp+hoqKhn56dnqChoqKhoJ6en6ChoaGgnpycnZ+hoqKhn56dnZ+goqKhoJ6dnp+goaGgn52cn6ChoaGgn52cnp+goaGgnpycnZ+goaGgnpycnZ+goaGgn52cnp+goaGgn52cnp+goaGgnpybnZ+goKCfnpydnp+goKCfnpycnZ6fn5+enZycnZ6fn5+enZycnZ6fn5+enZybnZ6fn5+enZycnZ6enp6dnJybnZ6enp2cnJucnZ6enp2cnJucnZ2dnZybm5ucnZ2dnZybm5qbnJydnZybm5qam5ycnJuampqam5ycm5uampqam5ubm5qamZqam5ubm5qZmZmam5uampmZmZmampqamZmYmJmampqZmJiYmJmZmZmYmJeXmJmZmZiXl5eXmJmYl5eXl5eXmJiXl5aWlpeXl5eWlpaWlpeXl5aWlZWVlpaWlpWVlZWVlZaVlZWUlJSUlZWVlJSUlJSUlJSUlJSUk5OTk5SUlJSTk5OTk5OTk5OSkpKSkpKSkpKSkpKRkZGRkZGSkpKRkZGRkZCRkZGQkJCQkJCQkJCQj4+Pj4+Pj5CQj4+Pj4+Ojo+Pjo6Ojo6Ojo6NjY2NjY2NjY2NjYyMjIyMjIyMjIyMjIuLi4uLi4uLi4uKioqKioqKioqKioqJiYmJiYmJiYmJiYiIiIiIiIiIiIiIh4eHh4eHh4eHh4eGhoaGhoaGhoaGhYWFhYWFhYWFhYWFhISEhISEhISEhISDg4ODg4ODg4ODgoKCgoKCgoKCgoKCgYGBgYGBgYGBgYGBgICAAACA');
    audio.volume = 0.5;
    audio.play().catch(() => {});
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
    
    const targetApp = appointments.find(app => app.id === parseInt(pendingAppointmentId.current!));
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
    const paidAppointments = appointments.filter(app => app.paid);
    const total = paidAppointments.reduce((sum, app) => sum + (app.total || 0), 0);
    const perStaff = staffList.map(s => {
      const staffTotal = paidAppointments
        .filter(app => app.staffId === s.id || (!app.staffId && app.staff === s.name))
        .reduce((sum, app) => sum + (app.total || 0), 0);
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

    // Handle stock validation for multi-service or single service
    const servicesToCheck = selectedServices.length > 0 
      ? selectedServices.map(s => services.find(svc => svc.name === s.name)).filter(Boolean)
      : [services.find(s => s.name === data.service)].filter(Boolean);
    
    // First pass: check ALL stock availability before decrementing any
    const stockDecrements: Array<{productId: number, newQuantity: number, productName: string}> = [];
    const productQuantities: Record<number, {current: number, name: string}> = {};
    
    for (const selectedService of servicesToCheck) {
      if (selectedService?.linkedProductId) {
        try {
          // Get current stock if we haven't already
          if (!productQuantities[selectedService.linkedProductId]) {
            const res = await apiRequest("GET", `/api/products/${selectedService.linkedProductId}`);
            const product = await res.json();
            productQuantities[selectedService.linkedProductId] = { current: product.quantity, name: product.name };
          }
          
          // Track the decrement needed
          const productInfo = productQuantities[selectedService.linkedProductId];
          const newQuantity = productInfo.current - 1;
          
          if (newQuantity < 0) {
            alert(`⚠️ المخزون غير كافٍ لـ ${productInfo.name}`);
            return;
          }
          
          // Update local tracking and queue the decrement
          productQuantities[selectedService.linkedProductId].current = newQuantity;
          stockDecrements.push({ productId: selectedService.linkedProductId, newQuantity, productName: productInfo.name });
        } catch (e) {
          console.error("Stock check failed:", e);
        }
      }
    }
    
    // Second pass: all checks passed, now apply all decrements
    for (const decrement of stockDecrements) {
      try {
        await apiRequest("PATCH", `/api/products/${decrement.productId}/quantity`, {
          quantity: decrement.newQuantity
        });
      } catch (e) {
        console.error("Stock decrement failed:", e);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });

    // Find the client ID from the clients list
    const selectedClient = clients.find(c => c.name === data.client);
    const clientId = selectedClient?.id || (data as any).clientId || null;

    // Read prices from React state (priceInputs tracks individual service prices)
    const servicesToSave = selectedServices.map(s => {
      const inputValue = priceInputs[s.id];
      const price = inputValue !== undefined ? (parseFloat(inputValue) || s.price) : s.price;
      return { name: s.name, price, duration: s.duration };
    });
    
    // Read total price from state (user can override the calculated total)
    const customTotal = totalInputValue ? parseFloat(totalInputValue) : null;
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
          toast({ title: t("common.error"), description: t("planning.clientNotFound", "Client not found for loyalty discount"), variant: "destructive" });
          return;
        }
        const oldPoints = Number(editingAppointment.loyaltyPointsRedeemed) || 0;
        const newPoints = appliedLoyaltyPoints.points;
        const delta = newPoints - oldPoints;
        if (delta > 0 && client.loyaltyPoints < delta) {
          toast({ title: t("common.error"), description: t("planning.insufficientPoints", "Insufficient loyalty points"), variant: "destructive" });
          return;
        }
      }
      if (appliedGiftCardBalance) {
        const client = clients.find(c => c.id === appliedGiftCardBalance.clientId);
        if (!client) {
          toast({ title: t("common.error"), description: t("planning.clientNotFound", "Client not found for gift card discount"), variant: "destructive" });
          return;
        }
        const oldGiftCard = Number(editingAppointment.giftCardDiscountAmount) || 0;
        const newGiftCard = appliedGiftCardBalance.discountAmount;
        const delta = newGiftCard - oldGiftCard;
        if (delta > 0 && Number(client.giftCardBalance) < delta) {
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
            toast({ title: t("common.error"), description: t("planning.loyaltyDeductionError", "Loyalty points deduction failed"), variant: "destructive" });
          }
        }
      }
    };

    if (editingAppointment) {
      updateMutation.mutate({ id: editingAppointment.id, ...submitData }, {
        onSuccess: async () => { await performDeductions(); }
      });
    } else {
      const currentUser = sessionStorage.getItem("current_user") || "Unknown";
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
      createMutation.mutate({ ...submitData, createdBy: currentUser }, {
        onSuccess: async (result: any) => {
          let loyaltyPointsEarned = 0;
          let loyaltyPointsBalance = 0;
          try {
            const clientMatch = clients.find(c => 
              (submitData.client || data.client || "").includes(c.name)
            );
            if (clientMatch && clientMatch.loyaltyEnrolled) {
              const pointsPerDh = businessSettings?.loyaltyPointsPerDh ?? 1;
              loyaltyPointsEarned = Math.floor(finalTotal * pointsPerDh);
              const res = await fetch(`/api/clients/${clientMatch.id}`, {
                headers: { "x-user-pin": sessionStorage.getItem("user_pin") || "" },
              });
              if (res.ok) {
                const updatedClient = await res.json();
                loyaltyPointsBalance = updatedClient.loyaltyPoints ?? 0;
              }
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
            }).catch((err) => {
              console.error("[print-relay] autoPrint failed:", err);
            });
          }
          await performDeductions();
        },
      });
      playSuccessSound();
    }

    setSelectedServices([]);
    setPriceInputs({});
    setSelectedPackage(null);
    setAppliedLoyaltyPoints(null);
    setAppliedGiftCardBalance(null);
    setManualTotalOverride(false);
    setEditingAppointment(null);
    setTotalInputValue("0");
    setIsDialogOpen(false);
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
      const client = clientName ? clients.find(c => c.name === clientName) : null;
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
      refreshSalariesBackground();
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
      toast({ title: t("common.error"), description: t("planning.paymentError"), variant: "destructive" });
    }
  };

  const handleDragStart = (e: React.DragEvent, appointment: any) => {
    if (!canEdit) {
      e.preventDefault();
      return;
    }
    setDraggedAppointment(appointment);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", appointment.id.toString());
  };

  const handleDragEnd = () => {
    setDraggedAppointment(null);
    setDragOverSlot(null);
  };

  const handleDragOver = (e: React.DragEvent, staffName: string, time: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSlot({ staff: staffName, time });
  };

  const handleDragLeave = () => {
    setDragOverSlot(null);
  };

  const handleDrop = async (e: React.DragEvent, staffName: string, newTime: string) => {
    e.preventDefault();
    setDragOverSlot(null);
    
    if (!canEdit || !draggedAppointment) return;
    
    const staffMember = staffList.find(s => s.name === staffName);
    if (!staffMember) return;

    // Parse servicesJson if it's a string (from API response)
    let parsedServicesJson = draggedAppointment.servicesJson;
    if (typeof parsedServicesJson === 'string') {
      try {
        parsedServicesJson = JSON.parse(parsedServicesJson);
      } catch {
        parsedServicesJson = null;
      }
    }

    try {
      const updateData = {
        ...draggedAppointment,
        servicesJson: parsedServicesJson,
        staff: staffName,
        staffId: staffMember.id,
        startTime: newTime,
        updatedAt: new Date().toISOString(),
        _store: 'appointments',
        _offlineUpdatedAt: new Date().toISOString(),
      };
      await apiRequest("PUT", `/api/appointments/${draggedAppointment.id}`, updateData);
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
      toast({ 
        title: t("planning.appointmentMoved"), 
        description: `${draggedAppointment.client} → ${staffName} @ ${newTime}` 
      });
      playSuccessSound();
    } catch (error) {
      toast({ title: t("common.error"), description: t("planning.moveError"), variant: "destructive" });
    }
    
    setDraggedAppointment(null);
  };

  const favoriteServices = useMemo(() => {
    return favoriteIds.map(id => services.find(s => s.id === id)).filter(Boolean);
  }, [services, favoriteIds]);

  const groupedServices = useMemo(() => {
    const groups: Record<string, typeof services> = {};
    const list = serviceSearch.trim() 
      ? services.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()))
      : services;
    list.forEach(s => {
      const cat = s.category || t("common.other");
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    });
    return groups;
  }, [services, serviceSearch, t]);

  const toggleFavorite = (serviceId: number) => {
    setFavoriteIds(prev => {
      let updated: number[];
      if (prev.includes(serviceId)) {
        updated = prev.filter(id => id !== serviceId);
      } else if (prev.length < 6) {
        updated = [...prev, serviceId];
      } else {
        toast({ title: t("planning.maxFavorites"), variant: "destructive" });
        return prev;
      }
      localStorage.setItem('favoriteServiceIds', JSON.stringify(updated));
      return updated;
    });
  };

  const getBooking = (staffId: number, staffName: string, hour: string) => {
    return appointments.find(a => (a.staffId === staffId || (!a.staffId && a.staff === staffName)) && a.startTime === hour);
  };

  const getBookingSpan = (app: any) => {
    return Math.ceil(app.duration / 30);
  };

  const isSlotCovered = (staffId: number, staffName: string, hour: string) => {
    const hourIndex = hours.indexOf(hour);
    for (let i = 0; i < hourIndex; i++) {
      const prevBooking = appointments.find(a => (a.staffId === staffId || (!a.staffId && a.staff === staffName)) && a.startTime === hours[i]);
      if (prevBooking) {
        const span = getBookingSpan(prevBooking);
        if (i + span > hourIndex) {
          return true;
        }
      }
    }
    return false;
  };

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

          {/* Date nav */}
          <Button variant="ghost" size="icon" className="h-7 w-7 md:h-9 md:w-9 rounded-full p-0" onClick={() => setDate(d => addDays(d, -1))}>
            {isRtl ? <ChevronRight className="w-4 h-4 md:w-5 md:h-5" /> : <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="h-7 px-1.5 md:h-9 md:px-3 text-xs md:text-sm font-medium rounded-full">
                {format(date, "dd/MM")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-2xl glass-card shadow-xl" align="end">
              <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="h-7 w-7 md:h-9 md:w-9 rounded-full p-0" onClick={() => setDate(d => addDays(d, 1))}>
            {isRtl ? <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" /> : <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />}
          </Button>

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
              <button className="p-1 md:p-1" onClick={() => setShowSearchInput(true)}>
                <Search className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
              </button>
            )}
          </div>

          <button
            className="p-0.5 md:p-1 shrink-0"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
              queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
              queryClient.invalidateQueries({ queryKey: ["/api/services"] });
              if (boardRef.current) {
                boardRef.current.scrollTop = 0;
              }
              toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
            }}
          >
            <RefreshCw className={cn("w-3.5 h-3.5 md:w-4.5 md:h-4.5 text-muted-foreground", loadingApps && "animate-spin")} />
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
          className="grid z-50 shrink-0 overflow-x-hidden bg-gradient-to-b from-rose-50 to-white dark:from-slate-800 dark:to-slate-850 border-b-2 border-rose-200 dark:border-slate-600"
          style={{ 
            gridTemplateColumns: `44px repeat(${staffList.length}, minmax(80px, 1fr))`,
          }}
        >
          <div className={cn("bg-rose-50/80 dark:bg-slate-900/80 py-1 px-0.5", isRtl ? "border-l border-rose-200 dark:border-slate-600" : "border-r border-rose-200 dark:border-slate-600")}></div>
          {staffList.map((s, staffIndex) => (
            <div 
              key={s.id} 
              className={cn("py-2 px-0.5 font-semibold text-center text-[10px]", isRtl ? "border-l border-rose-100 dark:border-slate-700" : "border-r border-rose-100 dark:border-slate-700")}
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
                <span className="text-slate-700 dark:text-slate-200 font-bold text-[10px] leading-tight break-words max-w-[80px] truncate">{s.name}</span>
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
        <div ref={boardRef} className={cn("flex-1 min-h-0 overflow-auto relative free-scroll planning-scroll bg-white dark:bg-slate-900", isMobile && "pb-24")}>
          <div 
            className="grid relative"
            style={{ 
              gridTemplateColumns: `44px repeat(${staffList.length}, minmax(80px, 1fr))`,
              gridAutoRows: '52px'
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
                    style={{ width: '44px' }}
                  >
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full liquid-gradient shadow-xl flex items-center justify-center border-2 border-white/50 live-indicator">
                        <Scissors className="w-4 h-4 text-white drop-shadow-md" />
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
              <div 
                className={cn(
                  "bg-rose-50 dark:bg-slate-800 border-b border-rose-100 dark:border-slate-700 px-0.5 py-1 text-[11px] font-bold text-rose-400 dark:text-slate-300 sticky z-30 flex items-center justify-center",
                  isRtl ? "right-0 border-l-2 border-l-rose-200 dark:border-l-slate-600" : "left-0 border-r-2 border-r-rose-200 dark:border-r-slate-600"
                )}
                style={{ gridColumn: 1, gridRow: rowNum }}
              >
                {hour}
              </div>

              {staffList.map((s, staffIndex) => {
                const colNum = staffIndex + 2; // +2 because column 1 is time labels
                const booking = getBooking(s.id, s.name, hour);
                // Only treat as covered if there's no booking starting at this exact slot
                const isCovered = !booking && isSlotCovered(s.id, s.name, hour);

                // For covered slots (no booking here), render empty cell with just borders
                if (isCovered) {
                  return (
                    <div
                      key={`${s.id}-${hour}-covered`}
                      className={cn("border-b border-rose-50 dark:border-slate-800 bg-transparent pointer-events-none", isRtl ? "border-l border-rose-100 dark:border-slate-700" : "border-r border-rose-100 dark:border-slate-700")}
                      style={{ gridColumn: colNum, gridRow: rowNum }}
                    />
                  );
                }

                const span = booking ? getBookingSpan(booking) : 1;

                const isDragOver = dragOverSlot?.staff === s.name && dragOverSlot?.time === hour;
                const isDragging = draggedAppointment?.id === booking?.id;
                const isConflicting = booking ? conflictingIds.has(booking.id) : false;

                if (booking) {
                  return (
                    <div
                      key={`${s.id}-${hour}`}
                      className="p-0.5 z-10"
                      style={{ 
                        gridColumn: colNum,
                        gridRow: `${rowNum} / span ${span}`
                      }}
                    >
                      <div 
                        className={cn(
                          "appointment-card h-full text-white cursor-grab active:cursor-grabbing relative rounded-md shadow-md",
                          span === 1 ? "flex items-center gap-1 px-1.5 py-0.5" : span <= 2 ? "flex flex-col px-1.5 py-1" : "flex flex-col px-2 py-1.5",
                          isDragging && "opacity-50 scale-95",
                          isConflicting && "ring-2 ring-amber-400 ring-inset"
                        )}
                        style={{ 
                          background: `linear-gradient(135deg, ${s.color}ee, ${s.color}cc)`,
                          cursor: canEdit ? 'grab' : 'default'
                        }}
                        draggable={canEdit}
                        onDragStart={(e) => handleDragStart(e, booking)}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => handleAppointmentClick(e, booking)}
                      >
                        <div className="water-shimmer absolute inset-0 opacity-30" />
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
                            <span 
                              className="relative w-6 h-6 flex items-center justify-center shrink-0" 
                              role="status"
                              aria-label={t("common.paid")}
                              data-testid={`status-paid-${booking.id}`}
                            >
                              <CreditCard className="w-5 h-5 text-green-400" />
                              <Check className="w-2.5 h-2.5 text-green-400 absolute -top-0.5 -right-0.5 stroke-[3]" />
                            </span>
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

                          return span === 1 ? (
                            <div className="relative z-10 flex items-center w-full gap-1 min-w-0 pointer-events-auto">
                              <span className="text-[10px] font-bold bg-white/25 px-1 py-0.5 rounded shrink-0 tabular-nums">{booking.total}</span>
                              <span className="text-[9px] opacity-90 shrink-0">{booking.startTime}</span>
                              <span className="text-[9px] opacity-70 shrink-0">{booking.duration}′</span>
                              <span className="shrink-0" style={{ marginInlineStart: 'auto' }}>{paidButton}</span>
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
                              <div className="relative shrink-0 pointer-events-auto mt-auto" style={{ direction: 'ltr' }}>
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[11px] font-bold bg-white/25 px-1 py-0.5 rounded tabular-nums shrink-0">{booking.total}</span>
                                  <span className="text-[10px] opacity-80 shrink-0">{booking.startTime}</span>
                                  <span className="text-[10px] opacity-80 shrink-0">{booking.duration}′</span>
                                  <span className="shrink-0 ml-auto">{paidButton}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${s.id}-${hour}`}
                    className={cn(
                      "border-b border-rose-50 dark:border-slate-800 min-h-[52px] transition-colors duration-150",
                      isRtl ? "border-l border-rose-100 dark:border-slate-700" : "border-r border-rose-100 dark:border-slate-700",
                      "hover:bg-rose-50/80 dark:hover:bg-slate-700/50 cursor-pointer",
                      isDragOver && "bg-rose-100 dark:bg-slate-700 ring-2 ring-primary/40 ring-inset",
                      hourIndex % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-rose-50/30 dark:bg-slate-800/50"
                    )}
                    style={{ 
                      gridColumn: colNum,
                      gridRow: rowNum
                    }}
                    onDragOver={(e) => handleDragOver(e, s.name, hour)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, s.name, hour)}
                    onClick={() => handleSlotClick(s.name, hour)}
                  />
                );
              })}
            </React.Fragment>
          );})}
          </div>
        </div>
      </div>

      {/* Appointment Dialog - iOS Liquid Glass */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsDialogOpen(false);
          // Delay state reset so close animation finishes without content flash
          setTimeout(() => {
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
          setIsDialogOpen(true);
        }
      }}>
        <DialogContent 
          className="w-[calc(100vw-16px)] max-w-[400px] max-h-[90dvh] p-0 border-0 rounded-2xl overflow-hidden animate-fade-in-scale flex flex-col liquid-glass-modal" 
          dir={isRtl ? "rtl" : "ltr"}
        >
          <Form {...form}>
            <form 
              onSubmit={form.handleSubmit(onSubmit)} 
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  const target = e.target as HTMLElement;
                  if (target.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    form.handleSubmit(onSubmit)();
                  }
                }
              }}
              className="flex flex-col flex-1 min-h-0"
            >
              {/* Header + Price merged row */}
              <div className="liquid-glass-header px-3 py-2.5 relative overflow-hidden shrink-0">
                <div className="liquid-glass-shimmer absolute inset-0" />
                <div className="liquid-glass-reflection absolute inset-0" />
                <div className="relative z-10 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-400 to-rose-400 flex items-center justify-center shadow-md shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                    {editingAppointment ? t("planning.editBooking") : t("planning.newBooking")}
                  </span>
                  {editingAppointment?.createdBy && (
                    <span className="text-[10px] text-slate-500 dark:text-white/60 truncate">
                      {editingAppointment.createdBy}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 ml-auto shrink-0">
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
                      className="w-20 h-9 text-lg font-bold border border-white/30 dark:border-white/10 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg text-center focus:ring-2 focus:ring-pink-400/50 focus:outline-none"
                      style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                    />
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">DH</span>
                    <FormField
                      control={form.control}
                      name="paid"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-1 space-y-0 px-2 py-1 rounded-lg bg-white/30 dark:bg-slate-800/30">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="w-3.5 h-3.5 accent-emerald-500 rounded"
                            />
                          </FormControl>
                          <FormLabel className="!mt-0 text-[10px] font-medium">{t("common.paid")}</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
              
              {/* Form body */}
              <div className="px-3 py-2 space-y-2 overflow-y-auto flex-1 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                                "w-full h-10 justify-between rounded-xl text-sm font-medium border border-border/60 bg-background shadow-sm hover:shadow transition-all",
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
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-9 rounded-lg text-[11px] border-0 bg-secondary/50">
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
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-9 rounded-lg text-[11px] border-0 bg-secondary/50">
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
                        <FormControl>
                          <Input type="number" inputMode="numeric" placeholder={t("common.duration")} className="h-9 rounded-lg text-[11px] border-0 bg-secondary/50" {...field} />
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
                  const client = clientName ? clients.find(c => c.name === clientName) : null;
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
                    <div className="flex flex-wrap gap-1 p-1.5 bg-secondary/30 rounded-lg">
                      {selectedServices.map((s, index) => (
                        <div key={s.id} className="flex items-center gap-1 px-2 py-1 bg-primary/10 dark:bg-primary/20 rounded-full text-[11px]">
                          <span className="font-medium truncate max-w-[80px]">{s.name}</span>
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
                    <div className="flex items-center justify-between gap-2 px-2 py-1 bg-primary/5 dark:bg-primary/10 rounded-lg text-[11px]">
                      <span className="text-muted-foreground">{selectedServices.length} {t("common.services")} / {selectedServices.reduce((sum, s) => sum + s.duration, 0)}min</span>
                      <span className="font-bold gradient-text">
                        {selectedServices.reduce((sum, s) => {
                          const inputVal = priceInputs[s.id];
                          const price = inputVal !== undefined ? (parseFloat(inputVal.replace(',', '.')) || 0) : s.price;
                          return sum + price;
                        }, 0)} DH
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
                              <Button variant="outline" role="combobox" className="h-10 w-full justify-between rounded-xl text-sm font-medium border border-dashed border-primary/40 bg-primary/5 dark:bg-primary/10 hover:bg-primary/10 dark:hover:bg-primary/15 transition-colors">
                                <span className="flex items-center gap-2 text-primary">
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
              <div className="flex gap-2 px-3 py-2 border-t border-white/10 shrink-0">
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
                  className="flex-1 h-10 text-sm font-semibold rounded-xl liquid-gradient shadow-md active:scale-[0.98]" 
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
                        disabled={markStaffPaidMutation.isPending}
                        onClick={() => markStaffPaidMutation.mutate({ staffId: walletStaffId!, staffName: walletPortalData.staffName, amount: Math.max(0, walletPortalData.walletBalance) })}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white text-sm font-semibold transition-all shadow-sm disabled:opacity-60"
                        data-testid="button-wallet-mark-paid"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {t("salaries.markAsPaid")} · {fmt(walletPortalData.walletBalance)}
                      </button>
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
