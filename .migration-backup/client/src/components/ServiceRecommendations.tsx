import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, Clock, TrendingUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceRecommendation {
  type: "timing" | "upsell" | "popular_pairing";
  serviceName: string;
  serviceId?: number;
  price: number;
  duration: number;
  message: string;
  messageKey: string;
  priority: number;
  daysSinceLastBooking?: number;
  usualIntervalWeeks?: number;
}

interface ServiceRecommendationsProps {
  phone: string;
  onAddService: (serviceName: string, serviceId?: number) => void;
  selectedServices?: string[];
  className?: string;
  appointmentId?: number;
  onServiceAdded?: () => void;
}

export function ServiceRecommendations({ 
  phone, 
  onAddService, 
  selectedServices = [],
  className,
  appointmentId,
  onServiceAdded
}: ServiceRecommendationsProps) {
  const { t } = useTranslation();
  const [recommendations, setRecommendations] = useState<ServiceRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [addingServiceId, setAddingServiceId] = useState<number | null>(null);

  useEffect(() => {
    const fetchRecommendations = async () => {
      if (!phone || phone.replace(/[^0-9]/g, "").length < 6) {
        setRecommendations([]);
        return;
      }

      setIsLoading(true);
      try {
        const res = await fetch(`/api/public/recommendations?phone=${encodeURIComponent(phone)}`);
        if (res.ok) {
          const data = await res.json();
          setRecommendations(data.recommendations || []);
        }
      } catch (err) {
        console.error("Failed to load recommendations:", err);
      } finally {
        setIsLoading(false);
        setHasLoaded(true);
      }
    };

    const debounceTimer = setTimeout(fetchRecommendations, 500);
    return () => clearTimeout(debounceTimer);
  }, [phone]);

  const filteredRecommendations = recommendations.filter(
    rec => !selectedServices.some(s => s.toLowerCase() === rec.serviceName.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className={cn("glass-card p-4 rounded-2xl", className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t("recommendations.loading", { defaultValue: "Chargement des recommandations..." })}</span>
        </div>
      </div>
    );
  }

  if (!hasLoaded || filteredRecommendations.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Sparkles className="w-4 h-4" />
        <span>{t("recommendations.forYou", { defaultValue: "Recommandé pour vous" })}</span>
      </div>
      
      <div className="space-y-2">
        {filteredRecommendations.map((rec, index) => (
          <div 
            key={`${rec.serviceName}-${index}`}
            className={cn(
              "glass-card rounded-xl p-3 transition-all hover:scale-[1.01]",
              rec.type === "timing" && "border-l-4 border-l-amber-500",
              rec.type === "upsell" && "border-l-4 border-l-emerald-500",
              rec.type === "popular_pairing" && "border-l-4 border-l-sky-500"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {rec.type === "timing" && <Clock className="w-3.5 h-3.5 text-amber-500" />}
                  {rec.type === "upsell" && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
                  {rec.type === "popular_pairing" && <Sparkles className="w-3.5 h-3.5 text-sky-500" />}
                  <span className="font-semibold text-sm truncate">{rec.serviceName}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {rec.message}
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{rec.duration} min</span>
                  <span className="font-semibold text-primary">{rec.price} DH</span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 h-8 px-3 rounded-lg border-primary/30 hover:bg-primary/10"
                disabled={addingServiceId === rec.serviceId}
                onClick={async () => {
                  if (appointmentId && rec.serviceId) {
                    setAddingServiceId(rec.serviceId);
                    try {
                      const res = await fetch("/api/public/add-service-to-appointment", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          appointmentId,
                          phone,
                          serviceId: rec.serviceId
                        })
                      });
                      if (res.ok) {
                        setRecommendations(prev => prev.filter(r => r.serviceId !== rec.serviceId));
                        onServiceAdded?.();
                      } else {
                        const data = await res.json().catch(() => ({}));
                        console.error("Failed to add service:", data.error);
                      }
                    } catch (err) {
                      console.error("Failed to add service:", err);
                    } finally {
                      setAddingServiceId(null);
                    }
                  } else {
                    onAddService(rec.serviceName, rec.serviceId);
                  }
                }}
              >
                {addingServiceId === rec.serviceId ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5 mr-1" />
                )}
                {t("recommendations.add", { defaultValue: "Ajouter" })}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
