import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { queryClient } from "@/lib/queryClient";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ar, enUS, fr } from "date-fns/locale";
import { Clock, CheckCircle2, Scissors, User, Phone, CalendarDays, ChevronLeft, ChevronRight, Plus, Check, Gift, Tag } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics";
import { io, Socket } from "socket.io-client";

const bookingSchema = z.object({
  client: z.string().min(1),
  phone: z.string().optional(),
});

interface SelectedService {
  name: string;
  price: number;
  duration: number;
}

type BookingFormValues = z.infer<typeof bookingSchema>;

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

type Step = 1 | 2 | 3 | 4;

export default function Booking() {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<Step>(1);
  const [date, setDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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
      phone: "",
    },
  });

  const totalDuration = useMemo(() => 
    selectedServices.reduce((sum, s) => sum + s.duration, 0), 
    [selectedServices]
  );

  const totalPrice = useMemo(() => 
    selectedPackage 
      ? selectedPackage.discountedPrice 
      : selectedServices.reduce((sum, s) => sum + s.price, 0), 
    [selectedServices, selectedPackage]
  );

  const categories = useMemo(() => 
    Array.from(new Set(services.map(s => s.category))),
    [services]
  );

  const getAvailableSlots = useMemo(() => {
    if (!date) return [];
    
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
  }, [date]);

  const onSubmit = async (data: BookingFormValues) => {
    if (!date || !selectedTime || selectedServices.length === 0) return;
    setIsSubmitting(true);
    
    const clientName = data.phone ? `${data.client} (${data.phone})` : data.client;
    const serviceNames = selectedPackage 
      ? `${selectedPackage.name} (${selectedServices.map(s => s.name).join(", ")})`
      : selectedServices.map(s => s.name).join(", ");
    
    const appointmentData = {
      client: clientName,
      service: serviceNames,
      staff: "",
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
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      trackEvent("booking_completed", "booking", serviceNames, totalPrice);
    } catch (error) {
      console.error("Booking failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddService = (service: Service) => {
    if (!selectedServices.some(s => s.name === service.name)) {
      setSelectedServices([...selectedServices, { name: service.name, price: service.price, duration: service.duration }]);
      setSelectedPackage(null);
    }
  };

  const handleRemoveService = (serviceName: string) => {
    setSelectedServices(selectedServices.filter(s => s.name !== serviceName));
    setSelectedPackage(null);
  };

  const handleSelectPackage = (pkg: Package) => {
    const packageServices = pkg.services
      .map(serviceId => services.find(s => s.id === serviceId))
      .filter((s): s is Service => s !== undefined)
      .map(s => ({ name: s.name, price: s.price, duration: s.duration }));
    
    if (packageServices.length === 0) return;
    
    setSelectedPackage(pkg);
    setSelectedServices(packageServices);
  };

  const canGoNext = () => {
    switch (step) {
      case 1: return selectedServices.length > 0;
      case 2: return date !== undefined;
      case 3: return selectedTime !== "";
      case 4: return form.watch("client").length > 0;
      default: return false;
    }
  };

  const goNext = () => {
    if (step < 4 && canGoNext()) {
      setStep((step + 1) as Step);
    }
  };

  const goBack = () => {
    if (step > 1) {
      setStep((step - 1) as Step);
    }
  };

  const stepTitles = {
    1: t("booking.step1Title", { defaultValue: "Choisir un service" }),
    2: t("booking.step2Title", { defaultValue: "Choisir une date" }),
    3: t("booking.step3Title", { defaultValue: "Choisir l'heure" }),
    4: t("booking.step4Title", { defaultValue: "Vos coordonnées" }),
  };

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
                  <span className="font-bold text-primary text-xl">{totalPrice} {t("common.currency")}</span>
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
                <span className="font-semibold text-right max-w-[180px]">{selectedServices.map(s => s.name).join(", ")}</span>
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
                <span className="font-bold text-primary text-xl">{totalPrice} {t("common.currency")}</span>
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
      
      <div className="max-w-lg mx-auto space-y-4 relative z-10 animate-fade-in">
        <div className="flex justify-between items-center">
          <div className="w-8" />
          <div className="flex justify-center">
            <img src="/prega_logo.png" alt="PregaSquad" className="w-16 h-16" />
          </div>
          <LanguageSwitcher />
        </div>

        <div className="flex justify-center gap-2 py-2">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={cn(
                "w-12 h-1.5 rounded-full transition-all duration-300",
                s === step ? "bg-primary" : s < step ? "bg-primary/60" : "bg-border"
              )}
            />
          ))}
        </div>

        <div className="text-center mb-4">
          <p className="text-sm text-muted-foreground">{t("booking.stepOf", { current: step, total: 4, defaultValue: `Étape ${step} sur 4` })}</p>
          <h1 className="text-2xl font-display font-bold">{stepTitles[step]}</h1>
        </div>

        <div className="glass-card p-5 min-h-[400px]">
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              {packages.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Gift className="w-4 h-4 text-primary" />
                    {t("booking.specialOffers", { defaultValue: "Offres spéciales" })}
                  </p>
                  {packages.map(pkg => {
                    const savings = pkg.originalPrice - pkg.discountedPrice;
                    const savingsPercent = pkg.originalPrice > 0 ? Math.round((savings / pkg.originalPrice) * 100) : 0;
                    const isSelected = selectedPackage?.id === pkg.id;
                    
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => isSelected ? setSelectedPackage(null) : handleSelectPackage(pkg)}
                        className={cn(
                          "w-full text-left p-4 rounded-2xl border-2 transition-all",
                          "bg-gradient-to-r from-emerald-500/5 to-primary/5",
                          isSelected
                            ? "border-emerald-500 ring-2 ring-emerald-500/20"
                            : "border-emerald-500/30 hover:border-emerald-500/50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{pkg.name}</span>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 text-xs font-bold flex items-center gap-1">
                                <Tag className="w-3 h-3" />
                                -{savingsPercent}%
                              </span>
                            </div>
                            {pkg.description && (
                              <p className="text-xs text-muted-foreground mt-1">{pkg.description}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-primary font-bold">{pkg.discountedPrice} DH</div>
                            <div className="text-xs text-muted-foreground line-through">{pkg.originalPrice} DH</div>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="mt-2 pt-2 border-t border-emerald-500/20">
                            <Check className="w-4 h-4 text-emerald-500 inline mr-1" />
                            <span className="text-xs text-emerald-600">{t("booking.packageSelected", { defaultValue: "Forfait sélectionné" })}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border/50" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-card px-2 text-muted-foreground">{t("booking.orChooseServices", { defaultValue: "ou choisir des services" })}</span>
                    </div>
                  </div>
                </div>
              )}

              {categories.map(category => (
                <div key={category} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{category}</p>
                  <div className="grid gap-2">
                    {services.filter(s => s.category === category).map(service => {
                      const isSelected = selectedServices.some(s => s.name === service.name);
                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => isSelected ? handleRemoveService(service.name) : handleAddService(service)}
                          className={cn(
                            "w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all",
                            "bg-background/50 backdrop-blur-sm",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border/50 hover:border-primary/30"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                              isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                            )}>
                              {isSelected ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            </div>
                            <div className="text-left">
                              <p className="font-medium">{service.name}</p>
                              <p className="text-xs text-muted-foreground">{service.duration} min</p>
                            </div>
                          </div>
                          <span className="font-bold text-primary">{service.price} DH</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col items-center animate-fade-in">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  setDate(d);
                  setSelectedTime("");
                }}
                disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                className="rounded-xl"
                locale={getDateLocale()}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
              {date && (
                <p className="text-center text-sm text-muted-foreground">
                  {format(date, "EEEE d MMMM yyyy", { locale: getDateLocale() })}
                </p>
              )}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {getAvailableSlots.map(slot => (
                  <Button
                    key={slot}
                    type="button"
                    variant="outline"
                    className={cn(
                      "h-12 rounded-xl transition-all font-medium text-base",
                      selectedTime === slot 
                        ? "bg-primary text-primary-foreground border-primary shadow-lg" 
                        : "border-border/50 hover:border-primary/50"
                    )}
                    onClick={() => setSelectedTime(slot)}
                  >
                    {slot}
                  </Button>
                ))}
              </div>
              {getAvailableSlots.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>{t("booking.noTimesAvailable", { defaultValue: "Aucun créneau disponible" })}</p>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 animate-fade-in">
                <div className="glass-subtle rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Scissors className="w-4 h-4" />
                      {t("booking.services", { defaultValue: "Services" })}
                    </span>
                    <span className="font-medium text-right max-w-[180px]">
                      {selectedServices.map(s => s.name).join(", ")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <CalendarDays className="w-4 h-4" />
                      {t("common.date")}
                    </span>
                    <span className="font-medium">{date && format(date, "d MMM yyyy", { locale: getDateLocale() })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {t("booking.time")}
                    </span>
                    <span className="font-medium">{selectedTime}</span>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="client"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2 text-sm font-medium mb-2">
                        <User className="w-4 h-4 text-primary" />
                        {t("booking.fullName")}
                      </div>
                      <FormControl>
                        <Input 
                          placeholder={t("booking.enterName")} 
                          className="h-12 rounded-xl" 
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
                      <div className="flex items-center gap-2 text-sm font-medium mb-2">
                        <Phone className="w-4 h-4 text-primary" />
                        {t("booking.phoneOptional")}
                      </div>
                      <FormControl>
                        <Input 
                          placeholder="06XXXXXXXX" 
                          className="h-12 rounded-xl" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full h-14 text-lg rounded-2xl font-semibold shadow-lg"
                  disabled={isSubmitting || !form.watch("client")}
                >
                  {isSubmitting ? t("booking.bookingInProgress") : t("booking.confirmBooking")}
                </Button>
              </form>
            </Form>
          )}
        </div>

        {selectedServices.length > 0 && (
          <div className="glass-subtle rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{selectedServices.length} service{selectedServices.length > 1 ? "s" : ""} · {totalDuration} min</p>
              {selectedPackage && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <Gift className="w-3 h-3" />
                  {selectedPackage.name}
                </p>
              )}
            </div>
            <div className="text-right">
              {selectedPackage && (
                <p className="text-xs text-muted-foreground line-through">{selectedPackage.originalPrice} DH</p>
              )}
              <p className="text-xl font-bold text-primary">{totalPrice} DH</p>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              className="flex-1 h-12 rounded-xl"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              {t("common.back", { defaultValue: "Retour" })}
            </Button>
          )}
          {step < 4 && (
            <Button
              type="button"
              onClick={goNext}
              disabled={!canGoNext()}
              className="flex-1 h-12 rounded-xl"
            >
              {t("common.next", { defaultValue: "Suivant" })}
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground pt-2">
          PREGASQUAD Beauty Salon
        </p>
      </div>
    </div>
  );
}
