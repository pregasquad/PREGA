import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { queryClient } from "@/lib/queryClient";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ar, enUS, fr } from "date-fns/locale";
import { Clock, CheckCircle2, Scissors, User, Phone, CalendarDays, Sparkles, X, Users, Gift, Tag } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics";
import { io, Socket } from "socket.io-client";

const bookingSchema = z.object({
  client: z.string().min(1),
  service: z.string().optional(),
  staff: z.string().optional(),
  duration: z.coerce.number(),
  price: z.coerce.number(),
  total: z.coerce.number(),
  phone: z.string().optional(),
});

interface SelectedService {
  name: string;
  price: number;
  duration: number;
}

type BookingFormValues = z.infer<typeof bookingSchema>;

interface Staff {
  id: number;
  name: string;
  color: string;
  categories: string | null;
}

interface Service {
  id: number;
  name: string;
  category: string;
  duration: number;
  price: number;
}

interface MinimalAppointment {
  staff: string;
  startTime: string;
  duration: number;
  date: string;
}

interface Package {
  id: number;
  name: string;
  description: string | null;
  services: number[];
  originalPrice: number;
  discountedPrice: number;
  validFrom: string | null;
  validUntil: string | null;
}

interface BookingResult {
  success: boolean;
  multipleAppointments?: boolean;
  count?: number;
  id?: number;
  date?: string;
  startTime?: string;
  service?: string;
  staff?: string;
  appointments?: Array<{
    id: number;
    date: string;
    startTime: string;
    service: string;
    staff: string;
    duration: number;
  }>;
}

const TIME_SLOTS = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30", "22:00", "22:30",
  "23:00", "23:30", "00:00"
];

