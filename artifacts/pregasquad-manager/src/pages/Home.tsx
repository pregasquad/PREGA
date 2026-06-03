import { useAppointments, useStaff, useServices, useClients, useCategories, useBusinessSettings } from "@/hooks/use-salon-data";
import { calcAppointmentCommission } from "@/lib/commissionCalc";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Scissors, CalendarCheck, TrendingUp, Clock, Package, UserPlus, Pencil, Trash2, LogOut, AlertTriangle, Banknote, CreditCard, RefreshCw, ClipboardCheck, CheckCircle2, XCircle, CircleDot, ArrowUpRight, ArrowDownRight, Minus, Bell, BellRing, ChevronDown, ChevronUp } from "lucide-react";
import { format, startOfToday, subDays, parseISO } from "date-fns";
import { useState, useMemo, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertStaffSchema } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

function getWorkDayDate(openingTime?: string, closingTime?: string): Date {
  const now = new Date();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  const currentTotalMinutes = hour * 60 + minutes;
  if (openingTime && closingTime) {
    const [openH, openM] = openingTime.split(":").map(Number);
    const [closeH, closeM] = closingTime.split(":").map(Number);
    const openingMinutes = openH * 60 + openM;
    const closingMinutes = closeH * 60 + closeM;
    if (closingMinutes < openingMinutes) {
      if (currentTotalMinutes < closingMinutes) {
        return subDays(startOfToday(), 1);
      }
    } else {
      if (currentTotalMinutes < openingMinutes) {
        return subDays(startOfToday(), 1);
      }
    }
  } else {
    if (currentTotalMinutes < 2 * 60) {
      return subDays(startOfToday(), 1);
    }
  }
  return startOfToday();
}

function EditStaffForm({ staff, categories, onSubmit, isPending, t }: { 
  staff: any; 
  categories: any[]; 
  onSubmit: (data: any) => void; 
  isPending: boolean;
  t: any;
}) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    staff.categories ? staff.categories.split(",").filter(Boolean) : []
  );
  const [name, setName] = useState(staff.name);
  const [color, setColor] = useState(staff.color);

  const toggleCategory = (catName: string) => {
    setSelectedCategories(prev => 
      prev.includes(catName) ? prev.filter(c => c !== catName) : [...prev, catName]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, color, categories: selectedCategories.join(",") });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("home.name")}</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required data-testid="input-edit-staff-name" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("home.color")}</label>
        <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} required data-testid="input-edit-staff-color" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("home.categories")}</label>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat: any) => (
            <Button
              key={cat.id}
              type="button"
              variant={selectedCategories.includes(cat.name) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleCategory(cat.name)}
              data-testid={`button-edit-category-${cat.id}`}
            >
              {cat.name}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("home.selectCategoriesHint")}</p>
      </div>
      <Button type="submit" className="w-full" disabled={isPending} data-testid="button-edit-staff-submit">
        {isPending ? t("home.updating") : t("home.update")}
      </Button>
    </form>
  );
}

