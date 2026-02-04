import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, parseISO, differenceInHours } from "date-fns";
import { ar, enUS, fr } from "date-fns/locale";
import { Phone, Calendar, Clock, User, Scissors, CheckCircle2, AlertCircle, X, Loader2, ArrowLeft } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
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

export default function MyBookings() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [cancellationHours, setCancellationHours] = useState(24);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

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
        setAppointments(data.appointments || []);
        setCancellationHours(data.cancellationHours || 24);
        setHasSearched(true);
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

  const getStatusBadge = (appointment: Appointment) => {
    if (appointment.status === 'confirmed' || appointment.paid) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          {t("myBookings.confirmed", { defaultValue: "Confirmé" })}
        </span>
      );
    }
    if (appointment.status === 'awaiting_assignment') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {t("myBookings.awaitingAssignment", { defaultValue: "En attente" })}
        </span>
      );
    }
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {t("myBookings.pending", { defaultValue: "En cours" })}
      </span>
    );
  };

  return (
    <div className="min-h-screen relative overflow-hidden" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
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

        <div className="glass-card p-6 mb-6">
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
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("common.search", { defaultValue: "Rechercher" })}
            </Button>
          </div>
        </div>

        {hasSearched && (
          <div className="space-y-4">
            {appointments.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">{t("myBookings.noAppointments", { defaultValue: "Aucun rendez-vous" })}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("myBookings.noAppointmentsDesc", { defaultValue: "Aucun rendez-vous trouvé pour ce numéro" })}
                </p>
                <a href="/booking">
                  <Button variant="outline">{t("myBookings.bookNow", { defaultValue: "Réserver maintenant" })}</Button>
                </a>
              </div>
            ) : (
              <>
                <div className="text-sm text-muted-foreground mb-2">
                  {t("myBookings.found", { count: appointments.length, defaultValue: `${appointments.length} rendez-vous trouvé(s)` })}
                </div>
                {appointments.map(appointment => (
                  <div key={appointment.id} className="glass-card p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-semibold text-lg">
                          {format(parseISO(appointment.date), "EEEE d MMMM", { locale: getDateLocale() })}
                        </div>
                        <div className="text-primary font-bold text-xl">{appointment.startTime}</div>
                      </div>
                      {getStatusBadge(appointment)}
                    </div>

                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Scissors className="w-4 h-4" />
                        <span>{appointment.service || t("common.service")}</span>
                      </div>
                      {appointment.staff && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="w-4 h-4" />
                          <span>{appointment.staff}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>{appointment.duration} min</span>
                      </div>
                      {appointment.total > 0 && (
                        <div className="text-primary font-bold">
                          {appointment.total} {t("common.currency", { defaultValue: "DH" })}
                        </div>
                      )}
                    </div>

                    {canCancel(appointment) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleCancel(appointment.id)}
                        disabled={cancellingId === appointment.id}
                      >
                        {cancellingId === appointment.id ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <X className="w-4 h-4 mr-2" />
                        )}
                        {t("myBookings.cancel", { defaultValue: "Annuler ce RDV" })}
                      </Button>
                    ) : (
                      <div className="text-xs text-muted-foreground text-center py-2 bg-muted/30 rounded-lg">
                        {t("myBookings.cannotCancel", { 
                          hours: cancellationHours,
                          remaining: getHoursUntil(appointment),
                          defaultValue: `Annulation possible jusqu'à ${cancellationHours}h avant (${getHoursUntil(appointment)}h restantes)`
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
