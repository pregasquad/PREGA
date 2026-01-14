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
import { Clock, CheckCircle2, Scissors, User, Phone, CalendarDays, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";

const bookingSchema = z.object({
  client: z.string().min(1),
  service: z.string().optional(),
  staff: z.string().min(1),
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

const TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30",
  "21:00"
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

  useEffect(() => {
    fetch("/api/public/staff")
      .then(res => res.json())
      .then(data => setStaffList(data))
      .catch(console.error);
    
    fetch("/api/public/services")
      .then(res => res.json())
      .then(data => setServices(data))
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

  const categories = useMemo(() => {
    return Array.from(new Set(services.map(s => s.category)));
  }, [services]);

  const getAvailableSlots = useMemo(() => {
    if (!selectedStaff || !date) return [];
    
    const staffAppointments = appointments.filter(a => a.staff === selectedStaff);
    const duration = serviceDuration || 30;
    
    return TIME_SLOTS.filter(slot => {
      const slotMinutes = parseInt(slot.split(":")[0]) * 60 + parseInt(slot.split(":")[1]);
      
      for (const app of staffAppointments) {
        const appStart = parseInt(app.startTime.split(":")[0]) * 60 + parseInt(app.startTime.split(":")[1]);
        const appEnd = appStart + app.duration;
        const slotEnd = slotMinutes + duration;
        
        if ((slotMinutes >= appStart && slotMinutes < appEnd) || 
            (slotEnd > appStart && slotEnd <= appEnd) ||
            (slotMinutes <= appStart && slotEnd >= appEnd)) {
          return false;
        }
      }
      return true;
    });
  }, [selectedStaff, date, appointments, serviceDuration]);

  const onSubmit = async (data: BookingFormValues) => {
    if (!date || !selectedTime || selectedServices.length === 0) return;
    setIsSubmitting(true);
    
    const clientName = data.phone ? `${data.client} (${data.phone})` : data.client;
    const serviceNames = selectedServices.map(s => s.name).join(", ");
    const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);
    const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0);
    
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
      
      setIsSuccess(true);
      setSelectedServices([]);
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    } catch (error) {
      console.error("Booking failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddService = (serviceName: string) => {
    const service = services.find(s => s.name === serviceName);
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
    const totalDuration = newSelectedServices.reduce((sum, s) => sum + s.duration, 0);
    const totalPrice = newSelectedServices.reduce((sum, s) => sum + s.price, 0);
    form.setValue("service", newSelectedServices.map(s => s.name).join(", "));
    form.setValue("duration", totalDuration);
    form.setValue("price", totalPrice);
    form.setValue("total", totalPrice);
  };

  const canSubmit = selectedServices.length > 0 && selectedStaff && date && selectedTime && form.watch("client");

  if (isSuccess) {
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
          </div>
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
            <div className="flex justify-between items-center border-t border-border/50 pt-3 mt-3">
              <span className="text-muted-foreground">{t("common.price")}</span>
              <span className="font-bold text-primary text-xl">{form.getValues("total")} {t("common.currency")}</span>
            </div>
          </div>
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
        <div className="text-center space-y-3 py-4">
          <div className="flex justify-center mb-4">
            <div className="glass-card p-4 rounded-3xl">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
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
                            {categories.map(cat => (
                              <div key={cat}>
                                <div className="px-3 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                  {cat}
                                </div>
                                {services.filter(s => s.category === cat).map(s => {
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
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">{t("common.duration")}:</span>
                                <span className="font-medium">{form.getValues("duration")} {t("common.minutes")}</span>
                              </div>
                              <div className="flex justify-between text-sm mt-1">
                                <span className="text-muted-foreground">{t("common.price")}:</span>
                                <span className="text-primary font-bold text-lg">{form.getValues("total")} {t("common.currency")}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="staff"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">{t("booking.preferredStaff")}</FormLabel>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {staffList.map(s => (
                            <Button
                              key={s.id}
                              type="button"
                              variant="outline"
                              className={cn(
                                "h-16 flex-col gap-2 rounded-2xl transition-all border-2",
                                "bg-background/50 backdrop-blur-sm hover:bg-background/80",
                                field.value === s.name 
                                  ? "border-primary ring-2 ring-primary/20 shadow-lg" 
                                  : "border-border/50 hover:border-border"
                              )}
                              onClick={() => field.onChange(s.name)}
                            >
                              <div 
                                className="w-8 h-8 rounded-full border-2 border-white/50 shadow-md"
                                style={{ backgroundColor: s.color }}
                              />
                              <span className="text-xs font-medium">{s.name}</span>
                            </Button>
                          ))}
                        </div>
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

                  {date && selectedStaff && (
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
                        <div className="glass-subtle rounded-xl p-6 text-center">
                          <p className="text-muted-foreground">
                            {t("booking.noTimesAvailable")}
                          </p>
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
