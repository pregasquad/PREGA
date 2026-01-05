import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { format, addDays, startOfToday, parseISO, subDays } from "date-fns";
import { useTranslation } from "react-i18next";
import { useAppointments, useStaff, useServices, useCreateAppointment, useUpdateAppointment, useDeleteAppointment } from "@/hooks/use-salon-data";
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
import { CalendarIcon, ChevronLeft, ChevronRight, Plus, Trash2, Check, X, Search, Star, RefreshCw, Sparkles, CreditCard, Settings2, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertAppointmentSchema, insertStaffSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const hours = [
  "02:00","02:30","03:00","03:30","04:00","04:30",
  "05:00","05:30","06:00","06:30","07:00","07:30",
  "08:00","08:30","09:00","09:30","10:00","10:30",
  "11:00","11:30","12:00","12:30","13:00","13:30",
  "14:00","14:30","15:00","15:30","16:00","16:30",
  "17:00","17:30","18:00","18:30","19:00","19:30",
  "20:00","20:30","21:00","21:30","22:00","22:30",
  "23:00","23:30","00:00","00:30","01:00","01:30"
];

const formSchema = insertAppointmentSchema.extend({
  price: z.coerce.number().min(0),
  duration: z.coerce.number().min(1),
  total: z.coerce.number().min(0),
});

type AppointmentFormValues = z.infer<typeof formSchema>;

// Get the "work day" date - if time is between 00:00-01:59, it's still the previous day's schedule
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
  const [date, setDate] = useState<Date>(getWorkDayDate());
  const [serviceSearch, setServiceSearch] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const boardRef = useRef<HTMLDivElement>(null);
  const liveLineRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    // Update immediately then every 30 seconds
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshTimer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    }, 30000);
    return () => clearInterval(refreshTimer);
  }, []);

  const getCurrentTimePosition = () => {
    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    // Schedule starts at 2 AM, so adjust the calculation
    // Hours 02-23 map to slots 0-43, Hours 00-01 map to slots 44-47
    let adjustedHour = currentHour >= 2 ? currentHour - 2 : currentHour + 22;
    const totalMinutes = adjustedHour * 60 + currentMinutes;
    const slotHeight = 48;
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

  // Custom smooth scroll function for better performance
  const smoothScrollTo = (element: HTMLElement, container: HTMLElement) => {
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const targetScroll = container.scrollTop + elementRect.top - containerRect.top - (containerRect.height / 2) + (elementRect.height / 2);
    
    const startScroll = container.scrollTop;
    const distance = targetScroll - startScroll;
    const duration = 800;
    let startTime: number | null = null;

    const easeInOutCubic = (t: number) => {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    const animateScroll = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = easeInOutCubic(progress);
      
      container.scrollTop = startScroll + (distance * easeProgress);
      
      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    };

    requestAnimationFrame(animateScroll);
  };

  // Smooth auto-scroll to live line when page loads or date changes
  useEffect(() => {
    if (isToday && liveLineRef.current && boardRef.current) {
      setTimeout(() => {
        if (liveLineRef.current && boardRef.current) {
          smoothScrollTo(liveLineRef.current, boardRef.current);
        }
      }, 200);
    }
  }, [date, isToday]);
  const [isEditFavoritesOpen, setIsEditFavoritesOpen] = useState(false);
  const [servicePopoverOpen, setServicePopoverOpen] = useState(false);
  const [appointmentSearch, setAppointmentSearch] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [draggedAppointment, setDraggedAppointment] = useState<any>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{staff: string, time: string} | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [favoriteIds, setFavoriteIds] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem('favoriteServiceIds');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const { toast } = useToast();

  const formattedDate = format(date, "yyyy-MM-dd");
  
  const { data: appointments = [], isLoading: loadingApps } = useAppointments(formattedDate);
  const { data: allAppointments = [] } = useAppointments();
  const { data: staffList = [] } = useStaff();
  const { data: services = [] } = useServices();
  const isAdmin = sessionStorage.getItem("admin_authenticated") === "true";

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
    setEditingAppointment(null);
    setIsDialogOpen(true);
  };

  const handleAppointmentClick = (e: React.MouseEvent, app: any) => {
    e.stopPropagation();
    if (!isAdmin) return;
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
    setEditingAppointment(app);
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: AppointmentFormValues) => {
    const stored = localStorage.getItem('mostUsedServices');
    const mostUsed = stored ? JSON.parse(stored) : {};
    mostUsed[data.service] = (mostUsed[data.service] || 0) + 1;
    localStorage.setItem('mostUsedServices', JSON.stringify(mostUsed));

    const selectedService = services.find(s => s.name === data.service);
    
    if (selectedService?.linkedProductId) {
      try {
        const res = await apiRequest("GET", `/api/products/${selectedService.linkedProductId}`);
        const product = await res.json();
        if (product.quantity <= 0) {
          alert(`⚠️ المخزون غير كافٍ لـ ${product.name}`);
          return;
        }
        await apiRequest("PATCH", `/api/products/${product.id}/quantity`, {
          quantity: product.quantity - 1
        });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      } catch (e) {
        console.error("Stock check failed:", e);
      }
    }

    if (editingAppointment) {
      updateMutation.mutate({ id: editingAppointment.id, ...data });
    } else {
      createMutation.mutate(data);
      playSuccessSound();
    }
    setIsDialogOpen(false);
  };

  const handleServiceChange = (serviceName: string) => {
    const service = services.find(s => s.name === serviceName);
    if (service) {
      form.setValue("service", serviceName);
      form.setValue("duration", service.duration);
      form.setValue("price", service.price);
      form.setValue("total", service.price);
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
    
    if (!draggedAppointment) return;
    
    const staffMember = staffList.find(s => s.name === staffName);
    if (!staffMember) return;

    try {
      await apiRequest("PUT", `/api/appointments/${draggedAppointment.id}`, {
        ...draggedAppointment,
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

  return (
    <div 
      ref={pageRef}
      className="h-full bg-background p-2 md:p-4 flex flex-col"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="mb-2 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 shrink-0">
        <h1 className="text-lg md:text-xl font-bold">{t("planning.title")}</h1>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Staff Revenue */}
          <div className="flex flex-wrap items-center gap-1">
            {stats.perStaff.map(s => (
              <div key={s.id} className="bg-card px-2 py-1 rounded-lg border text-xs flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="font-medium">{s.name}</span>
                <span className="font-bold">{s.total} DH</span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="bg-primary text-primary-foreground px-3 py-1 rounded-lg text-sm font-bold">
            {stats.total} DH
          </div>

          {/* Search with Price */}
          <div className="relative">
            <div className="flex items-center gap-1 bg-card rounded-lg border p-1">
              {showSearchInput ? (
                <>
                  <Input
                    type="text"
                    placeholder={t("common.search") + "..."}
                    value={appointmentSearch}
                    onChange={(e) => setAppointmentSearch(e.target.value)}
                    className="h-7 w-32 md:w-40 text-xs border-0 focus-visible:ring-0"
                    autoFocus
                  />
                  {appointmentSearch && searchResults.count > 0 && (
                    <div className="bg-green-500 text-white px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">
                      {searchResults.count} = {searchResults.total} DH
                    </div>
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7"
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
                  className="h-7 w-7"
                  onClick={() => setShowSearchInput(true)}
                >
                  <Search className="w-4 h-4" />
                </Button>
              )}
            </div>
            {/* Search Results Dropdown */}
            {showSearchInput && appointmentSearch && searchResults.count > 0 && (
              <div className="absolute top-full mt-1 ltr:right-0 rtl:left-0 z-50 w-72 md:w-80 bg-card border rounded-lg shadow-lg max-h-64 overflow-auto">
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
                            <p className="text-xs text-muted-foreground truncate">{app.service}</p>
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
                <div className="p-2 bg-green-500 text-white sticky bottom-0">
                  <div className="flex justify-between items-center text-sm font-bold">
                    <span>Total</span>
                    <span>{searchResults.total} DH</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Date Navigation */}
          <div className="flex items-center gap-1 bg-card rounded-lg border p-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDate(d => addDays(d, -1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" className="h-7 px-2 text-xs">
                  <CalendarIcon className="w-3 h-3 ml-1" />
                  {format(date, "dd/MM")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDate(d => addDays(d, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
                queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
                queryClient.invalidateQueries({ queryKey: ["/api/services"] });
                toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
              }}
            >
              <RefreshCw className={cn("w-3 h-3", loadingApps && "animate-spin")} />
            </Button>
          </div>

          {/* New Booking Button */}
          <Button 
            onClick={() => {
              form.reset({
                date: formattedDate,
                startTime: "10:00",
                duration: 60,
                client: "",
                service: "",
                staff: staffList[0]?.name || "",
                price: 0,
                total: 0,
                paid: true,
              });
              setEditingAppointment(null);
              setIsDialogOpen(true);
            }}
            className="bg-black text-white px-3 py-1 rounded-xl text-sm"
          >
            <Plus className="w-4 h-4 ml-1" />
            {t("planning.newBooking")}
          </Button>
        </div>
      </div>

      {/* Board */}
      <div ref={boardRef} className="flex-1 overflow-auto bg-background rounded-xl border shadow-sm relative free-scroll">
        <div 
          className="grid relative"
          style={{ 
            gridTemplateColumns: `55px repeat(${staffList.length}, minmax(120px, 1fr))`,
            gridAutoRows: '48px'
          }}
        >
          {/* Current Time Line - flex layout with sticky icon and spanning line */}
          {isToday && (
            <div 
              ref={liveLineRef}
              className="absolute z-[35] pointer-events-none transition-all duration-1000 ease-in-out flex items-center"
              style={{ 
                top: `${getCurrentTimePosition() + 48}px`,
                left: 0,
                right: 0,
              }}
            >
              {/* Makeup brush icon - sticky to time column, shifted right */}
              <div className="w-[70px] shrink-0 sticky ltr:left-0 rtl:right-0 z-[50] flex items-center ltr:justify-end rtl:justify-start ltr:pr-1 rtl:pl-1">
                <div className="relative flex items-center justify-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 shadow-xl flex items-center justify-center border-2 border-white dark:border-gray-800">
                    <Scissors className="w-4 h-4 text-white" />
                  </div>
                  <div className="absolute inset-0 w-9 h-9 rounded-full bg-orange-500 animate-ping opacity-30" />
                </div>
              </div>
              {/* Line spanning staff columns */}
              <div className="flex-1 h-0.5 ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-orange-500 via-orange-400 to-transparent shadow-sm ltr:-ml-3 rtl:-mr-3" />
            </div>
          )}
          {/* Top row - Staff headers (sticky) */}
          <div className="bg-card border-b border-r border-gray-300 dark:border-gray-600 p-1 sticky top-0 z-40" style={{ gridColumn: 1, gridRow: 1 }}></div>
          {staffList.map((s, staffIndex) => (
            <div 
              key={s.id} 
              className="bg-muted border-b border-r border-gray-300 dark:border-gray-600 p-2 md:p-3 font-bold text-center text-xs md:text-sm sticky top-0 z-40"
              style={{ gridColumn: staffIndex + 2, gridRow: 1 }}
            >
              <div className="flex items-center justify-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span>{s.name}</span>
              </div>
            </div>
          ))}

          {/* Time rows */}
          {hours.map((hour, hourIndex) => {
            const rowNum = hourIndex + 2; // +2 because row 1 is headers
            return (
            <React.Fragment key={hour}>
              <div 
                className="bg-card border-b border-r border-gray-300 dark:border-gray-600 p-1 text-xs text-muted-foreground font-medium sticky left-0 z-30"
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
                      className="border-b border-r border-gray-300 dark:border-gray-600 min-h-[48px]"
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
                      className="p-0.5 z-10"
                      style={{ 
                        gridColumn: colNum,
                        gridRow: `${rowNum} / span ${span}`
                      }}
                    >
                      <div 
                        className={cn(
                          "h-full p-2 rounded-lg text-white cursor-grab active:cursor-grabbing shadow-lg flex flex-col justify-between",
                          isDragging && "opacity-50 scale-95"
                        )}
                        style={{ backgroundColor: s.color }}
                        draggable
                        onDragStart={(e) => handleDragStart(e, booking)}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => handleAppointmentClick(e, booking)}
                      >
                        <div>
                          <div className="font-bold text-xs md:text-sm truncate">{booking.client || "—"}</div>
                          <div className="text-[10px] md:text-xs opacity-90 truncate">{booking.service}</div>
                          <div className="text-[9px] opacity-70">{booking.startTime}</div>
                        </div>
                        <div className="flex items-center justify-between mt-auto">
                          <span className="text-[10px] opacity-80">{booking.duration}د</span>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-xs">{booking.total} DH</span>
                            {booking.paid ? (
                              <CreditCard className="w-3 h-3 text-white" />
                            ) : (
                              <button
                                onClick={(e) => handleMarkAsPaid(e, booking)}
                                className="bg-white/20 hover:bg-white/30 rounded-full p-1 flex items-center gap-0.5"
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
                      "border-b border-r border-gray-300 dark:border-gray-600 min-h-[48px] transition-all duration-200",
                      "hover:bg-muted/30 cursor-pointer",
                      isDragOver && "bg-orange-100 dark:bg-orange-900/30 ring-2 ring-orange-500 ring-inset"
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

      {/* Appointment Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) setIsEditFavoritesOpen(false);
      }}>
        <DialogContent 
          className="w-[calc(100vw-24px)] max-w-[420px] p-0 border-0 shadow-2xl bg-gradient-to-b from-background to-muted/30 rounded-3xl overflow-hidden" 
          dir={isRtl ? "rtl" : "ltr"}
        >
          <div className="bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 px-4 py-3 text-white">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                {editingAppointment ? t("planning.editBooking") : t("planning.newBooking")}
              </DialogTitle>
            </DialogHeader>
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-4 space-y-3">
              
              {/* Price Row - FIRST */}
              <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-2xl p-3 border border-emerald-200 dark:border-emerald-800">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg">
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
                          className="text-2xl h-11 font-bold border-0 bg-white dark:bg-background rounded-xl text-center shadow-sm"
                          onFocus={(e) => e.target.select()}
                          {...field} 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">DH</span>
                <FormField
                  control={form.control}
                  name="paid"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-1.5 space-y-0 bg-white dark:bg-background rounded-xl px-2 py-1.5 shadow-sm">
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

              {/* Compact Fields */}
              <div className="grid grid-cols-3 gap-2">
                <FormField
                  control={form.control}
                  name="client"
                  render={({ field }) => (
                    <FormItem className="col-span-3 space-y-0">
                      <FormControl>
                        <Input placeholder={t("planning.client")} className="h-10 rounded-xl text-sm border-2 border-muted focus:border-orange-400 transition-colors" {...field} />
                      </FormControl>
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
                          <SelectTrigger className="h-10 rounded-xl text-xs border-2 border-muted">
                            <SelectValue placeholder={t("planning.staff")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl">
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
                          <SelectTrigger className="h-10 rounded-xl text-xs border-2 border-muted">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60 rounded-xl">
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
                        <Input type="number" inputMode="numeric" placeholder={t("common.duration")} className="h-10 rounded-xl text-xs border-2 border-muted" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Service */}
                <FormField
                  control={form.control}
                  name="service"
                  render={({ field }) => (
                    <FormItem className="col-span-3 space-y-0">
                      <Popover open={servicePopoverOpen} onOpenChange={setServicePopoverOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className="h-10 w-full justify-between rounded-xl text-xs border-2 border-muted hover:border-orange-400 transition-colors"
                            >
                              <span className="truncate">{field.value || t("planning.selectService")}</span>
                              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent 
                          className="w-[calc(100vw-48px)] max-w-[396px] p-0 rounded-2xl border-2 shadow-xl" 
                          align="center" 
                          side="top" 
                          sideOffset={4}
                          onWheel={(e) => e.stopPropagation()}
                        >
                          <div className="p-3 border-b bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 rounded-t-2xl">
                            <Input
                              placeholder={t("planning.searchService")}
                              value={serviceSearch}
                              onChange={(e) => setServiceSearch(e.target.value)}
                              className="h-9 text-sm rounded-xl border-2"
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
                                <div className="px-2 py-1.5 text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase bg-orange-50 dark:bg-orange-950/30 rounded-lg mb-1 sticky top-0">
                                  {category}
                                </div>
                                {categoryServices.map(s => (
                                  <div
                                    key={s.id}
                                    className={cn(
                                      "flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-sm mb-1 transition-all",
                                      "hover:bg-gradient-to-r hover:from-orange-50 hover:to-amber-50 dark:hover:from-orange-950/30 dark:hover:to-amber-950/30",
                                      field.value === s.name && "bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-900/40 dark:to-amber-900/40 font-medium"
                                    )}
                                    onClick={() => {
                                      handleServiceChange(s.name);
                                      setServiceSearch("");
                                      setServicePopoverOpen(false);
                                    }}
                                  >
                                    <span className="truncate">{s.name}</span>
                                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{s.price} DH</span>
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

                {/* Quick Favorites - compact */}
                {!editingAppointment && (
                  <div className="col-span-3 flex items-center gap-1.5">
                    {favoriteServices.slice(0, 4).map((s: any) => (
                      <Button
                        key={s.id}
                        type="button"
                        variant={form.watch("service") === s.name ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          "h-7 text-[9px] px-2 rounded-full font-medium transition-all whitespace-nowrap",
                          form.watch("service") === s.name 
                            ? "bg-gradient-to-r from-orange-500 to-amber-500 border-0 text-white shadow-md" 
                            : "border-2 hover:border-orange-300"
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
                      className="h-7 w-7 p-0 rounded-full hover:bg-orange-100 dark:hover:bg-orange-900/30"
                      onClick={() => setIsEditFavoritesOpen(!isEditFavoritesOpen)}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
                
                {isEditFavoritesOpen && (
                  <div className="col-span-3 border-2 border-dashed border-orange-200 dark:border-orange-800 rounded-xl p-2 bg-orange-50/50 dark:bg-orange-950/20">
                    <ScrollArea className="h-[80px]">
                      <div className="flex flex-wrap gap-1">
                        {services.map((s) => (
                          <Button
                            key={s.id}
                            type="button"
                            variant={favoriteIds.includes(s.id) ? "default" : "outline"}
                            size="sm"
                            className={cn(
                              "h-6 text-[9px] px-2 rounded-full",
                              favoriteIds.includes(s.id) && "bg-gradient-to-r from-orange-500 to-amber-500 border-0"
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

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                {editingAppointment && (
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-11 px-4 rounded-xl font-bold text-sm shadow-md"
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
                  className="flex-1 h-11 text-sm font-black rounded-xl bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 hover:from-orange-600 hover:via-orange-700 hover:to-amber-600 shadow-lg hover:shadow-xl transition-all" 
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
    </div>
  );
}
