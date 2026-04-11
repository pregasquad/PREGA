import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useParams } from "wouter";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SpinningLogo } from "@/components/ui/spinning-logo";
import { DollarSign, Calendar, TrendingUp, Wallet, AlertTriangle, Clock, Globe, Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format, parseISO } from "date-fns";
import { ar, enUS, fr } from "date-fns/locale";

interface StaffInfo {
  id: number;
  name: string;
  color: string;
}

interface PortalAppointment {
  id: number;
  date: string;
  time: string;
  service: string;
  duration: number;
  total: number;
  paid: boolean;
  client: string;
}

interface EarningsData {
  totalRevenue: number;
  totalCommission: number;
  totalAppointments: number;
  pendingDeductions: number;
  netPayable: number;
  walletBalance: number;
  walletSinceDate: string;
  lastPaidAt: string | null;
  deductionsList: { type: string; description: string; amount: number; date: string; cleared?: boolean; paidBack?: number }[];
  services: { name: string; count: number; revenue: number; commission: number }[];
}

export default function StaffPortal() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const isRTL = i18n.language === "ar";

  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.documentElement.lang = i18n.language;
  }, [i18n.language, isRTL]);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as any).standalone === true;
    setIsStandalone(standalone);
    if (!standalone) {
      const dismissed = localStorage.getItem("portal-install-dismissed");
      if (!dismissed) setShowInstallBanner(true);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const existingManifest = document.querySelector('link[rel="manifest"]');
    if (existingManifest) {
      existingManifest.setAttribute("href", `/api/public/staff-portal/${token}/manifest.json`);
    } else {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = `/api/public/staff-portal/${token}/manifest.json`;
      document.head.appendChild(link);
    }
    return () => {
      if (existingManifest) existingManifest.setAttribute("href", "/manifest.json");
    };
  }, [token]);

  const getDateLocale = () => {
    switch (i18n.language) {
      case "ar": return ar;
      case "fr": return fr;
      default: return enUS;
    }
  };

  // Today as local date string (no UTC shift)
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const { data: staffInfo, isLoading: loadingStaff, error: staffError } = useQuery<StaffInfo>({
    queryKey: ["/api/public/staff-portal", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/staff-portal/${token}`);
      if (!res.ok) throw new Error("Invalid token");
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  // Earnings always fetched in walletMode — server computes lastPaidAt → today automatically
  const { data: earnings, isLoading: loadingEarnings } = useQuery<EarningsData>({
    queryKey: ["/api/public/staff-portal", token, "earnings", "walletMode"],
    queryFn: async () => {
      const res = await fetch(`/api/public/staff-portal/${token}/earnings?walletMode=true`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!staffInfo,
  });

  // walletSinceDate comes from earnings response (server already computed it)
  const walletSinceDate = earnings?.walletSinceDate ?? "2000-01-01";

  // Appointments fetched for wallet period (walletSinceDate → today) once we know the start
  const { data: appointments = [], isLoading: loadingAppointments } = useQuery<PortalAppointment[]>({
    queryKey: ["/api/public/staff-portal", token, "appointments", walletSinceDate, todayStr],
    queryFn: async () => {
      const res = await fetch(
        `/api/public/staff-portal/${token}/appointments?startDate=${walletSinceDate}&endDate=${todayStr}`
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!staffInfo && !!earnings,
  });

  // Group appointments by date, sorted descending
  const appointmentsByDay = useMemo(() => {
    const map: Record<string, PortalAppointment[]> = {};
    for (const appt of appointments) {
      if (!map[appt.date]) map[appt.date] = [];
      map[appt.date].push(appt);
    }
    return map;
  }, [appointments]);

  const sortedDays = useMemo(
    () => Object.keys(appointmentsByDay).sort((a, b) => b.localeCompare(a)),
    [appointmentsByDay]
  );

  if (loadingStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <SpinningLogo size="lg" />
      </div>
    );
  }

  if (staffError || !staffInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" dir={isRTL ? "rtl" : "ltr"}>
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="p-4 rounded-full bg-destructive/10 mx-auto w-fit">
              <AlertTriangle className="w-10 h-10 text-destructive" />
            </div>
            <h2 className="text-xl font-bold" data-testid="text-invalid-link">{t("staffPortal.invalidLink")}</h2>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = loadingEarnings || loadingAppointments;

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: staffInfo.color }}
            data-testid="indicator-staff-color"
          />
          <h1 className="text-lg font-bold truncate flex-1" data-testid="text-staff-name">{staffInfo.name}</h1>
          <Badge variant="secondary" className="shrink-0">{t("staffPortal.title")}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" data-testid="button-portal-language">
                <Globe className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {[
                { code: "ar", name: "العربية" },
                { code: "fr", name: "Français" },
                { code: "en", name: "English" },
              ].map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  onClick={() => i18n.changeLanguage(lang.code)}
                  className={`cursor-pointer ${i18n.language === lang.code ? "bg-primary/10 text-primary font-medium" : ""}`}
                  data-testid={`menu-lang-${lang.code}`}
                >
                  {lang.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Install banner */}
      {showInstallBanner && !isStandalone && (
        <div className="max-w-2xl mx-auto px-4 pt-3">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                <div className="shrink-0 p-2 rounded-md bg-primary/10">
                  <Download className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{t("staffPortal.installApp", "Install as App")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {/iPhone|iPad|iPod/.test(navigator.userAgent)
                      ? t("staffPortal.installIOS", "Tap the Share button, then \"Add to Home Screen\"")
                      : t("staffPortal.installAndroid", "Tap the menu, then \"Add to Home Screen\"")}
                  </p>
                  {/iPhone|iPad|iPod/.test(navigator.userAgent) && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                      <span>1.</span>
                      <Share className="w-3.5 h-3.5" />
                      <span>{t("staffPortal.tapShare", "Tap Share")}</span>
                      <span className="mx-1">→</span>
                      <span>2. "{t("staffPortal.addToHomeScreen", "Add to Home Screen")}"</span>
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    setShowInstallBanner(false);
                    localStorage.setItem("portal-install-dismissed", "1");
                  }}
                  data-testid="button-dismiss-install"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Period label */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("staffPortal.myPerformance")}</h2>
          {earnings && (
            <span className="text-xs text-muted-foreground">
              {format(parseISO(walletSinceDate), "d MMM", { locale: getDateLocale() })}
              {" → "}
              {format(parseISO(todayStr), "d MMM yyyy", { locale: getDateLocale() })}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <SpinningLogo size="md" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-3 text-center">
                  <DollarSign className="w-5 h-5 mx-auto text-green-600 mb-1" />
                  <p className="text-xs text-muted-foreground">{t("staffPortal.revenue")}</p>
                  <p className="text-lg font-bold text-green-600" data-testid="text-total-revenue">
                    {formatCurrency(earnings?.totalRevenue ?? 0)} DH
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <TrendingUp className="w-5 h-5 mx-auto text-pink-600 mb-1" />
                  <p className="text-xs text-muted-foreground">{t("staffPortal.commission")}</p>
                  <p className="text-lg font-bold text-pink-600" data-testid="text-total-commission">
                    {formatCurrency(earnings?.totalCommission ?? 0)} DH
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <Calendar className="w-5 h-5 mx-auto text-pink-600 mb-1" />
                  <p className="text-xs text-muted-foreground">{t("staffPortal.appointments")}</p>
                  <p className="text-lg font-bold" data-testid="text-total-appointments">
                    {earnings?.totalAppointments ?? 0}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Appointment list grouped by date */}
            <Card>
              <CardHeader className="pb-2 px-3 pt-3">
                <CardTitle className="text-sm">{t("staffPortal.appointments")}</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {sortedDays.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-4" data-testid="text-no-appointments">
                    {t("staffPortal.noAppointments")}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {sortedDays.map((dateStr) => (
                      <div key={dateStr}>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                          {format(parseISO(dateStr), "EEEE, d MMMM yyyy", { locale: getDateLocale() })}
                        </p>
                        <div className="space-y-1.5">
                          {appointmentsByDay[dateStr]
                            .sort((a, b) => a.time.localeCompare(b.time))
                            .map((appt) => (
                              <div
                                key={appt.id}
                                className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30"
                                data-testid={`appointment-item-${appt.id}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium">{appt.time}</span>
                                    <span className="text-sm truncate">{appt.service}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{appt.client}</span>
                                    <span>{appt.duration}min</span>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-semibold">{formatCurrency(appt.total)} DH</p>
                                  <Badge variant={appt.paid ? "default" : "secondary"} className="text-xs">
                                    {appt.paid ? t("staffPortal.paid") : t("staffPortal.unpaid")}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Service breakdown */}
            {earnings && earnings.services.length > 0 && (
              <Card>
                <CardHeader className="pb-2 px-3 pt-3">
                  <CardTitle className="text-sm">{t("staffPortal.serviceBreakdown")}</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="space-y-2">
                    {earnings.services
                      .sort((a, b) => b.revenue - a.revenue)
                      .map((svc) => (
                        <div key={svc.name} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-b-0" data-testid={`service-row-${svc.name}`}>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{svc.name}</p>
                            <p className="text-xs text-muted-foreground">{svc.count}x</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm text-green-600">{formatCurrency(svc.revenue)} DH</p>
                            <p className="text-xs text-pink-600">{formatCurrency(svc.commission)} DH {t("staffPortal.commission")}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Wallet & deductions */}
            {earnings && (
              <Card>
                <CardHeader className="pb-2 px-3 pt-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wallet className="w-4 h-4" />
                    {t("staffPortal.earningsAndDeductions")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{t("staffPortal.commission")}</span>
                    <span className="font-bold text-green-600" data-testid="text-commission-total">
                      {formatCurrency(earnings.totalCommission)} DH
                    </span>
                  </div>
                  {earnings.pendingDeductions > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{t("staffPortal.pendingDeductions")}</span>
                      <span className="font-bold text-red-600" data-testid="text-pending-deductions">
                        -{formatCurrency(earnings.pendingDeductions)} DH
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="text-sm font-medium">{t("staffPortal.walletBalance")}</span>
                    <span className={`font-bold ${earnings.walletBalance < 0 ? "text-red-600" : "text-green-600"}`} data-testid="text-wallet-balance">
                      {earnings.walletBalance < 0
                        ? `-${formatCurrency(Math.abs(earnings.walletBalance))}`
                        : formatCurrency(earnings.walletBalance)} DH
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {t("staffPortal.lastPaid")}
                    </span>
                    <span>
                      {earnings.lastPaidAt
                        ? format(new Date(earnings.lastPaidAt), "d MMM yyyy", { locale: getDateLocale() })
                        : t("staffPortal.never")}
                    </span>
                  </div>

                  {earnings.deductionsList.length > 0 && (
                    <div className="border-t pt-2 space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">{t("staffPortal.allDeductions")}</p>
                      {earnings.deductionsList.map((ded, idx) => {
                        const remaining = Math.max(0, ded.amount - (ded.paidBack || 0));
                        return (
                          <div key={idx} className="flex items-center justify-between gap-2 py-1 text-sm" data-testid={`deduction-item-${idx}`}>
                            <div className="min-w-0 flex-1">
                              <span className="text-xs">{ded.type}</span>
                              {ded.description && (
                                <span className="text-xs text-muted-foreground"> - {ded.description}</span>
                              )}
                              {ded.cleared && (
                                <span className="text-[10px] ms-1.5 px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
                                  {t("salaries.paidBack")}
                                </span>
                              )}
                              {!ded.cleared && (ded.paidBack || 0) > 0 && (
                                <span className="text-[10px] ms-1.5 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
                                  {formatCurrency(ded.paidBack || 0)} {t("salaries.repaid")}
                                </span>
                              )}
                            </div>
                            <span className={`font-medium shrink-0 ${ded.cleared ? "text-muted-foreground line-through" : "text-red-600"}`}>
                              -{formatCurrency(ded.cleared ? ded.amount : remaining)} DH
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
