import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DollarSign, Users, CalendarIcon, TrendingUp, Building2, RefreshCw, Plus, Trash2, Receipt, UserMinus, ChevronDown, ChevronUp, CheckCircle, Pencil, Wallet, Briefcase, BarChart3, ArrowDownLeft, Store, Undo2, FileDown } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useTranslation } from "react-i18next";
import { getAppSocket } from "@/lib/appSocket";
import { getWorkDayDate } from "@/lib/workday";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, parseISO, isAfter, isBefore, isEqual, subDays } from "date-fns";
import { ar, enUS, fr } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import { useBusinessSettings } from "@/hooks/use-salon-data";
import { connectQz, openCashDrawer, isQzConnected, checkPrintStationAsync, remoteOpenDrawer } from "@/lib/qzPrint";
import type { Staff, Service, Appointment, Charge, StaffDeduction, StaffPayment, SalonPayment } from "@shared/schema";
import { saveSalariesCache } from "@/lib/offlineDb";
import { refreshSalariesBackground } from "@/lib/salariesRefresher";
import { calcAppointmentCommission } from "@/lib/commissionCalc";

type PeriodType = "day" | "week" | "month" | "custom";

// Check if current time is within business hours
function isWithinBusinessHours(openingTime?: string, closingTime?: string): boolean {
  if (!openingTime || !closingTime) return true;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = openingTime.split(":").map(Number);
  const [closeH, closeM] = closingTime.split(":").map(Number);
  const openingMinutes = openH * 60 + openM;
  const closingMinutes = closeH * 60 + closeM;
  // Handle overnight businesses (e.g. open 20:00 – 02:00)
  if (closingMinutes < openingMinutes) {
    return currentMinutes >= openingMinutes || currentMinutes < closingMinutes;
  }
  return currentMinutes >= openingMinutes && currentMinutes < closingMinutes;
}

