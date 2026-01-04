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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarIcon, ChevronLeft, ChevronRight, Plus, Trash2, Check, X, Search, Star, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertAppointmentSchema, insertStaffSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const hours = [
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

  const filteredServices = useMemo(() => {
    if (!serviceSearch) return services;
    return services.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()));
  }, [services, serviceSearch]);

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
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/appointments"] })}
            >
              <RefreshCw className="w-3 h-3" />
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
                        ? "text-white cursor-pointer" 
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
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingAppointment ? "تعديل الحجز" : "حجز جديد"}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Favorite Services */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">خدمات مفضلة</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setIsEditFavoritesOpen(!isEditFavoritesOpen)}
                  >
                    <Star className="w-3 h-3 ml-1" />
                    تعديل
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {favoriteServices.map((service: any) => (
                    <Button
                      key={service.id}
                      type="button"
                      variant={form.watch("service") === service.name ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-8 justify-start"
                      onClick={() => handleServiceChange(service.name)}
                    >
                      {service.name}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Edit Favorites */}
              {isEditFavoritesOpen && (
                <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                  <Label className="text-xs">اختر حتى 4 خدمات مفضلة</Label>
                  <div className="relative">
                    <Search className="absolute right-2 top-2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث..."
                      value={serviceSearch}
                      onChange={(e) => setServiceSearch(e.target.value)}
                      className="pr-8 h-8 text-xs"
                    />
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {filteredServices.slice(0, 20).map((service: any) => (
                      <div
                        key={service.id}
                        className={cn(
                          "flex items-center justify-between p-2 rounded cursor-pointer text-xs",
                          favoriteNames.includes(service.name) ? "bg-primary/10" : "hover:bg-muted"
                        )}
                        onClick={() => toggleFavorite(service.name)}
                      >
                        <span>{service.name}</span>
                        {favoriteNames.includes(service.name) && <Star className="w-3 h-3 fill-primary text-primary" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Service Selector */}
              <FormField
                control={form.control}
                name="service"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الخدمة</FormLabel>
                    <Select value={field.value} onValueChange={handleServiceChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر خدمة" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-60">
                        {services.map((s: any) => (
                          <SelectItem key={s.id} value={s.name}>
                            {s.name} - {s.price} DH
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Client */}
              <FormField
                control={form.control}
                name="client"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>العميل</FormLabel>
                    <FormControl>
                      <Input placeholder="اسم العميل (رقم الهاتف)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Staff */}
              <FormField
                control={form.control}
                name="staff"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الموظف</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر موظف" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {staffList.map((s: any) => (
                          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Time */}
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الوقت</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-60">
                        {hours.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Duration & Price */}
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="duration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>المدة (دقيقة)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="total"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>المجموع (DH)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Paid */}
              <FormField
                control={form.control}
                name="paid"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        className="w-4 h-4"
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">تم الدفع</FormLabel>
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-2">
                {editingAppointment && isAdmin && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      if (confirm("هل أنت متأكد من الحذف؟")) {
                        deleteMutation.mutate(editingAppointment.id);
                        setIsDialogOpen(false);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 ml-1" />
                    حذف
                  </Button>
                )}
                <Button type="submit">
                  <Check className="w-4 h-4 ml-1" />
                  {editingAppointment ? "حفظ" : "إضافة"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
