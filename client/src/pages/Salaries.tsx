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
      const commission = Math.round((apt.total * commissionPercent) / 100);
      
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
    <div className="space-y-6 max-w-6xl mx-auto" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">{t("salaries.pageTitle")}</h1>
          <p className="text-muted-foreground">{t("salaries.pageDesc")}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
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
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
          <SelectTrigger className="w-[150px]">
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
            <Button variant="outline" className={`w-[200px] justify-start ${i18n.language === "ar" ? "text-right" : "text-left"}`}>
              <CalendarIcon className={`h-4 w-4 ${i18n.language === "ar" ? "ml-2" : "mr-2"}`} />
              {format(selectedDate, "PPP", { locale: getDateLocale() })}
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
          <SelectTrigger className="w-[180px]">
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("salaries.totalRevenue")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRevenue.toLocaleString()} {t("common.currency")}</div>
            <p className="text-xs text-muted-foreground">
              {format(start, "d MMM", { locale: getDateLocale() })} - {format(end, "d MMM yyyy", { locale: getDateLocale() })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("salaries.staffCommissions")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totalCommissions.toLocaleString()} {t("common.currency")}</div>
            <p className="text-xs text-muted-foreground">{t("salaries.amountDueToStaff")}</p>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("salaries.salonShare")}</CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{salonPortion.toLocaleString()} {t("common.currency")}</div>
            <p className="text-xs text-muted-foreground">{t("salaries.remainingForSalon")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("salaries.appointmentsCount")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAppointments}</div>
            <p className="text-xs text-muted-foreground">{t("salaries.paidAppointments")}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2 border-dashed">
        <CardHeader>
          <CardTitle className="text-xl">{t("salaries.budget")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3 p-4 bg-primary/5 rounded-lg">
              <h3 className="font-bold text-lg border-b pb-2">{t("salaries.salonAccount")}</h3>
              <div className="flex justify-between">
                <span>{t("salaries.salonRevenueShare")}:</span>
                <span className="font-semibold text-primary">{salonPortion.toLocaleString()} {t("common.currency")}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>{t("salaries.totalExpenses")}:</span>
                <span className="font-semibold">- {totalExpenses.toLocaleString()} {t("common.currency")}</span>
              </div>
              <div className="flex justify-between pt-2 border-t-2 text-lg">
                <span className="font-bold">{t("salaries.salonNetProfit")}:</span>
                <span className={`font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {netProfit.toLocaleString()} {t("common.currency")}
                </span>
              </div>
            </div>

            <div className="space-y-3 p-4 bg-green-50 rounded-lg">
              <h3 className="font-bold text-lg border-b pb-2">{t("salaries.staffAccount")}</h3>
              <div className="flex justify-between">
                <span>{t("salaries.totalCommissionsDue")}:</span>
                <span className="font-semibold text-green-600">{totalCommissions.toLocaleString()} {t("common.currency")}</span>
              </div>
              <div className="flex justify-between text-orange-600">
                <span>{t("salaries.totalDeductions")}:</span>
                <span className="font-semibold">- {totalDeductions.toLocaleString()} {t("common.currency")}</span>
              </div>
              <div className="flex justify-between pt-2 border-t-2 text-lg">
                <span className="font-bold">{t("salaries.netDueToStaff")}:</span>
                <span className={`font-bold ${netStaffPayable >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {netStaffPayable.toLocaleString()} {t("common.currency")}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("salaries.staffEarningsDetails")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.staff")}</TableHead>
                <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.appointmentsCount")}</TableHead>
                <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.totalRevenue")}</TableHead>
                <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.commissionDue")}</TableHead>
                <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.salonShare")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffEarnings.map((earning) => (
                <TableRow key={earning.name}>
                  <TableCell className="font-medium">{earning.name}</TableCell>
                  <TableCell>{earning.appointmentsCount}</TableCell>
                  <TableCell>{earning.totalRevenue.toLocaleString()} {t("common.currency")}</TableCell>
                  <TableCell className="text-green-600 font-semibold">
                    {earning.totalCommission.toLocaleString()} {t("common.currency")}
                  </TableCell>
                  <TableCell className="text-primary font-semibold">
                    {(earning.totalRevenue - earning.totalCommission).toLocaleString()} {t("common.currency")}
                  </TableCell>
                </TableRow>
              ))}
              {staffEarnings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {t("salaries.noDataForPeriod")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedStaff !== "all" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("salaries.serviceDetails")} - {selectedStaff}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.service")}</TableHead>
                  <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.commissionPercent")}</TableHead>
                  <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.times")}</TableHead>
                  <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.revenue")}</TableHead>
                  <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.commission")}</TableHead>
                  <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.salonShare")}</TableHead>
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
                      <TableCell className="font-medium">{serviceName}</TableCell>
                      <TableCell>{getServiceCommission(serviceName)}%</TableCell>
                      <TableCell>{data.count}</TableCell>
                      <TableCell>{data.revenue.toLocaleString()} {t("common.currency")}</TableCell>
                      <TableCell className="text-green-600">
                        {data.commission.toLocaleString()} {t("common.currency")}
                      </TableCell>
                      <TableCell className="text-primary">
                        {(data.revenue - data.commission).toLocaleString()} {t("common.currency")}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Collapsible open={commissionRatesOpen} onOpenChange={setCommissionRatesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle>{t("salaries.commissionRatesByService")}</CardTitle>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${commissionRatesOpen ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.service")}</TableHead>
                    <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.price")}</TableHead>
                    <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.commissionPercent")}</TableHead>
                    <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.staffCommission")}</TableHead>
                    <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.salonShare")}</TableHead>
                    <TableHead className={`${i18n.language === "ar" ? "text-right" : "text-left"} w-[100px]`}>{t("common.edit")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((service) => {
                    const commissionPercent = service.commissionPercent ?? 50;
                    const staffAmount = Math.round((service.price * commissionPercent) / 100);
                    const salonAmount = service.price - staffAmount;
                    const isEditing = editingServiceId === service.id;

                    return (
                      <TableRow key={service.id}>
                        <TableCell className="font-medium">{service.name}</TableCell>
                        <TableCell>{service.price} {t("common.currency")}</TableCell>
                        <TableCell>
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-20 h-8"
                              />
                              <span>%</span>
                            </div>
                          ) : (
                            <span>{commissionPercent}%</span>
                          )}
                        </TableCell>
                        <TableCell className="text-green-600">
                          {staffAmount} {t("common.currency")}
                        </TableCell>
                        <TableCell className="text-primary">
                          {salonAmount} {t("common.currency")}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => saveCommission(service.id)}
                                disabled={updateCommissionMutation.isPending}
                              >
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={cancelEditing}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEditing(service)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            {t("salaries.expensesAndCosts")}
          </CardTitle>
          <Dialog open={showChargeDialog} onOpenChange={setShowChargeDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className={`h-4 w-4 ${i18n.language === "ar" ? "ml-2" : "mr-2"}`} />
                {t("salaries.addExpense")}
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
                    onChange={(e) => setNewCharge({ ...newCharge, amount: parseInt(e.target.value) || 0 })}
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
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("common.type")}</TableHead>
                <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("common.description")}</TableHead>
                <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("common.amount")}</TableHead>
                <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("common.date")}</TableHead>
                <TableHead className={`${i18n.language === "ar" ? "text-right" : "text-left"} w-[60px]`}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCharges.map((charge) => (
                <TableRow key={charge.id}>
                  <TableCell>{getChargeTypeLabel(charge.type)}</TableCell>
                  <TableCell>{charge.name}</TableCell>
                  <TableCell className="text-red-600 font-semibold">{charge.amount.toLocaleString()} {t("common.currency")}</TableCell>
                  <TableCell>{format(parseISO(charge.date), "d MMM yyyy", { locale: getDateLocale() })}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => deleteChargeMutation.mutate(charge.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredCharges.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {t("salaries.noExpensesForPeriod")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <UserMinus className="h-5 w-5" />
            {t("salaries.staffDeductions")}
          </CardTitle>
          <Dialog open={showDeductionDialog} onOpenChange={setShowDeductionDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className={`h-4 w-4 ${i18n.language === "ar" ? "ml-2" : "mr-2"}`} />
                {t("salaries.addDeduction")}
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
                    onChange={(e) => setNewDeduction({ ...newDeduction, amount: parseInt(e.target.value) || 0 })}
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
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("salaries.staff")}</TableHead>
                <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("common.type")}</TableHead>
                <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("common.description")}</TableHead>
                <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("common.amount")}</TableHead>
                <TableHead className={i18n.language === "ar" ? "text-right" : "text-left"}>{t("common.date")}</TableHead>
                <TableHead className={`${i18n.language === "ar" ? "text-right" : "text-left"} w-[60px]`}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDeductions.map((deduction) => (
                <TableRow key={deduction.id}>
                  <TableCell className="font-medium">{deduction.staffName}</TableCell>
                  <TableCell>{getDeductionTypeLabel(deduction.type)}</TableCell>
                  <TableCell>{deduction.description}</TableCell>
                  <TableCell className="text-orange-600 font-semibold">{deduction.amount.toLocaleString()} {t("common.currency")}</TableCell>
                  <TableCell>{format(parseISO(deduction.date), "d MMM yyyy", { locale: getDateLocale() })}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => deleteDeductionMutation.mutate(deduction.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredDeductions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {t("salaries.noDeductionsForPeriod")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
