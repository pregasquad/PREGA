import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DollarSign, Users, CalendarIcon, TrendingUp, Building2, RefreshCw, Plus, Trash2, Receipt, UserMinus, ChevronDown, CheckCircle, Pencil, Wallet, Briefcase, BarChart3 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { io, Socket } from "socket.io-client";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, parseISO, isAfter, isBefore, isEqual, subDays, startOfToday } from "date-fns";
import { ar, enUS, fr } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import { useBusinessSettings } from "@/hooks/use-salon-data";
import { connectQz, openCashDrawer, isQzConnected, checkPrintStationAsync, remoteOpenDrawer } from "@/lib/qzPrint";
import type { Staff, Service, Appointment, Charge, StaffDeduction, StaffPayment } from "@shared/schema";

type PeriodType = "day" | "week" | "month" | "custom";

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

export default function Salaries() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: bSettings } = useBusinessSettings();
  const workDayToday = getWorkDayDate(bSettings?.openingTime, bSettings?.closingTime);
  const [selectedDate, setSelectedDate] = useState<Date>(workDayToday);
  const [period, setPeriod] = useState<PeriodType>("day");
  const [customStartDate, setCustomStartDate] = useState<Date>(workDayToday);
  const [customEndDate, setCustomEndDate] = useState<Date>(workDayToday);
  const [selectedStaff, setSelectedStaff] = useState<string>("all");
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [showChargeDialog, setShowChargeDialog] = useState(false);
  const [showDeductionDialog, setShowDeductionDialog] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [deductionsOpen, setDeductionsOpen] = useState(false);
  const [unclearedOpen, setUnclearedOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<Charge | null>(null);
  const [editingDeduction, setEditingDeduction] = useState<StaffDeduction | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newCharge, setNewCharge] = useState({ type: "rent", name: "", amount: 0, date: format(workDayToday, "yyyy-MM-dd") });
  const [newDeduction, setNewDeduction] = useState<{ staffName: string; type: "advance" | "loan" | "penalty" | "other"; description: string; amount: number; date: string }>({ staffName: "", type: "advance", description: "", amount: 0, date: format(workDayToday, "yyyy-MM-dd") });

  const getDateLocale = () => {
    switch (i18n.language) {
      case "ar": return ar;
      case "fr": return fr;
      default: return enUS;
    }
  };

  useEffect(() => {
    if (bSettings) {
      const wd = getWorkDayDate(bSettings.openingTime, bSettings.closingTime);
      setSelectedDate(wd);
      setCustomStartDate(wd);
      setCustomEndDate(wd);
    }
  }, [bSettings?.openingTime, bSettings?.closingTime]);

  useEffect(() => {
    const socket: Socket = io();

    socket.on("booking:created", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      setLastUpdate(new Date());
    });

    socket.on("appointment:updated", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      setLastUpdate(new Date());
    });

    socket.on("appointment:paid", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      setLastUpdate(new Date());
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const onPageShow = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-deductions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-commissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/business-settings"] });
      setRefreshKey(k => k + 1);
    };
    onPageShow();
    window.addEventListener("focus", onPageShow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onPageShow();
    });
    return () => {
      window.removeEventListener("focus", onPageShow);
    };
  }, [queryClient]);

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff", refreshKey],
    queryFn: async () => { const res = await fetch("/api/staff"); if (!res.ok) return []; return res.json(); },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services", refreshKey],
    queryFn: async () => { const res = await fetch("/api/services"); if (!res.ok) return []; return res.json(); },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: appointments = [], refetch: refetchAppointments } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments/all", refreshKey],
    queryFn: async () => {
      const res = await fetch("/api/appointments/all");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });

  const { data: charges = [] } = useQuery<Charge[]>({
    queryKey: ["/api/charges", refreshKey],
    queryFn: async () => { const res = await fetch("/api/charges"); if (!res.ok) return []; return res.json(); },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: deductions = [] } = useQuery<StaffDeduction[]>({
    queryKey: ["/api/staff-deductions", refreshKey],
    queryFn: async () => { const res = await fetch("/api/staff-deductions"); if (!res.ok) return []; return res.json(); },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: staffCommissions = [] } = useQuery<{ id: number; staffId: number; serviceId: number; percentage: number }[]>({
    queryKey: ["/api/staff-commissions", refreshKey],
    queryFn: async () => { const res = await fetch("/api/staff-commissions"); if (!res.ok) return []; return res.json(); },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: staffPayments = [] } = useQuery<StaffPayment[]>({
    queryKey: ["/api/staff-payments", refreshKey],
    queryFn: async () => { const res = await fetch("/api/staff-payments"); if (!res.ok) return []; return res.json(); },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createChargeMutation = useMutation({
    mutationFn: async (charge: typeof newCharge) => {
      const res = await apiRequest("POST", "/api/charges", charge);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
      setShowChargeDialog(false);
      setNewCharge({ type: "rent", name: "", amount: 0, date: format(getWorkDayDate(bSettings?.openingTime, bSettings?.closingTime), "yyyy-MM-dd") });
    },
  });

  const deleteChargeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/charges/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
    },
  });

  const createDeductionMutation = useMutation({
    mutationFn: async (deduction: typeof newDeduction) => {
      const res = await apiRequest("POST", "/api/staff-deductions", deduction);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-deductions"] });
      setShowDeductionDialog(false);
      setNewDeduction({ staffName: "", type: "advance", description: "", amount: 0, date: format(getWorkDayDate(bSettings?.openingTime, bSettings?.closingTime), "yyyy-MM-dd") });
    },
  });

  const deleteDeductionMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/staff-deductions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-deductions"] });
    },
  });

  const clearDeductionMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/staff-deductions/${id}/clear`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-deductions"] });
      toast({ title: t("salaries.cleared") });
    },
  });

  const updateChargeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PATCH", `/api/charges/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
      setEditingCharge(null);
      toast({ title: t("common.save") });
    },
  });

  const updateDeductionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PATCH", `/api/staff-deductions/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-deductions"] });
      setEditingDeduction(null);
      toast({ title: t("common.save") });
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (payment: { staffId: number; staffName: string; amount: number }) => {
      const res = await apiRequest("POST", "/api/staff-payments", payment);
      return res.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-payments"] });
      toast({ title: t("salaries.paymentRecorded") });
      try {
        await connectQz();
        if (isQzConnected()) {
          await openCashDrawer();
          return;
        }
      } catch {}
      const available = await checkPrintStationAsync();
      if (available) {
        await remoteOpenDrawer();
      }
    },
  });

  const unclearedDeductions = deductions.filter(d => !d.cleared);
  const totalUnclearedByStaff = unclearedDeductions.reduce((acc, d) => {
    acc[d.staffName] = (acc[d.staffName] || 0) + d.amount;
    return acc;
  }, {} as Record<string, number>);
  const totalUncleared = unclearedDeductions.reduce((sum, d) => sum + d.amount, 0);

  const getDateRange = () => {
    switch (period) {
      case "day":
        return { start: selectedDate, end: selectedDate };
      case "week":
        return { start: startOfWeek(selectedDate, { weekStartsOn: 0 }), end: endOfWeek(selectedDate, { weekStartsOn: 0 }) };
      case "month":
        return { start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) };
      case "custom":
        return { start: customStartDate, end: customEndDate };
      default:
        return { start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) };
    }
  };

  const { start, end } = getDateRange();

  const filteredAppointments = appointments.filter((apt) => {
    const aptDate = startOfDay(parseISO(apt.date));
    const rangeStart = startOfDay(start);
    const rangeEnd = endOfDay(end);
    const inRange = (isAfter(aptDate, rangeStart) || isEqual(aptDate, rangeStart)) && 
                    (isBefore(aptDate, rangeEnd) || isEqual(aptDate, rangeEnd));
    const selectedStaffId = selectedStaff !== "all" ? parseInt(selectedStaff) : null;
    const staffMatch = selectedStaff === "all" || (selectedStaffId && (apt.staffId === selectedStaffId || (!apt.staffId && apt.staff === staff.find(s => s.id === selectedStaffId)?.name)));
    return inRange && staffMatch && apt.paid === true;
  });

  const getServiceCommission = (serviceName: string, staffName?: string): number => {
    const service = services.find((s) => s.name === serviceName);
    if (!service) return 50;
    
    if (staffName) {
      const staffMember = staff.find(s => s.name === staffName);
      if (staffMember) {
        const customCommission = staffCommissions.find(
          c => c.staffId === staffMember.id && c.serviceId === service.id
        );
        if (customCommission) {
          return customCommission.percentage;
        }
      }
    }
    
    return service.commissionPercent ?? 50;
  };

  const calculateStaffEarnings = () => {
    const earnings: Record<string, { 
      name: string; 
      totalRevenue: number; 
      totalCommission: number; 
      appointmentsCount: number;
      services: Record<string, { count: number; revenue: number; commission: number }>;
    }> = {};

    const selectedStaffId = selectedStaff !== "all" ? parseInt(selectedStaff) : null;
    const staffToShow = selectedStaff === "all" 
      ? staff 
      : staff.filter(s => s.id === selectedStaffId);

    staffToShow.forEach((s) => {
      earnings[s.name] = { 
        name: s.name, 
        totalRevenue: 0, 
        totalCommission: 0, 
        appointmentsCount: 0,
        services: {}
      };
    });

    filteredAppointments.forEach((apt) => {
      const staffName = apt.staff || "Unknown";
      const serviceName = apt.service || "Unknown";
      
      if (!earnings[staffName]) {
        earnings[staffName] = { 
          name: staffName, 
          totalRevenue: 0, 
          totalCommission: 0, 
          appointmentsCount: 0,
          services: {}
        };
      }
      
      const commissionPercent = getServiceCommission(serviceName, staffName);
      const commission = (apt.total * commissionPercent) / 100;
      
      earnings[staffName].totalRevenue += apt.total;
      earnings[staffName].totalCommission += commission;
      earnings[staffName].appointmentsCount += 1;

      if (!earnings[staffName].services[serviceName]) {
        earnings[staffName].services[serviceName] = { count: 0, revenue: 0, commission: 0 };
      }
      earnings[staffName].services[serviceName].count += 1;
      earnings[staffName].services[serviceName].revenue += apt.total;
      earnings[staffName].services[serviceName].commission += commission;
    });

    if (selectedStaff === "all") {
      return Object.values(earnings).filter(e => e.appointmentsCount > 0 || staff.some(s => s.name === e.name));
    } else {
      const selStaff = staff.find(s => s.id === parseInt(selectedStaff));
      return Object.values(earnings).filter(e => e.name === selStaff?.name);
    }
  };

  const staffEarnings = calculateStaffEarnings();
  const totalRevenue = staffEarnings.reduce((sum, e) => sum + e.totalRevenue, 0);
  const totalCommissions = staffEarnings.reduce((sum, e) => sum + e.totalCommission, 0);
  const totalAppointments = staffEarnings.reduce((sum, e) => sum + e.appointmentsCount, 0);
  const salonPortion = totalRevenue - totalCommissions;

  const filteredCharges = charges.filter(c => {
    const chargeDate = startOfDay(parseISO(c.date));
    return (isAfter(chargeDate, startOfDay(start)) || isEqual(chargeDate, startOfDay(start))) &&
           (isBefore(chargeDate, endOfDay(end)) || isEqual(chargeDate, endOfDay(end)));
  });

  const filteredDeductions = deductions.filter(d => {
    const deductionDate = startOfDay(parseISO(d.date));
    const deductionStaffId = selectedStaff !== "all" ? parseInt(selectedStaff) : null;
    const staffMatch = selectedStaff === "all" || (deductionStaffId && (d.staffId === deductionStaffId || (!d.staffId && d.staffName === staff.find(s => s.id === deductionStaffId)?.name)));
    if (!staffMatch) return false;

    if (d.cleared && d.clearedAt) {
      const clearedDate = startOfDay(new Date(d.clearedAt));
      return (isAfter(clearedDate, startOfDay(start)) || isEqual(clearedDate, startOfDay(start))) &&
             (isBefore(clearedDate, endOfDay(end)) || isEqual(clearedDate, endOfDay(end)));
    }

    return (isAfter(deductionDate, startOfDay(start)) || isEqual(deductionDate, startOfDay(start))) &&
           (isBefore(deductionDate, endOfDay(end)) || isEqual(deductionDate, endOfDay(end)));
  });

  const paidBackDeductions = filteredDeductions.filter(d => d.cleared);
  const pendingDeductions = filteredDeductions.filter(d => !d.cleared);
  const totalPaidBack = paidBackDeductions.reduce((sum, d) => sum + d.amount, 0);
  const totalPending = pendingDeductions.reduce((sum, d) => sum + d.amount, 0);
  const totalExpenses = filteredCharges.reduce((sum, c) => sum + c.amount, 0);
  const netProfit = salonPortion - totalExpenses;
  const netStaffPayable = staff.reduce((total, s) => {
    const earning = staffEarnings.find(e => e.name === s.name);
    const staffCommission = earning ? earning.totalCommission : 0;
    const staffDeductionAmount = pendingDeductions
      .filter(d => d.staffId === s.id || (!d.staffId && d.staffName === s.name))
      .reduce((sum, d) => sum + d.amount, 0);
    return total + Math.max(0, staffCommission - staffDeductionAmount);
  }, 0);

  const getChargeTypeLabel = (type: string) => {
    switch (type) {
      case "rent": return t("salaries.rent");
      case "utilities": return t("salaries.utilities");
      case "products": return t("salaries.products");
      case "equipment": return t("salaries.equipment");
      case "maintenance": return t("salaries.maintenance");
      case "other": return t("salaries.other");
      default: return type;
    }
  };

  const getDeductionTypeLabel = (type: string) => {
    switch (type) {
      case "advance": return t("salaries.advance");
      case "loan": return t("salaries.loan");
      case "penalty": return t("salaries.penalty");
      case "other": return t("salaries.other");
      default: return type;
    }
  };

  const getStaffWalletData = (s: Staff) => {
    const lastPayment = staffPayments
      .filter(p => p.staffId === s.id)
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())[0];
    const lastPaymentDate = lastPayment ? new Date(lastPayment.paidAt) : null;

    const earningsSincePayment = appointments
      .filter(apt => {
        if (!apt.paid) return false;
        const matchesStaff = apt.staffId === s.id || (!apt.staffId && apt.staff === s.name);
        if (!matchesStaff) return false;
        if (lastPaymentDate) {
          const aptCreated = apt.createdAt ? new Date(apt.createdAt) : parseISO(apt.date);
          return isAfter(aptCreated, lastPaymentDate);
        }
        return true;
      })
      .reduce((sum, apt) => {
        const serviceName = apt.service || "Unknown";
        const commissionPercent = getServiceCommission(serviceName, s.name);
        return sum + (apt.total * commissionPercent) / 100;
      }, 0);

    const pendingStaffDeductions = deductions
      .filter(d => !d.cleared && (d.staffId === s.id || (!d.staffId && d.staffName === s.name)))
      .reduce((sum, d) => sum + d.amount, 0);

    const walletBalance = earningsSincePayment - pendingStaffDeductions;

    return { lastPaymentDate, earningsSincePayment, walletBalance };
  };

  return (
    <div className="h-full flex flex-col gap-3 p-2 animate-fade-in" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-bold" data-testid="text-page-title">{t("salaries.pageTitle")}</h1>
        <Button
          variant="outline"
          size="icon"
          disabled={isRefreshing}
          onClick={async () => {
            setIsRefreshing(true);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] }),
              queryClient.invalidateQueries({ queryKey: ["/api/staff"] }),
              queryClient.invalidateQueries({ queryKey: ["/api/services"] }),
              queryClient.invalidateQueries({ queryKey: ["/api/charges"] }),
              queryClient.invalidateQueries({ queryKey: ["/api/staff-deductions"] }),
              queryClient.invalidateQueries({ queryKey: ["/api/staff-commissions"] }),
              queryClient.invalidateQueries({ queryKey: ["/api/staff-payments"] }),
            ]);
            setLastUpdate(new Date());
            setIsRefreshing(false);
            toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
          }}
          data-testid="button-refresh-salaries"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {unclearedDeductions.length > 0 && (
        <Collapsible open={unclearedOpen} onOpenChange={setUnclearedOpen}>
          <Card className="glass-card border-orange-300/50 dark:border-orange-700/50">
            <CollapsibleTrigger asChild>
              <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2 cursor-pointer" data-testid="button-toggle-uncleared">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4 text-orange-500" />
                  <span className="text-orange-700 dark:text-orange-400">{t("salaries.unclearedDeductions")}</span>
                  <span className="text-sm font-normal text-orange-600/70">({unclearedDeductions.length})</span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-orange-600 font-bold text-sm" data-testid="text-uncleared-total">{formatCurrency(totalUncleared)} DH</span>
                  <ChevronDown className={`h-4 w-4 text-orange-500 transition-transform ${unclearedOpen ? "rotate-180" : ""}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="px-3 pb-3 pt-0 space-y-2">
                <p className="text-xs text-orange-600/70 dark:text-orange-400/70 mb-2">{t("salaries.unclearedDeductionsDesc")}</p>
                {unclearedDeductions.map((d) => (
                  <div key={d.id} className="p-3 rounded-lg glass-subtle flex items-center justify-between gap-2" data-testid={`uncleared-item-${d.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{d.staffName}</span>
                        <span className="liquid-glass-chip text-xs">{getDeductionTypeLabel(d.type)}</span>
                      </div>
                      {d.description && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{d.description}</div>
                      )}
                      <div className="flex items-center gap-2 text-sm mt-1">
                        <span className="text-orange-600 font-semibold tabular-nums">{formatCurrency(d.amount)} DH</span>
                        <span className="text-muted-foreground text-xs">{format(parseISO(d.date), "d/M/yy")}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={clearDeductionMutation.isPending}
                      onClick={() => clearDeductionMutation.mutate(d.id)}
                      data-testid={`button-clear-uncleared-${d.id}`}
                    >
                      <CheckCircle className="h-3 w-3 me-1" />
                      {t("salaries.markAsCleared")}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      <div className="flex gap-2 flex-wrap">
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
          <SelectTrigger className="w-28 text-sm" data-testid="select-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">{t("salaries.day")}</SelectItem>
            <SelectItem value="week">{t("salaries.week")}</SelectItem>
            <SelectItem value="month">{t("salaries.month")}</SelectItem>
            <SelectItem value="custom">{t("salaries.custom")}</SelectItem>
          </SelectContent>
        </Select>

        {period !== "custom" ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-select-date">
                <CalendarIcon className="h-4 w-4 mr-2" />
                {format(selectedDate, "d/M/yy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        ) : (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-start-date">
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {format(customStartDate, "d/M/yy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={customStartDate}
                  onSelect={(date) => date && setCustomStartDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground self-center">&rarr;</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-end-date">
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {format(customEndDate, "d/M/yy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={customEndDate}
                  onSelect={(date) => date && setCustomEndDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </>
        )}

        <Select value={selectedStaff} onValueChange={setSelectedStaff}>
          <SelectTrigger className="w-28 text-sm" data-testid="select-staff-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("salaries.allStaff")}</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Stats - Glass Cards */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="glass-card" data-testid="stat-total-revenue">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                <DollarSign className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">{t("salaries.totalRevenue")}</p>
            </div>
            <p className="text-xl font-bold tabular-nums" data-testid="text-total-revenue">{formatCurrency(totalRevenue)} <span className="text-sm font-normal text-muted-foreground">DH</span></p>
          </CardContent>
        </Card>
        <Card className="glass-card" data-testid="stat-commissions">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-green-500/15 flex items-center justify-center">
                <Users className="h-3.5 w-3.5 text-green-600" />
              </div>
              <p className="text-xs text-muted-foreground">{t("salaries.staffCommissions")}</p>
            </div>
            <p className="text-xl font-bold tabular-nums" data-testid="text-total-commissions">{formatCurrency(totalCommissions - totalPending)} <span className="text-sm font-normal text-muted-foreground">DH</span></p>
          </CardContent>
        </Card>
        <Card className="glass-card" data-testid="stat-salon-share">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                <Building2 className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">{t("salaries.salonShare")}</p>
            </div>
            <p className="text-xl font-bold tabular-nums" data-testid="text-salon-share">{formatCurrency(salonPortion)} <span className="text-sm font-normal text-muted-foreground">DH</span></p>
          </CardContent>
        </Card>
        <Card className="glass-card" data-testid="stat-appointments">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-pink-500/15 flex items-center justify-center">
                <CalendarIcon className="h-3.5 w-3.5 text-pink-600" />
              </div>
              <p className="text-xs text-muted-foreground">{t("salaries.appointmentsCount")}</p>
            </div>
            <p className="text-xl font-bold tabular-nums" data-testid="text-total-appointments">{totalAppointments}</p>
          </CardContent>
        </Card>
      </div>

      {/* Salon Budget - Glass Card */}
      <Card className="glass-card" data-testid="card-salon-budget">
        <CardHeader className="p-4 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-primary" />
            </div>
            {t("salaries.budget")}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-4">
          {/* Salon Account Section */}
          <div className="p-4 rounded-xl bg-primary/5 dark:bg-primary/10">
            <p className="text-sm font-bold flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-primary" />
              {t("salaries.salonAccount")}
            </p>
            <div className="space-y-2">
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-muted-foreground">{t("salaries.salonRevenueShare")}</span>
                <span className="font-semibold tabular-nums" data-testid="text-salon-revenue-share">{formatCurrency(salonPortion)} DH</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-muted-foreground">{t("salaries.totalExpenses")}</span>
                <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">- {formatCurrency(totalExpenses)} DH</span>
              </div>
              <div className="border-t border-border/50 my-1" />
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-bold">{t("salaries.salonNetProfit")}</span>
                <span className={`text-base font-bold tabular-nums ${netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-net-profit">
                  {netProfit >= 0 ? '' : '- '}{formatCurrency(Math.abs(netProfit))} DH
                </span>
              </div>
            </div>
            {totalPending > 0 && (
              <div className="flex justify-between items-baseline text-xs text-orange-600 dark:text-orange-400 border-t border-border/30 pt-2 mt-2">
                <span>{t("salaries.pendingDeductions")}</span>
                <span className="tabular-nums">{formatCurrency(totalPending)} DH</span>
              </div>
            )}
          </div>

          {/* Staff Account Section */}
          <div className="p-4 rounded-xl bg-green-50/80 dark:bg-green-950/20">
            <p className="text-sm font-bold flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-green-600" />
              {t("salaries.staffAccount")}
            </p>
            <div className="space-y-1.5">
              {staff.map((s) => {
                const earning = staffEarnings.find(e => e.name === s.name);
                const staffCommission = earning ? earning.totalCommission : 0;
                const staffDeductionAmount = pendingDeductions
                  .filter(d => d.staffId === s.id || (!d.staffId && d.staffName === s.name))
                  .reduce((sum, d) => sum + d.amount, 0);
                const staffNet = staffCommission - staffDeductionAmount;
                if (staffCommission === 0 && staffDeductionAmount === 0) return null;
                return (
                  <div key={s.id} className="flex justify-between items-center text-sm py-1 border-b border-border/20 last:border-0" data-testid={`text-staff-budget-${s.id}`}>
                    <span className="font-medium">{s.name}</span>
                    <div className="flex items-center gap-3 tabular-nums">
                      <span className="text-muted-foreground min-w-[55px] text-end">{formatCurrency(staffCommission)}</span>
                      {staffDeductionAmount > 0 && (
                        <span className="text-red-600 dark:text-red-400 min-w-[55px] text-end">- {formatCurrency(staffDeductionAmount)}</span>
                      )}
                      <span className={`font-bold min-w-[60px] text-end ${staffNet < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>= {formatCurrency(Math.abs(staffNet))}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-green-200/50 dark:border-green-800/30 mt-2 pt-2">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-bold">{t("salaries.netDueToStaff")}</span>
                <span className={`text-base font-bold tabular-nums ${netStaffPayable >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-net-due-staff">
                  {formatCurrency(netStaffPayable)} DH
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual Staff Cards */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold flex items-center gap-2" data-testid="text-staff-earnings-header">
          <BarChart3 className="h-4 w-4 text-primary" />
          {t("salaries.staffEarningsDetails")}
        </h2>
        
        {(selectedStaff === "all" ? staff : staff.filter(s => s.id === parseInt(selectedStaff))).map((s) => {
          const earning = staffEarnings.find(e => e.name === s.name);
          const wallet = getStaffWalletData(s);
          const staffAllDeductions = filteredDeductions
            .filter(d => d.staffId === s.id || (!d.staffId && d.staffName === s.name));
          const staffDeductionAmount = staffAllDeductions.reduce((sum, d) => sum + d.amount, 0);

          return (
            <Card key={s.id} className="glass-card" data-testid={`staff-card-${s.id}`}>
              <CardContent className="p-0">
                {/* Staff Header with Photo */}
                <div className="p-4 pb-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border-2 border-primary/20" data-testid={`img-avatar-${s.id}`}>
                      <AvatarImage src={s.photoUrl || undefined} alt={s.name} />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                        {s.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base" data-testid={`text-staff-name-${s.id}`}>{s.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span data-testid={`text-staff-appointments-${s.id}`}>{earning?.appointmentsCount || 0} {t("salaries.appointmentsCount").toLowerCase()}</span>
                        {wallet.lastPaymentDate && (
                          <>
                            <span>-</span>
                            <span data-testid={`text-staff-last-paid-${s.id}`}>{t("salaries.lastPaid")}: {format(wallet.lastPaymentDate, "d/M/yy")}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {wallet.walletBalance > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={createPaymentMutation.isPending}
                        onClick={() => createPaymentMutation.mutate({
                          staffId: s.id,
                          staffName: s.name,
                          amount: Math.max(0, wallet.walletBalance),
                        })}
                        data-testid={`button-pay-staff-${s.id}`}
                      >
                        <CheckCircle className="h-3 w-3 me-1" />
                        {t("salaries.markAsPaid")}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Earnings Row */}
                <div className="px-4 pb-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg bg-muted/40 dark:bg-muted/20" data-testid={`text-staff-revenue-${s.id}`}>
                      <p className="text-[10px] text-muted-foreground mb-1">{t("salaries.totalRevenue")}</p>
                      <p className="text-sm font-bold tabular-nums">{formatCurrency(earning?.totalRevenue || 0)}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-green-50/80 dark:bg-green-950/20" data-testid={`text-staff-commission-${s.id}`}>
                      <p className="text-[10px] text-muted-foreground mb-1">{t("salaries.staffCommissions")}</p>
                      <p className="text-sm font-bold tabular-nums">{formatCurrency((earning?.totalCommission || 0) - staffDeductionAmount)}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-primary/5 dark:bg-primary/10" data-testid={`text-staff-wallet-${s.id}`}>
                      <p className="text-[10px] text-muted-foreground mb-1">{t("salaries.walletBalance").split(':')[0] || "Wallet"}</p>
                      <p className={`text-sm font-bold tabular-nums ${wallet.walletBalance < 0 ? 'text-red-600 dark:text-red-400' : wallet.walletBalance > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                        {wallet.walletBalance < 0 ? `- ${formatCurrency(Math.abs(wallet.walletBalance))}` : formatCurrency(wallet.walletBalance)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Deductions */}
                {staffAllDeductions.length > 0 && (
                  <div className="px-4 pb-3">
                    <div className="p-3 rounded-lg bg-orange-50/80 dark:bg-orange-950/20" data-testid={`text-staff-deductions-${s.id}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-orange-700 dark:text-orange-400">{t("staffPortal.allDeductions")}</span>
                        {staffDeductionAmount > 0 && (
                          <span className="text-xs font-bold tabular-nums text-red-600 dark:text-red-400">- {formatCurrency(staffDeductionAmount)} DH</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {staffAllDeductions.map((d) => (
                          <div key={d.id} className="flex items-center justify-between gap-2 py-1 border-t border-orange-200/30 dark:border-orange-800/20 first:border-0" data-testid={`text-staff-deduction-item-${d.id}`}>
                            <div className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-medium">{getDeductionTypeLabel(d.type)}</span>
                              {d.description && (
                                <span className="text-[10px] text-muted-foreground">- {d.description}</span>
                              )}
                              {d.cleared && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
                                  {t("salaries.paidBack")}
                                </span>
                              )}
                            </div>
                            <span className={`text-xs font-medium shrink-0 tabular-nums ${d.cleared ? 'text-muted-foreground line-through' : 'text-red-600 dark:text-red-400'}`}>
                              - {formatCurrency(d.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Service Breakdown */}
                {earning && Object.keys(earning.services).length > 0 && (
                  <div className="px-4 pb-4">
                    <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">{t("reports.serviceDetailsLabel")}</p>
                    <div className="space-y-0">
                      {Object.entries(earning.services).map(([serviceName, data]) => (
                        <div key={serviceName} className="flex items-center justify-between py-1.5 border-t border-border/20 first:border-0" data-testid={`text-service-${s.id}-${serviceName}`}>
                          <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                            <span className="text-sm truncate">{serviceName}</span>
                            <span className="liquid-glass-chip text-[10px] shrink-0">x{data.count}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 tabular-nums">
                            <span className="text-xs text-muted-foreground min-w-[45px] text-end">{formatCurrency(data.revenue)}</span>
                            <span className="text-sm font-semibold min-w-[50px] text-end">{formatCurrency(data.commission)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {(!earning || earning.appointmentsCount === 0) && (
                  <div className="px-4 pb-4">
                    <p className="text-center text-xs text-muted-foreground py-2">{t("salaries.noDataForPeriod")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {staff.length === 0 && (
          <Card className="glass-card">
            <CardContent className="p-6">
              <p className="text-center text-muted-foreground text-sm">{t("salaries.noEarnings")}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Expenses Section */}
      <Collapsible open={expensesOpen} onOpenChange={setExpensesOpen}>
        <Card className="glass-card">
          <CollapsibleTrigger asChild>
            <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2 cursor-pointer" data-testid="button-toggle-expenses">
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4 text-red-500" />
                {t("salaries.expensesAndCosts")}
                <span className="text-sm font-normal text-muted-foreground">({filteredCharges.length})</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Dialog open={showChargeDialog} onOpenChange={setShowChargeDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={(e) => e.stopPropagation()} data-testid="button-add-expense">
                      <Plus className="h-4 w-4 mr-1" />
                      +
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("salaries.addNewExpense")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>{t("salaries.expenseType")}</Label>
                        <Select value={newCharge.type} onValueChange={(v) => setNewCharge({ ...newCharge, type: v })}>
                          <SelectTrigger data-testid="select-expense-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rent">{t("salaries.rent")}</SelectItem>
                            <SelectItem value="utilities">{t("salaries.utilities")}</SelectItem>
                            <SelectItem value="products">{t("salaries.products")}</SelectItem>
                            <SelectItem value="equipment">{t("salaries.equipment")}</SelectItem>
                            <SelectItem value="maintenance">{t("salaries.maintenance")}</SelectItem>
                            <SelectItem value="other">{t("salaries.other")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t("common.description")}</Label>
                        <Input
                          value={newCharge.name}
                          onChange={(e) => setNewCharge({ ...newCharge, name: e.target.value })}
                          placeholder={t("salaries.expenseDescription")}
                          data-testid="input-expense-name"
                        />
                      </div>
                      <div>
                        <Label>{t("salaries.amountDH")}</Label>
                        <Input
                          type="number"
                          value={newCharge.amount || ""}
                          onChange={(e) => setNewCharge({ ...newCharge, amount: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                          data-testid="input-expense-amount"
                        />
                      </div>
                      <div>
                        <Label>{t("common.date")}</Label>
                        <Input
                          type="date"
                          value={newCharge.date}
                          onChange={(e) => setNewCharge({ ...newCharge, date: e.target.value })}
                          data-testid="input-expense-date"
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => createChargeMutation.mutate(newCharge)}
                        disabled={!newCharge.name || !newCharge.amount || createChargeMutation.isPending}
                        data-testid="button-save-expense"
                      >
                        {t("common.save")}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <ChevronDown className={`h-4 w-4 transition-transform ${expensesOpen ? "rotate-180" : ""}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="px-3 pb-3 pt-0 space-y-2">
              {filteredCharges.map((charge) => (
                <div key={charge.id} className="p-3 rounded-lg glass-subtle flex justify-between items-center" data-testid={`expense-item-${charge.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{charge.name}</span>
                      <span className="liquid-glass-chip text-xs">{getChargeTypeLabel(charge.type)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm mt-1">
                      <span className="text-red-600 dark:text-red-400 font-semibold tabular-nums">{formatCurrency(charge.amount)} DH</span>
                      <span className="text-muted-foreground text-xs">{format(parseISO(charge.date), "d/M/yy")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => setEditingCharge(charge)} data-testid={`button-edit-expense-${charge.id}`}>
                      <Pencil className="h-4 w-4 text-pink-600" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteChargeMutation.mutate(charge.id)} data-testid={`button-delete-expense-${charge.id}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {filteredCharges.length === 0 && (
                <p className="text-center text-muted-foreground py-4 text-sm">
                  {t("salaries.noExpensesForPeriod")}
                </p>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Deductions Section */}
      <Collapsible open={deductionsOpen} onOpenChange={setDeductionsOpen}>
        <Card className="glass-card">
          <CollapsibleTrigger asChild>
            <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2 cursor-pointer" data-testid="button-toggle-deductions">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserMinus className="h-4 w-4 text-sky-500" />
                {t("salaries.staffDeductions")}
                <span className="text-sm font-normal text-muted-foreground">({filteredDeductions.length})</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Dialog open={showDeductionDialog} onOpenChange={setShowDeductionDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={(e) => e.stopPropagation()} data-testid="button-add-deduction">
                      <Plus className="h-4 w-4 mr-1" />
                      +
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("salaries.addStaffDeduction")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>{t("salaries.staff")}</Label>
                        <Select value={newDeduction.staffName} onValueChange={(v) => setNewDeduction({ ...newDeduction, staffName: v })}>
                          <SelectTrigger data-testid="select-deduction-staff">
                            <SelectValue placeholder={t("salaries.selectStaff")} />
                          </SelectTrigger>
                          <SelectContent>
                            {staff.map((s) => (
                              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t("salaries.deductionType")}</Label>
                        <Select value={newDeduction.type} onValueChange={(v) => setNewDeduction({ ...newDeduction, type: v as "advance" | "loan" | "penalty" | "other" })}>
                          <SelectTrigger data-testid="select-deduction-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="advance">{t("salaries.advance")}</SelectItem>
                            <SelectItem value="loan">{t("salaries.loan")}</SelectItem>
                            <SelectItem value="penalty">{t("salaries.penalty")}</SelectItem>
                            <SelectItem value="other">{t("salaries.other")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t("common.description")}</Label>
                        <Input
                          value={newDeduction.description}
                          onChange={(e) => setNewDeduction({ ...newDeduction, description: e.target.value })}
                          placeholder={t("salaries.deductionDescription")}
                          data-testid="input-deduction-description"
                        />
                      </div>
                      <div>
                        <Label>{t("salaries.amountDH")}</Label>
                        <Input
                          type="number"
                          value={newDeduction.amount || ""}
                          onChange={(e) => setNewDeduction({ ...newDeduction, amount: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                          data-testid="input-deduction-amount"
                        />
                      </div>
                      <div>
                        <Label>{t("common.date")}</Label>
                        <Input
                          type="date"
                          value={newDeduction.date}
                          onChange={(e) => setNewDeduction({ ...newDeduction, date: e.target.value })}
                          data-testid="input-deduction-date"
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => createDeductionMutation.mutate(newDeduction)}
                        disabled={!newDeduction.staffName || !newDeduction.description || !newDeduction.amount || createDeductionMutation.isPending}
                        data-testid="button-save-deduction"
                      >
                        {t("common.save")}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <ChevronDown className={`h-4 w-4 transition-transform ${deductionsOpen ? "rotate-180" : ""}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="px-3 pb-3 pt-0 space-y-2">
              {filteredDeductions.map((deduction) => (
                <div key={deduction.id} className="p-3 rounded-lg glass-subtle flex justify-between items-center" data-testid={`deduction-item-${deduction.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{deduction.staffName}</span>
                      <span className="liquid-glass-chip text-xs">{getDeductionTypeLabel(deduction.type)}</span>
                      {deduction.cleared ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">{t("salaries.paidBack")}</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400">{t("salaries.pending")}</span>
                      )}
                    </div>
                    {deduction.description && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{deduction.description}</div>
                    )}
                    <div className="flex items-center gap-2 text-sm mt-1">
                      <span className={`font-semibold tabular-nums ${deduction.cleared ? 'text-muted-foreground line-through' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(deduction.amount)} DH</span>
                      <span className="text-muted-foreground text-xs">{format(parseISO(deduction.date), "d/M/yy")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!deduction.cleared && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={clearDeductionMutation.isPending}
                        onClick={() => clearDeductionMutation.mutate(deduction.id)}
                        data-testid={`button-paidback-${deduction.id}`}
                      >
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => setEditingDeduction(deduction)} data-testid={`button-edit-deduction-${deduction.id}`}>
                      <Pencil className="h-4 w-4 text-pink-600" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteDeductionMutation.mutate(deduction.id)} data-testid={`button-delete-deduction-${deduction.id}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {filteredDeductions.length === 0 && (
                <p className="text-center text-muted-foreground py-4 text-sm">
                  {t("salaries.noDeductionsForPeriod")}
                </p>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Edit Expense Dialog */}
      <Dialog open={!!editingCharge} onOpenChange={(open) => !open && setEditingCharge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.edit")} - {t("salaries.expensesAndCosts")}</DialogTitle>
          </DialogHeader>
          {editingCharge && (
            <div className="space-y-4">
              <div>
                <Label>{t("salaries.expenseType")}</Label>
                <Select value={editingCharge.type} onValueChange={(v) => setEditingCharge({ ...editingCharge, type: v })}>
                  <SelectTrigger data-testid="select-edit-expense-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rent">{t("salaries.rent")}</SelectItem>
                    <SelectItem value="utilities">{t("salaries.utilities")}</SelectItem>
                    <SelectItem value="products">{t("salaries.products")}</SelectItem>
                    <SelectItem value="equipment">{t("salaries.equipment")}</SelectItem>
                    <SelectItem value="maintenance">{t("salaries.maintenance")}</SelectItem>
                    <SelectItem value="other">{t("salaries.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("common.description")}</Label>
                <Input
                  value={editingCharge.name}
                  onChange={(e) => setEditingCharge({ ...editingCharge, name: e.target.value })}
                  data-testid="input-edit-expense-name"
                />
              </div>
              <div>
                <Label>{t("salaries.amountDH")}</Label>
                <Input
                  type="number"
                  value={editingCharge.amount || ""}
                  onChange={(e) => setEditingCharge({ ...editingCharge, amount: parseFloat(e.target.value) || 0 })}
                  data-testid="input-edit-expense-amount"
                />
              </div>
              <div>
                <Label>{t("common.date")}</Label>
                <Input
                  type="date"
                  value={editingCharge.date}
                  onChange={(e) => setEditingCharge({ ...editingCharge, date: e.target.value })}
                  data-testid="input-edit-expense-date"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => updateChargeMutation.mutate({ id: editingCharge.id, data: { type: editingCharge.type, name: editingCharge.name, amount: editingCharge.amount, date: editingCharge.date } })}
                disabled={!editingCharge.name || !editingCharge.amount || updateChargeMutation.isPending}
                data-testid="button-update-expense"
              >
                {t("common.save")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Deduction Dialog */}
      <Dialog open={!!editingDeduction} onOpenChange={(open) => !open && setEditingDeduction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.edit")} - {t("salaries.staffDeductions")}</DialogTitle>
          </DialogHeader>
          {editingDeduction && (
            <div className="space-y-4">
              <div>
                <Label>{t("salaries.staff")}</Label>
                <Select value={editingDeduction.staffName} onValueChange={(v) => setEditingDeduction({ ...editingDeduction, staffName: v })}>
                  <SelectTrigger data-testid="select-edit-deduction-staff">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("salaries.deductionType")}</Label>
                <Select value={editingDeduction.type} onValueChange={(v) => setEditingDeduction({ ...editingDeduction, type: v })}>
                  <SelectTrigger data-testid="select-edit-deduction-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="advance">{t("salaries.advance")}</SelectItem>
                    <SelectItem value="loan">{t("salaries.loan")}</SelectItem>
                    <SelectItem value="penalty">{t("salaries.penalty")}</SelectItem>
                    <SelectItem value="other">{t("salaries.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("common.description")}</Label>
                <Input
                  value={editingDeduction.description}
                  onChange={(e) => setEditingDeduction({ ...editingDeduction, description: e.target.value })}
                  data-testid="input-edit-deduction-description"
                />
              </div>
              <div>
                <Label>{t("salaries.amountDH")}</Label>
                <Input
                  type="number"
                  value={editingDeduction.amount || ""}
                  onChange={(e) => setEditingDeduction({ ...editingDeduction, amount: parseFloat(e.target.value) || 0 })}
                  data-testid="input-edit-deduction-amount"
                />
              </div>
              <div>
                <Label>{t("common.date")}</Label>
                <Input
                  type="date"
                  value={editingDeduction.date}
                  onChange={(e) => setEditingDeduction({ ...editingDeduction, date: e.target.value })}
                  data-testid="input-edit-deduction-date"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => updateDeductionMutation.mutate({ id: editingDeduction.id, data: { staffName: editingDeduction.staffName, type: editingDeduction.type, description: editingDeduction.description, amount: editingDeduction.amount, date: editingDeduction.date } })}
                disabled={!editingDeduction.staffName || !editingDeduction.description || !editingDeduction.amount || updateDeductionMutation.isPending}
                data-testid="button-update-deduction"
              >
                {t("common.save")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