export default function Booking() {
  const { t, i18n } = useTranslation();
  const [date, setDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<MinimalAppointment[]>([]);
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const [visitorCount, setVisitorCount] = useState<number>(0);
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);

  useEffect(() => {
    i18n.changeLanguage("fr");
  }, []);

  useEffect(() => {
    const socket: Socket = io(window.location.origin, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    socket.on("connect", () => {
      socket.emit("booking:join");
    });

    socket.on("booking:viewers", (count: number) => {
      setVisitorCount(count);
    });

    return () => {
      socket.emit("booking:leave");
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    fetch("/api/public/staff")
      .then(res => res.json())
      .then(data => setStaffList(data))
      .catch(console.error);
    
    fetch("/api/public/services")
      .then(res => res.json())
      .then(data => setServices(data))
      .catch(console.error);
    
    fetch("/api/public/packages")
      .then(res => res.json())
      .then(data => setPackages(data))
      .catch(console.error);
  }, []);

  const formattedDate = date ? format(date, "yyyy-MM-dd") : "";

  useEffect(() => {
    if (formattedDate) {
      fetch(`/api/public/appointments?date=${formattedDate}`)
        .then(res => res.json())
        .then(data => setAppointments(data))
        .catch(console.error);
    }
  }, [formattedDate]);
  
  const getDateLocale = () => {
    switch (i18n.language) {
      case "ar": return ar;
      case "fr": return fr;
      default: return enUS;
    }
  };

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      client: "",
      service: "",
      staff: "",
      duration: 30,
      price: 0,
      total: 0,
      phone: "",
    },
  });

  const selectedStaff = form.watch("staff");
  const selectedService = form.watch("service");
  const serviceDuration = form.watch("duration");

  const selectedStaffData = useMemo(() => {
    return staffList.find(s => s.name === selectedStaff);
  }, [staffList, selectedStaff]);

  const filteredServices = useMemo(() => {
    if (!selectedStaffData || !selectedStaffData.categories) {
      return services;
    }
    const staffCategories = new Set(
      selectedStaffData.categories.split(",").map(c => c.trim())
    );
    return services.filter(s => staffCategories.has(s.category));
  }, [services, selectedStaffData]);

  const filteredCategories = useMemo(() => {
    return Array.from(new Set(filteredServices.map(s => s.category)));
  }, [filteredServices]);

  const getAvailableSlots = useMemo(() => {
    if (!date) return [];
    
    const duration = serviceDuration || 30;
    
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    return TIME_SLOTS.filter(slot => {
      const slotMinutes = parseInt(slot.split(":")[0]) * 60 + parseInt(slot.split(":")[1]);
      
      if (isToday && slotMinutes <= currentMinutes) {
        return false;
      }
      
      return true;
    });
  }, [date, serviceDuration]);

  const onSubmit = async (data: BookingFormValues) => {
    if (!date || !selectedTime || selectedServices.length === 0) return;
    setIsSubmitting(true);
    
    const clientName = data.phone ? `${data.client} (${data.phone})` : data.client;
    const serviceNames = selectedPackage 
      ? `${selectedPackage.name} (${selectedServices.map(s => s.name).join(", ")})`
      : selectedServices.map(s => s.name).join(", ");
    const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);
    const totalPrice = selectedPackage ? selectedPackage.discountedPrice : selectedServices.reduce((sum, s) => sum + s.price, 0);
    
    const appointmentData = {
      client: clientName,
      service: serviceNames,
      staff: data.staff,
      duration: totalDuration,
      price: totalPrice,
      total: totalPrice,
      date: formattedDate, 
      startTime: selectedTime,
      phone: data.phone || undefined,
      servicesJson: selectedServices,
    };
    
    try {
      const res = await fetch("/api/public/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appointmentData),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to book appointment");
      }
      
      const result: BookingResult = await res.json();
      setBookingResult(result);
      setIsSuccess(true);
      setSelectedServices([]);
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      trackEvent("booking_completed", "booking", serviceNames, totalPrice);
    } catch (error) {
      console.error("Booking failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddService = (serviceName: string) => {
    const service = filteredServices.find(s => s.name === serviceName);
    if (service && !selectedServices.some(s => s.name === serviceName)) {
      const newSelectedServices = [...selectedServices, { name: service.name, price: service.price, duration: service.duration }];
      setSelectedServices(newSelectedServices);
      const totalDuration = newSelectedServices.reduce((sum, s) => sum + s.duration, 0);
      const totalPrice = newSelectedServices.reduce((sum, s) => sum + s.price, 0);
      form.setValue("service", newSelectedServices.map(s => s.name).join(", "));
      form.setValue("duration", totalDuration);
      form.setValue("price", totalPrice);
      form.setValue("total", totalPrice);
    }
  };

  const handleRemoveService = (index: number) => {
    const newSelectedServices = selectedServices.filter((_, i) => i !== index);
    setSelectedServices(newSelectedServices);
    setSelectedPackage(null);
    const totalDuration = newSelectedServices.reduce((sum, s) => sum + s.duration, 0);
    const totalPrice = newSelectedServices.reduce((sum, s) => sum + s.price, 0);
    form.setValue("service", newSelectedServices.map(s => s.name).join(", "));
    form.setValue("duration", totalDuration);
    form.setValue("price", totalPrice);
    form.setValue("total", totalPrice);
  };

  const handleSelectPackage = (pkg: Package) => {
    const packageServices = pkg.services
      .map(serviceId => services.find(s => s.id === serviceId))
      .filter((s): s is Service => s !== undefined)
      .map(s => ({ name: s.name, price: s.price, duration: s.duration }));
    
    if (packageServices.length === 0) return;
    
    setSelectedPackage(pkg);
    setSelectedServices(packageServices);
    const totalDuration = packageServices.reduce((sum, s) => sum + s.duration, 0);
    form.setValue("service", packageServices.map(s => s.name).join(", "));
    form.setValue("duration", totalDuration);
    form.setValue("price", pkg.discountedPrice);
    form.setValue("total", pkg.discountedPrice);
  };

  const handleClearPackage = () => {
    setSelectedPackage(null);
    setSelectedServices([]);
    form.setValue("service", "");
    form.setValue("duration", 30);
    form.setValue("price", 0);
    form.setValue("total", 0);
  };

  const canSubmit = selectedServices.length > 0 && date && selectedTime && form.watch("client");

  if (isSuccess) {
    const hasMultipleAppointments = bookingResult?.multipleAppointments && bookingResult.appointments;
    
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
        
        <div className="glass-card w-full max-w-md text-center py-12 px-8 space-y-6 relative z-10">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 backdrop-blur-sm flex items-center justify-center border border-emerald-500/20">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 animate-in zoom-in duration-500" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-display font-bold">{t("booking.bookingConfirmed")}</h1>
            <p className="text-muted-foreground text-base">{t("booking.thankYou")}</p>
            {hasMultipleAppointments && (
              <p className="text-sm text-primary font-medium">
                {t("booking.multipleAppointments", { count: bookingResult.count, defaultValue: `${bookingResult.count} rendez-vous créés` })}
              </p>
            )}
          </div>
          
          {hasMultipleAppointments ? (
            <div className="space-y-3">
              {bookingResult.appointments!.map((appt, index) => (
                <div key={appt.id} className="glass-subtle rounded-2xl p-4 text-sm space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-full">
                      RDV {index + 1}
                    </span>
                    <span className="text-xs text-muted-foreground">{appt.duration} min</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {t("booking.time")}
                    </span>
                    <span className="font-semibold">{appt.startTime}</span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Scissors className="w-4 h-4" />
                      {t("booking.service")}
                    </span>
                    <span className="font-semibold text-right max-w-[150px] text-sm">{appt.service}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <User className="w-4 h-4" />
                      {t("booking.staff", { defaultValue: "Spécialiste" })}
                    </span>
                    <span className={cn(
                      "font-semibold text-sm",
                      appt.staff === "À assigner" ? "text-orange-500" : "text-emerald-500"
                    )}>
                      {appt.staff}
                    </span>
                  </div>
                </div>
              ))}
              <div className="glass-subtle rounded-2xl p-4 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    {t("common.date")}
                  </span>
                  <span className="font-semibold">{date && format(date, "PPP", { locale: getDateLocale() })}</span>
                </div>
                <div className="flex justify-between items-center border-t border-border/50 pt-3 mt-3">
                  <span className="text-muted-foreground">{t("common.price")}</span>
                  <span className="font-bold text-primary text-xl">{form.getValues("total")} {t("common.currency")}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-subtle rounded-2xl p-5 text-sm space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  {t("common.date")}
                </span>
                <span className="font-semibold">{date && format(date, "PPP", { locale: getDateLocale() })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {t("booking.time")}
                </span>
                <span className="font-semibold">{selectedTime}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Scissors className="w-4 h-4" />
                  {t("booking.service")}
                </span>
                <span className="font-semibold text-right max-w-[180px]">{form.getValues("service")}</span>
              </div>
              {bookingResult?.staff && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <User className="w-4 h-4" />
                    {t("booking.staff", { defaultValue: "Spécialiste" })}
                  </span>
                  <span className={cn(
                    "font-semibold",
                    bookingResult.staff === "À assigner" ? "text-orange-500" : "text-emerald-500"
                  )}>
                    {bookingResult.staff}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-border/50 pt-3 mt-3">
                <span className="text-muted-foreground">{t("common.price")}</span>
                <span className="font-bold text-primary text-xl">{form.getValues("total")} {t("common.currency")}</span>
              </div>
            </div>
          )}
          
          <Button onClick={() => window.location.reload()} className="w-full h-12 text-lg mt-4 rounded-2xl">
            {t("booking.newBooking")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 relative overflow-hidden" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl opacity-60" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent/20 rounded-full blur-3xl opacity-60" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl opacity-40" />
      
      <div className="max-w-4xl mx-auto space-y-6 relative z-10 animate-fade-in">
        <div className="flex justify-between items-center mb-2">
          {visitorCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground/80">
              <Users className="w-4 h-4" />
              <span>{visitorCount} {t("booking.activeVisitors", { defaultValue: "en ligne" })}</span>
            </div>
          )}
          {visitorCount === 0 && <div />}
          <LanguageSwitcher />
        </div>
        <div className="text-center space-y-3 py-4">
          <div className="flex justify-center mb-4">
            <img src="/prega_logo.png" alt="PregaSquad" className="w-24 h-24" />
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold gradient-text">
            {t("booking.title")}
          </h1>
          <p className="text-muted-foreground">{t("booking.subtitle")}</p>
        </div>

        <div className="glass-card p-6 md:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <FormField
                    control={form.control}
                    name="client"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2 text-sm font-medium">
                          <User className="w-4 h-4 text-primary" />
                          {t("booking.fullName")}
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder={t("booking.enterName")} 
                            className="h-12 rounded-xl bg-background/50 backdrop-blur-sm border-border/50 focus:border-primary/50" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2 text-sm font-medium">
                          <Phone className="w-4 h-4 text-primary" />
                          {t("booking.phoneOptional")}
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="06XXXXXXXX" 
                            className="h-12 rounded-xl bg-background/50 backdrop-blur-sm border-border/50 focus:border-primary/50" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {packages.length > 0 && (
                    <div className="space-y-3">
                      <FormLabel className="flex items-center gap-2 text-sm font-medium">
                        <Gift className="w-4 h-4 text-primary" />
                        {t("booking.packages", { defaultValue: "Forfaits" })}
                      </FormLabel>
                      <div className="grid gap-3">
                        {packages.map(pkg => {
                          const savings = pkg.originalPrice - pkg.discountedPrice;
                          const savingsPercent = pkg.originalPrice > 0 ? Math.round((savings / pkg.originalPrice) * 100) : 0;
                          const isSelected = selectedPackage?.id === pkg.id;
                          
                          return (
                            <button
                              key={pkg.id}
                              type="button"
                              onClick={() => isSelected ? handleClearPackage() : handleSelectPackage(pkg)}
                              className={cn(
                                "w-full text-left p-4 rounded-2xl border-2 transition-all relative overflow-hidden",
                                "bg-background/50 backdrop-blur-sm hover:bg-background/80",
                                isSelected
                                  ? "border-primary ring-2 ring-primary/20 shadow-lg bg-primary/5"
                                  : "border-border/50 hover:border-primary/30"
                              )}
                            >
                              {isSelected && (
                                <div className="absolute top-2 right-2">
                                  <CheckCircle2 className="w-5 h-5 text-primary" />
                                </div>
                              )}
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-base">{pkg.name}</span>
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-bold flex items-center gap-1">
                                      <Tag className="w-3 h-3" />
                                      -{savingsPercent}%
                                    </span>
                                  </div>
                                  {pkg.description && (
                                    <p className="text-xs text-muted-foreground mt-1">{pkg.description}</p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-primary font-bold text-lg">{pkg.discountedPrice} {t("common.currency")}</div>
                                  <div className="text-xs text-muted-foreground line-through">{pkg.originalPrice} {t("common.currency")}</div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        {t("booking.orSelectServices", { defaultValue: "Ou choisissez vos services individuellement ci-dessous" })}
                      </p>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="service"
                    render={() => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2 text-sm font-medium">
                          <Scissors className="w-4 h-4 text-primary" />
                          {t("booking.requiredService")}
                        </FormLabel>
                        <Select onValueChange={handleAddService} value="">
                          <FormControl>
                            <SelectTrigger className="h-12 rounded-xl bg-background/50 backdrop-blur-sm border-border/50">
                              <SelectValue placeholder={t("booking.selectService")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="glass max-h-[300px] rounded-xl">
                            {filteredCategories.map(cat => (
                              <div key={cat}>
                                <div className="px-3 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                  {cat}
                                </div>
                                {filteredServices.filter(s => s.category === cat).map(s => {
                                  const isSelected = selectedServices.some(sel => sel.name === s.name);
                                  return (
                                    <SelectItem 
                                      key={s.id} 
                                      value={s.name} 
                                      className={cn("rounded-lg", isSelected && "opacity-50")}
                                      disabled={isSelected}
                                    >
                                      <div className="flex justify-between items-center w-full gap-4">
                                        <span>{s.name}</span>
                                        <span className="text-primary font-bold">{s.price} {t("common.currency")}</span>
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                            
                            {selectedServices.length > 0 && (
                              <div className="space-y-3 mt-3">
                                <div className="flex flex-wrap gap-2">
                                  {selectedServices.map((service, index) => (
                                    <div 
                                      key={index}
                                      className="glass-subtle rounded-xl px-3 py-2 flex items-center gap-2 group animate-fade-in"
                                    >
                                      <span className="text-sm font-medium">{service.name}</span>
                                      <span className="text-xs text-primary font-bold">{service.price} {t("common.currency")}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveService(index)}
                                        className="w-5 h-5 rounded-full bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center transition-colors"
                                      >
                                        <X className="w-3 h-3 text-destructive" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <div className="glass-subtle rounded-xl p-3">
                                  {selectedPackage && (
                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
                                      <Gift className="w-4 h-4 text-emerald-500" />
                                      <span className="text-sm font-medium text-emerald-600">{selectedPackage.name}</span>
                                      <span className="ml-auto px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-bold">
                                        -{selectedPackage.originalPrice - selectedPackage.discountedPrice} {t("common.currency")}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">{t("common.duration")}:</span>
                                    <span className="font-medium">{form.getValues("duration")} {t("common.minutes")}</span>
                                  </div>
                                  <div className="flex justify-between text-sm mt-1">
                                    <span className="text-muted-foreground">{t("common.price")}:</span>
                                    <div className="text-right">
                                      {selectedPackage && (
                                        <span className="text-xs text-muted-foreground line-through mr-2">
                                          {selectedPackage.originalPrice} {t("common.currency")}
                                        </span>
                                      )}
                                      <span className="text-primary font-bold text-lg">{form.getValues("total")} {t("common.currency")}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-6">
                  <div>
                    <FormLabel className="flex items-center gap-2 mb-4 text-sm font-medium">
                      <CalendarDays className="w-4 h-4 text-primary" />
                      {t("booking.selectDate")}
                    </FormLabel>
                    <div className="flex justify-center">
                      <div className="glass-subtle rounded-2xl p-2">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={(d) => {
                            setDate(d);
                            setSelectedTime("");
                          }}
                          disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                          className="rounded-xl"
                        />
                      </div>
                    </div>
                  </div>

                  {date && (
                    <div className="animate-fade-in">
                      <FormLabel className="flex items-center gap-2 mb-4 text-sm font-medium">
                        <Clock className="w-4 h-4 text-primary" />
                        {t("booking.selectAvailableTime")}
                      </FormLabel>
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-[200px] overflow-y-auto p-1 calendar-scroll">
                        {getAvailableSlots.map(slot => (
                          <Button
                            key={slot}
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn(
                              "h-10 rounded-xl transition-all font-medium",
                              "bg-background/50 backdrop-blur-sm",
                              selectedTime === slot 
                                ? "bg-primary text-primary-foreground border-primary shadow-lg" 
                                : "border-border/50 hover:border-primary/50 hover:bg-background/80"
                            )}
                            onClick={() => setSelectedTime(slot)}
                          >
                            {slot}
                          </Button>
                        ))}
                      </div>
                      {getAvailableSlots.length === 0 && (
                        <div className="glass-subtle rounded-xl p-6 text-center space-y-4">
                          <p className="text-muted-foreground">
                            {t("booking.noTimesAvailable")}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl"
                            onClick={async () => {
                              const clientName = form.getValues("client");
                              const phone = form.getValues("phone");
                              if (!clientName) {
                                alert(t("booking.enterName"));
                                return;
                              }
                              try {
                                await fetch("/api/waitlist", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    clientName,
                                    clientPhone: phone,
                                    requestedDate: date ? format(date, "yyyy-MM-dd") : "",
                                    requestedTime: null,
                                    servicesDescription: selectedServices.map(s => s.name).join(", "),
                                    staffName: form.getValues("staff"),
                                    status: "waiting",
                                  }),
                                });
                                alert(t("booking.waitlistSuccess") + " " + t("booking.waitlistMessage"));
                              } catch (err) {
                                console.error("Failed to join waitlist:", err);
                              }
                            }}
                          >
                            {t("booking.joinWaitlist")}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-border/50 pt-6">
                <Button
                  type="submit"
                  className="w-full h-14 text-lg rounded-2xl font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
                  disabled={isSubmitting || !canSubmit}
                >
                  {isSubmitting ? t("booking.bookingInProgress") : t("booking.confirmBooking")}
                </Button>
              </div>
            </form>
          </Form>
        </div>

        <p className="text-center text-sm text-muted-foreground py-4">
          PREGASQUAD Beauty Salon
        </p>
      </div>
    </div>
  );
}