function DayOpeningBriefing({ appointments, todayDate, businessName, currency }: { appointments: any[]; todayDate: string; businessName?: string; currency?: string }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const key = `briefing_shown_${todayDate}`;
    const already = localStorage.getItem(key);
    const unpaidCount = appointments.filter((a: any) => !a.paid).length;
    if (!already && unpaidCount > 0) {
      const timer = setTimeout(() => {
        setOpen(true);
        localStorage.setItem(key, "1");
      }, 800);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [todayDate, appointments.length]);

  const timeToMinutes = (time: string) => {
    const [h, m] = (time || "00:00").split(":").map(Number);
    return h * 60 + m;
  };

  const sorted = [...appointments]
    .filter((a: any) => a.startTime && !a.paid)
    .sort((a: any, b: any) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const totalRevenue = sorted.reduce((s: number, a: any) => s + (a.total || 0), 0);
  const firstAppt = sorted[0];
  const curr = currency || "DH";

  const dateLocale = i18n.language === "ar" ? "ar-MA" : i18n.language === "fr" ? "fr-FR" : "en-GB";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden gap-0">
        {/* Header */}
        <div className="bg-gradient-to-br from-orange-400 to-pink-500 px-5 pt-6 pb-5 text-white">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">☀️</span>
            <span className="text-xs font-semibold uppercase tracking-widest opacity-80">{t("home.briefingTitle")}</span>
          </div>
          <h2 className="text-xl font-bold leading-tight">{businessName || "PREGA SQUAD"}</h2>
          <p className="text-sm opacity-90 mt-0.5">
            {new Date(todayDate + "T12:00:00").toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" })}
          </p>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-white/20 rounded-xl px-3 py-2 text-center">
              <p className="text-xl font-bold">{sorted.length}</p>
              <p className="text-[10px] font-medium opacity-80 uppercase">{t("home.briefingUnpaid")}</p>
            </div>
            <div className="bg-white/20 rounded-xl px-3 py-2 text-center">
              <p className="text-xl font-bold">{totalRevenue}</p>
              <p className="text-[10px] font-medium opacity-80 uppercase">{curr} {t("home.briefingRemaining")}</p>
            </div>
            <div className="bg-white/20 rounded-xl px-3 py-2 text-center">
              <p className="text-xl font-bold">{firstAppt ? firstAppt.startTime : "--"}</p>
              <p className="text-[10px] font-medium opacity-80 uppercase">{t("home.briefingStart")}</p>
            </div>
          </div>
        </div>

        {/* Appointment list */}
        <div className="px-4 py-3 max-h-64 overflow-y-auto divide-y divide-border/50">
          {sorted.map((appt: any, i: number) => (
            <div key={appt.id} className="flex items-center gap-3 py-2.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                i === 0 ? "bg-orange-400" : "bg-pink-400"
              }`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold tabular-nums">{appt.startTime}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{appt.duration} min</span>
                </div>
                <p className="text-sm font-medium truncate leading-tight">{appt.client}</p>
                <p className="text-xs text-muted-foreground truncate">{appt.service}{appt.staff ? ` · ${appt.staff}` : ""}</p>
              </div>
              <p className="text-sm font-bold shrink-0">{appt.total} {curr}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-2 border-t border-border/50">
          <Button
            className="w-full rounded-xl bg-gradient-to-r from-orange-400 to-pink-500 text-white font-semibold hover:opacity-90"
            onClick={() => setOpen(false)}
          >
            {t("home.briefingLetsGo")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TodayScheduleReminder({ appointments, currency }: { appointments: any[]; currency?: string }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(new Date());
  const [expanded, setExpanded] = useState(true);
  const notifiedRef = useRef<Set<number>>(new Set());
  const curr = currency || "DH";

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const timeToMinutes = (time: string) => {
    const [h, m] = (time || "00:00").split(":").map(Number);
    return h * 60 + m;
  };

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const sorted = useMemo(() => {
    return [...appointments]
      .filter((a: any) => a.startTime)
      .sort((a: any, b: any) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }, [appointments]);

  const getStatus = (appt: any) => {
    const start = timeToMinutes(appt.startTime);
    const end = start + (appt.duration || 30);
    if (nowMinutes >= end) return "done";
    if (nowMinutes >= start) return "inprogress";
    return "upcoming";
  };

  const next = sorted.find((a: any) => getStatus(a) === "upcoming");
  const nextMinutes = next ? timeToMinutes(next.startTime) - nowMinutes : null;

  // Browser notification for appointment starting in 10 min
  useEffect(() => {
    if (!next || notifiedRef.current.has(next.id)) return;
    if (nextMinutes !== null && nextMinutes <= 10 && nextMinutes > 0) {
      notifiedRef.current.add(next.id);
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(`⏰ ${t("home.nextAppt")} ${next.startTime} (${nextMinutes} min)`, {
          body: `${next.client} — ${next.service}`,
          icon: "/icon-192.png",
        });
      }
    }
  }, [next, nextMinutes, t]);

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 px-4 py-3 flex items-center gap-3 text-muted-foreground text-sm">
        <CalendarCheck className="w-4 h-4 shrink-0" />
        <span>{t("home.noAppointmentsScheduled")}</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between gap-3 px-4 py-3"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2.5">
          {next ? (
            <div className="relative">
              <BellRing className="w-4 h-4 text-orange-500" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full animate-ping" />
            </div>
          ) : (
            <Bell className="w-4 h-4 text-muted-foreground" />
          )}
          <div className="text-left">
            <p className="text-sm font-semibold leading-tight">
              {t("home.todaySchedule")}
              <span className="ms-2 text-xs font-normal text-muted-foreground">({sorted.length})</span>
            </p>
            {next && nextMinutes !== null && (
              <p className="text-[11px] text-orange-500 font-medium mt-0.5">
                {t("home.nextAppt")}: {next.startTime} — {next.client}
                {nextMinutes <= 60
                  ? ` (${nextMinutes} min)`
                  : ` (${Math.floor(nextMinutes / 60)}h${nextMinutes % 60 > 0 ? String(nextMinutes % 60).padStart(2, "0") : ""})`}
              </p>
            )}
            {!next && (
              <p className="text-[11px] text-emerald-500 font-medium mt-0.5">{t("home.allDone")}</p>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border/50 divide-y divide-border/40">
          {sorted.map((appt: any) => {
            const status = getStatus(appt);
            return (
              <div
                key={appt.id}
                className={`flex items-center gap-3 px-4 py-2.5 ${status === "inprogress" ? "bg-orange-50 dark:bg-orange-900/10" : status === "done" ? "opacity-50" : ""}`}
              >
                <div className={`w-1.5 h-10 rounded-full shrink-0 ${status === "done" ? "bg-emerald-400" : status === "inprogress" ? "bg-orange-400 animate-pulse" : "bg-blue-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{appt.startTime}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{appt.duration} min</span>
                    {status === "inprogress" && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-orange-500 bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded-full">{t("home.inProgress")}</span>
                    )}
                    {status === "done" && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                  </div>
                  <p className="text-xs font-medium truncate">{appt.client}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{appt.service} {appt.staff ? `· ${appt.staff}` : ""}</p>
                </div>
                <div className={`text-right shrink-0 ${appt.paid ? "text-emerald-600" : "text-amber-500"}`}>
                  <p className="text-xs font-bold">{appt.total} {curr}</p>
                  <p className="text-[10px]">{appt.paid ? t("common.paid") : t("common.unpaid")}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { data: bSettings } = useBusinessSettings();
  const todayDate = useMemo(() => format(getWorkDayDate(bSettings?.openingTime, bSettings?.closingTime), "yyyy-MM-dd"), [bSettings?.openingTime, bSettings?.closingTime]);
  const { data: appointments = [] } = useAppointments(todayDate);
  const { data: staff = [] } = useStaff();
  const { data: services = [] } = useServices();
  const { data: clients = [] } = useClients();
  const { data: categories = [] } = useCategories();
  const { data: charges = [] } = useQuery<any[]>({
    queryKey: ["/api/charges"],
  });
  const { data: ownerWithdrawalsData = [] } = useQuery<any[]>({
    queryKey: ["/api/owner-withdrawals"],
  });
  const { data: lowStockProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/products/low-stock"],
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cashVerified, setCashVerified] = useState(() => {
    const stored = localStorage.getItem(`cash_verified_${todayDate}`);
    return stored === "true";
  });
  const toggleCashVerified = () => {
    const newVal = !cashVerified;
    setCashVerified(newVal);
    localStorage.setItem(`cash_verified_${todayDate}`, String(newVal));
  };
  const [isStaffDialogOpen, setIsStaffDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const handleAdminLogout = () => {
    sessionStorage.removeItem("admin_authenticated");
    localStorage.removeItem("admin_authenticated");
    setLocation("/planning");
  };

  const staffForm = useForm({
    resolver: zodResolver(insertStaffSchema),
    defaultValues: { name: "", color: "#" + Math.floor(Math.random()*16777215).toString(16), categories: "" }
  });

  const createStaffMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/staff", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setIsStaffDialogOpen(false);
      staffForm.reset({ name: "", color: "#" + Math.floor(Math.random()*16777215).toString(16), categories: "" });
      toast({ title: t("home.staffAdded") });
    }
  });

  const updateStaffMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/staff/${editingStaff.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setEditingStaff(null);
      toast({ title: t("home.staffUpdated") });
    }
  });

  const deleteStaffMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/staff/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: t("home.staffDeleted") });
    }
  });

  const { data: staffCommissions = [] } = useQuery<{ id: number; staffId: number; serviceId: number; percentage: number }[]>({
    queryKey: ["/api/staff-commissions"],
  });

  const todayStats = useMemo(() => {
    const totalRevenue = appointments.reduce((sum: number, app: any) => sum + (app.total || 0), 0);
    const paidRevenue = appointments.filter((app: any) => app.paid).reduce((sum: number, app: any) => sum + (app.total || 0), 0);
    const unpaidRevenue = totalRevenue - paidRevenue;

    // Commissions computed only on PAID appointments — unpaid cash isn't in the register yet
    let totalCommissions = 0;
    appointments.filter((app: any) => app.paid).forEach((app: any) => {
      totalCommissions += calcAppointmentCommission(app, services, staff, staffCommissions);
    });

    return { totalRevenue, paidRevenue, unpaidRevenue, totalCommissions, count: appointments.length };
  }, [appointments, services, staff, staffCommissions]);

  const todayExpenses = useMemo(() => {
    const todayCharges = charges.filter((c: any) => c.date === todayDate);
    return todayCharges.reduce((sum: number, c: any) => sum + (c.amount || 0), 0);
  }, [charges, todayDate]);

  const todayOwnerWithdrawals = useMemo(() => {
    const todayW = ownerWithdrawalsData.filter((w: any) => {
      try { return format(parseISO(w.date), "yyyy-MM-dd") === todayDate; } catch { return w.date === todayDate; }
    });
    return todayW.reduce((sum: number, w: any) => sum + Number(w.amount || 0), 0);
  }, [ownerWithdrawalsData, todayDate]);

  const salonPortion = todayStats.paidRevenue - todayStats.totalCommissions;
  const netProfit = salonPortion - todayExpenses - todayOwnerWithdrawals;

  const closingChecklist = useMemo(() => {
    const unpaidCount = appointments.filter((app: any) => !app.paid).length;
    const hasAppointments = appointments.length > 0;
    const allPaid = hasAppointments && unpaidCount === 0;
    const unpaidAmount = appointments.filter((app: any) => !app.paid).reduce((sum: number, app: any) => sum + (app.total || 0), 0);
    const todayCharges = charges.filter((c: any) => c.date === todayDate);
    const hasExpenses = todayCharges.length > 0;
    const allGood = allPaid && hasAppointments && hasExpenses && cashVerified;
    return { unpaidCount, hasAppointments, allPaid, unpaidAmount, hasExpenses, allGood };
  }, [appointments, charges, todayDate, cashVerified]);

  const staffPerformance = useMemo(() => {
    return staff.map((s: any) => {
      const staffApps = appointments.filter((a: any) => a.staffId === s.id || (!a.staffId && a.staff === s.name));
      const staffRevenue = staffApps.reduce((sum: number, a: any) => sum + (a.total || 0), 0);
      return {
        ...s,
        appointmentCount: staffApps.length,
        revenue: staffRevenue,
      };
    });
  }, [staff, appointments]);

  return (
    <div className="min-h-screen pb-24" dir={isRtl ? "rtl" : "ltr"}>
      <div className="max-w-lg mx-auto px-4 py-5 space-y-6 animate-fade-in">

        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-dashboard-title">{t("home.dashboard")}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{t("home.overview")}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              disabled={isRefreshing}
              onClick={async () => {
                setIsRefreshing(true);
                await queryClient.invalidateQueries();
                setIsRefreshing(false);
                toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
              }}
              title={t("common.refresh")}
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
            <LanguageSwitcher />
            <Button 
              variant="ghost" 
              size="icon"
              className="text-destructive"
              onClick={handleAdminLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <DayOpeningBriefing appointments={appointments} todayDate={todayDate} businessName={bSettings?.businessName} currency={bSettings?.currencySymbol} />
        <TodayScheduleReminder appointments={appointments} currency={bSettings?.currencySymbol} />

        <div className="grid grid-cols-2 gap-3" data-testid="section-summary-cards">
          <div className="glass-card rounded-2xl p-4 flex flex-col justify-between min-h-[100px]" data-testid="card-revenue">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("home.todayRevenue")}</span>
            <div className="mt-2">
              <span className="text-2xl font-bold tracking-tight" data-testid="text-revenue-value">{todayStats.totalRevenue}</span>
              <span className="text-sm font-medium text-muted-foreground ms-1">{bSettings?.currencySymbol || "DH"}</span>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4 flex flex-col justify-between min-h-[100px]" data-testid="card-appointments">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("home.todayAppointments")}</span>
            <div className="mt-2">
              <span className="text-2xl font-bold tracking-tight" data-testid="text-appointments-value">{todayStats.count}</span>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4 flex flex-col justify-between min-h-[100px]" data-testid="card-paid">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("home.paidToday")}</span>
            <div className="mt-2">
              <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400" data-testid="text-paid-value">{todayStats.paidRevenue}</span>
              <span className="text-sm font-medium text-muted-foreground ms-1">{bSettings?.currencySymbol || "DH"}</span>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4 flex flex-col justify-between min-h-[100px]" data-testid="card-unpaid">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("home.unpaidToday")}</span>
            <div className="mt-2">
              <span className={`text-2xl font-bold tracking-tight ${todayStats.unpaidRevenue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`} data-testid="text-unpaid-value">{todayStats.unpaidRevenue}</span>
              <span className="text-sm font-medium text-muted-foreground ms-1">{bSettings?.currencySymbol || "DH"}</span>
            </div>
          </div>
        </div>

        <div data-testid="section-financial">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">{t("home.financialOverview")}</h2>
          <Card className="overflow-visible">
            <CardContent className="p-0">
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("home.salonRevenue")}</p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400" data-testid="text-salon-revenue">{todayStats.totalRevenue} {bSettings?.currencySymbol || "DH"}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-border/50" />

              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                    <ArrowDownRight className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("home.expenses")}</p>
                    <p className="text-lg font-bold text-red-600 dark:text-red-400" data-testid="text-expenses">{todayExpenses} {bSettings?.currencySymbol || "DH"}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-border/50" />

              <div className="p-5 flex flex-col items-center justify-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">{t("home.netProfit")}</p>
                <p className={`text-3xl font-extrabold tracking-tight ${netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-net-profit">
                  {netProfit >= 0 ? '+' : ''}{netProfit} {bSettings?.currencySymbol || "DH"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div data-testid="section-team-performance">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{t("home.employeesAccount")}</h2>
            <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs" data-testid="button-add-staff">
                  <UserPlus className="w-3.5 h-3.5" />
                  {t("home.addStaff")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t("home.addNewStaff")}</DialogTitle></DialogHeader>
                <Form {...staffForm}>
                  <form onSubmit={staffForm.handleSubmit((data) => createStaffMutation.mutate(data))} className="space-y-4">
                    <FormField control={staffForm.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>{t("home.name")}</FormLabel><FormControl><Input {...field} data-testid="input-add-staff-name" /></FormControl></FormItem>
                    )} />
                    <FormField control={staffForm.control} name="color" render={({ field }) => (
                      <FormItem><FormLabel>{t("home.color")}</FormLabel><FormControl><Input type="color" {...field} data-testid="input-add-staff-color" /></FormControl></FormItem>
                    )} />
                    <FormField control={staffForm.control} name="categories" render={({ field }) => {
                      const selectedCategories = field.value ? field.value.split(",").filter(Boolean) : [];
                      const toggleCategory = (catName: string) => {
                        const newCategories = selectedCategories.includes(catName)
                          ? selectedCategories.filter(c => c !== catName)
                          : [...selectedCategories, catName];
                        field.onChange(newCategories.join(","));
                      };
                      return (
                        <FormItem>
                          <FormLabel>{t("home.categories")}</FormLabel>
                          <div className="flex flex-wrap gap-2">
                            {categories.map((cat: any) => (
                              <Button
                                key={cat.id}
                                type="button"
                                variant={selectedCategories.includes(cat.name) ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleCategory(cat.name)}
                                data-testid={`button-add-category-${cat.id}`}
                              >
                                {cat.name}
                              </Button>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">{t("home.selectCategoriesHint")}</p>
                        </FormItem>
                      );
                    }} />
                    <Button type="submit" className="w-full" disabled={createStaffMutation.isPending} data-testid="button-add-staff-submit">
                      {createStaffMutation.isPending ? t("home.adding") : t("home.add")}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {staffPerformance.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground text-center" data-testid="text-no-staff">{t("home.noStaffData")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {staffPerformance.map((s: any) => (
                <Card key={s.id} className="overflow-visible" data-testid={`card-employee-${s.id}`}>
                  <CardContent className="p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: s.color }}>
                        {s.name?.charAt(0)?.toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <p className="font-bold text-sm truncate" data-testid={`text-employee-name-${s.id}`}>{s.name}</p>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Dialog open={!!editingStaff && editingStaff.id === s.id} onOpenChange={(open) => !open && setEditingStaff(null)}>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => setEditingStaff(s)} data-testid={`button-edit-staff-${s.id}`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader><DialogTitle>{t("home.editStaffData")}</DialogTitle></DialogHeader>
                                <EditStaffForm 
                                  staff={s} 
                                  categories={categories} 
                                  onSubmit={(data: any) => updateStaffMutation.mutate(data)} 
                                  isPending={updateStaffMutation.isPending}
                                  t={t}
                                />
                              </DialogContent>
                            </Dialog>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-destructive"
                              onClick={() => {
                                if (confirm(t("home.deleteConfirm"))) {
                                  deleteStaffMutation.mutate(s.id);
                                }
                              }}
                              data-testid={`button-delete-staff-${s.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs">
                          <div>
                            <span className="text-muted-foreground">{t("home.revenue")}: </span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400" data-testid={`text-employee-revenue-${s.id}`}>{s.revenue} {bSettings?.currencySymbol || "DH"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t("home.appointments")}: </span>
                            <span className="font-semibold" data-testid={`text-employee-appts-${s.id}`}>{s.appointmentCount}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div data-testid="section-closing-checklist">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">{t("home.smartClosingDay")}</h2>
          <Card>
            <CardContent className="p-3.5">
              <p className="text-xs text-muted-foreground mb-3">{t("home.smartClosingDesc")}</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40" data-testid="check-appointments">
                  {closingChecklist.allPaid ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : closingChecklist.hasAppointments ? (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  ) : (
                    <CircleDot className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{t("home.checkAllAppointments")}</p>
                    <p className={`text-[10px] ${closingChecklist.allPaid ? 'text-emerald-600 dark:text-emerald-400' : closingChecklist.hasAppointments ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {closingChecklist.allPaid
                        ? t("home.allAppointmentsPaid")
                        : closingChecklist.hasAppointments
                          ? t("home.unpaidAppointments", { count: closingChecklist.unpaidCount })
                          : t("home.noAppointmentsRecorded")}
                    </p>
                  </div>
                </div>

                <div
                  className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40 cursor-pointer hover-elevate"
                  data-testid="check-cash"
                  onClick={toggleCashVerified}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleCashVerified(); }}
                >
                  {cashVerified ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <CircleDot className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{t("home.checkCashMatch")}</p>
                    <p className={`text-[10px] ${cashVerified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {cashVerified ? t("home.cashMatches") : t("home.cashTapToVerify")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40" data-testid="check-expenses">
                  {closingChecklist.hasExpenses ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <CircleDot className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{t("home.checkExpensesEntered")}</p>
                    <p className={`text-[10px] ${closingChecklist.hasExpenses ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {closingChecklist.hasExpenses ? t("home.expensesRecorded") : t("home.noExpensesRecorded")}
                    </p>
                  </div>
                </div>
              </div>

              <div className={`mt-3 p-2 rounded-lg text-center text-xs font-semibold ${closingChecklist.allGood ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`} data-testid="text-closing-status">
                {closingChecklist.allGood ? t("home.closingReady") : t("home.closingNotReady")}
              </div>
            </CardContent>
          </Card>
        </div>

        {lowStockProducts.length > 0 && (
          <div data-testid="section-low-stock">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-destructive mb-3">{t("home.lowStockAlert")}</h2>
            <Card>
              <CardContent className="p-3.5">
                <div className="space-y-2">
                  {lowStockProducts.map((product: any) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-destructive/5"
                      data-testid={`card-low-stock-${product.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Package className="w-3.5 h-3.5 text-destructive shrink-0" />
                        <span className="text-xs font-medium truncate">{product.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-bold text-destructive">({product.quantity})</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setLocation("/inventory")}
                          data-testid={`button-edit-stock-${product.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}
