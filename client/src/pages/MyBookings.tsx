import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parseISO, differenceInHours, addDays, startOfToday, isSameDay } from "date-fns";
import { ar, enUS, fr } from "date-fns/locale";
import { 
  Phone, Calendar as CalendarIcon, Clock, User, Scissors, CheckCircle2, AlertCircle, 
  X, Loader2, ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, Search, Plus
} from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ServiceRecommendations } from "@/components/ServiceRecommendations";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Appointment {
  id: number;
  client: string;
  service: string | null;
  staff: string;
  date: string;
  startTime: string;
  duration: number;
  total: number;
  paid: boolean;
  status: 'confirmed' | 'pending' | 'awaiting_assignment';
}

const TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30",
  "21:00", "21:30", "22:00", "22:30", "23:00"
];

export default function MyBookings() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [cancellationHours, setCancellationHours] = useState(24);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [date, setDate] = useState<Date>(startOfToday());
  const [showPhoneInput, setShowPhoneInput] = useState(true);
  
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const isRtl = i18n.language === "ar";
  
  const scrollToGrid = () => {
    setTimeout(() => {
      if (gridRef.current && scrollContainerRef.current) {
        gridRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const getDateLocale = () => {
    switch (i18n.language) {
      case "ar": return ar;
      case "fr": return fr;
      default: return enUS;
    }
  };

  const handleSearch = async () => {
    const digitsOnly = phone.replace(/[^0-9]/g, '');
    if (digitsOnly.length < 8) {
      toast({
        title: t("myBookings.invalidPhone", { defaultValue: "Numéro invalide" }),
        description: t("myBookings.enterValidPhone", { defaultValue: "Entrez au moins 8 chiffres" }),
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/public/my-bookings?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      
      if (res.ok) {
        const appts = data.appointments || [];
        setAppointments(appts);
        setCancellationHours(data.cancellationHours || 24);
        setHasSearched(true);
        setShowPhoneInput(false);
        
        // Auto-scroll to first appointment's date grid
        if (appts.length > 0) {
          setDate(parseISO(appts[0].date));
          scrollToGrid();
        }
      } else {
        toast({
          title: t("common.error"),
          description: data.error || t("myBookings.searchFailed"),
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: t("common.error"),
        description: t("myBookings.searchFailed", { defaultValue: "Impossible de récupérer vos RDV" }),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async (appointmentId: number) => {
    setCancellingId(appointmentId);
    try {
      const res = await fetch("/api/public/cancel-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, phone })
      });
      const data = await res.json();
      
      if (res.ok) {
        setAppointments(prev => prev.filter(a => a.id !== appointmentId));
        toast({
          title: t("myBookings.cancelled", { defaultValue: "RDV annulé" }),
          description: t("myBookings.cancelledDesc", { defaultValue: "Votre rendez-vous a été annulé" })
        });
      } else {
        toast({
          title: t("common.error"),
          description: data.error || t("myBookings.cancelFailed"),
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: t("common.error"),
        description: t("myBookings.cancelFailed", { defaultValue: "Impossible d'annuler" }),
        variant: "destructive"
      });
    } finally {
      setCancellingId(null);
    }
  };

  const canCancel = (appointment: Appointment) => {
    const appointmentDateTime = new Date(`${appointment.date}T${appointment.startTime}`);
    const hoursUntil = differenceInHours(appointmentDateTime, new Date());
    return hoursUntil >= cancellationHours;
  };

  const getHoursUntil = (appointment: Appointment) => {
    const appointmentDateTime = new Date(`${appointment.date}T${appointment.startTime}`);
    return Math.max(0, differenceInHours(appointmentDateTime, new Date()));
  };

  const isToday = isSameDay(date, startOfToday());

  const appointmentsForDate = useMemo(() => {
    const dateStr = format(date, "yyyy-MM-dd");
    return appointments.filter(a => a.date === dateStr);
  }, [appointments, date]);

  const datesWithAppointments = useMemo(() => {
    return new Set(appointments.map(a => a.date));
  }, [appointments]);

  const getSlotSpan = (duration: number) => {
    return Math.max(1, Math.ceil(duration / 30));
  };

  const getAppointmentAtSlot = (slot: string) => {
    return appointmentsForDate.find(a => {
      const startIdx = TIME_SLOTS.indexOf(a.startTime);
      const slotIdx = TIME_SLOTS.indexOf(slot);
      const span = getSlotSpan(a.duration);
      return slotIdx >= startIdx && slotIdx < startIdx + span;
    });
  };

  const isSlotStart = (slot: string) => {
    return appointmentsForDate.some(a => a.startTime === slot);
  };

  if (showPhoneInput) {
    return (
      <div className="min-h-screen relative overflow-hidden" dir={isRtl ? "rtl" : "ltr"}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
        
        <div className="relative z-10 container max-w-lg mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <a href="/booking" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">{t("myBookings.backToBooking", { defaultValue: "Réserver" })}</span>
            </a>
            <LanguageSwitcher />
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-primary mb-2">
              {t("myBookings.title", { defaultValue: "Mes Rendez-vous" })}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("myBookings.subtitle", { defaultValue: "Consultez et gérez vos réservations" })}
            </p>
          </div>

          <div className="glass-card p-6">
            <label className="flex items-center gap-2 mb-3 text-sm font-medium">
              <Phone className="w-4 h-4 text-primary" />
              {t("myBookings.enterPhone", { defaultValue: "Votre numéro de téléphone" })}
            </label>
            <div className="flex gap-2">
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="06XXXXXXXX"
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={isLoading} className="px-6">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header - Planning Style */}
      <div className="shrink-0 sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b px-4 py-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Left side - Back and Title */}
          <div className="flex items-center gap-3">
            <a href="/booking" className="flex items-center text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </a>
            <div>
              <h1 className="text-lg font-bold">{t("myBookings.title", { defaultValue: "Mes Rendez-vous" })}</h1>
              <p className="text-xs text-muted-foreground">{phone}</p>
            </div>
          </div>

          {/* Right side - Navigation */}
          <div className="flex items-center gap-2">
            {/* Date Navigation */}
            <div className="flex items-center gap-1 glass-card px-2 py-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 rounded-full hover:bg-muted/50" 
                onClick={() => setDate(d => addDays(d, isRtl ? 1 : -1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" className="h-7 px-3 text-xs rounded-full hover:bg-muted/50">
                    <CalendarIcon className="w-3 h-3 mr-1" />
                    {format(date, "dd MMM", { locale: getDateLocale() })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl glass-card shadow-xl" align="end">
                  <Calendar 
                    mode="single" 
                    selected={date} 
                    onSelect={(d) => d && setDate(d)} 
                    initialFocus
                    modifiers={{ hasAppointment: (d) => datesWithAppointments.has(format(d, "yyyy-MM-dd")) }}
                    modifiersStyles={{ hasAppointment: { fontWeight: 'bold', color: 'hsl(var(--primary))' } }}
                  />
                </PopoverContent>
              </Popover>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 rounded-full hover:bg-muted/50" 
                onClick={() => setDate(d => addDays(d, isRtl ? -1 : 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button 
                variant={isToday ? "ghost" : "default"}
                size="sm" 
                className={cn(
                  "h-7 px-3 text-xs font-semibold rounded-full transition-all",
                  !isToday && "liquid-gradient text-white shadow-md hover:shadow-lg",
                  isToday && "hover:bg-muted/50"
                )}
                onClick={() => setDate(startOfToday())}
              >
                {t("common.today", { defaultValue: "Aujourd'hui" })}
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 rounded-full hover:bg-muted/50"
                onClick={handleSearch}
              >
                <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
              </Button>
            </div>

            <Button 
              variant="ghost" 
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setShowPhoneInput(true);
                setHasSearched(false);
                setPhone("");
                setAppointments([]);
              }}
            >
              {t("myBookings.changeNumber", { defaultValue: "Changer" })}
            </Button>
            
            <LanguageSwitcher />
          </div>
        </div>

        {/* Stats Bar */}
        {appointments.length > 0 && (
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarIcon className="w-3 h-3" />
              {appointments.length} {t("myBookings.totalBookings", { defaultValue: "RDV à venir" })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {appointmentsForDate.length} {t("myBookings.onThisDay", { defaultValue: "ce jour" })}
            </span>
          </div>
        )}
      </div>

      {/* Main Content - Planning Grid Style */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4">
        {appointments.length === 0 ? (
          <div className="glass-card p-8 text-center max-w-md mx-auto mt-8">
            <CalendarIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">{t("myBookings.noAppointments", { defaultValue: "Aucun rendez-vous" })}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("myBookings.noAppointmentsDesc", { defaultValue: "Aucun rendez-vous trouvé pour ce numéro" })}
            </p>
            <a href="/booking">
              <Button variant="outline">{t("myBookings.bookNow", { defaultValue: "Réserver maintenant" })}</Button>
            </a>
          </div>
        ) : appointmentsForDate.length === 0 ? (
          <div className="glass-card p-8 text-center max-w-md mx-auto mt-8">
            <CalendarIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium mb-2">
              {t("myBookings.noAppointmentsOnDate", { defaultValue: "Aucun RDV ce jour" })}
            </h3>
            <p className="text-sm text-muted-foreground">
              {format(date, "EEEE d MMMM yyyy", { locale: getDateLocale() })}
            </p>
          </div>
        ) : (
          <div ref={gridRef} className="glass-card rounded-2xl overflow-hidden">
            {/* Date Header */}
            <div className="px-4 py-3 bg-primary/5 border-b">
              <h2 className="font-semibold">
                {format(date, "EEEE d MMMM yyyy", { locale: getDateLocale() })}
              </h2>
            </div>

            {/* Time Slots Grid */}
            <div className="divide-y">
              {TIME_SLOTS.map((slot, idx) => {
                const appointment = getAppointmentAtSlot(slot);
                const isStart = isSlotStart(slot);
                
                if (appointment && !isStart) return null;

                return (
                  <div 
                    key={slot} 
                    className={cn(
                      "flex items-stretch min-h-[60px]",
                      !appointment && "opacity-40"
                    )}
                  >
                    {/* Time Label */}
                    <div className="w-16 shrink-0 px-2 py-2 text-xs text-muted-foreground font-medium border-r bg-muted/30 flex items-center justify-center">
                      {slot}
                    </div>

                    {/* Appointment or Empty Slot */}
                    <div className="flex-1 p-2">
                      {appointment && isStart ? (
                        <div 
                          className={cn(
                            "h-full rounded-xl p-3 transition-all",
                            appointment.paid || appointment.status === 'confirmed' 
                              ? "bg-emerald-500/10 border border-emerald-500/30" 
                              : appointment.status === 'awaiting_assignment'
                              ? "bg-sky-500/10 border border-sky-500/30"
                              : "bg-primary/10 border border-primary/30"
                          )}
                          style={{
                            minHeight: `${getSlotSpan(appointment.duration) * 60 - 8}px`
                          }}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-lg">{appointment.startTime}</span>
                                <span className="text-xs text-muted-foreground">
                                  ({appointment.duration} min)
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <Scissors className="w-3 h-3 text-primary shrink-0" />
                                <span className="truncate font-medium">{appointment.service || "-"}</span>
                              </div>
                              {appointment.staff && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                  <User className="w-3 h-3 shrink-0" />
                                  <span>{appointment.staff}</span>
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              {appointment.total > 0 && (
                                <div className="font-bold text-primary">{appointment.total} DH</div>
                              )}
                              {appointment.paid || appointment.status === 'confirmed' ? (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {t("myBookings.confirmed", { defaultValue: "Confirmé" })}
                                </span>
                              ) : appointment.status === 'awaiting_assignment' ? (
                                <span className="inline-flex items-center gap-1 text-xs text-sky-600">
                                  <AlertCircle className="w-3 h-3" />
                                  {t("myBookings.awaitingAssignment", { defaultValue: "En attente" })}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-pink-600">
                                  <Clock className="w-3 h-3" />
                                  {t("myBookings.pending", { defaultValue: "En cours" })}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Cancel Button */}
                          <div className="mt-3 pt-2 border-t border-current/10">
                            {canCancel(appointment) ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 w-full"
                                onClick={() => handleCancel(appointment.id)}
                                disabled={cancellingId === appointment.id}
                              >
                                {cancellingId === appointment.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <X className="w-3 h-3 mr-1" />
                                )}
                                {t("myBookings.cancel", { defaultValue: "Annuler" })}
                              </Button>
                            ) : (
                              <div className="text-[10px] text-muted-foreground text-center">
                                {t("myBookings.cannotCancelShort", { 
                                  hours: cancellationHours,
                                  defaultValue: `Annulation impossible (min ${cancellationHours}h avant)`
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              }).filter(Boolean)}
            </div>
          </div>
        )}

        {/* Quick List View for All Appointments */}
        {appointments.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 px-1">
              {t("myBookings.allUpcoming", { defaultValue: "Tous vos RDV à venir" })}
            </h3>
            <div className="space-y-2">
              {appointments.map(appointment => (
                <div 
                  key={appointment.id}
                  className={cn(
                    "glass-card p-3 cursor-pointer hover:bg-muted/50 transition-all",
                    format(parseISO(appointment.date), "yyyy-MM-dd") === format(date, "yyyy-MM-dd") && "ring-2 ring-primary/50"
                  )}
                  onClick={() => {
                    setDate(parseISO(appointment.date));
                    scrollToGrid();
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-center shrink-0">
                        <div className="text-xs text-muted-foreground">
                          {format(parseISO(appointment.date), "EEE", { locale: getDateLocale() })}
                        </div>
                        <div className="text-lg font-bold">
                          {format(parseISO(appointment.date), "dd")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(parseISO(appointment.date), "MMM", { locale: getDateLocale() })}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-primary">{appointment.startTime}</div>
                        <div className="text-sm truncate">{appointment.service || "-"}</div>
                        {appointment.staff && (
                          <div className="text-xs text-muted-foreground">{appointment.staff}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {appointment.total > 0 && (
                        <div className="font-bold">{appointment.total} DH</div>
                      )}
                      {appointment.paid || appointment.status === 'confirmed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" />
                      ) : (
                        <Clock className="w-4 h-4 text-sky-500 ml-auto" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Personalized Recommendations */}
        {hasSearched && phone && appointments.length > 0 && (
          <div className="mt-6">
            <ServiceRecommendations
              phone={phone}
              appointmentId={appointments[0]?.id}
              onAddService={(serviceName) => {
                window.location.href = `/booking?service=${encodeURIComponent(serviceName)}&phone=${encodeURIComponent(phone)}`;
              }}
              onServiceAdded={() => {
                handleSearch();
                toast({
                  title: t("myBookings.serviceAdded", { defaultValue: "Service ajouté" }),
                  description: t("myBookings.serviceAddedDesc", { defaultValue: "Le service a été ajouté à votre prochain RDV" })
                });
              }}
              className="glass-card p-4 rounded-2xl"
            />
            
            <div className="mt-4 text-center">
              <a href={`/booking?phone=${encodeURIComponent(phone)}`}>
                <Button variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" />
                  {t("myBookings.bookNewAppointment", { defaultValue: "Réserver un nouveau RDV" })}
                </Button>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