// Convert a payment timestamp to its business-day date
// (if paid before opening time, it belongs to the previous business day)
function getBusinessDayDate(date: Date, openingTime?: string): Date {
  if (!openingTime) return startOfDay(date);
  const [openH, openM] = openingTime.split(":").map(Number);
  const openingMinutes = openH * 60 + openM;
  const dateMinutes = date.getHours() * 60 + date.getMinutes();
  if (dateMinutes < openingMinutes) {
    return subDays(startOfDay(date), 1);
  }
  return startOfDay(date);
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

  const [unclearedOpen, setUnclearedOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<Charge | null>(null);
  const [editingDeduction, setEditingDeduction] = useState<StaffDeduction | null>(null);
  const [payBackDeduction, setPayBackDeduction] = useState<StaffDeduction | null>(null);
  const [payBackInputAmount, setPayBackInputAmount] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [monthlyGoal, setMonthlyGoal] = useState<number>(() => Number(localStorage.getItem("monthly_revenue_goal") || 0));
  const [goalEditValue, setGoalEditValue] = useState("");
  const [showGoalEdit, setShowGoalEdit] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<{ staffId: number; staffName: string; amount: number } | null>(null);
  const [pendingSalonCollect, setPendingSalonCollect] = useState<number | null>(null);
  const [openPaymentHistories, setOpenPaymentHistories] = useState<Record<number, boolean>>({});
  const [openDeductions, setOpenDeductions] = useState<Record<number, boolean>>({});
  const [salonHistoryOpen, setSalonHistoryOpen] = useState(false);
  const [withdrawalsOpen, setWithdrawalsOpen] = useState(false);
  const [showAddWithdrawal, setShowAddWithdrawal] = useState(false);
  const [newWithdrawalAmount, setNewWithdrawalAmount] = useState("");
  const [newWithdrawalDate, setNewWithdrawalDate] = useState(() => format(workDayToday, "yyyy-MM-dd"));
  const [newWithdrawalNotes, setNewWithdrawalNotes] = useState("");
  const [newCharge, setNewCharge] = useState({ type: "rent", name: "", amount: 0, date: format(workDayToday, "yyyy-MM-dd") });
  const [newDeduction, setNewDeduction] = useState<{ staffName: string; type: "advance" | "loan" | "penalty" | "other"; description: string; amount: number; date: string }>({ staffName: "", type: "advance", description: "", amount: 0, date: format(workDayToday, "yyyy-MM-dd") });

  // ── Paid-back cash register (persisted in localStorage, cleared by Reset) ──
  type PaidBackEntry = { id: string; deductionId: number; staffName: string; type: string; description: string; amount: number; timestamp: string };
  const PAID_BACK_KEY = "salaries_paidback_history";
  const [paidBackHistory, setPaidBackHistory] = useState<PaidBackEntry[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(PAID_BACK_KEY) || "[]");
      return Array.isArray(raw)
        ? raw.filter((e: any) =>
            e &&
            typeof e.id === "string" &&
            typeof e.deductionId === "number" &&
            typeof e.staffName === "string" && e.staffName.length > 0 &&
            typeof e.type === "string" &&
            typeof e.description === "string" &&
            typeof e.amount === "number" && Number.isFinite(e.amount) &&
            typeof e.timestamp === "string" && !isNaN(Date.parse(e.timestamp))
          )
        : [];
    } catch { return []; }
  });
  const [paidBackOpen, setPaidBackOpen] = useState(false);
  const [paidBackOpenStaff, setPaidBackOpenStaff] = useState<Record<string, boolean>>({});
  const addPaidBackEntry = (entry: PaidBackEntry) => {
    setPaidBackHistory(prev => {
      const next = [...prev, entry];
      localStorage.setItem(PAID_BACK_KEY, JSON.stringify(next));
      return next;
    });
  };
  const resetPaidBackHistory = () => {
    setPaidBackHistory([]);
    localStorage.removeItem(PAID_BACK_KEY);
  };

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
    const socket = getAppSocket();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
        setLastUpdate(new Date());
      }, 1500);
    };
    socket.on("booking:created", invalidate);
    socket.on("appointment:created", invalidate);
    socket.on("appointment:updated", invalidate);
    socket.on("appointment:paid", invalidate);
    socket.on("appointment:deleted", invalidate);
    socket.on("booking:cancelled", invalidate);

    // deduction:cleared — prompt owner to credit the amount back to the staff wallet
    const onDeductionCleared = (data: { deductionId: number; staffId: number; staffName: string; amount: number }) => {
      invalidate();
      toast({
        title: `✅ خصم ${data.staffName} تسوّى تلقائياً`,
        description: `${data.amount} DH — هل تضيف المبلغ لرصيده؟`,
        duration: 15000,
        action: (
          <ToastAction
            altText="إضافة للرصيد"
            onClick={() =>
              createPaymentMutationRef.current?.mutate({
                staffId: data.staffId,
                staffName: data.staffName,
                amount: data.amount,
              })
            }
          >
            إضافة للرصيد
          </ToastAction>
        ),
      });
    };
    socket.on("deduction:cleared", onDeductionCleared);

    return () => {
      socket.off("booking:created", invalidate);
      socket.off("appointment:created", invalidate);
      socket.off("appointment:updated", invalidate);
      socket.off("appointment:paid", invalidate);
      socket.off("appointment:deleted", invalidate);
      socket.off("booking:cancelled", invalidate);
      socket.off("deduction:cleared", onDeductionCleared);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [queryClient]);

  // Socket handles real-time invalidation — no need to blow away cache on every focus.
  // Only do a single quiet background refresh when the tab becomes visible after being
  // hidden for more than 5 minutes (so data never goes stale while the app is idle).
  useEffect(() => {
    let hiddenAt: number | null = null;
    const STALE_MS = 5 * 60 * 1000;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null && Date.now() - hiddenAt > STALE_MS) {
        queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
        hiddenAt = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [queryClient]);

  // Single query fetches all 7 data sources in parallel on the server.
  // One HTTP round-trip → one response → one render. No cascading jumps.
  const { data: salaryData, isLoading: salaryLoading } = useQuery<{
    staff: Staff[];
    services: Service[];
    staffCommissions: { id: number; staffId: number; serviceId: number; percentage: number }[];
    appointments: Appointment[];
    charges: Charge[];
    deductions: StaffDeduction[];
    staffPayments: StaffPayment[];
    salonPayments: SalonPayment[];
  }>({
    queryKey: ["/api/salaries/compute"],
    queryFn: async () => {
      const res = await fetch("/api/salaries/compute");
      if (!res.ok) return { staff: [], services: [], staffCommissions: [], appointments: [], charges: [], deductions: [], staffPayments: [], salonPayments: [] };
      const data = await res.json();
      saveSalariesCache(data).catch(() => {});
      return data;
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const staff = salaryData?.staff ?? [];
  const services = salaryData?.services ?? [];
  const staffCommissions = salaryData?.staffCommissions ?? [];
  const appointments = salaryData?.appointments ?? [];
  const charges = salaryData?.charges ?? [];
  const deductions = salaryData?.deductions ?? [];
  const staffPayments = salaryData?.staffPayments ?? [];
  const salonPayments = salaryData?.salonPayments ?? [];
  const refetchAppointments = () => queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });

  // Owner withdrawals — needed for accurate net profit (consistent with Reports and Home)
  const { data: ownerWithdrawalsData = [] } = useQuery<any[]>({
    queryKey: ["/api/owner-withdrawals"],
    staleTime: 30_000,
  });

  const createChargeMutation = useMutation({
    mutationFn: async (charge: typeof newCharge) => {
      const res = await apiRequest("POST", "/api/charges", charge);
      return res.json();
    },
    onSuccess: () => {
      refreshSalariesBackground();
      setShowChargeDialog(false);
      setNewCharge({ type: "rent", name: "", amount: 0, date: format(getWorkDayDate(bSettings?.openingTime, bSettings?.closingTime), "yyyy-MM-dd") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const deleteChargeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/charges/${id}`);
    },
    onSuccess: () => {
      refreshSalariesBackground();
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const createDeductionMutation = useMutation({
    mutationFn: async (deduction: typeof newDeduction) => {
      const res = await apiRequest("POST", "/api/staff-deductions", deduction);
      return res.json();
    },
    onSuccess: () => {
      refreshSalariesBackground();
      setShowDeductionDialog(false);
      setNewDeduction({ staffName: "", type: "advance", description: "", amount: 0, date: format(getWorkDayDate(bSettings?.openingTime, bSettings?.closingTime), "yyyy-MM-dd") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const deleteDeductionMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/staff-deductions/${id}`);
    },
    onSuccess: () => {
      refreshSalariesBackground();
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const clearDeductionMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/staff-deductions/${id}/clear`);
    },
    onSuccess: () => {
      refreshSalariesBackground();
      toast({ title: t("salaries.cleared") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const updateChargeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PATCH", `/api/charges/${id}`, data);
    },
    onSuccess: () => {
      refreshSalariesBackground();
      setEditingCharge(null);
      toast({ title: t("common.save") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const updateDeductionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PATCH", `/api/staff-deductions/${id}`, data);
    },
    onSuccess: () => {
      refreshSalariesBackground();
      setEditingDeduction(null);
      toast({ title: t("common.save") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const payBackMutation = useMutation({
    mutationFn: async ({ id, amount }: { id: number; amount: number; staffName: string; type: string; description: string }) => {
      const res = await apiRequest("PATCH", `/api/staff-deductions/${id}/pay-back`, { amount });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      addPaidBackEntry({
        id: `${Date.now()}-${variables.id}`,
        deductionId: variables.id,
        staffName: variables.staffName,
        type: variables.type,
        description: variables.description,
        amount: variables.amount,
        timestamp: new Date().toISOString(),
      });

      // Immediately patch the cache so the deduction disappears / updates without
      // waiting for the background refetch (fixes the "auto-clear not visible" race).
      const prev = queryClient.getQueryData<NonNullable<typeof salaryData>>(["/api/salaries/compute"]);
      if (prev) {
        queryClient.setQueryData(["/api/salaries/compute"], {
          ...prev,
          deductions: prev.deductions.map((d) =>
            d.id === variables.id
              ? {
                  ...d,
                  paidBack: _data?.paidBack ?? variables.amount,
                  cleared: !!_data?.cleared,
                  clearedAt: _data?.cleared ? new Date().toISOString() : d.clearedAt,
                }
              : d
          ),
        });
      }

      refreshSalariesBackground();
      setPayBackDeduction(null);
      setPayBackInputAmount("");
      toast({
        title: _data?.cleared
          ? `✅ ${t("salaries.payBackRecorded")} — ${t("salaries.cleared") || "تسوّى تلقائياً"}`
          : t("salaries.payBackRecorded"),
      });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const createSalonPaymentMutation = useMutation({
    mutationFn: async (payment: { amount: number; note?: string }) => {
      const res = await apiRequest("POST", "/api/salon-payments", payment);
      return res.json();
    },
    onSuccess: async () => {
      refreshSalariesBackground();
      toast({ title: "Recette salon collectée" });
      try {
        await connectQz();
        if (isQzConnected()) { await openCashDrawer(); return; }
      } catch {}
      const available = await checkPrintStationAsync();
      if (available) { await remoteOpenDrawer(); }
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (payment: { staffId: number; staffName: string; amount: number }) => {
      const res = await apiRequest("POST", "/api/staff-payments", payment);
      return res.json();
    },
    onSuccess: async () => {
      refreshSalariesBackground();
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
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  // Stable ref so the deduction:cleared socket handler always sees the latest mutation
  const createPaymentMutationRef = useRef(createPaymentMutation);
  useEffect(() => { createPaymentMutationRef.current = createPaymentMutation; });

  const deletePaymentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/staff-payments/${id}`);
    },
    onSuccess: () => {
      refreshSalariesBackground();
      toast({ title: t("planning.paymentReverted") || "تم إلغاء الدفع" });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const createOwnerWithdrawalMutation = useMutation({
    mutationFn: async (data: { amount: number; date: string; notes?: string }) => {
      const res = await apiRequest("POST", "/api/owner-withdrawals", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner-withdrawals"] });
      setNewWithdrawalAmount("");
      setNewWithdrawalNotes("");
      setShowAddWithdrawal(false);
      toast({ title: t("ownerWithdrawals.withdrawalAdded") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const deleteOwnerWithdrawalMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/owner-withdrawals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner-withdrawals"] });
      toast({ title: t("ownerWithdrawals.withdrawalDeleted") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const unclearedDeductions = deductions.filter(d => !d.cleared);
  const getRemainingAmount = (d: StaffDeduction) => Math.max(0, d.amount - (d.paidBack || 0));
  const totalUnclearedByStaff = unclearedDeductions.reduce((acc, d) => {
    acc[d.staffName] = (acc[d.staffName] || 0) + getRemainingAmount(d);
    return acc;
  }, {} as Record<string, number>);
  const totalUncleared = unclearedDeductions.reduce((sum, d) => sum + getRemainingAmount(d), 0);

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
    const staffMatch = selectedStaff === "all" || (selectedStaffId && (Number(apt.staffId) === selectedStaffId || (!apt.staffId && apt.staff === staff.find(s => s.id === selectedStaffId)?.name)));
    return inRange && staffMatch && !!apt.paid;
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
      // Resolve staff name: prefer staffId match (handles null/mismatched apt.staff), fall back to apt.staff string
      const resolvedStaff = apt.staffId
        ? staff.find(s => s.id === Number(apt.staffId))
        : staff.find(s => s.name === apt.staff);
      const staffName = resolvedStaff?.name || apt.staff || "Unknown";
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
      
      const commission = calcAppointmentCommission(apt, services, staff, staffCommissions);
      const aptTotal = apt.total || 0;

      earnings[staffName].totalRevenue += aptTotal;
      earnings[staffName].totalCommission += commission;
      earnings[staffName].appointmentsCount += 1;

      if (!earnings[staffName].services[serviceName]) {
        earnings[staffName].services[serviceName] = { count: 0, revenue: 0, commission: 0 };
      }
      earnings[staffName].services[serviceName].count += 1;
      earnings[staffName].services[serviceName].revenue += aptTotal;
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
  const totalPending = pendingDeductions.reduce((sum, d) => sum + getRemainingAmount(d), 0);
  const totalExpenses = filteredCharges.reduce((sum, c) => sum + c.amount, 0);
  const filteredOwnerWithdrawals = ownerWithdrawalsData.filter((w: any) => {
    try {
      const wDate = parseISO(w.date);
      return (isAfter(wDate, startOfDay(start)) || isEqual(wDate, startOfDay(start))) &&
             (isBefore(wDate, endOfDay(end)) || isEqual(wDate, endOfDay(end)));
    } catch { return false; }
  });
  const totalOwnerWithdrawals = filteredOwnerWithdrawals.reduce((sum: number, w: any) => sum + Number(w.amount || 0), 0);
  const netProfit = salonPortion - totalExpenses - totalOwnerWithdrawals;
  const netStaffPayable = staff.reduce((total, s) => {
    const earning = staffEarnings.find(e => e.name === s.name);
    const staffCommission = earning ? earning.totalCommission : 0;
    const staffDeductionAmount = pendingDeductions
      .filter(d => d.staffId === s.id || (!d.staffId && d.staffName === s.name))
      .reduce((sum, d) => sum + getRemainingAmount(d), 0);
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

  const getSalonWalletData = () => {
    const lastPayment = [...salonPayments]
      .sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime())[0];
    const lastCollectedDate = lastPayment ? new Date(lastPayment.collectedAt) : null;

    // Filter appointments since the last collection (like staff wallet), not the whole month.
    // This way the balance resets to 0 right after collecting.
    let sinceDate: string | null = null;
    if (lastCollectedDate) {
      const businessDay = getBusinessDayDate(lastCollectedDate, bSettings?.openingTime);
      const y = businessDay.getFullYear();
      const m = String(businessDay.getMonth() + 1).padStart(2, "0");
      const d = String(businessDay.getDate()).padStart(2, "0");
      sinceDate = `${y}-${m}-${d}`;
    }

    const walletAppointments = appointments.filter(apt => {
      if (!apt.paid) return false;
      if (sinceDate) return apt.date > sinceDate;
      return true;
    });

    let walletRevenue = 0;
    let walletCommissions = 0;
    const walletApptCount = walletAppointments.length;

    walletAppointments.forEach(apt => {
      const total = apt.total || 0;
      const commission = calcAppointmentCommission(apt, services, staff, staffCommissions);
      walletRevenue += total;
      walletCommissions += commission;
    });

    const walletSalonPortion = walletRevenue - walletCommissions;

    const walletExpenses = charges.filter(c =>
      sinceDate ? c.date > sinceDate : true
    ).reduce((sum, c) => sum + c.amount, 0);

    const walletBalance = walletSalonPortion - walletExpenses;

    return {
      lastCollectedDate,
      sinceDate,
      walletRevenue,
      walletCommissions,
      walletSalonPortion,
      walletExpenses,
      walletBalance,
      walletApptCount,
    };
  };

  const getStaffWalletData = (s: Staff) => {
    const lastPayment = [...staffPayments]
      .filter(p => Number(p.staffId) === s.id)
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())[0];
    const lastPaymentDate = lastPayment ? new Date(lastPayment.paidAt) : null;

    // Convert payment timestamp to a business-day date string for the filter.
    // Payments made before opening time count as the previous business day.
    let sinceDate: string | null = null;
    if (lastPaymentDate) {
      const businessDay = getBusinessDayDate(lastPaymentDate, bSettings?.openingTime);
      const y = businessDay.getFullYear();
      const m = String(businessDay.getMonth() + 1).padStart(2, "0");
      const d = String(businessDay.getDate()).padStart(2, "0");
      sinceDate = `${y}-${m}-${d}`;
    }

    // Show only paid appointments from the last payment date onwards (inclusive).
    // If no payment has ever been made, show all appointments.
    const walletAppointments = appointments.filter(apt => {
      if (!apt.paid) return false;
      const matchesStaff = Number(apt.staffId) === s.id || (!apt.staffId && apt.staff === s.name);
      if (!matchesStaff) return false;
      if (sinceDate) {
        if (apt.date > sinceDate) return true;
        if (apt.date < sinceDate) return false;
        // Same calendar day as payment — use createdAt timestamp to include only
        // appointments that were created AFTER the payment (new work, not already paid).
        const aptCreated = apt.createdAt ? new Date(apt.createdAt).getTime() : null;
        return aptCreated !== null && lastPaymentDate !== null && aptCreated > lastPaymentDate.getTime();
      }
      return true;
    });

    let walletRevenue = 0;
    let walletCommission = 0;
    const walletServices: Record<string, { count: number; revenue: number; commission: number }> = {};

    walletAppointments.forEach(apt => {
      const serviceName = apt.service || "Unknown";
      const total = apt.total || 0;
      const commission = calcAppointmentCommission(apt, services, staff, staffCommissions);
      walletRevenue += total;
      walletCommission += commission;
      if (!walletServices[serviceName]) {
        walletServices[serviceName] = { count: 0, revenue: 0, commission: 0 };
      }
      walletServices[serviceName].count += 1;
      walletServices[serviceName].revenue += total;
      walletServices[serviceName].commission += commission;
    });

    // Use full deduction amount (paidBack tracked in the separate Paid-Back card, not wallet)
    const pendingStaffDeductions = deductions
      .filter(d => !d.cleared && (Number(d.staffId) === s.id || (!d.staffId && d.staffName === s.name)))
      .reduce((sum, d) => sum + d.amount, 0);

    // Fixed-salary staff: add baseSalary so the Pay button shows the correct monthly amount.
    // Commission staff will typically have baseSalary = 0 so this is a no-op for them.
    const baseSalary = Number(s.baseSalary) || 0;

    // Balance = fixed salary + commission earned since last payment − pending deductions
    const walletBalance = baseSalary + walletCommission - pendingStaffDeductions;

    return {
      lastPaymentDate, sinceDate, walletBalance,
      walletRevenue, walletCommission,
      baseSalary,
      walletApptCount: walletAppointments.length,
      walletServices,
    };
  };

  const exportToCSV = () => {
    const periodLabel = period === "day" ? format(selectedDate, "yyyy-MM-dd")
      : period === "week" ? `${format(start, "yyyy-MM-dd")}_${format(end, "yyyy-MM-dd")}`
      : period === "month" ? format(selectedDate, "yyyy-MM")
      : `${format(customStartDate, "yyyy-MM-dd")}_${format(customEndDate, "yyyy-MM-dd")}`;

    const bom = "\uFEFF";
    const rows: string[] = [];
    rows.push(`"تقرير الرواتب والمصاريف","${periodLabel}"`);
    rows.push("");
    rows.push(`"الإجمالي الكلي للحجوزات المدفوعة","${totalRevenue} DH"`);
    rows.push(`"إجمالي العمولات","${totalCommissions} DH"`);
    rows.push(`"نصيب الصالون","${salonPortion} DH"`);
    rows.push(`"إجمالي المصاريف","${totalExpenses} DH"`);
    rows.push(`"سحوبات المالك","${totalOwnerWithdrawals} DH"`);
    rows.push(`"صافي الربح","${netProfit} DH"`);
    rows.push(`"إجمالي المستحق للموظفين","${netStaffPayable} DH"`);
    rows.push("");
    rows.push(`"الموظف","الإيراد","العمولة","الخصومات","الصافي"`);
    for (const s of staff) {
      const earning = staffEarnings.find(e => e.name === s.name);
      const commission = earning ? earning.totalCommission : 0;
      const deductionAmt = pendingDeductions
        .filter(d => d.staffId === s.id || (!d.staffId && d.staffName === s.name))
        .reduce((sum, d) => sum + d.amount, 0);
      const net = commission - deductionAmt;
      if (commission === 0 && deductionAmt === 0) continue;
      rows.push(`"${s.name}","${earning?.totalRevenue ?? 0}","${commission}","${deductionAmt}","${net}"`);
    }
    rows.push("");
    if (filteredCharges.length > 0) {
      rows.push(`"المصاريف","النوع","المبلغ","التاريخ"`);
      for (const c of filteredCharges) {
        rows.push(`"${c.name}","${getChargeTypeLabel(c.type)}","${c.amount}","${c.date}"`);
      }
    }

    const blob = new Blob([bom + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `salary_report_${periodLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: t("salaries.csvExported") || "تم تصدير التقرير" });
  };

  return (
    <div className="flex flex-col gap-3 p-2 animate-fade-in" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-bold" data-testid="text-page-title">{t("salaries.pageTitle")}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={exportToCSV}
            title={t("salaries.exportCSV") || "تصدير CSV"}
            data-testid="button-export-csv"
          >
            <FileDown className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={isRefreshing}
            onClick={async () => {
              setIsRefreshing(true);
              await queryClient.invalidateQueries();
              setLastUpdate(new Date());
              setIsRefreshing(false);
              toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
            }}
            data-testid="button-refresh-salaries"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ── Paid-Back Cash Register card ── */}
      {paidBackHistory.length > 0 && (() => {
        const totalPaidBack = paidBackHistory.reduce((s, e) => s + e.amount, 0);
        const byStaff = paidBackHistory.reduce<Record<string, typeof paidBackHistory>>((acc, e) => {
          if (!acc[e.staffName]) acc[e.staffName] = [];
          acc[e.staffName].push(e);
          return acc;
        }, {});
        return (
          <Collapsible open={paidBackOpen} onOpenChange={setPaidBackOpen}>
            <Card className="glass-card border-emerald-300/50 dark:border-emerald-700/50">
              <CollapsibleTrigger asChild>
                <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 pb-2 cursor-pointer">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Undo2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-emerald-700 dark:text-emerald-400">استرداد الخصومات</span>
                    <span className="text-sm font-normal text-emerald-600/70">({paidBackHistory.length})</span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold text-sm">{formatCurrency(totalPaidBack)} DH</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs border-red-300/60 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={(e) => { e.stopPropagation(); resetPaidBackHistory(); }}
                      data-testid="button-reset-paidback"
                    >
                      <RefreshCw className="h-3 w-3 me-1" />
                      تصفير
                    </Button>
                    <ChevronDown className={`h-4 w-4 text-emerald-500 transition-transform ${paidBackOpen ? "rotate-180" : ""}`} />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="px-3 pb-3 pt-0 space-y-2">
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mb-2">المبالغ التي استردها الصالون من الموظفين — اضغط تصفير بعد تسجيل النقود</p>
                  {Object.entries(byStaff).map(([staffName, entries]) => {
                    const staffTotal = entries.reduce((s, e) => s + e.amount, 0);
                    const isOpen = !!paidBackOpenStaff[staffName];
                    return (
                      <div key={staffName} className="rounded-lg border border-emerald-200/40 dark:border-emerald-800/30 overflow-hidden">
                        <button
                          className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-emerald-50/40 dark:hover:bg-emerald-900/20 transition-colors"
                          onClick={() => setPaidBackOpenStaff(prev => ({ ...prev, [staffName]: !prev[staffName] }))}
                        >
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">{staffName}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-emerald-600 text-sm">{formatCurrency(staffTotal)} DH</span>
                            <ChevronDown className={`h-3 w-3 text-emerald-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </div>
                        </button>
                        {isOpen && (
                          <div className="px-3 pb-2 space-y-1 border-t border-emerald-200/30 dark:border-emerald-800/20 pt-1">
                            {entries.map((e) => (
                              <div key={e.id} className="flex items-center justify-between gap-2 py-1 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="liquid-glass-chip shrink-0">{getDeductionTypeLabel(e.type)}</span>
                                  {e.description && <span className="text-muted-foreground truncate">{e.description}</span>}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-mono font-semibold text-emerald-600">{formatCurrency(e.amount)} DH</span>
                                  <span className="text-muted-foreground">{format(new Date(e.timestamp), "d/M HH:mm")}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })()}

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
                {unclearedDeductions.map((d) => {
                  const remaining = getRemainingAmount(d);
                  return (
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
                          <span className="text-orange-600 font-semibold tabular-nums">{formatCurrency(remaining)} DH</span>
                          {(d.paidBack || 0) > 0 && (
                            <span className="text-[10px] text-muted-foreground">({t("salaries.of")} {formatCurrency(d.amount)})</span>
                          )}
                          <span className="text-muted-foreground text-xs">{format(parseISO(d.date), "d/M/yy")}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setPayBackDeduction(d); setPayBackInputAmount(String(remaining)); }}
                          data-testid={`button-payback-uncleared-${d.id}`}
                        >
                          <ArrowDownLeft className="h-3 w-3 me-1" />
                          {t("salaries.payBack")}
                        </Button>
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
                    </div>
                  );
                })}
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

      {/* Monthly Revenue Goal - Top */}
      {period === "month" && (
        <Card className="glass-card" data-testid="card-monthly-goal">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
                  <TrendingUp className="h-3.5 w-3.5 text-violet-600" />
                </div>
                <span className="text-sm font-semibold">{t("salaries.monthlyGoal") || "هدف الشهر"}</span>
              </div>
              {!showGoalEdit ? (
                <button
                  className="text-xs text-muted-foreground underline underline-offset-2"
                  onClick={() => { setGoalEditValue(monthlyGoal > 0 ? String(monthlyGoal) : ""); setShowGoalEdit(true); }}
                  data-testid="button-edit-goal"
                >
                  {monthlyGoal > 0 ? `${formatCurrency(monthlyGoal)} DH` : (t("salaries.setGoal") || "تعيين الهدف")}
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    value={goalEditValue}
                    onChange={e => setGoalEditValue(e.target.value)}
                    className="h-7 w-28 text-sm text-end"
                    placeholder="0"
                    data-testid="input-monthly-goal"
                    autoFocus
                  />
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={() => {
                    const val = Number(goalEditValue) || 0;
                    setMonthlyGoal(val);
                    localStorage.setItem("monthly_revenue_goal", String(val));
                    setShowGoalEdit(false);
                  }} data-testid="button-save-goal">✓</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowGoalEdit(false)}>✕</Button>
                </div>
              )}
            </div>
            {monthlyGoal > 0 ? (
              <>
                <div className="relative h-3 rounded-full bg-secondary overflow-hidden mb-1.5">
                  <div
                    className={`absolute inset-y-0 start-0 rounded-full transition-all duration-500 ${
                      salonPortion >= monthlyGoal
                        ? "bg-emerald-500"
                        : salonPortion / monthlyGoal >= 0.7
                        ? "bg-violet-500"
                        : "bg-violet-400/70"
                    }`}
                    style={{ width: `${Math.min((salonPortion / monthlyGoal) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
                  <span data-testid="text-goal-revenue">{formatCurrency(salonPortion)} DH</span>
                  <span className={`font-semibold ${salonPortion >= monthlyGoal ? "text-emerald-600 dark:text-emerald-400" : "text-violet-600 dark:text-violet-400"}`}>
                    {Math.round((salonPortion / monthlyGoal) * 100)}%
                    {salonPortion >= monthlyGoal && " ✓"}
                  </span>
                  <span>{formatCurrency(monthlyGoal)} DH</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-1">{t("salaries.noGoalSet") || "لم يتم تعيين هدف شهري بعد"}</p>
            )}
          </CardContent>
        </Card>
      )}

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
        <Card className="glass-card" data-testid="stat-owner-withdrawals">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center">
                <ArrowDownLeft className="h-3.5 w-3.5 text-orange-600" />
              </div>
              <p className="text-xs text-muted-foreground">{t("ownerWithdrawals.title")}</p>
            </div>
            <p className="text-xl font-bold tabular-nums text-orange-600 dark:text-orange-400" data-testid="text-owner-withdrawals">{formatCurrency(totalOwnerWithdrawals)} <span className="text-sm font-normal text-muted-foreground">DH</span></p>
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
              <div className="space-y-1">
                <button
                  className="w-full flex justify-between items-center text-sm py-0.5 hover:opacity-80 transition-opacity"
                  onClick={() => setWithdrawalsOpen(o => !o)}
                  data-testid="button-toggle-salary-withdrawals"
                >
                  <span className="text-muted-foreground flex items-center gap-1">
                    {withdrawalsOpen ? <ChevronUp className="w-3.5 h-3.5 text-orange-500" /> : <ChevronDown className="w-3.5 h-3.5 text-orange-500" />}
                    {t("ownerWithdrawals.title")}
                    <span className="text-xs text-orange-500">({filteredOwnerWithdrawals.length})</span>
                  </span>
                  <span className="font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                    {totalOwnerWithdrawals > 0 ? `- ${formatCurrency(totalOwnerWithdrawals)} DH` : "0 DH"}
                  </span>
                </button>
                {withdrawalsOpen && (
                  <div className="space-y-2 pt-1">
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {filteredOwnerWithdrawals.length === 0 && (
                        <p className="text-center text-xs text-muted-foreground py-2">{t("ownerWithdrawals.noWithdrawals")}</p>
                      )}
                      {filteredOwnerWithdrawals.map((w: any) => (
                        <div key={w.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-orange-50/70 dark:bg-orange-950/20 border border-orange-100/50 dark:border-orange-800/20 text-xs" data-testid={`row-withdrawal-${w.id}`}>
                          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <span className="font-bold text-orange-700 dark:text-orange-400">{formatCurrency(Number(w.amount))} DH</span>
                            {w.notes && <span className="text-muted-foreground truncate">{w.notes}</span>}
                            <span className="text-muted-foreground">{w.date}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-destructive/60 hover:text-destructive"
                            onClick={() => deleteOwnerWithdrawalMutation.mutate(w.id)}
                            disabled={deleteOwnerWithdrawalMutation.isPending}
                            data-testid={`button-delete-withdrawal-${w.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    {showAddWithdrawal ? (
                      <div className="p-3 rounded-lg bg-orange-50/80 dark:bg-orange-950/20 border border-orange-100/60 dark:border-orange-800/20 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">{t("ownerWithdrawals.amount")}</Label>
                            <Input
                              type="number"
                              value={newWithdrawalAmount}
                              onChange={e => setNewWithdrawalAmount(e.target.value)}
                              placeholder="0"
                              className="h-8 text-xs bg-white/60 dark:bg-white/5 border-white/50"
                              data-testid="input-salary-withdrawal-amount"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{t("common.date")}</Label>
                            <Input
                              type="date"
                              value={newWithdrawalDate}
                              onChange={e => setNewWithdrawalDate(e.target.value)}
                              className="h-8 text-xs bg-white/60 dark:bg-white/5 border-white/50"
                              data-testid="input-salary-withdrawal-date"
                            />
                          </div>
                        </div>
                        <Input
                          value={newWithdrawalNotes}
                          onChange={e => setNewWithdrawalNotes(e.target.value)}
                          placeholder={t("ownerWithdrawals.notesPlaceholder")}
                          className="h-8 text-xs bg-white/60 dark:bg-white/5 border-white/50"
                          data-testid="input-salary-withdrawal-notes"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 h-8 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                            disabled={createOwnerWithdrawalMutation.isPending || !newWithdrawalAmount}
                            onClick={() => {
                              if (!newWithdrawalAmount || !newWithdrawalDate) return;
                              createOwnerWithdrawalMutation.mutate({
                                amount: Number(newWithdrawalAmount),
                                date: newWithdrawalDate,
                                notes: newWithdrawalNotes || undefined,
                              });
                            }}
                            data-testid="button-save-salary-withdrawal"
                          >
                            {t("ownerWithdrawals.addWithdrawal")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs"
                            onClick={() => setShowAddWithdrawal(false)}
                            data-testid="button-cancel-salary-withdrawal"
                          >
                            {t("common.cancel") || "إلغاء"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs border-orange-200 dark:border-orange-800/40 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                        onClick={() => setShowAddWithdrawal(true)}
                        data-testid="button-add-salary-withdrawal"
                      >
                        <Plus className="w-3.5 h-3.5 ltr:mr-1.5 rtl:ml-1.5" />
                        {t("ownerWithdrawals.addWithdrawal")}
                      </Button>
                    )}
                  </div>
                )}
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
          const wallet = getStaffWalletData(s);
          // Use all pending deductions (not period-filtered) to match wallet balance calculation
          const staffAllDeductions = deductions
            .filter(d => !d.cleared && (Number(d.staffId) === s.id || (!d.staffId && d.staffName === s.name)));
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base" data-testid={`text-staff-name-${s.id}`}>{s.name}</h3>
                        {wallet.baseSalary > 0 && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-[10px] font-semibold shrink-0">
                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                            {formatCurrency(wallet.baseSalary)} {t("common.currency")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span data-testid={`text-staff-appointments-${s.id}`}>{wallet.walletApptCount} {t("salaries.appointmentsCount").toLowerCase()}</span>
                        <span>-</span>
                        <span data-testid={`text-staff-last-paid-${s.id}`}>
                          {t("salaries.lastPaid")}: {wallet.lastPaymentDate ? format(wallet.lastPaymentDate, "d/M/yy · HH:mm") : "—"}
                        </span>
                      </div>
                    </div>
                    {wallet.walletBalance > 0 && (
                      <button
                        disabled={createPaymentMutation.isPending}
                        onClick={() => setPendingPayment({
                          staffId: s.id,
                          staffName: s.name,
                          amount: Math.max(0, wallet.walletBalance),
                        })}
                        className="shrink-0 flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white transition-all shadow-md disabled:opacity-60"
                        data-testid={`button-pay-staff-${s.id}`}
                        title={t("salaries.markAsPaid")}
                      >
                        {createPaymentMutation.isPending
                          ? <RefreshCw className="h-5 w-5 animate-spin" />
                          : <CheckCircle className="h-5 w-5" />
                        }
                        <span className="text-[9px] font-bold leading-tight">{wallet.walletBalance.toFixed(0)}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Earnings Row */}
                <div className="px-4 pb-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg bg-muted/40 dark:bg-muted/20" data-testid={`text-staff-revenue-${s.id}`}>
                      <p className="text-[10px] text-muted-foreground mb-1">{t("salaries.totalRevenue")}</p>
                      <p className="text-sm font-bold tabular-nums">{formatCurrency(wallet.walletRevenue)}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-green-50/80 dark:bg-green-950/20" data-testid={`text-staff-commission-${s.id}`}>
                      <p className="text-[10px] text-muted-foreground mb-1">{t("salaries.staffCommissions")}</p>
                      <p className="text-sm font-bold tabular-nums">{formatCurrency(wallet.walletCommission)}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-primary/5 dark:bg-primary/10" data-testid={`text-staff-wallet-${s.id}`}>
                      <p className="text-[10px] text-muted-foreground mb-0.5">{t("salaries.walletBalance").split(':')[0] || "Wallet"}</p>
                      <p className={`text-sm font-bold tabular-nums ${wallet.walletBalance < 0 ? 'text-red-600 dark:text-red-400' : wallet.walletBalance > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                        {wallet.walletBalance < 0 ? `- ${formatCurrency(Math.abs(wallet.walletBalance))}` : formatCurrency(wallet.walletBalance)}
                      </p>
                      {staffDeductionAmount > 0 && (
                        <p className="text-[9px] text-red-500 dark:text-red-400 mt-0.5 leading-tight tabular-nums">
                          - {formatCurrency(staffDeductionAmount)} {t("staffPortal.allDeductions")}
                        </p>
                      )}
                      <p className="text-[9px] text-muted-foreground/70 mt-0.5 leading-tight">
                        {wallet.sinceDate
                          ? `${wallet.walletApptCount} rdv · depuis ${format(parseISO(wallet.sinceDate), "d/M/yy")}`
                          : `${wallet.walletApptCount} rdv · tout`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Deductions — collapsible per-staff */}
                <div className="px-4 pb-3">
                  <div className="rounded-lg overflow-hidden border border-orange-200/50 dark:border-orange-800/30" data-testid={`text-staff-deductions-${s.id}`}>
                    <button
                      type="button"
                      onClick={() => setOpenDeductions(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-orange-50/80 dark:bg-orange-950/20 hover:bg-orange-100/60 dark:hover:bg-orange-900/30 transition-colors"
                      data-testid={`button-toggle-deductions-${s.id}`}
                    >
                      <UserMinus className="h-3 w-3 text-orange-600 dark:text-orange-400 shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400">
                        {t("staffPortal.allDeductions")}
                      </span>
                      {staffDeductionAmount > 0 && (
                        <span className="text-[10px] font-bold tabular-nums text-red-600 dark:text-red-400">
                          - {formatCurrency(staffDeductionAmount)} DH
                        </span>
                      )}
                      {staffAllDeductions.length > 0 && (
                        <span className="text-[10px] text-orange-500/70 ml-0.5">({staffAllDeductions.length})</span>
                      )}
                      <div className="ml-auto flex items-center gap-1.5">
                        <span
                          className="flex items-center justify-center h-5 w-5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-800/50 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNewDeduction({ staffName: s.name, type: "advance", description: "", amount: 0, date: format(getWorkDayDate(bSettings?.openingTime, bSettings?.closingTime), "yyyy-MM-dd") });
                            setShowDeductionDialog(true);
                          }}
                          data-testid={`button-add-deduction-staff-${s.id}`}
                        >
                          <Plus className="h-3 w-3" />
                        </span>
                        <ChevronDown className={`h-3 w-3 text-orange-500 transition-transform duration-200 ${openDeductions[s.id] ? "rotate-180" : ""}`} />
                      </div>
                    </button>

                    {openDeductions[s.id] && (
                      <div className="px-3 py-2 bg-orange-50/40 dark:bg-orange-950/10">
                        {staffAllDeductions.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground text-center py-1">{t("salaries.noDeductionsForPeriod")}</p>
                        ) : (
                          <div className="space-y-0.5">
                            {staffAllDeductions.map((d) => {
                              const remaining = getRemainingAmount(d);
                              return (
                                <div key={d.id} className="flex items-center justify-between gap-1 py-1 border-t border-orange-200/30 dark:border-orange-800/20 first:border-0" data-testid={`text-staff-deduction-item-${d.id}`}>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-xs font-medium">{getDeductionTypeLabel(d.type)}</span>
                                      {d.description && (
                                        <span className="text-[10px] text-muted-foreground truncate">- {d.description}</span>
                                      )}
                                      {d.cleared && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">{t("salaries.paidBack")}</span>
                                      )}
                                      {!d.cleared && (d.paidBack || 0) > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
                                          {formatCurrency(d.paidBack || 0)} {t("salaries.repaid")}
                                        </span>
                                      )}
                                    </div>
                                    <span className={`text-[10px] tabular-nums ${d.cleared ? 'text-muted-foreground line-through' : 'text-red-600 dark:text-red-400'}`}>
                                      - {formatCurrency(d.cleared ? d.amount : remaining)} DH · {format(parseISO(d.date), "d/M/yy")}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    {!d.cleared && (
                                      <>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setPayBackDeduction(d); setPayBackInputAmount(String(remaining)); }} data-testid={`button-payback-staff-deduction-${d.id}`}>
                                          <ArrowDownLeft className="h-3 w-3 text-blue-600" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={clearDeductionMutation.isPending} onClick={() => clearDeductionMutation.mutate(d.id)} data-testid={`button-clear-staff-deduction-${d.id}`}>
                                          <CheckCircle className="h-3 w-3 text-green-600" />
                                        </Button>
                                      </>
                                    )}
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingDeduction(d)} data-testid={`button-edit-staff-deduction-${d.id}`}>
                                      <Pencil className="h-3 w-3 text-pink-600" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteDeductionMutation.mutate(d.id)} data-testid={`button-delete-staff-deduction-${d.id}`}>
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Service Breakdown */}
                {Object.keys(wallet.walletServices).length > 0 && (
                  <div className="px-4 pb-4">
                    <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">{t("reports.serviceDetailsLabel")}</p>
                    <div className="space-y-0">
                      {Object.entries(wallet.walletServices).map(([serviceName, data]) => (
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

                {/* Payment History — collapsible */}
                {(() => {
                  const staffHistory = staffPayments
                    .filter(p => Number(p.staffId) === s.id)
                    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
                  if (staffHistory.length === 0) return null;
                  const isOpen = !!openPaymentHistories[s.id];
                  return (
                    <div className="px-4 pb-3">
                      <div className="rounded-lg overflow-hidden border border-border/30">
                        <button
                          type="button"
                          onClick={() => setOpenPaymentHistories(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                          className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <Wallet className="h-3 w-3 text-primary shrink-0" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {t("salaries.paymentHistory")}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{staffHistory.length}</span>
                          <ChevronDown className={`h-3 w-3 text-muted-foreground ml-auto transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                        </button>
                        {isOpen && (
                          <div className="divide-y divide-border/20 max-h-40 overflow-y-auto">
                            {staffHistory.map((p, idx) => {
                              const payDate = new Date(p.paidAt);
                              const bizDay = getBusinessDayDate(payDate, bSettings?.openingTime);
                              return (
                                <div key={p.id ?? idx} className="flex items-center justify-between px-3 py-1.5 text-xs">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-medium tabular-nums">
                                      {format(bizDay, "d/M/yy")}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground tabular-nums">
                                      {format(payDate, "HH:mm")}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                      {formatCurrency(p.amount)}
                                    </span>
                                    {p.id && (
                                      <button
                                        onClick={() => deletePaymentMutation.mutate(p.id)}
                                        disabled={deletePaymentMutation.isPending}
                                        className="flex items-center justify-center h-5 w-5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
                                        title={t("planning.revertPayment") || "إلغاء الدفع"}
                                        data-testid={`button-revert-payment-${p.id}`}
                                      >
                                        <Undo2 className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Empty state */}
                {wallet.walletApptCount === 0 && Object.keys(wallet.walletServices).length === 0 && (
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

      {/* Salon Earnings Wallet */}
      {(() => {
        const salonWallet = getSalonWalletData();
        const sortedSalonPayments = [...salonPayments].sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());
        return (
          <Card className="glass-card border-primary/20" data-testid="card-salon-wallet">
            <CardContent className="p-0">
              <div className="p-4 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Store className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-base">Portefeuille Salon</h3>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(), "MMMM yyyy", { locale: fr })}
                        {salonWallet.lastCollectedDate && (
                          <span className="ml-1 opacity-60">· collecte: {format(salonWallet.lastCollectedDate, "d/M")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {salonWallet.walletBalance > 0 && (
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={createSalonPaymentMutation.isPending}
                        onClick={() => setPendingSalonCollect(salonWallet.walletBalance)}
                        data-testid="button-collect-salon-wallet"
                      >
                        <CheckCircle className="h-3 w-3 me-1" />
                        Collecter
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Wallet Stats */}
              <div className="px-4 pb-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-muted/40 dark:bg-muted/20 col-span-2">
                    <div className="flex justify-between items-baseline">
                      <p className="text-[10px] text-muted-foreground">Part salon (recettes – commissions)</p>
                      <p className="text-sm font-bold tabular-nums">{formatCurrency(salonWallet.walletSalonPortion)} DH</p>
                    </div>
                    {salonWallet.walletExpenses > 0 && (
                      <div className="flex justify-between items-baseline mt-1">
                        <p className="text-[10px] text-muted-foreground">Charges déduites</p>
                        <p className="text-sm font-bold tabular-nums text-red-500">- {formatCurrency(salonWallet.walletExpenses)} DH</p>
                      </div>
                    )}
                    <div className="border-t border-border/40 mt-1.5 pt-1.5 flex justify-between items-baseline">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Solde disponible</p>
                      <p className={`text-base font-bold tabular-nums ${salonWallet.walletBalance < 0 ? 'text-red-500' : salonWallet.walletBalance > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`} data-testid="text-salon-wallet-balance">
                        {salonWallet.walletBalance < 0 ? `- ${formatCurrency(Math.abs(salonWallet.walletBalance))}` : formatCurrency(salonWallet.walletBalance)} DH
                      </p>
                    </div>
                    <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                      {salonWallet.walletApptCount} rdv · {salonWallet.sinceDate
                          ? `depuis ${format(parseISO(salonWallet.sinceDate), "d/M/yy")}`
                          : "tout"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Salon Payment History */}
              {sortedSalonPayments.length > 0 && (
                <div className="px-4 pb-3">
                  <div className="rounded-lg overflow-hidden border border-border/30">
                    <button
                      type="button"
                      onClick={() => setSalonHistoryOpen(prev => !prev)}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
                      data-testid="button-toggle-salon-history"
                    >
                      <Wallet className="h-3 w-3 text-primary shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {t("salaries.collectionHistory")}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{sortedSalonPayments.length}</span>
                      <ChevronDown className={`h-3 w-3 text-muted-foreground ml-auto transition-transform duration-200 ${salonHistoryOpen ? "rotate-180" : ""}`} />
                    </button>
                    {salonHistoryOpen && (
                      <div className="divide-y divide-border/20 max-h-40 overflow-y-auto">
                        {sortedSalonPayments.map((p, idx) => {
                          const collectDate = new Date(p.collectedAt);
                          const bizDay = getBusinessDayDate(collectDate, bSettings?.openingTime);
                          return (
                            <div key={p.id ?? idx} className="flex items-center justify-between px-3 py-1.5 text-xs">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-medium tabular-nums">{format(bizDay, "d/M/yy")}</span>
                                <span className="text-[10px] text-muted-foreground tabular-nums">{format(collectDate, "HH:mm")}</span>
                              </div>
                              <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(p.amount)} DH
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

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

      {/* Add Deduction Dialog — triggered from each staff card's + button */}
      <Dialog open={showDeductionDialog} onOpenChange={setShowDeductionDialog}>
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

      <Dialog open={!!payBackDeduction} onOpenChange={(open) => { if (!open) { setPayBackDeduction(null); setPayBackInputAmount(""); } }}>
        <DialogContent className="liquid-glass-modal">
          <DialogHeader>
            <DialogTitle>{t("salaries.partialPayBack")}</DialogTitle>
          </DialogHeader>
          {payBackDeduction && (() => {
            const remaining = getRemainingAmount(payBackDeduction);
            return (
              <div className="space-y-4">
                <div className="p-3 rounded-lg glass-subtle">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{payBackDeduction.staffName}</span>
                    <span className="liquid-glass-chip text-xs">{getDeductionTypeLabel(payBackDeduction.type)}</span>
                  </div>
                  {payBackDeduction.description && (
                    <p className="text-xs text-muted-foreground">{payBackDeduction.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-sm">
                    <span className="text-muted-foreground">{t("salaries.totalAmount")}: {formatCurrency(payBackDeduction.amount)} DH</span>
                    {(payBackDeduction.paidBack || 0) > 0 && (
                      <span className="text-blue-600">{t("salaries.alreadyRepaid")}: {formatCurrency(payBackDeduction.paidBack || 0)} DH</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-orange-600 mt-1">{t("salaries.remainingAmount")}: {formatCurrency(remaining)} DH</p>
                </div>
                <div>
                  <Label>{t("salaries.payBackAmount")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={remaining}
                    value={payBackInputAmount}
                    onChange={(e) => setPayBackInputAmount(e.target.value)}
                    data-testid="input-payback-amount"
                  />
                  <div className="flex gap-2 mt-2">
                    {[remaining * 0.25, remaining * 0.5, remaining].map((preset) => (
                      <Button
                        key={preset}
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => setPayBackInputAmount(String(Math.round(preset * 100) / 100))}
                        data-testid={`button-preset-${preset}`}
                      >
                        {formatCurrency(Math.round(preset * 100) / 100)}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={!payBackInputAmount || parseFloat(payBackInputAmount) <= 0 || parseFloat(payBackInputAmount) > remaining || payBackMutation.isPending}
                  onClick={() => {
                    if (payBackDeduction) {
                      payBackMutation.mutate({ id: payBackDeduction.id, amount: parseFloat(payBackInputAmount), staffName: payBackDeduction.staffName, type: payBackDeduction.type, description: payBackDeduction.description || "" });
                    }
                  }}
                  data-testid="button-confirm-payback"
                >
                  {payBackMutation.isPending ? t("common.loading") : t("salaries.confirmPayBack")}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Staff salary pay confirmation */}
      <Dialog open={!!pendingPayment} onOpenChange={(open) => { if (!open) setPendingPayment(null); }}>
        <DialogContent className="max-w-xs" data-testid="dialog-confirm-pay-staff">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              {t("salaries.markAsPaid")}
            </DialogTitle>
            <DialogDescription>
              {pendingPayment?.staffName} — {formatCurrency(pendingPayment?.amount ?? 0)} DH
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setPendingPayment(null)}
              data-testid="button-cancel-pay-staff"
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
              disabled={createPaymentMutation.isPending}
              onClick={() => {
                if (pendingPayment) {
                  createPaymentMutation.mutate(pendingPayment, {
                    onSuccess: () => setPendingPayment(null),
                    onError: () => setPendingPayment(null),
                  });
                }
              }}
              data-testid="button-confirm-pay-staff"
            >
              {createPaymentMutation.isPending
                ? <RefreshCw className="h-4 w-4 animate-spin me-1" />
                : <CheckCircle className="h-4 w-4 me-1" />
              }
              {t("salaries.markAsPaid")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Salon wallet collect confirmation */}
      <Dialog open={pendingSalonCollect !== null} onOpenChange={(open) => { if (!open) setPendingSalonCollect(null); }}>
        <DialogContent className="max-w-xs" data-testid="dialog-confirm-salon-collect">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              Collecter la recette salon
            </DialogTitle>
            <DialogDescription>
              {formatCurrency(pendingSalonCollect ?? 0)} DH
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setPendingSalonCollect(null)}
              data-testid="button-cancel-salon-collect"
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={createSalonPaymentMutation.isPending}
              onClick={() => {
                if (pendingSalonCollect !== null) {
                  createSalonPaymentMutation.mutate({ amount: pendingSalonCollect }, {
                    onSuccess: () => setPendingSalonCollect(null),
                    onError: () => setPendingSalonCollect(null),
                  });
                }
              }}
              data-testid="button-confirm-salon-collect"
            >
              {createSalonPaymentMutation.isPending
                ? <RefreshCw className="h-4 w-4 animate-spin me-1" />
                : <CheckCircle className="h-4 w-4 me-1" />
              }
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
