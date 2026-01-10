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
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [deductionsOpen, setDeductionsOpen] = useState(false);
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
    <div className="h-full flex flex-col gap-3 p-2 animate-fade-in" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-bold">{t("salaries.pageTitle")}</h1>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => {
            refetchAppointments();
            setLastUpdate(new Date());
          }}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
          <SelectTrigger className="w-28 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">{t("salaries.day")}</SelectItem>
            <SelectItem value="week">{t("salaries.week")}</SelectItem>
            <SelectItem value="month">{t("salaries.month")}</SelectItem>
          </SelectContent>
        </Select>

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

        <Select value={selectedStaff} onValueChange={setSelectedStaff}>
          <SelectTrigger className="w-28 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("salaries.allStaff")}</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
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
          </div>

          <div className="p-3 bg-green-50 rounded-lg space-y-1.5">
            <p className="text-sm font-medium">{t("salaries.staffAccount")}</p>
            <div className="flex justify-between text-sm">
              <span>{t("salaries.totalCommissionsDue")}</span>
              <span className="text-green-600">{formatCurrency(totalCommissions)}</span>
            </div>
            <div className="flex justify-between text-sm text-orange-600">
              <span>{t("salaries.totalDeductions")}</span>
              <span>-{formatCurrency(totalDeductions)}</span>
            </div>
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
            <CardTitle className="text-base">{t("salaries.serviceDetails")} - {selectedStaff}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2">
            {staffEarnings
              .find((e) => e.name === selectedStaff)
              ?.services &&
              Object.entries(
                staffEarnings.find((e) => e.name === selectedStaff)!.services
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

      <Collapsible open={commissionRatesOpen} onOpenChange={setCommissionRatesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors p-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{t("salaries.commissionRatesByService")}</CardTitle>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${commissionRatesOpen ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="p-3 pt-0 space-y-2">
              {services.map((service) => {
                const commissionPercent = service.commissionPercent ?? 50;
                const staffAmount = (service.price * commissionPercent) / 100;
                const salonAmount = service.price - staffAmount;
                const isEditing = editingServiceId === service.id;

                return (
                  <div key={service.id} className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-base">{service.name}</span>
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-16 h-8 text-sm"
                            />
                            <span className="text-sm">%</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => saveCommission(service.id)}
                              disabled={updateCommissionMutation.isPending}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={cancelEditing}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="text-sm bg-primary/10 px-2 py-0.5 rounded">{commissionPercent}%</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => startEditing(service)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("salaries.price")}:</span>
                        <span>{formatCurrency(service.price)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Staff:</span>
                        <span className="text-green-600">{formatCurrency(staffAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Salon:</span>
                        <span className="text-primary">{formatCurrency(salonAmount)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => deleteChargeMutation.mutate(charge.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
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
                <div key={deduction.id} className="p-3 bg-orange-50 rounded-lg flex justify-between items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{deduction.staffName}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-orange-100 rounded text-orange-700">{getDeductionTypeLabel(deduction.type)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground truncate">{deduction.description}</div>
                    <div className="flex gap-2 text-sm mt-0.5">
                      <span className="text-orange-600 font-semibold">{formatCurrency(deduction.amount)}</span>
                      <span className="text-muted-foreground">{format(parseISO(deduction.date), "d/M/yy")}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => deleteDeductionMutation.mutate(deduction.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
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
    </div>
  );
}
