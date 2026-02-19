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
import { Clock, CheckCircle2, Scissors, User, Phone, CalendarDays, Sparkles, X, Users, Gift, Tag, CalendarCheck, Navigation, MapPin } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ServiceRecommendations } from "@/components/ServiceRecommendations";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics";
import { io, Socket } from "socket.io-client";
import { autoPrint } from "@/lib/printReceipt";

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
  isStartingPrice?: boolean;
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
  loyaltyPointsBalance?: number;
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

const DEFAULT_SALON_LOCATION = {
  lat: 30.399840,
  lng: -9.555420,
  address: "PROJECT ANNASER, IMM 25, Agadir"
};

export default function Booking() {
  const { t, i18n } = useTranslation();
  const [date, setDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [businessName, setBusinessName] = useState("PREGA SQUAD");
  
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<MinimalAppointment[]>([]);
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const [visitorCount, setVisitorCount] = useState<number>(0);
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    i18n.changeLanguage("fr");
  }, []);

  // Defer socket connection to after initial render
  useEffect(() => {
    let socket: Socket | null = null;
    
    const timer = setTimeout(() => {
      socket = io(window.location.origin, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 2000
      });
      
      socket.on("connect", () => {
        socket?.emit("booking:join");
      });

      socket.on("booking:viewers", (count: number) => {
        setVisitorCount(count);
      });
    }, 1000);
    
    return () => {
      clearTimeout(timer);
      if (socket) {
        socket.emit("booking:leave");
        socket.disconnect();
      }
    };
  }, []);

  // Fetch all data in parallel for faster loading
  useEffect(() => {
    const loadData = async () => {
      try {
        const [staffRes, servicesRes, packagesRes, settingsRes] = await Promise.all([
          fetch("/api/public/staff"),
          fetch("/api/public/services"),
          fetch("/api/public/packages"),
          fetch("/api/public/settings")
        ]);
        
        const staffData = staffRes.ok ? await staffRes.json() : [];
        const servicesData = servicesRes.ok ? await servicesRes.json() : [];
        const packagesData = packagesRes.ok ? await packagesRes.json() : [];
        
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (settingsData?.businessName) {
            setBusinessName(settingsData.businessName);
          }
        }
        
        setStaffList(staffData);
        setServices(servicesData);
        
        const validPackages = (packagesData as Package[]).filter(pkg => 
          pkg.discountedPrice < pkg.originalPrice && pkg.originalPrice > 0
        );
        setPackages(validPackages);
      } catch (error) {
        console.error("Failed to load booking data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
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

  const categoryFilteredServices = useMemo(() => {
    if (!selectedCategory) return filteredServices;
    return filteredServices.filter(s => s.category === selectedCategory);
  }, [filteredServices, selectedCategory]);

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
      
      autoPrint({
        businessName: businessName,
        currency: "DH",
        clientName: data.client,
        clientPhone: data.phone || "",
        services: serviceNames,
        staffName: data.staff || "",
        date: format(date!, "dd/MM/yyyy"),
        time: selectedTime!,
        duration: totalDuration,
        total: totalPrice,
        appointmentId: result.id,
        loyaltyPointsBalance: result.loyaltyPointsBalance,
      }).catch(() => {});
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

  // Loading skeleton for faster perceived performance
  if (isLoading) {
    return (
      <div className="min-h-screen p-3 md:p-4 relative overflow-hidden" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
        <div className="max-w-4xl mx-auto space-y-4 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted animate-pulse" />
              <div className="space-y-2">
                <div className="h-6 w-48 bg-muted rounded animate-pulse" />
                <div className="h-3 w-32 bg-muted rounded animate-pulse" />
              </div>
            </div>
          </div>
          <div className="glass-card p-4 md:p-6 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="h-10 bg-muted rounded animate-pulse" />
                <div className="h-10 bg-muted rounded animate-pulse" />
                <div className="h-20 bg-muted rounded animate-pulse" />
              </div>
              <div className="h-64 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                      appt.staff === "À assigner" ? "text-sky-500" : "text-emerald-500"
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
                    bookingResult.staff === "À assigner" ? "text-sky-500" : "text-emerald-500"
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
          
          {/* Salon Location & Directions */}
          <div 
            className="relative overflow-hidden rounded-2xl mt-4 p-4 border border-emerald-300/50 dark:border-emerald-700/50"
            style={{
              background: `
                linear-gradient(135deg, rgba(209, 250, 229, 0.8) 0%, rgba(204, 251, 241, 0.8) 50%, rgba(207, 250, 254, 0.8) 100%),
                url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 50h100M50 0v100M0 25h100M25 0v100M0 75h100M75 0v100' stroke='%2310b981' stroke-width='1' fill='none' opacity='0.3'/%3E%3Ccircle cx='25' cy='25' r='3' fill='%2310b981' opacity='0.2'/%3E%3Ccircle cx='75' cy='75' r='3' fill='%2310b981' opacity='0.2'/%3E%3Ccircle cx='25' cy='75' r='2' fill='%2314b8a6' opacity='0.2'/%3E%3Ccircle cx='75' cy='25' r='2' fill='%2314b8a6' opacity='0.2'/%3E%3C/svg%3E")
              `,
              backgroundSize: 'cover, 100px 100px'
            }}
          >
            {/* Decorative elements */}
            <div className="absolute top-1 right-1 w-20 h-20 rounded-full bg-emerald-400/30 blur-2xl pointer-events-none" />
            <div className="absolute bottom-1 left-1 w-16 h-16 rounded-full bg-pink-400/30 blur-xl pointer-events-none" />
            
            <div className="relative">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/30">
                  <MapPin className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-emerald-900 dark:text-emerald-100">Salon {businessName}</h4>
                  <p className="text-xs text-emerald-700/70 dark:text-emerald-300/70">{DEFAULT_SALON_LOCATION.address}</p>
                </div>
              </div>
              <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mb-3 text-center">
                {t("booking.chooseMapApp", { defaultValue: "Choisir votre application de navigation" })}
              </p>
              <div className="grid grid-cols-3 gap-2">
              <a 
                href={`https://www.google.com/maps/dir/?api=1&destination=${DEFAULT_SALON_LOCATION.lat},${DEFAULT_SALON_LOCATION.lng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button 
                  variant="outline" 
                  className="w-full h-10 rounded-xl text-xs gap-1.5 border-primary/30 hover:bg-primary/10"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Google
                </Button>
              </a>
              <a 
                href={`https://maps.apple.com/?daddr=${DEFAULT_SALON_LOCATION.lat},${DEFAULT_SALON_LOCATION.lng}&dirflg=d`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button 
                  variant="outline" 
                  className="w-full h-10 rounded-xl text-xs gap-1.5 border-primary/30 hover:bg-primary/10"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Apple
                </Button>
              </a>
              <a 
                href={`https://waze.com/ul?ll=${DEFAULT_SALON_LOCATION.lat},${DEFAULT_SALON_LOCATION.lng}&navigate=yes`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button 
                  variant="outline" 
                  className="w-full h-10 rounded-xl text-xs gap-1.5 border-primary/30 hover:bg-primary/10"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Waze
                </Button>
              </a>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-3 mt-4">
            <Button onClick={() => window.location.reload()} className="w-full h-12 text-lg rounded-2xl">
              {t("booking.newBooking")}
            </Button>
            <a href="/my-bookings" className="w-full">
              <Button variant="outline" className="w-full h-10 rounded-2xl">
                {t("booking.viewMyBookings", { defaultValue: "Voir mes rendez-vous" })}
              </Button>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-3 md:p-4 relative overflow-hidden" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl opacity-60" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent/20 rounded-full blur-3xl opacity-60" />
      
      <div className="max-w-4xl mx-auto space-y-4 relative z-10 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/prega_logo.png" alt={businessName} className="w-12 h-12" />
            <div>
              <h1 className="text-xl md:text-2xl font-display font-bold gradient-text leading-tight">
                {t("booking.title")}
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">{t("booking.subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {visitorCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
                <Users className="w-3.5 h-3.5" />
                <span>{visitorCount}</span>
              </div>
            )}
            <a href="/my-bookings">
              <Button variant="ghost" size="sm" className="h-8 px-2 sm:px-3 text-xs gap-1.5 hover:bg-primary/10">
                <CalendarCheck className="w-4 h-4" />
                <span className="hidden sm:inline">{t("booking.myBookings", { defaultValue: "Mes RDV" })}</span>
              </Button>
            </a>
            <LanguageSwitcher />
          </div>
        </div>

        <div className="glass-card p-4 md:p-5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="space-y-4">
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
                            className="h-10 rounded-xl bg-background/50 border-border/50 focus:border-primary/50" 
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
                            className="h-10 rounded-xl bg-background/50 border-border/50 focus:border-primary/50" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <ServiceRecommendations
                    phone={form.watch("phone") || ""}
                    onAddService={handleAddService}
                    selectedServices={selectedServices.map(s => s.name)}
                  />

                  {packages.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center">
                          <Gift className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm">{t("booking.packages", { defaultValue: "Nos Forfaits" })}</h3>
                          <p className="text-xs text-muted-foreground">{t("booking.packagesSubtitle", { defaultValue: "Économisez avec nos offres" })}</p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 overflow-x-auto pt-3 pb-1 -mx-1 px-1 scrollbar-hide overflow-y-visible">
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
                                "flex-shrink-0 w-[180px] p-3 rounded-xl transition-all relative",
                                isSelected
                                  ? "bg-gradient-to-br from-primary to-primary/80 text-white shadow-xl scale-[1.02]"
                                  : "bg-gradient-to-br from-muted/50 to-muted/30 hover:from-primary/10 hover:to-primary/5"
                              )}
                            >
                              {savingsPercent > 0 && (
                                <div className={cn(
                                  "absolute -top-2 -right-2 px-2 py-1 rounded-full text-xs font-bold shadow-md",
                                  isSelected 
                                    ? "bg-white text-primary" 
                                    : "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
                                )}>
                                  -{savingsPercent}%
                                </div>
                              )}
                              
                              <div className="space-y-2">
                                <div className="text-left">
                                  <h4 className={cn("font-bold text-sm", !isSelected && "text-foreground")}>{pkg.name}</h4>
                                  {pkg.description && (
                                    <p className={cn("text-xs line-clamp-1", isSelected ? "text-white/80" : "text-muted-foreground")}>
                                      {pkg.description}
                                    </p>
                                  )}
                                </div>
                                
                                <div className="flex items-end gap-1">
                                  <span className={cn("text-lg font-bold", !isSelected && "text-primary")}>
                                    {pkg.discountedPrice}
                                  </span>
                                  <span className={cn("text-xs mb-0.5", isSelected ? "text-white/80" : "text-muted-foreground")}>
                                    {t("common.currency")}
                                  </span>
                                  <span className={cn(
                                    "text-xs line-through ml-auto mb-0.5",
                                    isSelected ? "text-white/60" : "text-muted-foreground"
                                  )}>
                                    {pkg.originalPrice}
                                  </span>
                                </div>
                                
                                {isSelected && (
                                  <div className="flex items-center gap-1 text-xs text-white/90">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>{t("common.selected", { defaultValue: "Sélectionné" })}</span>
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                        <div className="h-px flex-1 bg-border/30" />
                        <span>{t("booking.orSelectServices", { defaultValue: "ou choisir des services" })}</span>
                        <div className="h-px flex-1 bg-border/30" />
                      </div>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="service"
                    render={() => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2 text-sm font-semibold">
                          <Scissors className="w-4 h-4 text-primary" />
                          {t("booking.requiredService")}
                        </FormLabel>
                        
                        {filteredCategories.length > 1 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            <button
                              type="button"
                              onClick={() => setSelectedCategory(null)}
                              className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                                !selectedCategory
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted/50 hover:bg-muted border border-border/50"
                              )}
                            >
                              {t("common.all", { defaultValue: "Tous" })}
                            </button>
                            {filteredCategories.map(cat => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setSelectedCategory(cat)}
                                className={cn(
                                  "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                                  selectedCategory === cat
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted/50 hover:bg-muted border border-border/50"
                                )}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        )}
                        
                        <Select onValueChange={handleAddService} value="">
                          <FormControl>
                            <SelectTrigger className={cn(
                              "h-11 rounded-xl text-sm font-medium",
                              "bg-gradient-to-r from-primary/5 to-primary/10",
                              "border-2 border-primary/30 hover:border-primary/50",
                              selectedServices.length === 0 && "animate-pulse"
                            )}>
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-primary" />
                                <SelectValue placeholder={t("booking.selectService")} />
                              </div>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-background max-h-[350px] rounded-2xl border-2 border-primary/20 shadow-xl overflow-hidden">
                            {(selectedCategory ? [selectedCategory] : filteredCategories).map(cat => (
                              <div key={cat}>
                                {!selectedCategory && (
                                  <div className="px-3 py-2 text-xs font-bold text-orange-600 uppercase tracking-wider bg-gradient-to-r from-orange-100 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/20 dark:text-orange-400 sticky top-0 z-10 border-b border-orange-200/60 dark:border-orange-800/40">
                                    {cat}
                                  </div>
                                )}
                                {categoryFilteredServices.filter(s => s.category === cat).map(s => {
                                  const isSelected = selectedServices.some(sel => sel.name === s.name);
                                  return (
                                    <SelectItem 
                                      key={s.id} 
                                      value={s.name} 
                                      className={cn(
                                        "rounded-xl py-3 px-4 my-1 cursor-pointer",
                                        isSelected && "opacity-40 bg-muted"
                                      )}
                                      disabled={isSelected}
                                    >
                                      <div className="flex justify-between items-center w-full gap-4">
                                        <div className="flex flex-col">
                                          <span className="font-medium">{s.name}</span>
                                          <span className="text-xs text-muted-foreground">{s.duration} min</span>
                                        </div>
                                        <span className="text-primary font-bold text-lg">{s.isStartingPrice ? `${t("services.startingFrom")} ` : ''}{s.price} {t("common.currency")}</span>
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

                <div className="space-y-4">
                  <div>
                    <FormLabel className="flex items-center gap-2 mb-2 text-sm font-medium">
                      <CalendarDays className="w-4 h-4 text-primary" />
                      {t("booking.selectDate")}
                    </FormLabel>
                    <div className="flex justify-center">
                      <div className="bg-muted/30 rounded-xl p-1">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={(d) => {
                            setDate(d);
                            setSelectedTime("");
                          }}
                          disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                          className="rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {date && (
                    <div className="animate-fade-in">
                      <FormLabel className="flex items-center gap-2 mb-2 text-sm font-medium">
                        <Clock className="w-4 h-4 text-primary" />
                        {t("booking.selectAvailableTime")}
                      </FormLabel>
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-[180px] overflow-y-auto p-1 calendar-scroll">
                        {getAvailableSlots.map(slot => (
                          <Button
                            key={slot}
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn(
                              "h-8 rounded-lg transition-all text-xs font-medium",
                              "bg-background/50",
                              selectedTime === slot 
                                ? "bg-primary text-primary-foreground border-primary" 
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
          {businessName} Beauty Salon
        </p>
      </div>
    </div>
  );
}
