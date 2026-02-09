import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { format, addDays, startOfToday, parseISO, subDays } from "date-fns";
import { useTranslation } from "react-i18next";
import { useAppointments, useStaff, useServices, useCreateAppointment, useUpdateAppointment, useDeleteAppointment } from "@/hooks/use-salon-data";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import { CalendarIcon, ChevronLeft, ChevronRight, Plus, Trash2, Check, X, Search, Star, RefreshCw, Sparkles, CreditCard, Settings2, Scissors, Clock, User, ChevronsUpDown, ListTodo, Bell, UserCheck, Gift, Tag, AlertCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SpinningLogo } from "@/components/ui/spinning-logo";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertAppointmentSchema, insertStaffSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_HOURS = [
  "10:00","10:30","11:00","11:30","12:00","12:30",
  "13:00","13:30","14:00","14:30","15:00","15:30",
  "16:00","16:30","17:00","17:30","18:00","18:30",
  "19:00","19:30","20:00","20:30","21:00","21:30",
  "22:00","22:30","23:00","23:30","00:00","00:30",
  "01:00","01:30"
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
      // If no permissions set (empty array), allow full access (opt-in restriction model)
      if (permissions.length === 0) return true;
      return permissions.includes("edit_cardboard");
    } catch {
      return true; // Default to allowing edits if parsing fails
    }
  }, []);
  const [serviceSearch, setServiceSearch] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
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

  // Sync horizontal scroll between header and board
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const handleScroll = () => {
      if (headerRef.current) {
        headerRef.current.scrollLeft = board.scrollLeft;
      }
    };

    board.addEventListener('scroll', handleScroll, { passive: true });
    return () => board.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Detect user interaction (wheel/touch/pointer/keyboard) to pause auto-scroll
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    
    const markUserInteraction = () => {
      userScrollPauseRef.current = Date.now();
    };
    
    // Handle keyboard scroll (arrow keys, page up/down, home/end)
    const handleKeydown = (e: KeyboardEvent) => {
      const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
      if (scrollKeys.includes(e.key)) {
        markUserInteraction();
      }
    };
    
    // Listen for actual user input events on board AND window (for parent scrolls)
    board.addEventListener('wheel', markUserInteraction, { passive: true });
    board.addEventListener('touchstart', markUserInteraction, { passive: true });
    board.addEventListener('pointerdown', markUserInteraction, { passive: true });
    window.addEventListener('wheel', markUserInteraction, { passive: true });
    
    // Keyboard events on document for scroll keys
    document.addEventListener('keydown', handleKeydown);
    
    return () => {
      board.removeEventListener('wheel', markUserInteraction);
      board.removeEventListener('touchstart', markUserInteraction);
      board.removeEventListener('pointerdown', markUserInteraction);
      window.removeEventListener('wheel', markUserInteraction);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  // Track data loaded state
  const dataLoadedRef = useRef(false);
  const [isEditFavoritesOpen, setIsEditFavoritesOpen] = useState(false);
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
  const [servicePopoverOpen, setServicePopoverOpen] = useState(false);
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
  const [appointmentSearch, setAppointmentSearch] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);
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
  const [selectedPackage, setSelectedPackage] = useState<{id: number; name: string; discountedPrice: number; originalPrice: number} | null>(null);
  const [appliedLoyaltyPoints, setAppliedLoyaltyPoints] = useState<{clientId: number; points: number; discountAmount: number} | null>(null);
  const [appliedGiftCardBalance, setAppliedGiftCardBalance] = useState<{clientId: number; amount: number; discountAmount: number} | null>(null);
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const { toast } = useToast();

  const formattedDate = format(date, "yyyy-MM-dd");
  
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
  }>({
    queryKey: ["/api/business-settings"],
  });
  
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
  
  // INITIAL AUTO-SCROLL: Scroll once when all data loads (staff + business settings ready)
  const initialScrollDoneRef = useRef(false);
  
  // Check if business settings are loaded (opening/closing times are set)
  const hoursReady = Boolean(businessSettings?.openingTime) || Boolean(businessSettings?.closingTime);
  
  useEffect(() => {
    // Only scroll when: viewing today, data loaded, and haven't scrolled yet
    // Business settings may not be needed if default hours are used
    if (!isToday || initialScrollDoneRef.current || staffList.length === 0) return;
    
    // Track all timers for cleanup
    const timers: NodeJS.Timeout[] = [];
    let cancelled = false;
    
    const tryScroll = (attempt: number) => {
      if (cancelled || initialScrollDoneRef.current) return;
      
      // Check if live line element exists
      if (liveLineRef.current && boardRef.current) {
        initialScrollDoneRef.current = true;
        scrollToLiveLine(true, true); // smooth = true, force = true
      } else if (attempt < 5) {
        // Retry after a short delay if elements not ready
        const retryTimer = setTimeout(() => tryScroll(attempt + 1), 200);
        timers.push(retryTimer);
      }
    };
    
    // Start first attempt after initial delay
    const initialTimer = setTimeout(() => tryScroll(0), 300);
    timers.push(initialTimer);
    
    return () => {
      cancelled = true;
      timers.forEach(t => clearTimeout(t));
    };
  }, [isToday, staffList.length, scrollToLiveLine]);

  // FOLLOW LIVE LINE every 30 seconds when currentTime updates
  // This respects user interaction pause - won't scroll if user interacted in last 30s
  const isFirstRender = useRef(true);
  
  useEffect(() => {
    // Skip the first render (initial scroll handles that)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!isToday || !initialScrollDoneRef.current) return;
    scrollToLiveLine(true); // smooth animation, respects user pause
  }, [isToday, currentTime, scrollToLiveLine]);

  // Scroll when visibility changes (returning from background in PWA)
  useEffect(() => {
    let visibilityTimers: NodeJS.Timeout[] = [];
    let cancelled = false;
    
    const handleVisibility = () => {
      // Clear any pending timers from previous visibility changes
      visibilityTimers.forEach(t => clearTimeout(t));
      visibilityTimers = [];
      
      if (document.visibilityState === 'visible' && isToday) {
        // Reset user pause when returning to app - they expect to see current time
        userScrollPauseRef.current = 0;
        
        // Retry a few times to ensure live line is ready
        const tryScroll = (attempt: number) => {
          if (cancelled) return;
          if (liveLineRef.current && boardRef.current && isToday) {
            scrollToLiveLine(true, true); // smooth, force
          } else if (attempt < 3) {
            const timer = setTimeout(() => tryScroll(attempt + 1), 100);
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
  }, [isToday, scrollToLiveLine]);
  
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

  // Auto-redirect to login if session expired
  useEffect(() => {
    if (hasAuthError) {
      sessionStorage.clear();
      localStorage.removeItem("user_authenticated");
      localStorage.removeItem("current_user");
      window.location.href = "/";
    }
  }, [hasAuthError]);

  // Mark data as loaded when staff loads (used by initial scroll timing)
  useEffect(() => {
    if (staffList.length > 0 && !dataLoadedRef.current) {
      dataLoadedRef.current = true;
    }
  }, [staffList]);

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
      openAppointmentForEdit(targetApp);
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
  
  // Recalculate discounts when services change and a client with discounts is selected
  useEffect(() => {
    if (!isDialogOpen) return;
    
    const clientName = watchedClient;
    if (!clientName) return;
    
    const client = clients.find(c => c.name === clientName);
    if (!client) return;
    
    // Calculate base total - use package discounted price if a package is selected, otherwise sum of services
    const baseTotal = selectedPackage 
      ? selectedPackage.discountedPrice 
      : selectedServices.reduce((sum, s) => sum + s.price, 0);
    if (baseTotal <= 0) {
      // Reset discounts if no services
      if (appliedLoyaltyPoints) setAppliedLoyaltyPoints(null);
      if (appliedGiftCardBalance) setAppliedGiftCardBalance(null);
      return;
    }
    
    let runningTotal = baseTotal;
    let newLoyaltyPoints: typeof appliedLoyaltyPoints = null;
    let newGiftCardBalance: typeof appliedGiftCardBalance = null;
    
    // Apply loyalty points if enabled
    if (client.usePoints && client.loyaltyPoints > 0 && businessSettings?.loyaltyEnabled) {
      const pointsValue = businessSettings?.loyaltyPointsValue || 0.1;
      const maxDiscount = client.loyaltyPoints * pointsValue;
      const discountAmount = Math.min(maxDiscount, runningTotal);
      const pointsUsed = Math.ceil(discountAmount / pointsValue);
      
      if (discountAmount > 0) {
        newLoyaltyPoints = {
          clientId: client.id,
          points: pointsUsed,
          discountAmount
        };
        runningTotal = Math.max(0, runningTotal - discountAmount);
      }
    }
    
    // Apply gift card balance if enabled
    if (client.useGiftCardBalance && client.giftCardBalance > 0) {
      const discountAmount = Math.min(client.giftCardBalance, runningTotal);
      
      if (discountAmount > 0) {
        newGiftCardBalance = {
          clientId: client.id,
          amount: client.giftCardBalance,
          discountAmount
        };
        runningTotal = Math.max(0, runningTotal - discountAmount);
      }
    }
    
    // Update state if changed
    if (JSON.stringify(newLoyaltyPoints) !== JSON.stringify(appliedLoyaltyPoints)) {
      setAppliedLoyaltyPoints(newLoyaltyPoints);
    }
    if (JSON.stringify(newGiftCardBalance) !== JSON.stringify(appliedGiftCardBalance)) {
      setAppliedGiftCardBalance(newGiftCardBalance);
    }
    
    // Update the total state
    form.setValue("total", runningTotal);
    setTotalInputValue(String(runningTotal));
  }, [selectedServices, selectedPackage, isDialogOpen, clients, businessSettings, form, appliedLoyaltyPoints, appliedGiftCardBalance, watchedClient]);

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
    setSelectedServices(parsedServices);
    const newPriceInputs: Record<string, string> = {};
    parsedServices.forEach(s => {
      newPriceInputs[s.id] = String(s.price);
    });
    setPriceInputs(newPriceInputs);
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
    });
    setEditingAppointment(app);
    setIsDialogOpen(true);
  };

  const handleSlotClick = (staffName: string, time: string) => {
    if (!canEditCardboard) return;
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
    setEditingAppointment(null);
    setIsDialogOpen(true);
  };

  const handleAppointmentClick = (e: React.MouseEvent, app: any) => {
    e.stopPropagation();
    if (!canEditCardboard) return;
    openAppointmentForEdit(app);
  };

  const onSubmit = async (data: AppointmentFormValues) => {
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
    };

    if (editingAppointment) {
      updateMutation.mutate({ id: editingAppointment.id, ...submitData });
    } else {
      const currentUser = sessionStorage.getItem("current_user") || "Unknown";
      createMutation.mutate({ ...submitData, createdBy: currentUser });
      playSuccessSound();
    }
    
    // Deduct gift card balance from client if applied
    if (appliedGiftCardBalance && appliedGiftCardBalance.discountAmount > 0) {
      try {
        await apiRequest("PATCH", `/api/clients/${appliedGiftCardBalance.clientId}/gift-card-balance`, {
          amount: -appliedGiftCardBalance.discountAmount
        });
        // Also disable useGiftCardBalance after using it
        await apiRequest("PATCH", `/api/clients/${appliedGiftCardBalance.clientId}/use-gift-card-balance`, {
          useGiftCardBalance: false
        });
        queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      } catch (e) {
        console.error("Gift card balance deduction failed:", e);
      }
    }
    
    // Deduct loyalty points if applied
    if (appliedLoyaltyPoints && appliedLoyaltyPoints.points > 0) {
      try {
        // Create a loyalty redemption record which also deducts the points
        await apiRequest("POST", "/api/loyalty-redemptions", {
          clientId: appliedLoyaltyPoints.clientId,
          pointsUsed: appliedLoyaltyPoints.points,
          rewardDescription: `Réduction automatique: -${Number(appliedLoyaltyPoints.discountAmount ?? 0).toFixed(2)} DH`,
          date: format(date, "yyyy-MM-dd")
        });
        // Also disable usePoints after using them
        await apiRequest("PATCH", `/api/clients/${appliedLoyaltyPoints.clientId}/use-points`, {
          usePoints: false
        });
        queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
        queryClient.invalidateQueries({ queryKey: ["/api/loyalty-redemptions"] });
      } catch (e) {
        console.error("Loyalty points deduction failed:", e);
      }
    }
    
    setSelectedServices([]);
    setPriceInputs({});
    setSelectedPackage(null);
    setAppliedLoyaltyPoints(null);
    setAppliedGiftCardBalance(null);
    setIsDialogOpen(false);
  };

  const handleAddService = (service: {name: string, price: number, duration: number}) => {
    const serviceId = `svc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newService = {
      ...service,
      id: serviceId
    };
    const updated = [...selectedServices, newService];
    setSelectedServices(updated);
    setSelectedPackage(null); // Clear package when adding individual services
    setPriceInputs(prev => ({ ...prev, [serviceId]: String(service.price) }));
    const totalDuration = updated.reduce((sum, s) => sum + s.duration, 0);
    const totalPrice = updated.reduce((sum, s) => sum + s.price, 0);
    form.setValue("service", updated.map(s => s.name).join(', '));
    form.setValue("duration", totalDuration);
    form.setValue("price", totalPrice);
    form.setValue("total", totalPrice);
    setTotalInputValue(String(totalPrice));
  };

  const handleRemoveService = (index: number) => {
    const removedService = selectedServices[index];
    const updated = selectedServices.filter((_, i) => i !== index);
    setSelectedServices(updated);
    setSelectedPackage(null);
    if (removedService) {
      setPriceInputs(prev => {
        const { [removedService.id]: _, ...rest } = prev;
        return rest;
      });
    }
    const totalDuration = updated.reduce((sum, s) => sum + s.duration, 0);
    const totalPrice = updated.reduce((sum, s) => sum + s.price, 0);
    form.setValue("service", updated.map(s => s.name).join(', '));
    form.setValue("duration", totalDuration);
    form.setValue("price", totalPrice);
    form.setValue("total", totalPrice);
    setTotalInputValue(String(totalPrice));
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
    form.setValue("total", pkg.discountedPrice);
    setTotalInputValue(String(pkg.discountedPrice));
  };

  const handleClearPackage = () => {
    setSelectedPackage(null);
    setSelectedServices([]);
    setPriceInputs({});
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
    console.log('Price change:', serviceId, value, '->', newPrice);
    
    setPriceInputs(prev => ({ ...prev, [serviceId]: value }));
    
    setSelectedServices(prev => {
      const updated = prev.map(s => 
        s.id === serviceId ? { ...s, price: newPrice } : s
      );
      // Update form totals
      const totalPrice = updated.reduce((sum, s) => sum + s.price, 0);
      form.setValue("price", totalPrice);
      form.setValue("total", totalPrice);
      console.log('Updated services:', JSON.stringify(updated.map(s => ({ name: s.name, price: s.price }))));
      return updated;
    });
  };

  const handleServiceChange = (serviceName: string) => {
    const service = services.find(s => s.name === serviceName);
    if (service) {
      handleAddService({ name: service.name, price: service.price, duration: service.duration });
    }
  };

  const handleMarkAsPaid = async (e: React.MouseEvent, app: any) => {
    e.stopPropagation();
    
    // Check if this is a temporary appointment that hasn't synced yet
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
      await apiRequest("PUT", `/api/appointments/${appId}`, {
        ...app,
        paid: true,
        updatedAt: new Date().toISOString(),
        _store: 'appointments',
        _offlineUpdatedAt: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      toast({ title: t("planning.paymentConfirmed"), description: t("planning.paymentConfirmedDesc") });
    } catch (error) {
      console.error("Payment error:", error);
      toast({ title: t("common.error"), description: t("planning.paymentError"), variant: "destructive" });
    }
  };

  const handleDragStart = (e: React.DragEvent, appointment: any) => {
    if (!canEditCardboard) {
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
    
    if (!canEditCardboard || !draggedAppointment) return;
    
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
      {/* Header - iOS Liquid Glass Style */}
      <div className="mb-2 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 shrink-0">
        <h1 className="text-xl md:text-2xl font-semibold gradient-text">{t("planning.title")}</h1>
        
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 w-full md:w-auto">
          {/* Staff Revenue - Glass Pills */}
          <div className="grid grid-cols-2 md:flex md:flex-wrap items-stretch md:items-center gap-1.5 w-full md:w-auto">
            {stats.perStaff.map(s => (
              <div key={s.id} className="glass-card px-3 py-2 text-xs flex items-center justify-between gap-1.5 hover:scale-[1.02] transition-transform min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full shadow-sm shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="font-medium text-foreground/80 truncate">{s.name}</span>
                </div>
                <span className="font-bold text-foreground whitespace-nowrap">{s.total} DH</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Total - Liquid Gradient */}
          <div className="liquid-gradient text-white px-4 py-2 rounded-2xl text-sm font-bold shadow-lg hover:shadow-xl transition-shadow whitespace-nowrap">
            {stats.total} DH
          </div>

          {/* Search with Price - Glass Style */}
          <div className="relative shrink-0">
            <div className="flex items-center gap-1 glass-card px-2 py-1">
              {showSearchInput ? (
                <>
                  <Input
                    type="text"
                    placeholder={t("common.search") + "..."}
                    value={appointmentSearch}
                    onChange={(e) => setAppointmentSearch(e.target.value)}
                    className="h-7 w-32 md:w-40 text-xs border-0 bg-transparent focus-visible:ring-0"
                    autoFocus
                  />
                  {appointmentSearch && searchResults.count > 0 && (
                    <div className="bg-emerald-500/90 text-white px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">
                      {searchResults.count} = {searchResults.total} DH
                    </div>
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 rounded-full hover:bg-muted/50"
                    onClick={() => {
                      setShowSearchInput(false);
                      setAppointmentSearch("");
                    }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </>
              ) : (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 rounded-full hover:bg-muted/50"
                  onClick={() => setShowSearchInput(true)}
                >
                  <Search className="w-4 h-4" />
                </Button>
              )}
            </div>
            {/* Search Results Dropdown - Glass Panel */}
            {showSearchInput && appointmentSearch && searchResults.count > 0 && (
              <div className="absolute top-full mt-2 ltr:right-0 rtl:left-0 z-50 w-72 md:w-80 glass-card rounded-2xl max-h-64 overflow-auto shadow-xl">
                <div className="p-2 border-b bg-muted/50 sticky top-0">
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
                        setDate(parseISO(app.date));
                        openAppointmentForEdit(app);
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
                            {format(parseISO(app.date), "dd/MM")} • {app.startTime} • {app.staff}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="p-2.5 bg-emerald-500/90 text-white sticky bottom-0 rounded-b-2xl">
                  <div className="flex justify-between items-center text-sm font-bold">
                    <span>Total</span>
                    <span>{searchResults.total} DH</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          </div>

          {/* Date Navigation - Glass Pills */}
          <div className="flex items-center gap-1 glass-card px-2 py-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-muted/50" onClick={() => setDate(d => addDays(d, -1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" className="h-7 px-3 text-xs rounded-full hover:bg-muted/50">
                  <CalendarIcon className="w-3 h-3 ml-1" />
                  {format(date, "dd/MM")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-2xl glass-card shadow-xl" align="end">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-muted/50" onClick={() => setDate(d => addDays(d, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button 
              variant={isToday ? "ghost" : "default"}
              size="sm" 
              className={cn(
                "h-7 px-3 text-xs font-semibold rounded-full transition-all",
                !isToday && "liquid-gradient text-white shadow-md hover:shadow-lg",
                isToday && "hover:bg-muted/50"
              )}
              onClick={() => setDate(getWorkDayDate(businessSettings?.openingTime, businessSettings?.closingTime))}
            >
              {t("common.today")}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 rounded-full hover:bg-muted/50"
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
              <RefreshCw className={cn("w-3 h-3", loadingApps && "animate-spin")} />
            </Button>
          </div>

          {isNonWorkingDay && (
            <div className="glass-card px-3 py-1.5 flex items-center gap-2 text-sky-600 dark:text-sky-400">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs font-medium">{t("planning.nonWorkingDay", "Off Day")}</span>
            </div>
          )}

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
                        entry.status === "notified" && "bg-blue-100 text-blue-700",
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

      {/* Board with sticky header - Glass Container */}
      <div className="flex-1 min-h-0 flex flex-col glass-card rounded-3xl overflow-hidden" dir={isRtl ? "rtl" : "ltr"}>
        {/* Sticky Staff Headers - iOS Liquid Glass Style */}
        <div 
          ref={headerRef}
          className="grid glass border-b border-white/20 dark:border-white/5 z-50 shrink-0 overflow-x-hidden"
          style={{ 
            gridTemplateColumns: `60px repeat(${staffList.length}, minmax(100px, 1fr))`,
          }}
        >
          <div className={cn("bg-white/30 dark:bg-white/5 py-2 px-1", isRtl ? "border-l border-white/20 dark:border-white/5" : "border-r border-white/20 dark:border-white/5")}></div>
          {staffList.map((s, staffIndex) => (
            <div 
              key={s.id} 
              className={cn("py-2 px-1 font-semibold text-center text-xs", isRtl ? "border-l border-white/10 dark:border-white/5" : "border-r border-white/10 dark:border-white/5")}
            >
              <div className="flex flex-col items-center justify-center gap-1.5">
                {s.photoUrl ? (
                  <div className="relative">
                    <img 
                      src={s.photoUrl} 
                      alt={s.name}
                      className="w-16 h-16 rounded-full object-cover border-2 shadow-sm"
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
                    className="w-16 h-16 rounded-full shadow-sm flex items-center justify-center text-white font-bold text-lg border-2" 
                    style={{ backgroundColor: s.color, borderColor: s.color }}
                  >
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-foreground/90 font-bold text-[11px] leading-tight break-words max-w-[90px]">{s.name}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable content */}
        <div ref={boardRef} className="flex-1 min-h-0 overflow-auto relative free-scroll planning-scroll bg-white/80 dark:bg-slate-900/80">
          <div 
            className="grid relative"
            style={{ 
              gridTemplateColumns: `60px repeat(${staffList.length}, minmax(100px, 1fr))`,
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
                    style={{ width: '60px' }}
                  >
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full liquid-gradient shadow-xl flex items-center justify-center border-2 border-white/50 live-indicator">
                        <Scissors className="w-5 h-5 text-white drop-shadow-md" />
                      </div>
                      <div className="absolute -inset-1 rounded-full liquid-gradient blur-lg opacity-40 animate-pulse" />
                    </div>
                  </div>
                  {/* Thick glowing line - Liquid gradient */}
                  <div className="flex-1 relative">
                    <div 
                      className="h-1 rounded-full shadow-lg"
                      style={{
                        background: 'linear-gradient(to right, hsl(211, 100%, 50%), hsl(187, 100%, 50%), hsl(163, 100%, 45%))',
                        boxShadow: '0 0 16px rgba(59, 130, 246, 0.5), 0 0 32px rgba(59, 130, 246, 0.25)',
                      }}
                    />
                    <div 
                      className="absolute inset-0 h-1 rounded-full opacity-50 blur-sm"
                      style={{
                        background: 'linear-gradient(to right, hsl(211, 100%, 50%), hsl(187, 100%, 50%))',
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
                  "bg-white/60 dark:bg-slate-800/60 border-b border-slate-200/50 dark:border-slate-700/50 px-2 py-1 text-sm font-medium text-slate-500 dark:text-slate-400 sticky z-30 flex items-center justify-center",
                  isRtl ? "right-0 border-l border-primary/20" : "left-0 border-r border-primary/20"
                )}
                style={{ gridColumn: 1, gridRow: rowNum }}
              >
                {hour}
              </div>

              {staffList.map((s, staffIndex) => {
                const colNum = staffIndex + 2; // +2 because column 1 is time labels
                const booking = getBooking(s.id, s.name, hour);
                const isCovered = isSlotCovered(s.id, s.name, hour);

                // For covered slots, render empty cell with just borders
                if (isCovered) {
                  return (
                    <div
                      key={`${s.id}-${hour}-covered`}
                      className={cn("border-b border-slate-100/50 dark:border-slate-800/50 min-h-[60px] bg-transparent", isRtl ? "border-l border-slate-100/50 dark:border-slate-800/50" : "border-r border-slate-100/50 dark:border-slate-800/50")}
                      style={{ gridColumn: colNum, gridRow: rowNum }}
                    />
                  );
                }

                const span = booking ? getBookingSpan(booking) : 1;

                const isDragOver = dragOverSlot?.staff === s.name && dragOverSlot?.time === hour;
                const isDragging = draggedAppointment?.id === booking?.id;

                if (booking) {
                  return (
                    <div
                      key={`${s.id}-${hour}`}
                      className="p-1 z-10"
                      style={{ 
                        gridColumn: colNum,
                        gridRow: `${rowNum} / span ${span}`
                      }}
                    >
                      <div 
                        className={cn(
                          "appointment-card h-full px-2 text-white cursor-grab active:cursor-grabbing relative overflow-hidden rounded-lg shadow-lg",
                          span === 1 ? "flex items-center gap-2 py-1" : "flex flex-col py-1.5",
                          isDragging && "opacity-50 scale-95"
                        )}
                        style={{ 
                          background: `linear-gradient(135deg, ${s.color}ee, ${s.color}cc)`,
                          cursor: canEditCardboard ? 'grab' : 'default'
                        }}
                        draggable={canEditCardboard}
                        onDragStart={(e) => handleDragStart(e, booking)}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => handleAppointmentClick(e, booking)}
                      >
                        <div className="water-shimmer absolute inset-0 opacity-30" />
                        {span === 1 ? (
                          /* Compact single-row layout for 30min appointments */
                          <div className="relative z-10 flex items-center w-full gap-1 min-w-0 pointer-events-auto">
                            {booking.paid ? (
                              <span 
                                className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shrink-0" 
                                role="status"
                                aria-label={t("common.paid")}
                              >
                                <Check className="w-2.5 h-2.5 text-white" />
                              </span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleMarkAsPaid(e, booking);
                                }}
                                className="w-5 h-5 bg-white/30 hover:bg-white/50 rounded-full flex items-center justify-center transition-colors shrink-0 relative z-20"
                                aria-label={t("planning.markAsPaid")}
                              >
                                <CreditCard className="w-2.5 h-2.5" />
                              </button>
                            )}
                            <span className="text-[10px] opacity-90 shrink-0">{booking.startTime}</span>
                            <span className="font-medium text-[11px] truncate flex-1 min-w-0" title={`${booking.service}${booking.client ? ` - ${booking.client}` : ''}`}>
                              {booking.service}
                            </span>
                            <span className="text-[10px] font-bold bg-white/20 px-1 py-0.5 rounded shrink-0">{booking.total}</span>
                          </div>
                        ) : (
                          /* Multi-row layout for longer appointments */
                          <div className="relative z-10 flex flex-col justify-between h-full w-full">
                            <div className="min-w-0 flex-1 flex flex-col justify-center">
                              <div 
                                className="font-semibold text-xs leading-tight line-clamp-2" 
                                title={booking.service}
                              >
                                {booking.service}
                              </div>
                              {booking.client && (
                                <div className="text-[10px] opacity-90 truncate mt-0.5" title={booking.client}>
                                  {booking.client}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 mt-1 pointer-events-auto">
                              {booking.paid ? (
                                <span 
                                  className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shrink-0" 
                                  role="status"
                                  aria-label={t("common.paid")}
                                >
                                  <Check className="w-2.5 h-2.5 text-white" />
                                </span>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    handleMarkAsPaid(e, booking);
                                  }}
                                  className="w-5 h-5 bg-white/30 hover:bg-white/50 rounded-full flex items-center justify-center transition-colors shrink-0 relative z-20"
                                  aria-label={t("planning.markAsPaid")}
                                >
                                  <CreditCard className="w-2.5 h-2.5" />
                                </button>
                              )}
                              <span className="text-[10px] opacity-80 shrink-0">{booking.duration}′</span>
                              <span className="text-[10px] opacity-90 shrink-0">{booking.startTime}</span>
                              <span className="text-[10px] font-bold bg-white/20 px-1 py-0.5 rounded shrink-0 ml-auto">{booking.total}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${s.id}-${hour}`}
                    className={cn(
                      "border-b border-slate-100/50 dark:border-slate-800/50 min-h-[60px] transition-all duration-300 bg-transparent",
                      isRtl ? "border-l border-slate-100/50 dark:border-slate-800/50" : "border-r border-slate-100/50 dark:border-slate-800/50",
                      "hover:bg-primary/5 dark:hover:bg-primary/10 cursor-pointer",
                      isDragOver && "bg-primary/10 dark:bg-primary/20 ring-2 ring-primary/50 ring-inset"
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
        setIsDialogOpen(open);
        if (!open) {
          setIsEditFavoritesOpen(false);
          setSelectedServices([]);
          setPriceInputs({});
          setSelectedPackage(null);
        }
      }}>
        <DialogContent 
          className="w-[calc(100vw-24px)] max-w-[420px] max-h-[90vh] p-0 border-0 rounded-3xl overflow-hidden animate-fade-in-scale flex flex-col liquid-glass-modal" 
          dir={isRtl ? "rtl" : "ltr"}
        >
          {/* iOS 26 Liquid Glass Header */}
          <div className="liquid-glass-header px-5 py-4 relative overflow-hidden shrink-0">
            <div className="liquid-glass-shimmer absolute inset-0" />
            <div className="liquid-glass-reflection absolute inset-0" />
            <DialogHeader className="relative z-10">
              <DialogTitle className="text-lg font-semibold flex items-center gap-2 text-slate-800 dark:text-white">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center shadow-lg">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                {editingAppointment ? t("planning.editBooking") : t("planning.newBooking")}
              </DialogTitle>
              {editingAppointment?.createdBy && (
                <p className="text-xs text-slate-600 dark:text-white/70 mt-1">
                  {t("planning.createdBy")}: <span className="font-medium text-slate-800 dark:text-white">{editingAppointment.createdBy}</span>
                </p>
              )}
            </DialogHeader>
          </div>
          
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
              className="p-5 space-y-4 overflow-y-auto flex-1"
            >
              
              {/* Price Row - iOS 26 Liquid Glass Style */}
              <div className="flex items-center gap-3 liquid-glass-field rounded-2xl p-4">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={totalInputValue}
                    onChange={(e) => {
                      setTotalInputValue(e.target.value);
                      form.setValue("total", parseFloat(e.target.value) || 0);
                    }}
                    placeholder="0"
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.target.select()}
                    className="w-full text-2xl h-12 font-bold border border-white/30 dark:border-white/10 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl text-center shadow-inner focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400/50 focus:outline-none transition-all"
                    style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                  />
                </div>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">DH</span>
                <FormField
                  control={form.control}
                  name="paid"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0 liquid-glass-chip rounded-xl px-3 py-2">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="w-4 h-4 accent-emerald-500 rounded"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0 text-xs font-medium">{t("common.paid")}</FormLabel>
                    </FormItem>
                  )}
                />
              </div>

              {/* Compact Fields - Glass Style */}
              <div className="grid grid-cols-3 gap-2.5">
                <FormField
                  control={form.control}
                  name="client"
                  render={({ field }) => (
                    <FormItem className="col-span-3 space-y-0">
                      <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={clientPopoverOpen}
                              className={cn(
                                "w-full h-11 justify-between rounded-xl text-sm border-0 bg-secondary/50 hover:bg-secondary/70 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-primary/30 transition-all",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              <span className="flex items-center gap-2 truncate">
                                <User className="w-4 h-4 shrink-0 opacity-50" />
                                {field.value || t("planning.client")}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0 rounded-2xl glass-card shadow-xl" align="start">
                          <Command>
                            <CommandInput placeholder={t("planning.searchClient")} />
                            <CommandList>
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
                                      
                                      // Get current total for calculations
                                      let runningTotal = parseFloat(totalInputValue || "0");
                                      
                                      // Auto-apply loyalty points if client has usePoints enabled
                                      if (client.usePoints && client.loyaltyPoints > 0 && businessSettings?.loyaltyEnabled) {
                                        const pointsValue = businessSettings?.loyaltyPointsValue || 0.1;
                                        const maxDiscount = client.loyaltyPoints * pointsValue;
                                        const discountAmount = Math.min(maxDiscount, runningTotal);
                                        const pointsUsed = Math.ceil(discountAmount / pointsValue);
                                        
                                        if (discountAmount > 0) {
                                          setAppliedLoyaltyPoints({
                                            clientId: client.id,
                                            points: pointsUsed,
                                            discountAmount
                                          });
                                          runningTotal = Math.max(0, runningTotal - discountAmount);
                                          setTotalInputValue(String(runningTotal));
                                          form.setValue("total", runningTotal);
                                          toast({ title: t("clients.pointsApplied", "Loyalty points applied!") + ` -${discountAmount.toFixed(2)} DH` });
                                        }
                                      } else {
                                        setAppliedLoyaltyPoints(null);
                                      }
                                      
                                      // Auto-apply gift card balance if client has useGiftCardBalance enabled
                                      if (client.useGiftCardBalance && client.giftCardBalance > 0) {
                                        const discountAmount = Math.min(client.giftCardBalance, runningTotal);
                                        
                                        if (discountAmount > 0) {
                                          setAppliedGiftCardBalance({
                                            clientId: client.id,
                                            amount: client.giftCardBalance,
                                            discountAmount
                                          });
                                          runningTotal = Math.max(0, runningTotal - discountAmount);
                                          setTotalInputValue(String(runningTotal));
                                          form.setValue("total", runningTotal);
                                          toast({ title: t("giftCard.balanceApplied", "Gift card balance applied!") + ` -${discountAmount.toFixed(2)} DH` });
                                        }
                                      } else {
                                        setAppliedGiftCardBalance(null);
                                      }
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === client.name ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex flex-col">
                                      <span>{client.name}</span>
                                      {client.phone && (
                                        <span className="text-xs text-muted-foreground">{client.phone}</span>
                                      )}
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

                <FormField
                  control={form.control}
                  name="staff"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 rounded-xl text-xs border-0 bg-secondary/50">
                            <SelectValue placeholder={t("planning.staff")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-2xl glass-card shadow-xl">
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
                          <SelectTrigger className="h-11 rounded-xl text-xs border-0 bg-secondary/50">
                            <SelectValue placeholder={t("planning.time")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60 rounded-2xl glass-card shadow-xl">
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
                        <Input type="number" inputMode="numeric" placeholder={t("common.duration")} className="h-11 rounded-xl text-xs border-0 bg-secondary/50" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Packages Section - Dropdown */}
                {activePackages.length > 0 && (
                  <div className="col-span-3 space-y-2">
                    <Label className="flex items-center gap-2 text-xs font-medium">
                      <Gift className="w-3.5 h-3.5 text-primary" />
                      {t("booking.packages", { defaultValue: "Forfaits" })}
                    </Label>
                    <Select
                      value={selectedPackage?.id?.toString() || ""}
                      onValueChange={(value) => {
                        if (value === "none") {
                          handleClearPackage();
                        } else {
                          const pkg = activePackages.find(p => p.id.toString() === value);
                          if (pkg) handleSelectPackage(pkg);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full h-10 rounded-xl border-border/50 bg-background/50">
                        <SelectValue placeholder={t("booking.selectPackage", { defaultValue: "Sélectionner un forfait" })} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="text-muted-foreground">{t("booking.noPackage", { defaultValue: "Aucun forfait" })}</span>
                        </SelectItem>
                        {activePackages.map(pkg => {
                          const savings = pkg.originalPrice - pkg.discountedPrice;
                          const savingsPercent = pkg.originalPrice > 0 ? Math.round((savings / pkg.originalPrice) * 100) : 0;
                          return (
                            <SelectItem key={pkg.id} value={pkg.id.toString()}>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{pkg.name}</span>
                                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-bold">
                                  -{savingsPercent}%
                                </span>
                                <span className="text-primary font-bold">{pkg.discountedPrice} DH</span>
                                <span className="text-xs text-muted-foreground line-through">{pkg.originalPrice}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Applied Gift Card Balance */}
                {appliedGiftCardBalance && (
                  <div className="col-span-3 space-y-2">
                    <Label className="flex items-center gap-2 text-xs font-medium">
                      <Gift className="w-3.5 h-3.5 text-green-500" />
                      {t("giftCard.balanceDiscount", "Solde Carte Cadeau")}
                    </Label>
                    <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                      <div className="flex items-center gap-2">
                        <Gift className="w-4 h-4 text-green-600" />
                        <span className="font-medium text-sm">{Number(appliedGiftCardBalance.amount ?? 0).toFixed(2)} DH</span>
                        <span className="text-green-600 font-bold">-{Number(appliedGiftCardBalance.discountAmount ?? 0).toFixed(2)} DH</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleClearGiftCardBalance}
                        className="h-7 text-xs text-destructive hover:text-destructive"
                      >
                        <X className="w-3 h-3 mr-1" />
                        {t("common.remove", "Retirer")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Applied Loyalty Points */}
                {appliedLoyaltyPoints && (
                  <div className="col-span-3 space-y-2">
                    <Label className="flex items-center gap-2 text-xs font-medium">
                      <Star className="w-3.5 h-3.5 text-yellow-500" />
                      {t("clients.loyaltyPointsDiscount", "Points de fidélité")}
                    </Label>
                    <div className="flex items-center justify-between p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-yellow-600" />
                        <span className="font-medium text-sm">{appliedLoyaltyPoints.points} {t("clients.points", "points")}</span>
                        <span className="text-yellow-600 font-bold">-{Number(appliedLoyaltyPoints.discountAmount ?? 0).toFixed(2)} DH</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const currentTotal = parseFloat(totalInputValue || "0");
                          const newTotal = currentTotal + appliedLoyaltyPoints.discountAmount;
                          setTotalInputValue(String(newTotal));
                          form.setValue("total", newTotal);
                          setAppliedLoyaltyPoints(null);
                        }}
                        className="h-7 text-xs text-destructive hover:text-destructive"
                      >
                        <X className="w-3 h-3 mr-1" />
                        {t("common.remove", "Retirer")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Service - Multi-select with Pills */}
                <div className="col-span-3 space-y-2">
                  {/* Selected Services Pills */}
                  {selectedServices.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-2 bg-secondary/30 rounded-xl">
                      {selectedServices.map((s, index) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/10 dark:bg-primary/20 rounded-full text-xs"
                        >
                          <span className="font-medium">{s.name}</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            id={`price-input-${s.id}`}
                            defaultValue={s.price}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={(e) => e.target.select()}
                            className="w-20 h-7 px-2 text-sm text-center font-bold rounded-lg border-2 border-primary/50 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none"
                            style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                          />
                          <span className="text-muted-foreground text-[10px]">DH</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveService(index)}
                            className="w-4 h-4 rounded-full bg-destructive/20 hover:bg-destructive/40 flex items-center justify-center transition-colors"
                          >
                            <X className="w-2.5 h-2.5 text-destructive" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Summary Row */}
                  {selectedServices.length > 0 && (
                    <div className="flex items-center justify-between px-3 py-2 bg-primary/5 dark:bg-primary/10 rounded-xl text-xs">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{selectedServices.length} {t("common.services")}</span>
                        <span className="font-medium">{selectedServices.reduce((sum, s) => sum + s.duration, 0)}′</span>
                      </div>
                      <span className="font-bold gradient-text">
                        {selectedServices.reduce((sum, s) => {
                          const inputVal = priceInputs[s.id];
                          const price = inputVal !== undefined ? (parseFloat(inputVal.replace(',', '.')) || 0) : s.price;
                          return sum + price;
                        }, 0)} DH
                      </span>
                    </div>
                  )}

                  {/* Add Service Popover */}
                  <FormField
                    control={form.control}
                    name="service"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <Popover open={servicePopoverOpen} onOpenChange={setServicePopoverOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="h-11 w-full justify-between rounded-xl text-xs border-0 bg-secondary/50 hover:bg-secondary/70 transition-colors"
                              >
                                <span className="flex items-center gap-2">
                                  <Plus className="w-4 h-4" />
                                  {t("planning.addService")}
                                </span>
                                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent 
                            className="w-[calc(100vw-48px)] max-w-[396px] p-0 rounded-2xl glass-card shadow-2xl" 
                            align="center" 
                            side="top" 
                            sideOffset={4}
                            onWheel={(e) => e.stopPropagation()}
                          >
                            <div className="p-3 border-b border-white/20 liquid-gradient-subtle rounded-t-2xl">
                              <Input
                                placeholder={t("planning.searchService")}
                                value={serviceSearch}
                                onChange={(e) => setServiceSearch(e.target.value)}
                                className="h-10 text-sm rounded-xl border-0 bg-white/80 dark:bg-slate-800/80"
                              />
                            </div>
                            <div 
                              className="max-h-[200px] overflow-y-auto p-2"
                              style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
                              onWheel={(e) => {
                                e.stopPropagation();
                                const target = e.currentTarget;
                                target.scrollTop += e.deltaY;
                              }}
                              onTouchMove={(e) => e.stopPropagation()}
                            >
                              {Object.entries(groupedServices).map(([category, categoryServices]) => (
                                <div key={category}>
                                  <div className="px-2 py-1.5 text-[10px] font-bold gradient-text uppercase glass-subtle rounded-lg mb-1 sticky top-0">
                                    {category}
                                  </div>
                                  {categoryServices.map(s => (
                                    <div
                                      key={s.id}
                                      className={cn(
                                        "flex items-center justify-between p-3 rounded-xl cursor-pointer text-sm mb-1 transition-all",
                                        "hover:bg-primary/5 dark:hover:bg-primary/10",
                                        selectedServices.some(sel => sel.name === s.name) && "bg-primary/10 dark:bg-primary/20"
                                      )}
                                      onClick={() => {
                                        handleServiceChange(s.name);
                                        setServiceSearch("");
                                        setServicePopoverOpen(false);
                                      }}
                                    >
                                      <span className="truncate">{s.name}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold gradient-text">{s.isStartingPrice ? `${t("services.startingFrom")} ` : ''}{s.price} DH</span>
                                        <Plus className="w-4 h-4 text-primary" />
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

                {/* Quick Favorites - Glass Pills */}
                {!editingAppointment && (
                  <div className="col-span-3 flex items-center gap-1.5">
                    {favoriteServices.slice(0, 4).map((s: any) => (
                      <Button
                        key={s.id}
                        type="button"
                        variant={form.watch("service") === s.name ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          "h-8 text-[10px] px-3 rounded-full font-medium transition-all whitespace-nowrap",
                          form.watch("service") === s.name 
                            ? "liquid-gradient border-0 text-white shadow-md" 
                            : "border-0 bg-secondary/50 hover:bg-secondary/70"
                        )}
                        onClick={() => handleServiceChange(s.name)}
                      >
                        {s.name}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-full hover:bg-primary/10"
                      onClick={() => setIsEditFavoritesOpen(!isEditFavoritesOpen)}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
                
                {isEditFavoritesOpen && (
                  <div className="col-span-3 border border-dashed border-primary/30 rounded-xl p-2.5 glass-subtle">
                    <ScrollArea className="h-[80px]">
                      <div className="flex flex-wrap gap-1.5">
                        {services.map((s) => (
                          <Button
                            key={s.id}
                            type="button"
                            variant={favoriteIds.includes(s.id) ? "default" : "outline"}
                            size="sm"
                            className={cn(
                              "h-7 text-[9px] px-2.5 rounded-full transition-all",
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

              {/* Action Buttons - Glass Style */}
              <div className="flex gap-3 pt-3">
                {editingAppointment && (
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-12 px-5 rounded-2xl font-semibold text-sm shadow-lg hover:shadow-xl transition-all"
                    onClick={() => {
                      if (confirm(t("planning.deleteConfirm"))) {
                        deleteMutation.mutate(editingAppointment.id);
                        setIsDialogOpen(false);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
                <Button 
                  type="submit" 
                  className="flex-1 h-12 text-sm font-semibold rounded-2xl liquid-gradient shadow-lg hover:shadow-xl transition-all active:scale-[0.98]" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  <Sparkles className="w-4 h-4 ml-2" />
                  {editingAppointment ? t("planning.updateBooking") : t("planning.confirmBooking")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Floating "Go to Now" button - iOS Liquid Glass Style */}
      {isToday && getCurrentTimePosition(hours, businessSettings?.openingTime, businessSettings?.closingTime) >= 0 && (
        <button
          onClick={() => scrollToLiveLine(true, true)}
          className={cn(
            "fixed bottom-20 z-50 w-14 h-14 rounded-full liquid-gradient shadow-xl flex items-center justify-center text-white transition-all active:scale-95 live-indicator",
            isRtl ? "left-4" : "right-4"
          )}
          aria-label="Go to current time"
        >
          <Clock className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
