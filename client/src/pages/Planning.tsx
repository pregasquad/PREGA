import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { format, addDays, startOfToday, parseISO } from "date-fns";
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
import { CalendarIcon, ChevronLeft, ChevronRight, Plus, Trash2, Check, X, Search, Star, RefreshCw, Sparkles, CreditCard, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertAppointmentSchema, insertStaffSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const hours = [
  "00:00","00:30","01:00","01:30","02:00","02:30",
  "03:00","03:30","04:00","04:30","05:00","05:30",
  "06:00","06:30","07:00","07:30","08:00","08:30",
  "09:00","09:30","10:00","10:30","11:00","11:30",
  "12:00","12:30","13:00","13:30","14:00","14:30",
  "15:00","15:30","16:00","16:30","17:00","17:30",
  "18:00","18:30","19:00","19:30","20:00","20:30",
  "21:00","21:30","22:00","22:30","23:00","23:30"
];

const formSchema = insertAppointmentSchema.extend({
  price: z.coerce.number(),
  duration: z.coerce.number(),
  total: z.coerce.number(),
});

type AppointmentFormValues = z.infer<typeof formSchema>;

export default function Planning() {
  const [date, setDate] = useState<Date>(startOfToday());
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
  const { toast } = useToast();

  const formattedDate = format(date, "yyyy-MM-dd");
  
  const { data: appointments = [], isLoading: loadingApps } = useAppointments(formattedDate);
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
      toast({ title: "تم التأكيد", description: "تم تأكيد الدفع بنجاح" });
    } catch (error) {
      toast({ title: "خطأ", description: "فشل تأكيد الدفع", variant: "destructive" });
    }
  };

  const favoriteServices = useMemo(() => {
    return favoriteNames.map(name => services.find(s => s.name === name)).filter(Boolean);
  }, [services, favoriteNames]);

  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return services;
    return services.filter(s => 
      s.name.toLowerCase().includes(serviceSearch.toLowerCase())
    );
  }, [services, serviceSearch]);

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
    <div className="min-h-screen bg-background p-2 md:p-4" dir="rtl">
      {/* Header */}
      <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <h1 className="text-xl md:text-2xl font-bold">PREGA SQUAD – التخطيط</h1>
        
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
                toast({ title: "تم التحديث", description: "تم تحديث البيانات بنجاح" });
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
            حجز جديد
          </Button>
        </div>
      </div>

      {/* Board */}
      <div className="overflow-x-auto bg-card rounded-xl border shadow-sm">
        <div 
          className="grid" 
          style={{ gridTemplateColumns: `80px repeat(${staffList.length}, minmax(120px, 1fr))` }}
        >
          {/* Top row - Staff headers */}
          <div className="bg-muted/50 border-b border-l p-2"></div>
          {staffList.map((s) => (
            <div 
              key={s.id} 
              className="bg-muted/50 border-b border-l p-2 md:p-3 font-bold text-center text-xs md:text-sm"
            >
              <div className="flex items-center justify-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span>{s.name}</span>
              </div>
            </div>
          ))}

          {/* Time rows */}
          {hours.map((hour) => (
            <React.Fragment key={hour}>
              <div 
                className="bg-muted/30 border-b border-l p-2 text-xs text-muted-foreground font-medium"
              >
                {hour}
              </div>

              {staffList.map((s) => {
                const booking = getBooking(s.name, hour);
                const isCovered = isSlotCovered(s.name, hour);

                if (isCovered) {
                  return null;
                }

                const span = booking ? getBookingSpan(booking) : 1;

                return (
                  <div
                    key={`${s.id}-${hour}`}
                    className={cn(
                      "border-b border-l p-1 min-h-[48px] transition-colors",
                      booking 
                        ? "text-white cursor-pointer m-0.5 rounded-xl shadow-md" 
                        : "bg-background hover:bg-muted/50 cursor-pointer"
                    )}
                    style={booking ? { 
                      gridRow: `span ${span}`,
                      backgroundColor: s.color 
                    } : undefined}
                    onClick={(e) => booking ? handleAppointmentClick(e, booking) : handleSlotClick(s.name, hour)}
                  >
                    {booking && (
                      <div className="h-full flex flex-col justify-between p-1">
                        <div>
                          <div className="font-bold text-xs md:text-sm truncate">{booking.client || "—"}</div>
                          <div className="text-[10px] md:text-xs opacity-90 truncate">{booking.service}</div>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] opacity-80">{booking.duration}د</span>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-xs">{booking.total} DH</span>
                            {booking.paid ? (
                              <Check className="w-3 h-3 text-white" />
                            ) : (
                              <button
                                onClick={(e) => handleMarkAsPaid(e, booking)}
                                className="bg-white/20 hover:bg-white/30 rounded-full p-0.5"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Appointment Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) setIsEditFavoritesOpen(false);
      }}>
        <DialogContent className="sm:max-w-[380px] p-0 overflow-hidden border-2 border-primary/20 shadow-2xl bg-gradient-to-br from-pink-50/80 via-white to-cyan-50/80 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900" dir="rtl">
          {/* Compact Header */}
          <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 px-3 py-2 text-white">
            <DialogHeader>
              <DialogTitle className="text-sm font-black flex items-center gap-2 text-white">
                <Sparkles className="w-3 h-3" />
                {editingAppointment ? "تعديل الموعد" : "موعد جديد"}
              </DialogTitle>
            </DialogHeader>
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-3 space-y-2">
              
              {/* Price Row */}
              <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-lg p-2 border border-emerald-500/30">
                <CreditCard className="w-4 h-4 text-emerald-600 shrink-0" />
                <FormField
                  control={form.control}
                  name="total"
                  render={({ field }) => (
                    <FormItem className="flex-1 space-y-0">
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="السعر"
                          className="text-xl h-10 font-black border-0 bg-white dark:bg-gray-800 rounded-lg text-center" 
                          {...field} 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <span className="text-sm font-bold text-emerald-600">DH</span>
              </div>

              {/* All Fields Grid */}
              <div className="grid grid-cols-2 gap-2">
                <FormField
                  control={form.control}
                  name="client"
                  render={({ field }) => (
                    <FormItem className="col-span-2 space-y-1">
                      <FormLabel className="text-[10px] text-muted-foreground">العميل</FormLabel>
                      <FormControl>
                        <Input placeholder="اسم العميل..." className="h-8 rounded-lg text-xs" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="staff"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[10px] text-muted-foreground">الموظف</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-8 rounded-lg text-xs">
                            <SelectValue placeholder="اختر" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
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
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[10px] text-muted-foreground">الوقت</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-8 rounded-lg text-xs">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60">
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
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[10px] text-muted-foreground">المدة (د)</FormLabel>
                      <FormControl>
                        <Input type="number" className="h-8 rounded-lg text-xs" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paid"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 pt-4">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="w-4 h-4 accent-emerald-500"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0 text-xs">مدفوع</FormLabel>
                    </FormItem>
                  )}
                />

                {/* Service with Quick Favorites */}
                <FormField
                  control={form.control}
                  name="service"
                  render={({ field }) => (
                    <FormItem className="col-span-2 space-y-1">
                      <FormLabel className="text-[10px] text-muted-foreground">الخدمة</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className="h-9 w-full justify-between rounded-lg text-xs border-2 hover:border-primary/50 transition-colors"
                            >
                              <span className="truncate">{field.value || "اختر خدمة..."}</span>
                              <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent 
                          className="w-[320px] p-0 shadow-xl border-2" 
                          align="start"
                          onWheel={(e) => e.stopPropagation()}
                        >
                          <div className="p-3 border-b bg-muted/30">
                            <div className="relative">
                              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="ابحث عن خدمة..."
                                value={serviceSearch}
                                onChange={(e) => setServiceSearch(e.target.value)}
                                className="pr-10 h-10 text-sm rounded-lg border-2 focus:border-primary"
                                autoFocus
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2 text-center">
                              {filteredServices.length} خدمة متاحة
                            </p>
                          </div>
                          <div 
                            className="max-h-[250px] overflow-y-scroll p-2 space-y-1"
                            style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
                            onWheel={(e) => {
                              e.stopPropagation();
                              const target = e.currentTarget;
                              target.scrollTop += e.deltaY;
                            }}
                          >
                            {filteredServices.map(s => (
                              <div
                                key={s.id}
                                className={cn(
                                  "flex items-center justify-between p-3 rounded-xl cursor-pointer text-sm transition-all",
                                  "hover:bg-gradient-to-r hover:from-primary/10 hover:to-transparent",
                                  field.value === s.name 
                                    ? "bg-gradient-to-r from-primary/20 to-primary/5 border-r-4 border-primary font-medium" 
                                    : "hover:translate-x-1"
                                )}
                                onClick={() => {
                                  handleServiceChange(s.name);
                                  setServiceSearch("");
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  {field.value === s.name && <Check className="h-4 w-4 text-primary" />}
                                  <span>{s.name}</span>
                                </div>
                                <span className="text-xs font-bold text-primary">{s.price} DH</span>
                              </div>
                            ))}
                            {filteredServices.length === 0 && (
                              <div className="p-6 text-center">
                                <Search className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                                <p className="text-sm text-muted-foreground">لا توجد نتائج</p>
                              </div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                      
                      {/* Quick Favorites */}
                      {!editingAppointment && (
                        <div className="pt-2">
                          <p className="text-[10px] text-muted-foreground mb-1">الخدمات المفضلة:</p>
                          <div className="flex flex-wrap items-center gap-2">
                            {favoriteServices.slice(0, 4).map((s: any) => (
                              <Button
                                key={s.id}
                                type="button"
                                variant="outline"
                                size="sm"
                                className={cn(
                                  "h-9 text-xs px-3 rounded-xl font-medium transition-all",
                                  field.value === s.name 
                                    ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white border-0 shadow-lg" 
                                    : "bg-muted/30 hover:bg-muted border-2 hover:border-primary/50"
                                )}
                                onClick={() => handleServiceChange(s.name)}
                              >
                                {field.value === s.name && <Check className="w-3 h-3 ml-1" />}
                                {s.name}
                              </Button>
                            ))}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-xl text-muted-foreground hover:text-primary hover:bg-muted"
                              onClick={() => setIsEditFavoritesOpen(!isEditFavoritesOpen)}
                            >
                              <Settings2 className="w-4 h-4" />
                            </Button>
                          </div>
                          
                          {isEditFavoritesOpen && (
                            <div className="mt-2 border border-dashed border-primary/30 rounded-lg p-2 bg-primary/5 max-h-[120px] overflow-y-auto">
                              <p className="text-[9px] text-muted-foreground mb-1">اختر حتى 4 ({favoriteNames.length}/4)</p>
                              <div className="flex flex-wrap gap-1">
                                {services.map((s) => (
                                  <Button
                                    key={s.id}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                      "h-5 text-[9px] px-1.5 rounded-full",
                                      favoriteNames.includes(s.name) 
                                        ? "bg-primary text-primary-foreground border-primary" 
                                        : "border-border/50"
                                    )}
                                    onClick={() => toggleFavorite(s.name)}
                                  >
                                    {favoriteNames.includes(s.name) && <Check className="w-2 h-2 ml-0.5" />}
                                    {s.name}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </FormItem>
                  )}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-1">
                {editingAppointment && (
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-10 px-4 rounded-lg font-bold text-sm"
                    onClick={() => {
                      if (confirm("هل أنت متأكد من حذف هذا الموعد؟")) {
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
                  className="flex-1 h-11 text-sm font-black rounded-lg bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 hover:from-pink-600 hover:via-purple-600 hover:to-indigo-600 shadow-lg transition-all" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  <Sparkles className="w-4 h-4 ml-2" />
                  {editingAppointment ? "تحديث" : "تأكيد الموعد"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
