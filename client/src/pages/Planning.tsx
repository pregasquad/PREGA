import { useState, useMemo, useEffect, useRef } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { format, addDays, startOfToday, setHours, setMinutes, isSameDay } from "date-fns";
import { useAppointments, useStaff, useServices, useCreateAppointment, useUpdateAppointment, useDeleteAppointment } from "@/hooks/use-salon-data";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarIcon, ChevronLeft, ChevronRight, Clock, Plus, Trash2, Check, X, UserPlus, Edit2, Scissors, Search, Star, CreditCard, Settings2, Sparkles, User, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertAppointmentSchema, insertStaffSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// Constants for grid calculation (Updated to 24h)
const START_HOUR = 0;  // 00:00
const END_HOUR = 24;   // 24:00
const SLOT_HEIGHT = 100;
const SLOT_INTERVAL = 15; // minutes
const PIXELS_PER_MINUTE = SLOT_HEIGHT / 60;

// Schema for form
const formSchema = insertAppointmentSchema.extend({
  price: z.coerce.number(),
  duration: z.coerce.number(),
  total: z.coerce.number(),
});

type AppointmentFormValues = z.infer<typeof formSchema>;

export default function Planning() {
  const [isPageReady, setIsPageReady] = useState(false);
  const [now, setNow] = useState(new Date());
  const [date, setDate] = useState<Date>(startOfToday());
  const [isStaffDialogOpen, setIsStaffDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [serviceSearch, setServiceSearch] = useState("");
  const [isEditFavoritesOpen, setIsEditFavoritesOpen] = useState(false);
  const [favoriteNames, setFavoriteNames] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('favoriteServiceNames');
      return stored ? JSON.parse(stored) : ["Brushing", "Manicure Simple", "Soin Classique", "Sourcils"];
    } catch {
      return ["Brushing", "Manicure Simple", "Soin Classique", "Sourcils"];
    }
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledToNow = useRef(false);
  const { toast } = useToast();

  const formattedDate = format(date, "yyyy-MM-dd");
  
  const { data: appointments = [], isLoading: loadingApps } = useAppointments(formattedDate);
  const { data: staffList = [] } = useStaff();
  const { data: services = [] } = useServices();
  const isAdmin = sessionStorage.getItem("admin_authenticated") === "true";

  // Update time every 20 seconds
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(interval);
  }, []);

  const nowLinePosition = useMemo(() => {
    if (!date || format(date, "yyyy-MM-dd") !== format(now, "yyyy-MM-dd")) return null;
    const h = now.getHours();
    const m = now.getMinutes();
    const currentMinutes = h * 60 + m;
    const startMinutes = START_HOUR * 60;
    const endMinutes = END_HOUR * 60;

    if (currentMinutes < startMinutes || currentMinutes >= endMinutes) return null;
    return (currentMinutes - startMinutes) * PIXELS_PER_MINUTE;
  }, [now, date]);

  // Auto-scroll to current time on page load
  useEffect(() => {
    if (nowLinePosition !== null && scrollContainerRef.current && isPageReady && !hasScrolledToNow.current) {
      const container = scrollContainerRef.current;
      const scrollPosition = nowLinePosition - container.clientHeight / 3;
      container.scrollTo({ top: Math.max(0, scrollPosition), behavior: 'smooth' });
      hasScrolledToNow.current = true;
    }
  }, [nowLinePosition, isPageReady]);

  useEffect(() => {
    // Small delay to ensure everything is mounted and measured
    if (!loadingApps) {
      const timer = setTimeout(() => setIsPageReady(true), 200);
      return () => clearTimeout(timer);
    }
  }, [loadingApps]);

  const createMutation = useCreateAppointment();
  const updateMutation = useUpdateAppointment();
  const deleteMutation = useDeleteAppointment();

  const createStaffMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/staff", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setIsStaffDialogOpen(false);
      toast({ title: "تمت إضافة الموظف" });
    }
  });

  const updateStaffMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/staff/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setEditingStaff(null);
      toast({ title: "تم تحديث بيانات الموظف" });
    }
  });

  const deleteStaffMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/staff/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: "تم حذف الموظف" });
    }
  });

  const staffForm = useForm({
    resolver: zodResolver(insertStaffSchema),
    defaultValues: { name: "", color: "#" + Math.floor(Math.random()*16777215).toString(16) }
  });

  // Modal State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);

  // Form setup
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

  // Calculate daily revenue and staff breakdown (only paid appointments)
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

  const totalRevenue = stats.total;
  const staffRevenue = stats.perStaff;

  // Open modal for new appointment - default to paid since created by staff
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
    setSelectedStaff(staffName);
    setSelectedTime(time);
    setEditingAppointment(null);
    setIsDialogOpen(true);
  };

  // Open modal for edit (admin only)
  const handleAppointmentClick = (e: React.MouseEvent, app: any) => {
    e.stopPropagation();
    if (!isAdmin) {
      return; // Non-admin users cannot edit appointments
    }
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
    // Save most used service to localStorage
    const stored = localStorage.getItem('mostUsedServices');
    const mostUsed = stored ? JSON.parse(stored) : {};
    mostUsed[data.service] = (mostUsed[data.service] || 0) + 1;
    localStorage.setItem('mostUsedServices', JSON.stringify(mostUsed));

    // Find the service to check for linked product
    const selectedService = services.find(s => s.name === data.service);
    
    if (selectedService?.linkedProductId) {
      try {
        const res = await apiRequest("GET", `/api/products/${selectedService.linkedProductId}`);
        const product = await res.json();
        if (product.quantity <= 0) {
          alert(`⚠️ المخزون غير كافٍ لـ ${product.name}`);
          return;
        }
        
        // Decrease stock
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

  // Quick mark as paid
  const handleMarkAsPaid = async (e: React.MouseEvent, app: any) => {
    e.stopPropagation();
    try {
      await apiRequest("PUT", `/api/appointments/${app.id}`, {
        ...app,
        paid: true
      });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({
        title: "تم التأكيد",
        description: "تم تأكيد الدفع بنجاح",
      });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل تأكيد الدفع",
        variant: "destructive"
      });
    }
  };

  // Time slots array
  interface TimeSlot {
    minutes: number;
    label: string;
    fullLabel: string;
  }
  const timeSlots: TimeSlot[] = [];
  for (let i = START_HOUR * 60; i < END_HOUR * 60; i += SLOT_INTERVAL) {
    const h = Math.floor(i / 60);
    const m = i % 60;
    const timeString = `${h < 24 ? h : h - 24}:${m === 0 ? "00" : m}`;
    // Format for display (e.g., 09:00)
    const displayH = h < 24 ? h : h - 24;
    const formattedTime = `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    timeSlots.push({ minutes: i, label: formattedTime, fullLabel: timeString });
  }

  // Get favorite services from user's saved list
  const favoriteServices = useMemo(() => {
    return favoriteNames
      .map(name => services.find(s => s.name === name))
      .filter(Boolean);
  }, [services, favoriteNames]);

  // Toggle a service in favorites
  const toggleFavorite = (serviceName: string) => {
    setFavoriteNames(prev => {
      let updated: string[];
      if (prev.includes(serviceName)) {
        updated = prev.filter(n => n !== serviceName);
      } else if (prev.length < 4) {
        updated = [...prev, serviceName];
      } else {
        toast({ title: "الحد الأقصى 4 خدمات", variant: "destructive" });
        return prev;
      }
      localStorage.setItem('favoriteServiceNames', JSON.stringify(updated));
      return updated;
    });
  };

  // Filter services based on search
  const filteredServices = useMemo(() => {
    if (!serviceSearch) return services;
    return services.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()));
  }, [services, serviceSearch]);

  return (
    <div className={cn(
      "h-full flex flex-col gap-4 md:gap-6 transition-opacity duration-500",
      isPageReady ? "opacity-100" : "opacity-0"
    )} dir="rtl">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">التخطيط</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 md:gap-4 w-full lg:w-auto">
          <div className="flex flex-wrap items-center gap-2 flex-1 md:flex-initial">
            {staffRevenue.map(s => (
              <div key={s.id} className="bg-card px-2 py-1 md:px-3 md:py-1.5 rounded-lg border border-border shadow-sm flex items-center gap-1.5 md:gap-2 group relative">
                <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-[10px] md:text-xs font-medium text-muted-foreground">{s.name}</span>
                <span className="text-xs md:text-sm font-bold">{s.total} DH</span>
              </div>
            ))}
          </div>

          <div className="bg-card px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-border shadow-sm flex items-center gap-2">
            <span className="text-muted-foreground text-[10px] md:text-sm font-medium">إجمالي اليوم</span>
            <span className="text-lg md:text-xl font-bold text-primary">{totalRevenue} DH</span>
          </div>

          <div className="flex items-center gap-2 bg-card p-1 rounded-xl border border-border shadow-sm w-full md:w-auto justify-between md:justify-start">
            <Button variant="ghost" size="icon" onClick={() => setDate(d => addDays(d, -1))} className="h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" className={cn("flex-1 md:w-[200px] justify-start text-left font-normal h-8", !date && "text-muted-foreground")}>
                  <CalendarIcon className="ml-2 h-4 w-4" />
                  <span className="truncate">{date ? format(date, "PPP") : <span>Pick a date</span>}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" onClick={() => setDate(d => addDays(d, 1))} className="h-8 w-8">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        {/* Scrollable Container for both Header and Grid */}
        <div ref={scrollContainerRef} className="flex-1 overflow-x-auto overflow-y-auto calendar-scroll relative" id="calendar-scroll-container">
          <div className="min-w-max">
            {/* Staff Header (inside scroll) */}
            <div className="flex border-b border-border sticky top-0 z-20 bg-card/95 backdrop-blur shadow-sm">
              <div className="w-14 md:w-20 flex-shrink-0 border-l border-border bg-muted/30 flex items-center justify-center sticky right-0 z-30 bg-card">
                <Clock className="w-4 h-4 text-muted-foreground" />
              </div>
              {staffList.map(s => (
                <div key={s.id} className="flex-1 py-2 md:py-4 px-1 md:px-2 text-center border-l border-border last:border-l-0 bg-muted/5 min-w-[140px] md:min-w-[200px] flex flex-col items-center justify-center gap-1">
                  <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full shadow-sm" style={{ backgroundColor: s.color }} />
                  <span className="font-black text-[10px] md:text-base text-foreground truncate block uppercase tracking-wider">{s.name}</span>
                </div>
              ))}
            </div>

            <div className="flex relative min-h-[2400px]" style={{ height: (END_HOUR - START_HOUR) * SLOT_HEIGHT }}>
              {/* Time Column */}
              <div className="w-14 md:w-20 flex-shrink-0 border-l border-border bg-muted/5 sticky right-0 z-10">
                {timeSlots.map((slot, i) => (
                  slot.minutes % 60 === 0 && (
                    <div key={i} className="absolute w-full text-right pr-2 text-[10px] md:text-xs text-muted-foreground -mt-2" 
                         style={{ top: (slot.minutes - START_HOUR * 60) * PIXELS_PER_MINUTE }}>
                      {slot.label}
                    </div>
                  )
                ))}
              </div>

              {/* Staff Columns */}
              {staffList.map((s) => (
                <div key={s.id} className="flex-1 relative border-l border-border last:border-l-0 min-w-[140px] md:min-w-[200px]">
                  {/* Horizontal Grid Lines */}
                  {timeSlots.map((slot, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "absolute w-full border-b border-border/30 h-[15px] hover:bg-primary/5 transition-colors cursor-pointer",
                        slot.minutes % 60 === 0 && "border-border/60"
                      )}
                      style={{ 
                        top: (slot.minutes - START_HOUR * 60) * PIXELS_PER_MINUTE,
                        height: SLOT_INTERVAL * PIXELS_PER_MINUTE
                      }}
                      onClick={() => handleSlotClick(s.name, slot.label)}
                    />
                  ))}

                  {/* Appointments */}
                  {appointments
                    .filter(app => app.staff === s.name)
                    .map(app => {
                      const [h, m] = app.startTime.split(':').map(Number);
                      const startMinutes = h * 60 + m;
                      const offsetMinutes = startMinutes - (START_HOUR * 60);
                      const top = offsetMinutes * PIXELS_PER_MINUTE;
                      const height = app.duration * PIXELS_PER_MINUTE;

                      const staffColor = staffList.find(st => st.name === s.name)?.color || "var(--primary)";

                      return (
                        <div
                          key={app.id}
                          className={cn(
                            "absolute left-0.5 right-0.5 md:left-1 md:right-1 rounded-lg md:rounded-xl p-1 md:p-3 text-[10px] md:text-xs border transition-all overflow-hidden flex flex-col justify-between shadow-sm",
                            isAdmin ? "cursor-pointer hover:brightness-95 hover:shadow-xl hover:z-10" : "cursor-default"
                          )}
                          style={{ 
                            top, 
                            height: Math.max(height, 40),
                            backgroundColor: staffColor,
                            borderColor: `${staffColor}40`,
                            color: "#ffffff"
                          }}
                          onClick={(e) => handleAppointmentClick(e, app)}
                        >
                      <div className="flex flex-col items-center justify-center h-full gap-0.5 md:gap-1">
                        <div className="flex flex-col items-center gap-0.5 w-full overflow-hidden">
                          <div className={cn(
                            "font-black px-1.5 md:px-3 py-0.5 md:py-1 rounded-full bg-white/30 dark:bg-black/30 border md:border-2 border-current shadow-sm shrink-0 leading-tight text-center break-words max-w-full",
                            app.duration >= 45 ? 'text-[10px] md:text-sm' : 'text-[8px] md:text-xs'
                          )} style={{ color: "inherit" }}>
                            {app.service}
                          </div>
                          <span className="text-[8px] md:text-[10px] font-bold opacity-90 truncate max-w-full">
                            {app.client}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between border-t border-black/5 pt-0.5 w-full">
                          <div className="hidden md:flex items-center gap-1 opacity-80">
                            <Clock className="w-2.5 h-2.5" />
                            <span className="text-[9px]">{app.duration} م</span>
                          </div>
                          <div className="font-bold text-[9px] md:text-xs w-full text-center md:w-auto">{app.total} DH</div>
                        </div>
                      </div>

                          {/* Status badge / Pay button */}
                          {app.paid ? (
                            <div className="absolute bottom-1 left-1 md:bottom-2 md:left-2 w-3 h-3 md:w-4 md:h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                              <Check className="w-2 h-2 md:w-3 md:h-3 text-white" />
                            </div>
                          ) : (
                            <button
                              onClick={(e) => handleMarkAsPaid(e, app)}
                              className="absolute bottom-1 left-1 md:bottom-2 md:left-2 bg-white hover:bg-emerald-500 hover:text-white text-emerald-600 rounded-lg px-2 py-1 md:px-3 md:py-1.5 transition-all shadow-lg flex items-center gap-1 text-[10px] md:text-xs font-bold border border-emerald-200 hover:border-emerald-500"
                              title="تأكيد الدفع"
                            >
                              <CreditCard className="w-3 h-3 md:w-4 md:h-4" />
                              <span>دفع</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              ))}
              
              {/* Current Time Indicator */}
              {nowLinePosition !== null && (
                <div 
                  className="absolute left-0 right-0 h-0.5 bg-red-500 z-50 pointer-events-none flex items-center"
                  style={{ top: nowLinePosition }}
                >
                  <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-red-500 -mr-0.5 md:-ml-1" />
                  <div className="bg-red-500 text-white text-[8px] md:text-[10px] px-1 rounded-sm mr-1 font-bold">
                    {format(now, "HH:mm")}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) setIsEditFavoritesOpen(false);
      }}>
        <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden border-0 shadow-2xl bg-gradient-to-br from-pink-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 p-5 text-white">
            <DialogHeader>
              <DialogTitle className="text-xl font-black flex items-center gap-2 text-white">
                <Sparkles className="w-5 h-5" />
                {editingAppointment ? "تعديل الموعد" : "موعد جديد"}
              </DialogTitle>
            </DialogHeader>
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-5 space-y-5">
              
              {/* Price Section - Hero Card */}
              <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl p-4 border-2 border-emerald-500/30 shadow-sm">
                <FormField
                  control={form.control}
                  name="total"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-2 text-base">
                        <CreditCard className="w-4 h-4" />
                        السعر الإجمالي
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            type="number" 
                            className="text-3xl h-16 font-black border-2 border-emerald-500/50 bg-white dark:bg-gray-800 rounded-xl text-center pr-16 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" 
                            {...field} 
                          />
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-emerald-600">DH</span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Client Section */}
              <div className="bg-white/70 dark:bg-gray-800/50 rounded-2xl p-4 border border-border/50 shadow-sm backdrop-blur">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-blue-500" />
                  </div>
                  <span className="font-bold text-sm text-blue-600 dark:text-blue-400">معلومات العميل</span>
                </div>
                <FormField
                  control={form.control}
                  name="client"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input 
                          placeholder="اسم العميل..." 
                          className="h-11 rounded-xl border-border/50 bg-white/50 dark:bg-gray-700/50"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Schedule Section */}
              <div className="bg-white/70 dark:bg-gray-800/50 rounded-2xl p-4 border border-border/50 shadow-sm backdrop-blur">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <Timer className="w-4 h-4 text-purple-500" />
                  </div>
                  <span className="font-bold text-sm text-purple-600 dark:text-purple-400">الجدول الزمني</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="staff"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">الموظف</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-10 rounded-xl border-border/50 bg-white/50 dark:bg-gray-700/50">
                              <SelectValue placeholder="اختر" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {staffList.map(s => (
                              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">وقت البدء</FormLabel>
                        <FormControl>
                          <Input 
                            type="time" 
                            className="h-10 rounded-xl border-border/50 bg-white/50 dark:bg-gray-700/50"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">المدة (د)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            className="h-10 rounded-xl border-border/50 bg-white/50 dark:bg-gray-700/50"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Service Section */}
              <div className="bg-white/70 dark:bg-gray-800/50 rounded-2xl p-4 border border-border/50 shadow-sm backdrop-blur">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                    <Scissors className="w-4 h-4 text-orange-500" />
                  </div>
                  <span className="font-bold text-sm text-orange-600 dark:text-orange-400">الخدمة</span>
                </div>
                <FormField
                  control={form.control}
                  name="service"
                  render={({ field }) => (
                    <FormItem>
                      <div className="space-y-3">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="outline" 
                              role="combobox" 
                              className={cn(
                                "w-full justify-between h-11",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value || "ابحث واختر الخدمة..."}
                              <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[450px] p-0" align="start">
                            <div className="flex flex-col">
                              <div className="p-3 border-b border-border">
                                <div className="relative">
                                  <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                                  <Input 
                                    placeholder="ابحث عن خدمة..." 
                                    className="pr-9 h-10"
                                    value={serviceSearch}
                                    onChange={(e) => setServiceSearch(e.target.value)}
                                    autoFocus
                                  />
                                </div>
                              </div>
                              <div className="max-h-[300px] overflow-y-auto p-1">
                                {filteredServices.length === 0 ? (
                                  <div className="py-6 text-center text-sm text-muted-foreground">
                                    لم يتم العثور على خدمات
                                  </div>
                                ) : (
                                  filteredServices.map(s => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      className={cn(
                                        "w-full text-right px-3 py-2 text-sm rounded-sm hover:bg-primary/10 transition-colors flex items-center justify-between group",
                                        field.value === s.name && "bg-primary/5 font-bold"
                                      )}
                                      onClick={() => {
                                        handleServiceChange(s.name);
                                      }}
                                    >
                                      <span>{s.name}</span>
                                      <span className="text-[10px] text-muted-foreground group-hover:text-primary">{s.price} DH</span>
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                        
                        {/* Favorite Services */}
                        {!editingAppointment && !serviceSearch && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-[10px] text-muted-foreground">الخدمات المفضلة</Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => setIsEditFavoritesOpen(!isEditFavoritesOpen)}
                              >
                                <Settings2 className="w-3 h-3 ml-1" />
                                {isEditFavoritesOpen ? "إغلاق" : "تعديل"}
                              </Button>
                            </div>
                            
                            {isEditFavoritesOpen ? (
                              <div className="border border-dashed border-primary/30 rounded-lg p-3 bg-primary/5 max-h-[200px] overflow-y-auto">
                                <p className="text-[10px] text-muted-foreground mb-2">اختر حتى 4 خدمات ({favoriteNames.length}/4)</p>
                                <div className="flex flex-wrap gap-2">
                                  {services.map((s) => (
                                    <Button
                                      key={s.id}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className={cn(
                                        "h-7 text-[10px] rounded-full transition-all",
                                        favoriteNames.includes(s.name) 
                                          ? "bg-primary text-primary-foreground border-primary" 
                                          : "border-border hover:border-primary/50"
                                      )}
                                      onClick={() => toggleFavorite(s.name)}
                                    >
                                      {favoriteNames.includes(s.name) && <Check className="w-3 h-3 ml-1" />}
                                      {s.name}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            ) : favoriteServices.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {favoriteServices.map((s: any) => (
                                  <Button
                                    key={s.id}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                      "h-8 text-[11px] md:text-xs rounded-full border-primary/30 bg-primary/5 hover:bg-primary/10",
                                      field.value === s.name && "bg-primary text-primary-foreground border-solid ring-2 ring-primary ring-offset-1"
                                    )}
                                    onClick={() => handleServiceChange(s.name)}
                                  >
                                    <Star className={cn("w-3 h-3 ml-1", field.value === s.name ? "fill-current" : "text-primary")} />
                                    {s.name}
                                  </Button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[10px] text-muted-foreground">انقر على "تعديل" لاختيار الخدمات المفضلة</p>
                            )}
                          </div>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                {editingAppointment && (
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1 h-12 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all"
                    onClick={() => {
                      if (confirm("هل أنت متأكد من حذف هذا الموعد؟")) {
                        deleteMutation.mutate(editingAppointment.id);
                        setIsDialogOpen(false);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 ml-2" />
                    حذف
                  </Button>
                )}
                <Button 
                  type="submit" 
                  className="flex-1 h-14 text-lg font-black rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 hover:from-pink-600 hover:via-purple-600 hover:to-indigo-600 shadow-xl hover:shadow-2xl transition-all transform hover:scale-[1.02]" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  <Sparkles className="w-5 h-5 ml-2" />
                  {editingAppointment ? "تحديث الموعد" : "تأكيد الموعد"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
