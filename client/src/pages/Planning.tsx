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
import { CalendarIcon, ChevronLeft, ChevronRight, Plus, Trash2, Check, X, Search, Star, RefreshCw, Sparkles, CreditCard, Settings2, Scissors, Clock, User, ChevronsUpDown } from "lucide-react";
import { SpinningLogo } from "@/components/ui/spinning-logo";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertAppointmentSchema, insertStaffSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const hours = [
  "10:00","10:30","11:00","11:30","12:00","12:30",
  "13:00","13:30","14:00","14:30","15:00","15:30",
  "16:00","16:30","17:00","17:30","18:00","18:30",
  "19:00","19:30","20:00","20:30","21:00","21:30",
  "22:00","22:30","23:00","23:30","00:00","00:30",
  "01:00","01:30"
];

const formSchema = insertAppointmentSchema.extend({
  price: z.coerce.number().min(0),
  duration: z.coerce.number().min(1),
  total: z.coerce.number().min(0),
});

type AppointmentFormValues = z.infer<typeof formSchema>;

// Get the "work day" date - work day runs 10am to 2am, so before 2am is still previous day
function getWorkDayDate(): Date {
  const now = new Date();
  const hour = now.getHours();
  // If between midnight and 2 AM, consider it still the previous work day
  if (hour < 2) {
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
    // Mobile: refresh every 3 minutes, Desktop: every 2 minutes (socket handles real-time)
    const refreshInterval = isMobile ? 180000 : 120000;
    
    const intervalId = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
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

  const getCurrentTimePosition = () => {
    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    // Schedule runs from 10am to 2am (next day)
    // Hours 10-23 map to slots 0-27, Hours 00-01 map to slots 28-31
    let adjustedHour;
    if (currentHour >= 10) {
      adjustedHour = currentHour - 10;
    } else if (currentHour < 2) {
      adjustedHour = currentHour + 14; // 00:00 = slot 28, 01:00 = slot 30
    } else {
      return -1; // Outside work hours (2am-10am)
    }
    const totalMinutes = adjustedHour * 60 + currentMinutes;
    const slotHeight = 52;
    const position = (totalMinutes / 30) * slotHeight;
    return position;
  };

  // Check if we're viewing the current "work day" (accounting for 2 AM start)
  const isToday = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const workDayDate = hour < 2 ? subDays(now, 1) : now;
    return format(date, "yyyy-MM-dd") === format(workDayDate, "yyyy-MM-dd");
  }, [date, currentTime]);

  // BULLETPROOF SCROLL TO LIVE LINE - uses scrollIntoView on the actual element
  const scrollToLiveLine = useCallback((smooth = false) => {
    // Method 1: Use the actual live line element
    if (liveLineRef.current) {
      liveLineRef.current.scrollIntoView({ 
        block: 'center', 
        inline: 'nearest',
        behavior: smooth ? 'smooth' : 'auto'
      });
      return true;
    }
    
    // Method 2: Fallback to manual scrollTop calculation
    const board = boardRef.current;
    if (!board || board.scrollHeight <= board.clientHeight) return false;
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    
    let adjustedHour;
    if (currentHour >= 10) {
      adjustedHour = currentHour - 10;
    } else if (currentHour < 2) {
      adjustedHour = currentHour + 14;
    } else {
      return false;
    }
    
    const totalMinutes = adjustedHour * 60 + currentMinutes;
    const slotHeight = 52;
    const targetTop = (totalMinutes / 30) * slotHeight + 52;
    const scrollTarget = Math.max(0, targetTop - board.clientHeight / 2);
    
    if (smooth) {
      board.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    } else {
      board.scrollTop = scrollTarget;
    }
    return true;
  }, []);

  // AGGRESSIVE AUTO-SCROLL: Try many times with different delays
  useLayoutEffect(() => {
    if (!isToday) return;
    
    // Try scrolling multiple times
    const attempts = [0, 50, 100, 200, 300, 500, 800, 1000, 1500, 2000, 3000];
    const timers: NodeJS.Timeout[] = [];
    
    attempts.forEach(delay => {
      const timer = setTimeout(() => {
        scrollToLiveLine();
      }, delay);
      timers.push(timer);
    });
    
    return () => timers.forEach(t => clearTimeout(t));
  }, [isToday, scrollToLiveLine]);

  // ResizeObserver: scroll when content loads
  useEffect(() => {
    if (!isToday) return;
    
    const board = boardRef.current;
    if (!board) return;
    
    const observer = new ResizeObserver(() => {
      scrollToLiveLine();
    });
    observer.observe(board);
    
    return () => observer.disconnect();
  }, [isToday, scrollToLiveLine]);

  // FOLLOW LIVE LINE every 30 seconds when currentTime updates
  useEffect(() => {
    if (!isToday) return;
    scrollToLiveLine();
  }, [isToday, currentTime, scrollToLiveLine]);

  // Scroll when visibility changes (returning from background in PWA)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isToday) {
        setTimeout(scrollToLiveLine, 100);
        setTimeout(scrollToLiveLine, 300);
        setTimeout(scrollToLiveLine, 500);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    window.addEventListener('pageshow', handleVisibility);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      window.removeEventListener('pageshow', handleVisibility);
    };
  }, [isToday, scrollToLiveLine]);

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

  // Track data loaded state
  const dataLoadedRef = useRef(false);
  const [isEditFavoritesOpen, setIsEditFavoritesOpen] = useState(false);
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
  const [selectedServices, setSelectedServices] = useState<Array<{name: string, price: number, duration: number}>>([]);
  const { toast } = useToast();

  const formattedDate = format(date, "yyyy-MM-dd");
  
  const { data: appointments = [], isLoading: loadingApps } = useAppointments(formattedDate);
  const { data: allAppointments = [] } = useAppointments();
  const { data: staffList = [], isLoading: loadingStaff, isError: staffError } = useStaff();
  const { data: services = [], isLoading: loadingServices, isError: servicesError } = useServices();
  const { data: clients = [] } = useQuery<Array<{id: number, name: string, phone: string | null}>>({
    queryKey: ["/api/clients"],
  });
  
  // Show loading state while essential data loads
  const isDataLoading = loadingStaff || loadingServices;
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

  // Scroll when data loads (staff or appointments)
  useEffect(() => {
    if (staffList.length > 0 && !dataLoadedRef.current && isToday) {
      dataLoadedRef.current = true;
      // Use double rAF to ensure layout is complete
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToLiveLine();
        });
      });
    }
  }, [staffList, isToday, scrollToLiveLine]);

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
    
    if (dateParam && appointmentId && !pendingAppointmentId.current) {
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
      form.reset({
        date: targetApp.date,
        startTime: targetApp.startTime,
        duration: targetApp.duration,
        client: targetApp.client,
        service: targetApp.service,
        staff: targetApp.staff,
        price: targetApp.price,
        total: targetApp.total,
        paid: targetApp.paid,
      });
      setEditingAppointment(targetApp);
      setIsDialogOpen(true);
      pendingAppointmentId.current = null;
    } else if (appointments.length > 0) {
      pendingAppointmentId.current = null;
    }
  }, [loadingApps, appointments, form]);

  const stats = useMemo(() => {
    const paidAppointments = appointments.filter(app => app.paid);
    const total = paidAppointments.reduce((sum, app) => sum + (app.total || 0), 0);
    const perStaff = staffList.map(s => {
      const staffTotal = paidAppointments
        .filter(app => app.staff === s.name)
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
    setEditingAppointment(null);
    setIsDialogOpen(true);
  };

  const handleAppointmentClick = (e: React.MouseEvent, app: any) => {
    e.stopPropagation();
    if (!canEditCardboard) return;
    
    // Parse servicesJson or fall back to single service
    let parsedServices: Array<{name: string, price: number, duration: number}> = [];
    if (app.servicesJson) {
      try {
        parsedServices = typeof app.servicesJson === 'string' 
          ? JSON.parse(app.servicesJson) 
          : app.servicesJson;
      } catch {
        parsedServices = [];
      }
    }
    // Fall back to single service if no servicesJson
    if (parsedServices.length === 0 && app.service) {
      const svc = services.find(s => s.name === app.service);
      if (svc) {
        parsedServices = [{ name: svc.name, price: svc.price, duration: svc.duration }];
      }
    }
    setSelectedServices(parsedServices);
    
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

    const submitData = {
      ...data,
      clientId,
      servicesJson: selectedServices.length > 0 ? selectedServices : undefined,
      service: selectedServices.length > 0 ? selectedServices.map(s => s.name).join(', ') : data.service,
      duration: selectedServices.length > 0 ? selectedServices.reduce((sum, s) => sum + s.duration, 0) : data.duration,
      price: selectedServices.length > 0 ? selectedServices.reduce((sum, s) => sum + s.price, 0) : data.price,
      total: selectedServices.length > 0 ? selectedServices.reduce((sum, s) => sum + s.price, 0) : data.total,
    };

    if (editingAppointment) {
      updateMutation.mutate({ id: editingAppointment.id, ...submitData });
    } else {
      const currentUser = sessionStorage.getItem("current_user") || "Unknown";
      createMutation.mutate({ ...submitData, createdBy: currentUser });
      playSuccessSound();
    }
    setSelectedServices([]);
    setIsDialogOpen(false);
  };

  const handleAddService = (service: {name: string, price: number, duration: number}) => {
    const updated = [...selectedServices, service];
    setSelectedServices(updated);
    const totalDuration = updated.reduce((sum, s) => sum + s.duration, 0);
    const totalPrice = updated.reduce((sum, s) => sum + s.price, 0);
    form.setValue("service", updated.map(s => s.name).join(', '));
    form.setValue("duration", totalDuration);
    form.setValue("price", totalPrice);
    form.setValue("total", totalPrice);
  };

  const handleRemoveService = (index: number) => {
    const updated = selectedServices.filter((_, i) => i !== index);
    setSelectedServices(updated);
    const totalDuration = updated.reduce((sum, s) => sum + s.duration, 0);
    const totalPrice = updated.reduce((sum, s) => sum + s.price, 0);
    form.setValue("service", updated.map(s => s.name).join(', '));
    form.setValue("duration", totalDuration);
    form.setValue("price", totalPrice);
    form.setValue("total", totalPrice);
  };

  const handleServiceChange = (serviceName: string) => {
    const service = services.find(s => s.name === serviceName);
    if (service) {
      handleAddService({ name: service.name, price: service.price, duration: service.duration });
    }
  };

  const handleMarkAsPaid = async (e: React.MouseEvent, app: any) => {
    e.stopPropagation();
    try {
      await apiRequest("PUT", `/api/appointments/${app.id}`, {
        ...app,
        paid: true
      });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: t("planning.paymentConfirmed"), description: t("planning.paymentConfirmedDesc") });
    } catch (error) {
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
      await apiRequest("PUT", `/api/appointments/${draggedAppointment.id}`, {
        ...draggedAppointment,
        servicesJson: parsedServicesJson,
        staff: staffName,
        startTime: newTime,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
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

  const getBooking = (staffName: string, hour: string) => {
    return appointments.find(a => a.staff === staffName && a.startTime === hour);
  };

  const getBookingSpan = (app: any) => {
    return Math.ceil(app.duration / 30);
  };

  const isSlotCovered = (staffName: string, hour: string) => {
    const hourIndex = hours.indexOf(hour);
    for (let i = 0; i < hourIndex; i++) {
      const prevBooking = appointments.find(a => a.staff === staffName && a.startTime === hours[i]);
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
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Staff Revenue - Glass Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {stats.perStaff.map(s => (
              <div key={s.id} className="glass-card px-3 py-1.5 text-xs flex items-center gap-1.5 hover:scale-105 transition-transform">
                <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: s.color }} />
                <span className="font-medium text-foreground/80">{s.name}</span>
                <span className="font-bold text-foreground">{s.total} DH</span>
              </div>
            ))}
          </div>

          {/* Total - Liquid Gradient */}
          <div className="liquid-gradient text-white px-4 py-1.5 rounded-2xl text-sm font-bold shadow-lg hover:shadow-xl transition-shadow">
            {stats.total} DH
          </div>

          {/* Search with Price - Glass Style */}
          <div className="relative">
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
                        setEditingAppointment(app);
                        form.reset({
                          date: app.date,
                          startTime: app.startTime,
                          duration: app.duration,
                          client: app.client,
                          service: app.service,
                          staff: app.staff,
                          price: app.price,
                          total: app.total,
                          paid: app.paid,
                        });
                        setIsDialogOpen(true);
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
              onClick={() => setDate(getWorkDayDate())}
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

        </div>
      </div>

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
              <div className="flex items-center justify-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full shadow-sm ring-2 ring-white/30" style={{ backgroundColor: s.color }} />
                <span className="text-foreground/90 truncate font-medium">{s.name}</span>
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
            {isToday && getCurrentTimePosition() >= 0 && (
              <div 
                ref={liveLineRef}
                className="absolute z-[35] pointer-events-none transition-all duration-1000 ease-in-out"
                style={{ 
                  top: `${getCurrentTimePosition()}px`,
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
                const booking = getBooking(s.name, hour);
                const isCovered = isSlotCovered(s.name, hour);

                // For covered slots, render empty cell with just borders
                if (isCovered) {
                  return (
                    <div
                      key={`${s.id}-${hour}-covered`}
                      className={cn("border-b border-slate-100/50 dark:border-slate-800/50 min-h-[52px] bg-transparent", isRtl ? "border-l border-slate-100/50 dark:border-slate-800/50" : "border-r border-slate-100/50 dark:border-slate-800/50")}
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
                          "appointment-card h-full p-2.5 text-white cursor-grab active:cursor-grabbing flex flex-col justify-between relative overflow-hidden",
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
                        <div className="relative z-10">
                          <div className="font-semibold text-xs md:text-sm truncate">{booking.client || "—"}</div>
                          <div className="text-[10px] md:text-xs opacity-90">
                            {booking.service?.includes(',') ? (
                              booking.service.split(',').map((svc: string, idx: number) => (
                                <div key={idx} className="truncate">- {svc.trim()}</div>
                              ))
                            ) : (
                              <div className="truncate">{booking.service}</div>
                            )}
                          </div>
                          <div className="text-[9px] opacity-70 font-medium">{booking.startTime}</div>
                        </div>
                        <div className="flex items-center justify-between mt-auto relative z-10">
                          <span className="text-[10px] opacity-80 font-medium">{booking.duration}′</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs">{booking.total} DH</span>
                            {booking.paid ? (
                              <div className="bg-white/20 rounded-full p-1">
                                <CreditCard className="w-3 h-3 text-white" />
                              </div>
                            ) : (
                              <button
                                onClick={(e) => handleMarkAsPaid(e, booking)}
                                className="bg-white/25 hover:bg-white/40 rounded-full p-1 flex items-center gap-0.5 transition-colors"
                              >
                                <CreditCard className="w-3 h-3" />
                                <Check className="w-2 h-2" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${s.id}-${hour}`}
                    className={cn(
                      "border-b border-slate-100/50 dark:border-slate-800/50 min-h-[52px] transition-all duration-300 bg-transparent",
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
        }
      }}>
        <DialogContent 
          className="w-[calc(100vw-24px)] max-w-[420px] p-0 border-0 shadow-2xl glass-card rounded-3xl overflow-hidden animate-fade-in-scale" 
          dir={isRtl ? "rtl" : "ltr"}
        >
          <div className="liquid-gradient px-5 py-4 text-white relative overflow-hidden">
            <div className="water-shimmer absolute inset-0 opacity-20" />
            <DialogHeader className="relative z-10">
              <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                {editingAppointment ? t("planning.editBooking") : t("planning.newBooking")}
              </DialogTitle>
              {editingAppointment?.createdBy && (
                <p className="text-xs text-white/70 mt-1">
                  {t("planning.createdBy")}: <span className="font-medium text-white">{editingAppointment.createdBy}</span>
                </p>
              )}
            </DialogHeader>
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-5 space-y-4">
              
              {/* Price Row - FIRST - Glass Card */}
              <div className="flex items-center gap-3 glass-subtle rounded-2xl p-4">
                <div className="w-11 h-11 rounded-2xl liquid-gradient flex items-center justify-center shadow-lg">
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <FormField
                  control={form.control}
                  name="total"
                  render={({ field }) => (
                    <FormItem className="flex-1 space-y-0">
                      <FormControl>
                        <Input 
                          type="number" 
                          inputMode="decimal"
                          placeholder="0"
                          className="text-2xl h-12 font-bold border-0 bg-white/80 dark:bg-slate-800/80 rounded-xl text-center shadow-sm focus:ring-2 focus:ring-primary/30"
                          onFocus={(e) => e.target.select()}
                          {...field} 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <span className="text-base font-bold gradient-text">DH</span>
                <FormField
                  control={form.control}
                  name="paid"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0 bg-white/80 dark:bg-slate-800/80 rounded-xl px-3 py-2 shadow-sm">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="w-4 h-4 accent-primary rounded"
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
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
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
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 rounded-xl text-xs border-0 bg-secondary/50">
                            <SelectValue />
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

                {/* Service - Multi-select with Pills */}
                <div className="col-span-3 space-y-2">
                  {/* Selected Services Pills */}
                  {selectedServices.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-2 bg-secondary/30 rounded-xl">
                      {selectedServices.map((s, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/10 dark:bg-primary/20 rounded-full text-xs"
                        >
                          <span className="font-medium">{s.name}</span>
                          <span className="text-muted-foreground">{s.price} DH</span>
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
                      <span className="font-bold gradient-text">{selectedServices.reduce((sum, s) => sum + s.price, 0)} DH</span>
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
                                        <span className="text-xs font-bold gradient-text">{s.price} DH</span>
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
      {isToday && getCurrentTimePosition() >= 0 && (
        <button
          onClick={() => scrollToLiveLine(true)}
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
