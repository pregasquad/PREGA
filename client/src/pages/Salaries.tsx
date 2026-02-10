import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DollarSign, Users, CalendarIcon, TrendingUp, Building2, RefreshCw, Plus, Trash2, Receipt, UserMinus, ChevronDown, CheckCircle, Pencil, Wallet } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { io, Socket } from "socket.io-client";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, parseISO, isAfter, isBefore, isEqual } from "date-fns";
import { ar, enUS, fr } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import type { Staff, Service, Appointment, Charge, StaffDeduction, StaffPayment } from "@shared/schema";

type PeriodType = "day" | "week" | "month" | "custom";


export default function Salaries() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [period, setPeriod] = useState<PeriodType>("day");
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
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
  const [newCharge, setNewCharge] = useState({ type: "rent", name: "", amount: 0, date: format(new Date(), "yyyy-MM-dd") });
  const [newDeduction, setNewDeduction] = useState<{ staffName: string; type: "advance" | "loan" | "penalty" | "other"; description: string; amount: number; date: string }>({ staffName: "", type: "advance", description: "", amount: 0, date: format(new Date(), "yyyy-MM-dd") });

  const getDateLocale = () => {
    switch (i18n.language) {
      case "ar": return ar;
      case "fr": return fr;
      default: return enUS;
    }
  };

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

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: appointments = [], refetch: refetchAppointments } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments/all"],
    queryFn: async () => {
      const res = await fetch("/api/appointments/all");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: charges = [] } = useQuery<Charge[]>({
    queryKey: ["/api/charges"],
  });

  const { data: deductions = [] } = useQuery<StaffDeduction[]>({
    queryKey: ["/api/staff-deductions"],
  });

  const { data: staffCommissions = [] } = useQuery<{ id: number; staffId: number; serviceId: number; percentage: number }[]>({
    queryKey: ["/api/staff-commissions"],
  });

  const { data: staffPayments = [] } = useQuery<StaffPayment[]>({
    queryKey: ["/api/staff-payments"],
  });

  const createChargeMutation = useMutation({
    mutationFn: async (charge: typeof newCharge) => {
      const res = await apiRequest("POST", "/api/charges", charge);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
      setShowChargeDialog(false);
      setNewCharge({ type: "rent", name: "", amount: 0, date: format(new Date(), "yyyy-MM-dd") });
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
      setNewDeduction({ staffName: "", type: "advance", description: "", amount: 0, date: format(new Date(), "yyyy-MM-dd") });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-payments"] });
      toast({ title: t("salaries.paymentRecorded") });
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

    return isBefore(deductionDate, endOfDay(end)) || isEqual(deductionDate, endOfDay(end));
  });

  const paidBackDeductions = filteredDeductions.filter(d => d.cleared);
  const pendingDeductions = filteredDeductions.filter(d => !d.cleared);
  const totalPaidBack = paidBackDeductions.reduce((sum, d) => sum + d.amount, 0);
  const totalPending = pendingDeductions.reduce((sum, d) => sum + d.amount, 0);
  const totalExpenses = filteredCharges.reduce((sum, c) => sum + c.amount, 0);
  const totalDeductions = filteredDeductions.reduce((sum, d) => sum + d.amount, 0);
  const netProfit = salonPortion + totalPaidBack - totalExpenses;
  const netStaffPayable = totalCommissions - totalPending;

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

  return (
    <div className="h-full flex flex-col gap-3 p-2 animate-fade-in" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-bold">{t("salaries.pageTitle")}</h1>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
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
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {unclearedDeductions.length > 0 && (
        <Collapsible open={unclearedOpen} onOpenChange={setUnclearedOpen}>
          <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800">
            <CollapsibleTrigger asChild>
              <CardHeader className="flex flex-row items-center justify-between p-3 pb-2 cursor-pointer hover:bg-orange-100/50 dark:hover:bg-orange-900/20 transition-colors">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4 text-orange-600" />
                  <span className="text-orange-700 dark:text-orange-400">{t("salaries.unclearedDeductions")}</span>
                  <span className="text-sm font-normal text-orange-600/70">({unclearedDeductions.length})</span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-orange-600 font-bold text-sm">{formatCurrency(totalUncleared)} DH</span>
                  <ChevronDown className={`h-4 w-4 text-orange-600 transition-transform ${unclearedOpen ? "rotate-180" : ""}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-3 pt-0 space-y-2">
                <p className="text-xs text-orange-600/70 dark:text-orange-400/70 mb-2">{t("salaries.unclearedDeductionsDesc")}</p>
                {unclearedDeductions.map((d) => (
                  <div key={d.id} className="p-3 bg-white/60 dark:bg-white/5 rounded-lg flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{d.staffName}</span>
                        <span className="text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/40 rounded text-orange-700 dark:text-orange-400">{getDeductionTypeLabel(d.type)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{d.description}</div>
                      <div className="flex gap-2 text-sm mt-0.5">
                        <span className="text-orange-600 font-semibold">{formatCurrency(d.amount)} DH</span>
                        <span className="text-muted-foreground">{format(parseISO(d.date), "d/M/yy")}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30 shrink-0"
                      disabled={clearDeductionMutation.isPending}
                      onClick={() => clearDeductionMutation.mutate(d.id)}
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
          <SelectTrigger className="w-28 h-9 text-sm">
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
              <Button variant="outline" size="sm" className="h-9 text-sm px-3">
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
                <Button variant="outline" size="sm" className="h-9 text-sm px-3">
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
            <span className="text-muted-foreground self-center">→</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 text-sm px-3">
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
          <SelectTrigger className="w-28 h-9 text-sm">
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

      <div className="grid grid-cols-2 gap-2">
        <Card>
          <CardContent className="p-3">
            <p className="text-sm text-muted-foreground">{t("salaries.totalRevenue")}</p>
            <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-sm text-muted-foreground">{t("salaries.staffCommissions")}</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalCommissions)}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5">
          <CardContent className="p-3">
            <p className="text-sm text-muted-foreground">{t("salaries.salonShare")}</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(salonPortion)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-sm text-muted-foreground">{t("salaries.appointmentsCount")}</p>
            <p className="text-2xl font-bold">{totalAppointments}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-base">{t("salaries.budget")}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          <div className="p-3 bg-primary/5 rounded-lg space-y-1.5">
            <p className="text-sm font-medium">{t("salaries.salonAccount")}</p>
            <div className="flex justify-between text-sm">
              <span>{t("salaries.salonRevenueShare")}</span>
              <span className="text-primary">{formatCurrency(salonPortion)}</span>
            </div>
            {totalPaidBack > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>{t("salaries.paidBackDeductions")}</span>
                <span>+{formatCurrency(totalPaidBack)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-red-600">
              <span>{t("salaries.totalExpenses")}</span>
              <span>-{formatCurrency(totalExpenses)}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t pt-1">
              <span>{t("salaries.salonNetProfit")}</span>
              <span className={netProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                {formatCurrency(netProfit)}
              </span>
            </div>
            {totalPending > 0 && (
              <div className="flex justify-between text-sm text-orange-600 dark:text-orange-400 border-t pt-1">
                <span>{t("salaries.pendingDeductions")}</span>
                <span>{formatCurrency(totalPending)}</span>
              </div>
            )}
          </div>

          <div className="p-3 bg-green-50 rounded-lg space-y-1.5">
            <p className="text-sm font-medium">{t("salaries.staffAccount")}</p>
            <div className="flex justify-between text-sm">
              <span>{t("salaries.totalCommissionsDue")}</span>
              <span className="text-green-600">{formatCurrency(totalCommissions)}</span>
            </div>
            {totalPending > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>{t("salaries.totalDeductions")}</span>
                <span>-{formatCurrency(totalPending)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold border-t pt-1">
              <span>{t("salaries.netDueToStaff")}</span>
              <span className={netStaffPayable >= 0 ? 'text-green-600' : 'text-red-600'}>
                {formatCurrency(netStaffPayable)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" />
            {t("salaries.employeeWallet")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          {staff.map((s) => {
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
                  const aptDate = startOfDay(parseISO(apt.date));
                  const paymentDay = startOfDay(lastPaymentDate);
                  return isAfter(aptDate, paymentDay);
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

            return (
              <div key={s.id} className="p-3 bg-muted/50 rounded-lg" data-testid={`wallet-staff-${s.id}`}>
                <div className="flex justify-between items-center">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-base">{s.name}</span>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t("salaries.lastPaid")}: {lastPaymentDate ? format(lastPaymentDate, "d/M/yy") : t("salaries.never")}
                    </div>
                    <div className="flex gap-3 mt-1 text-sm">
                      <span className="text-green-600">{formatCurrency(earningsSincePayment)}</span>
                      {pendingStaffDeductions > 0 && (
                        <span className="text-red-600">-{formatCurrency(pendingStaffDeductions)}</span>
                      )}
                    </div>
                    <div className="text-base font-bold mt-0.5">
                      <span className={walletBalance >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {t("salaries.walletBalance")}: {formatCurrency(walletBalance)}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-green-300 text-green-700 dark:border-green-700 dark:text-green-400"
                    disabled={walletBalance <= 0 || createPaymentMutation.isPending}
                    onClick={() => createPaymentMutation.mutate({
                      staffId: s.id,
                      staffName: s.name,
                      amount: walletBalance,
                    })}
                    data-testid={`button-pay-staff-${s.id}`}
                  >
                    <CheckCircle className="h-3 w-3 me-1" />
                    {t("salaries.markAsPaid")}
                  </Button>
                </div>
              </div>
            );
          })}
          {staff.length === 0 && (
            <p className="text-center text-muted-foreground py-4 text-sm">
              {t("salaries.noEarnings")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-base">{t("salaries.staffEarningsDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          {staffEarnings.map((earning) => (
            <div key={earning.name} className="p-3 bg-muted/50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-medium text-base">{earning.name}</span>
                <span className="text-sm text-muted-foreground">{earning.appointmentsCount} rdv</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rev:</span>
                  <span>{formatCurrency(earning.totalRevenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Com:</span>
                  <span className="text-green-600">{formatCurrency(earning.totalCommission)}</span>
                </div>
              </div>
            </div>
          ))}
          {staffEarnings.length === 0 && (
            <p className="text-center text-muted-foreground py-4 text-sm">
              {t("salaries.noDataForPeriod")}
            </p>
          )}
        </CardContent>
      </Card>

      {selectedStaff !== "all" && (
        <Card>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-base">{t("salaries.serviceDetails")} - {staff.find(s => s.id === parseInt(selectedStaff))?.name}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2">
            {staffEarnings
              .find((e) => e.name === staff.find(s => s.id === parseInt(selectedStaff))?.name)
              ?.services &&
              Object.entries(
                staffEarnings.find((e) => e.name === staff.find(s => s.id === parseInt(selectedStaff))?.name)!.services
              ).map(([serviceName, data]) => (
                <div key={serviceName} className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{serviceName}</span>
                    <span className="text-sm text-muted-foreground">{getServiceCommission(serviceName)}% | x{data.count}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rev:</span>
                      <span>{formatCurrency(data.revenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Com:</span>
                      <span className="text-green-600">{formatCurrency(data.commission)}</span>
                    </div>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      <Collapsible open={expensesOpen} onOpenChange={setExpensesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="flex flex-row items-center justify-between p-3 pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4" />
                {t("salaries.expensesAndCosts")}
                <span className="text-sm font-normal text-muted-foreground">({filteredCharges.length})</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Dialog open={showChargeDialog} onOpenChange={setShowChargeDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="h-8 text-sm px-3" onClick={(e) => e.stopPropagation()}>
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
                          <SelectTrigger>
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
                        />
                      </div>
                      <div>
                        <Label>{t("salaries.amountDH")}</Label>
                        <Input
                          type="number"
                          value={newCharge.amount || ""}
                          onChange={(e) => setNewCharge({ ...newCharge, amount: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <Label>{t("common.date")}</Label>
                        <Input
                          type="date"
                          value={newCharge.date}
                          onChange={(e) => setNewCharge({ ...newCharge, date: e.target.value })}
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => createChargeMutation.mutate(newCharge)}
                        disabled={!newCharge.name || !newCharge.amount || createChargeMutation.isPending}
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
            <CardContent className="p-3 pt-0 space-y-2">
              {filteredCharges.map((charge) => (
                <div key={charge.id} className="p-3 bg-red-50 rounded-lg flex justify-between items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{charge.name}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-red-100 rounded text-red-700">{getChargeTypeLabel(charge.type)}</span>
                    </div>
                    <div className="flex gap-2 text-sm mt-0.5">
                      <span className="text-red-600 font-semibold">{formatCurrency(charge.amount)}</span>
                      <span className="text-muted-foreground">{format(parseISO(charge.date), "d/M/yy")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingCharge(charge)}
                    >
                      <Pencil className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => deleteChargeMutation.mutate(charge.id)}
                    >
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

      <Collapsible open={deductionsOpen} onOpenChange={setDeductionsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="flex flex-row items-center justify-between p-3 pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserMinus className="h-4 w-4" />
                {t("salaries.staffDeductions")}
                <span className="text-sm font-normal text-muted-foreground">({filteredDeductions.length})</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Dialog open={showDeductionDialog} onOpenChange={setShowDeductionDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="h-8 text-sm px-3" onClick={(e) => e.stopPropagation()}>
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
                          <SelectTrigger>
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
                          <SelectTrigger>
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
                        />
                      </div>
                      <div>
                        <Label>{t("salaries.amountDH")}</Label>
                        <Input
                          type="number"
                          value={newDeduction.amount || ""}
                          onChange={(e) => setNewDeduction({ ...newDeduction, amount: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <Label>{t("common.date")}</Label>
                        <Input
                          type="date"
                          value={newDeduction.date}
                          onChange={(e) => setNewDeduction({ ...newDeduction, date: e.target.value })}
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => createDeductionMutation.mutate(newDeduction)}
                        disabled={!newDeduction.staffName || !newDeduction.description || !newDeduction.amount || createDeductionMutation.isPending}
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
            <CardContent className="p-3 pt-0 space-y-2">
              {filteredDeductions.map((deduction) => (
                <div key={deduction.id} className={`p-3 rounded-lg flex justify-between items-center ${deduction.cleared ? 'bg-green-50 dark:bg-green-950/20' : 'bg-sky-50 dark:bg-sky-950/20'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{deduction.staffName}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-sky-100 dark:bg-sky-900/40 rounded text-sky-700 dark:text-sky-400">{getDeductionTypeLabel(deduction.type)}</span>
                      {deduction.cleared ? (
                        <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/40 rounded text-green-700 dark:text-green-400">{t("salaries.paidBack")}</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/40 rounded text-orange-700 dark:text-orange-400">{t("salaries.pending")}</span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">{deduction.description}</div>
                    <div className="flex gap-2 text-sm mt-0.5">
                      <span className={`font-semibold ${deduction.cleared ? 'text-green-600' : 'text-sky-600'}`}>{formatCurrency(deduction.amount)}</span>
                      <span className="text-muted-foreground">{format(parseISO(deduction.date), "d/M/yy")}</span>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingDeduction(deduction)}
                    >
                      <Pencil className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteDeductionMutation.mutate(deduction.id)}
                    >
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
                  <SelectTrigger>
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
                />
              </div>
              <div>
                <Label>{t("salaries.amountDH")}</Label>
                <Input
                  type="number"
                  value={editingCharge.amount || ""}
                  onChange={(e) => setEditingCharge({ ...editingCharge, amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>{t("common.date")}</Label>
                <Input
                  type="date"
                  value={editingCharge.date}
                  onChange={(e) => setEditingCharge({ ...editingCharge, date: e.target.value })}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => updateChargeMutation.mutate({ id: editingCharge.id, data: { type: editingCharge.type, name: editingCharge.name, amount: editingCharge.amount, date: editingCharge.date } })}
                disabled={!editingCharge.name || !editingCharge.amount || updateChargeMutation.isPending}
              >
                {t("common.save")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                  <SelectTrigger>
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
                  <SelectTrigger>
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
                />
              </div>
              <div>
                <Label>{t("salaries.amountDH")}</Label>
                <Input
                  type="number"
                  value={editingDeduction.amount || ""}
                  onChange={(e) => setEditingDeduction({ ...editingDeduction, amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>{t("common.date")}</Label>
                <Input
                  type="date"
                  value={editingDeduction.date}
                  onChange={(e) => setEditingDeduction({ ...editingDeduction, date: e.target.value })}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => updateDeductionMutation.mutate({ id: editingDeduction.id, data: { staffName: editingDeduction.staffName, type: editingDeduction.type, description: editingDeduction.description, amount: editingDeduction.amount, date: editingDeduction.date } })}
                disabled={!editingDeduction.staffName || !editingDeduction.description || !editingDeduction.amount || updateDeductionMutation.isPending}
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
