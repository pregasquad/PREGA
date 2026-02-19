import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useParams } from "wouter";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SpinningLogo } from "@/components/ui/spinning-logo";
import { DollarSign, Calendar, TrendingUp, Wallet, AlertTriangle, ChevronDown, ChevronUp, Clock, Globe, Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format, startOfMonth, endOfMonth, subMonths, getDaysInMonth, getDay, parseISO } from "date-fns";
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
  lastPaidAt: string | null;
  deductionsList: { type: string; description: string; amount: number; date: string; cleared?: boolean }[];
  services: { name: string; count: number; revenue: number; commission: number }[];
}

export default function StaffPortal() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const isRTL = i18n.language === "ar";

  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

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
      if (!dismissed) {
        setShowInstallBanner(true);
      }
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
      if (existingManifest) {
        existingManifest.setAttribute("href", "/manifest.json");
      }
    };
  }, [token]);

  const getDateLocale = () => {
    switch (i18n.language) {
      case "ar": return ar;
      case "fr": return fr;
      default: return enUS;
    }
  };

  const { startDate, endDate } = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const start = startOfMonth(new Date(year, month - 1));
    const end = endOfMonth(start);
    return {
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
    };
  }, [selectedMonth]);

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

  const { data: appointments = [], isLoading: loadingAppointments } = useQuery<PortalAppointment[]>({
    queryKey: ["/api/public/staff-portal", token, "appointments", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/public/staff-portal/${token}/appointments?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!staffInfo,
  });

  const { data: earnings, isLoading: loadingEarnings } = useQuery<EarningsData>({
    queryKey: ["/api/public/staff-portal", token, "earnings", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/public/staff-portal/${token}/earnings?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!staffInfo,
  });

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return {
      value: format(date, "yyyy-MM"),
      label: format(date, "MMMM yyyy", { locale: getDateLocale() }),
    };
  }), [i18n.language]);

  const appointmentsByDay = useMemo(() => {
    const map: Record<string, PortalAppointment[]> = {};
    for (const appt of appointments) {
      if (!map[appt.date]) map[appt.date] = [];
      map[appt.date].push(appt);
    }
    return map;
  }, [appointments]);

  const calendarDays = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const daysInMonth = getDaysInMonth(new Date(year, month - 1));
    const firstDayOfWeek = getDay(new Date(year, month - 1, 1));
    const days: { day: number; dateStr: string }[] = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({ day: 0, dateStr: "" });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ day: d, dateStr });
    }

    return days;
  }, [selectedMonth]);

  const weekDays = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    if (i18n.language === "ar") return ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
    if (i18n.language === "fr") return ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    return days;
  }, [i18n.language]);

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

  const isLoading = loadingAppointments || loadingEarnings;

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? "rtl" : "ltr"}>
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t("staffPortal.myPerformance")}</h2>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-40" data-testid="select-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <SpinningLogo size="md" />
          </div>
        ) : (
          <>
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

            <Card>
              <CardHeader className="pb-2 px-3 pt-3">
                <CardTitle className="text-sm">{t("staffPortal.appointments")}</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="grid grid-cols-7 gap-px mb-1">
                  {weekDays.map((d) => (
                    <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px">
                  {calendarDays.map((cell, idx) => {
                    if (cell.day === 0) return <div key={`empty-${idx}`} className="aspect-square" />;
                    const dayAppts = appointmentsByDay[cell.dateStr] || [];
                    const hasAppts = dayAppts.length > 0;
                    const isExpanded = expandedDay === cell.dateStr;
                    const isToday = cell.dateStr === format(new Date(), "yyyy-MM-dd");

                    return (
                      <div
                        key={cell.dateStr}
                        className={`aspect-square flex flex-col items-center justify-center rounded-md text-sm cursor-pointer transition-colors
                          ${isToday ? "ring-1 ring-primary" : ""}
                          ${isExpanded ? "bg-primary/10" : hasAppts ? "bg-muted/50" : ""}
                        `}
                        onClick={() => setExpandedDay(isExpanded ? null : cell.dateStr)}
                        data-testid={`calendar-day-${cell.day}`}
                      >
                        <span className={`text-xs ${isToday ? "font-bold" : ""}`}>{cell.day}</span>
                        {hasAppts && (
                          <div
                            className="w-1.5 h-1.5 rounded-full mt-0.5"
                            style={{ backgroundColor: staffInfo.color }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {expandedDay && appointmentsByDay[expandedDay] && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {format(parseISO(expandedDay), "EEEE, d MMMM", { locale: getDateLocale() })}
                    </p>
                    {appointmentsByDay[expandedDay].map((appt) => (
                      <div key={appt.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30" data-testid={`appointment-item-${appt.id}`}>
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
                )}

                {appointments.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4" data-testid="text-no-appointments">
                    {t("staffPortal.noAppointments")}
                  </p>
                )}
              </CardContent>
            </Card>

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
                    <span className={`font-bold ${earnings.walletBalance < 0 ? 'text-red-600' : 'text-green-600'}`} data-testid="text-wallet-balance">
                      {earnings.walletBalance < 0 ? `-${formatCurrency(Math.abs(earnings.walletBalance))}` : formatCurrency(earnings.walletBalance)} DH
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
                      {earnings.deductionsList.map((ded, idx) => (
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
                          </div>
                          <span className={`font-medium shrink-0 ${ded.cleared ? 'text-muted-foreground line-through' : 'text-red-600'}`}>
                            -{formatCurrency(ded.amount)} DH
                          </span>
                        </div>
                      ))}
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
