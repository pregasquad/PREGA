import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { DollarSign, Users, CalendarIcon, TrendingUp, Building2, Edit2, Check, X, RefreshCw, Plus, Trash2, Receipt, UserMinus, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { io, Socket } from "socket.io-client";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, parseISO, isAfter, isBefore, isEqual } from "date-fns";
import { ar, enUS, fr } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import type { Staff, Service, Appointment, Charge, StaffDeduction } from "@shared/schema";

type PeriodType = "day" | "week" | "month" | "custom";

const formatCurrency = (value: number): string => {
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export default function Salaries() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [period, setPeriod] = useState<PeriodType>("month");
  const [selectedStaff, setSelectedStaff] = useState<string>("all");
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [showChargeDialog, setShowChargeDialog] = useState(false);
  const [showDeductionDialog, setShowDeductionDialog] = useState(false);
  const [commissionRatesOpen, setCommissionRatesOpen] = useState(false);
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
    refetchInterval: 30000,
  });

  const { data: charges = [] } = useQuery<Charge[]>({
    queryKey: ["/api/charges"],
  });

  const { data: deductions = [] } = useQuery<StaffDeduction[]>({
    queryKey: ["/api/staff-deductions"],
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

  const updateCommissionMutation = useMutation({
    mutationFn: async ({ id, commissionPercent }: { id: number; commissionPercent: number }) => {
      const res = await apiRequest("PATCH", `/api/services/${id}`, { commissionPercent });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      setEditingServiceId(null);
      setEditValue("");
    },
  });

  const startEditing = (service: Service) => {
    setEditingServiceId(service.id);
    setEditValue(String(service.commissionPercent ?? 50));
  };

  const saveCommission = (id: number) => {
    const value = parseInt(editValue);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      updateCommissionMutation.mutate({ id, commissionPercent: value });
    }
  };

  const cancelEditing = () => {
    setEditingServiceId(null);
    setEditValue("");
  };

  const getDateRange = () => {
    switch (period) {
      case "day":
        return { start: selectedDate, end: selectedDate };
      case "week":
        return { start: startOfWeek(selectedDate, { weekStartsOn: 0 }), end: endOfWeek(selectedDate, { weekStartsOn: 0 }) };
      case "month":
        return { start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) };
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
    const staffMatch = selectedStaff === "all" || apt.staff === selectedStaff;
    return inRange && staffMatch && apt.paid === true;
  });

  const getServiceCommission = (serviceName: string): number => {
    const service = services.find((s) => s.name === serviceName);
    return service?.commissionPercent ?? 50;
  };

  const calculateStaffEarnings = () => {
    const earnings: Record<string, { 
      name: string; 
      totalRevenue: number; 
      totalCommission: number; 
      appointmentsCount: number;
      services: Record<string, { count: number; revenue: number; commission: number }>;
    }> = {};

    staff.forEach((s) => {
      earnings[s.name] = { 
        name: s.name, 
        totalRevenue: 0, 
        totalCommission: 0, 
        appointmentsCount: 0,
        services: {}
      };
    });

    filteredAppointments.forEach((apt) => {
      if (!earnings[apt.staff]) {
        earnings[apt.staff] = { 
          name: apt.staff, 
          totalRevenue: 0, 
          totalCommission: 0, 
          appointmentsCount: 0,
          services: {}
        };
      }
      
      const commissionPercent = getServiceCommission(apt.service);
      const commission = (apt.total * commissionPercent) / 100;
      
      earnings[apt.staff].totalRevenue += apt.total;
      earnings[apt.staff].totalCommission += commission;
      earnings[apt.staff].appointmentsCount += 1;

      if (!earnings[apt.staff].services[apt.service]) {
        earnings[apt.staff].services[apt.service] = { count: 0, revenue: 0, commission: 0 };
      }
      earnings[apt.staff].services[apt.service].count += 1;
      earnings[apt.staff].services[apt.service].revenue += apt.total;
      earnings[apt.staff].services[apt.service].commission += commission;
    });

    return Object.values(earnings).filter(e => e.appointmentsCount > 0 || staff.some(s => s.name === e.name));
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
    const staffMatch = selectedStaff === "all" || d.staffName === selectedStaff;
    return staffMatch &&
           (isAfter(deductionDate, startOfDay(start)) || isEqual(deductionDate, startOfDay(start))) &&
           (isBefore(deductionDate, endOfDay(end)) || isEqual(deductionDate, endOfDay(end)));
  });

  const totalExpenses = filteredCharges.reduce((sum, c) => sum + c.amount, 0);
  const totalDeductions = filteredDeductions.reduce((sum, d) => sum + d.amount, 0);
  const netProfit = salonPortion - totalExpenses;
  const netStaffPayable = totalCommissions - totalDeductions;

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
    <div className="space-y-4 md:space-y-6 max-w-6xl mx-auto px-2 md:px-0" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-display font-bold">{t("salaries.pageTitle")}</h1>
          <p className="text-sm md:text-base text-muted-foreground">{t("salaries.pageDesc")}</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {t("salaries.lastUpdate")}: {format(lastUpdate, "HH:mm:ss", { locale: getDateLocale() })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchAppointments();
              setLastUpdate(new Date());
            }}
          >
            <RefreshCw className={`h-4 w-4 ${i18n.language === "ar" ? "ml-2" : "mr-2"}`} />
            <span className="hidden sm:inline">{t("common.refresh")}</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
          <SelectTrigger className="w-[100px] sm:w-[130px] h-9 text-xs sm:text-sm">
            <SelectValue placeholder={t("salaries.period")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">{t("salaries.day")}</SelectItem>
            <SelectItem value="week">{t("salaries.week")}</SelectItem>
            <SelectItem value="month">{t("salaries.month")}</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={`w-auto min-w-[120px] sm:min-w-[160px] justify-start text-xs sm:text-sm h-9 ${i18n.language === "ar" ? "text-right" : "text-left"}`}>
              <CalendarIcon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${i18n.language === "ar" ? "ml-1.5" : "mr-1.5"}`} />
              <span className="truncate">{format(selectedDate, "d MMM yy", { locale: getDateLocale() })}</span>
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

        <Select value={selectedStaff} onValueChange={setSelectedStaff}>
          <SelectTrigger className="w-[100px] sm:w-[140px] h-9 text-xs sm:text-sm">
            <SelectValue placeholder={t("salaries.staff")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("salaries.allStaff")}</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
            <CardTitle className="text-xs sm:text-sm font-medium">{t("salaries.totalRevenue")}</CardTitle>
            <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-lg sm:text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
              {format(start, "d/M", { locale: getDateLocale() })} - {format(end, "d/M", { locale: getDateLocale() })}
            </p>
          </CardContent>
        </Card>

        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
            <CardTitle className="text-xs sm:text-sm font-medium">{t("salaries.staffCommissions")}</CardTitle>
            <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-lg sm:text-2xl font-bold text-green-600">{formatCurrency(totalCommissions)}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{t("salaries.amountDueToStaff")}</p>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20 p-0">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
            <CardTitle className="text-xs sm:text-sm font-medium">{t("salaries.salonShare")}</CardTitle>
            <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-lg sm:text-2xl font-bold text-primary">{formatCurrency(salonPortion)}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{t("salaries.remainingForSalon")}</p>
          </CardContent>
        </Card>

        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
            <CardTitle className="text-xs sm:text-sm font-medium">{t("salaries.appointmentsCount")}</CardTitle>
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-lg sm:text-2xl font-bold">{totalAppointments}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{t("salaries.paidAppointments")}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2 border-dashed">
        <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-4">
          <CardTitle className="text-base sm:text-xl">{t("salaries.budget")}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
            <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 bg-primary/5 rounded-lg">
              <h3 className="font-bold text-sm sm:text-lg border-b pb-2">{t("salaries.salonAccount")}</h3>
              <div className="flex justify-between text-xs sm:text-base">
                <span>{t("salaries.salonRevenueShare")}:</span>
                <span className="font-semibold text-primary">{formatCurrency(salonPortion)}</span>
              </div>
              <div className="flex justify-between text-red-600 text-xs sm:text-base">
                <span>{t("salaries.totalExpenses")}:</span>
                <span className="font-semibold">- {formatCurrency(totalExpenses)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t-2 text-sm sm:text-lg">
                <span className="font-bold">{t("salaries.salonNetProfit")}:</span>
                <span className={`font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(netProfit)}
                </span>
              </div>
            </div>

            <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 bg-green-50 rounded-lg">
              <h3 className="font-bold text-sm sm:text-lg border-b pb-2">{t("salaries.staffAccount")}</h3>
              <div className="flex justify-between text-xs sm:text-base">
                <span>{t("salaries.totalCommissionsDue")}:</span>
                <span className="font-semibold text-green-600">{formatCurrency(totalCommissions)}</span>
              </div>
              <div className="flex justify-between text-orange-600 text-xs sm:text-base">
                <span>{t("salaries.totalDeductions")}:</span>
                <span className="font-semibold">- {formatCurrency(totalDeductions)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t-2 text-sm sm:text-lg">
                <span className="font-bold">{t("salaries.netDueToStaff")}:</span>
                <span className={`font-bold ${netStaffPayable >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(netStaffPayable)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-sm sm:text-base">{t("salaries.staffEarningsDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("salaries.staff")}</TableHead>
                  <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>#</TableHead>
                  <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("salaries.totalRevenue")}</TableHead>
                  <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("salaries.commissionDue")}</TableHead>
                  <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("salaries.salonShare")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffEarnings.map((earning) => (
                  <TableRow key={earning.name}>
                    <TableCell className="font-medium text-xs sm:text-sm whitespace-nowrap">{earning.name}</TableCell>
                    <TableCell className="text-xs sm:text-sm">{earning.appointmentsCount}</TableCell>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap">{formatCurrency(earning.totalRevenue)}</TableCell>
                    <TableCell className="text-green-600 font-semibold text-xs sm:text-sm whitespace-nowrap">
                      {formatCurrency(earning.totalCommission)}
                    </TableCell>
                    <TableCell className="text-primary font-semibold text-xs sm:text-sm whitespace-nowrap">
                      {formatCurrency(earning.totalRevenue - earning.totalCommission)}
                    </TableCell>
                  </TableRow>
                ))}
                {staffEarnings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-sm">
                      {t("salaries.noDataForPeriod")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selectedStaff !== "all" && (
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-sm sm:text-base">{t("salaries.serviceDetails")} - {selectedStaff}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 sm:pt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("salaries.service")}</TableHead>
                    <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>%</TableHead>
                    <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>#</TableHead>
                    <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("salaries.revenue")}</TableHead>
                    <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("salaries.commission")}</TableHead>
                    <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("salaries.salonShare")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffEarnings
                    .find((e) => e.name === selectedStaff)
                    ?.services &&
                    Object.entries(
                      staffEarnings.find((e) => e.name === selectedStaff)!.services
                    ).map(([serviceName, data]) => (
                      <TableRow key={serviceName}>
                        <TableCell className="font-medium text-xs sm:text-sm">{serviceName}</TableCell>
                        <TableCell className="text-xs sm:text-sm">{getServiceCommission(serviceName)}%</TableCell>
                        <TableCell className="text-xs sm:text-sm">{data.count}</TableCell>
                        <TableCell className="text-xs sm:text-sm whitespace-nowrap">{formatCurrency(data.revenue)}</TableCell>
                        <TableCell className="text-green-600 text-xs sm:text-sm whitespace-nowrap">
                          {formatCurrency(data.commission)}
                        </TableCell>
                        <TableCell className="text-primary text-xs sm:text-sm whitespace-nowrap">
                          {formatCurrency(data.revenue - data.commission)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Collapsible open={commissionRatesOpen} onOpenChange={setCommissionRatesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm sm:text-base">{t("salaries.commissionRatesByService")}</CardTitle>
                <ChevronDown className={`h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground transition-transform duration-200 ${commissionRatesOpen ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("salaries.service")}</TableHead>
                      <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("salaries.price")}</TableHead>
                      <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>%</TableHead>
                      <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("salaries.staffCommission")}</TableHead>
                      <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("salaries.salonShare")}</TableHead>
                      <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"} w-[60px] sm:w-[100px]`}></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.map((service) => {
                      const commissionPercent = service.commissionPercent ?? 50;
                      const staffAmount = (service.price * commissionPercent) / 100;
                      const salonAmount = service.price - staffAmount;
                      const isEditing = editingServiceId === service.id;

                      return (
                        <TableRow key={service.id}>
                          <TableCell className="font-medium text-xs sm:text-sm">{service.name}</TableCell>
                          <TableCell className="text-xs sm:text-sm whitespace-nowrap">{service.price}</TableCell>
                          <TableCell className="text-xs sm:text-sm">
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="w-14 sm:w-20 h-7 sm:h-8 text-xs sm:text-sm"
                                />
                                <span>%</span>
                              </div>
                            ) : (
                              <span>{commissionPercent}%</span>
                            )}
                          </TableCell>
                          <TableCell className="text-green-600 text-xs sm:text-sm whitespace-nowrap">
                            {formatCurrency(staffAmount)}
                          </TableCell>
                          <TableCell className="text-primary text-xs sm:text-sm whitespace-nowrap">
                            {formatCurrency(salonAmount)}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">
                            {isEditing ? (
                              <div className="flex gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 sm:h-8 sm:w-8"
                                  onClick={() => saveCommission(service.id)}
                                  disabled={updateCommissionMutation.isPending}
                                >
                                  <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 sm:h-8 sm:w-8"
                                  onClick={cancelEditing}
                                >
                                  <X className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-destructive" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 sm:h-8 sm:w-8"
                                onClick={() => startEditing(service)}
                              >
                                <Edit2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              </Button>
                            )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Receipt className="h-4 w-4 sm:h-5 sm:w-5" />
            {t("salaries.expensesAndCosts")}
          </CardTitle>
          <Dialog open={showChargeDialog} onOpenChange={setShowChargeDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3">
                <Plus className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${i18n.language === "ar" ? "ml-1" : "mr-1"}`} />
                <span className="hidden sm:inline">{t("salaries.addExpense")}</span>
                <span className="sm:hidden">+</span>
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
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("common.type")}</TableHead>
                  <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("common.description")}</TableHead>
                  <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("common.amount")}</TableHead>
                  <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("common.date")}</TableHead>
                  <TableHead className={`text-xs sm:text-sm ${i18n.language === "ar" ? "text-right" : "text-left"} w-[40px]`}></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCharges.map((charge) => (
                  <TableRow key={charge.id}>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap">{getChargeTypeLabel(charge.type)}</TableCell>
                    <TableCell className="text-xs sm:text-sm">{charge.name}</TableCell>
                    <TableCell className="text-red-600 font-semibold text-xs sm:text-sm whitespace-nowrap">{formatCurrency(charge.amount)}</TableCell>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap">{format(parseISO(charge.date), "d/M/yy", { locale: getDateLocale() })}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8"
                        onClick={() => deleteChargeMutation.mutate(charge.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredCharges.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-sm">
                      {t("salaries.noExpensesForPeriod")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <UserMinus className="h-4 w-4 sm:h-5 sm:w-5" />
            {t("salaries.staffDeductions")}
          </CardTitle>
          <Dialog open={showDeductionDialog} onOpenChange={setShowDeductionDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3">
                <Plus className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${i18n.language === "ar" ? "ml-1" : "mr-1"}`} />
                <span className="hidden sm:inline">{t("salaries.addDeduction")}</span>
                <span className="sm:hidden">+</span>
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
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("salaries.staff")}</TableHead>
                  <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("common.type")}</TableHead>
                  <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("common.description")}</TableHead>
                  <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("common.amount")}</TableHead>
                  <TableHead className={`text-xs sm:text-sm whitespace-nowrap ${i18n.language === "ar" ? "text-right" : "text-left"}`}>{t("common.date")}</TableHead>
                  <TableHead className={`text-xs sm:text-sm ${i18n.language === "ar" ? "text-right" : "text-left"} w-[40px]`}></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeductions.map((deduction) => (
                  <TableRow key={deduction.id}>
                    <TableCell className="font-medium text-xs sm:text-sm whitespace-nowrap">{deduction.staffName}</TableCell>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap">{getDeductionTypeLabel(deduction.type)}</TableCell>
                    <TableCell className="text-xs sm:text-sm">{deduction.description}</TableCell>
                    <TableCell className="text-orange-600 font-semibold text-xs sm:text-sm whitespace-nowrap">{formatCurrency(deduction.amount)}</TableCell>
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap">{format(parseISO(deduction.date), "d/M/yy", { locale: getDateLocale() })}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8"
                        onClick={() => deleteDeductionMutation.mutate(deduction.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredDeductions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8 text-sm">
                      {t("salaries.noDeductionsForPeriod")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
