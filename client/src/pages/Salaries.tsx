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
import { io, Socket } from "socket.io-client";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, parseISO, isAfter, isBefore, isEqual } from "date-fns";
import { ar } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import type { Staff, Service, Appointment, Charge, StaffDeduction } from "@shared/schema";

type PeriodType = "day" | "week" | "month" | "custom";

export default function Salaries() {
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

  // Calculate filtered expenses and deductions
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

  return (
    <div className="space-y-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">الرواتب والعمولات</h1>
          <p className="text-muted-foreground">حساب أرباح الموظفين بناءً على الخدمات المقدمة</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            آخر تحديث: {format(lastUpdate, "HH:mm:ss", { locale: ar })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchAppointments();
              setLastUpdate(new Date());
            }}
          >
            <RefreshCw className="h-4 w-4 ml-2" />
            تحديث
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="الفترة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">يوم</SelectItem>
            <SelectItem value="week">أسبوع</SelectItem>
            <SelectItem value="month">شهر</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[200px] justify-start text-right">
              <CalendarIcon className="ml-2 h-4 w-4" />
              {format(selectedDate, "PPP", { locale: ar })}
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
            <SelectValue placeholder="الموظف" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الموظفين</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRevenue.toLocaleString()} د.م</div>
            <p className="text-xs text-muted-foreground">
              {format(start, "d MMM", { locale: ar })} - {format(end, "d MMM yyyy", { locale: ar })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">عمولات الموظفين</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totalCommissions.toLocaleString()} د.م</div>
            <p className="text-xs text-muted-foreground">المبلغ المستحق للموظفين</p>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">حصة الصالون</CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{salonPortion.toLocaleString()} د.م</div>
            <p className="text-xs text-muted-foreground">الباقي للصالون بعد العمولات</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">عدد المواعيد</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAppointments}</div>
            <p className="text-xs text-muted-foreground">المواعيد المدفوعة</p>
          </CardContent>
        </Card>
      </div>

      {/* الميزانية - Budget Summary */}
      <Card className="border-2 border-dashed">
        <CardHeader>
          <CardTitle className="text-xl">الميزانية</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Salon Side */}
            <div className="space-y-3 p-4 bg-primary/5 rounded-lg">
              <h3 className="font-bold text-lg border-b pb-2">حساب الصالون</h3>
              <div className="flex justify-between">
                <span>حصة الصالون من الإيرادات:</span>
                <span className="font-semibold text-primary">{salonPortion.toLocaleString()} د.م</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>إجمالي المصاريف:</span>
                <span className="font-semibold">- {totalExpenses.toLocaleString()} د.م</span>
              </div>
              <div className="flex justify-between pt-2 border-t-2 text-lg">
                <span className="font-bold">صافي ربح الصالون:</span>
                <span className={`font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {netProfit.toLocaleString()} د.م
                </span>
              </div>
            </div>

            {/* Staff Side */}
            <div className="space-y-3 p-4 bg-green-50 rounded-lg">
              <h3 className="font-bold text-lg border-b pb-2">حساب الموظفين</h3>
              <div className="flex justify-between">
                <span>إجمالي العمولات المستحقة:</span>
                <span className="font-semibold text-green-600">{totalCommissions.toLocaleString()} د.م</span>
              </div>
              <div className="flex justify-between text-orange-600">
                <span>إجمالي الخصومات:</span>
                <span className="font-semibold">- {totalDeductions.toLocaleString()} د.م</span>
              </div>
              <div className="flex justify-between pt-2 border-t-2 text-lg">
                <span className="font-bold">صافي المستحق للموظفين:</span>
                <span className={`font-bold ${netStaffPayable >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {netStaffPayable.toLocaleString()} د.م
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>تفاصيل أرباح الموظفين</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الموظف</TableHead>
                <TableHead className="text-right">عدد المواعيد</TableHead>
                <TableHead className="text-right">إجمالي الإيرادات</TableHead>
                <TableHead className="text-right">العمولة المستحقة</TableHead>
                <TableHead className="text-right">حصة الصالون</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffEarnings.map((earning) => (
                <TableRow key={earning.name}>
                  <TableCell className="font-medium">{earning.name}</TableCell>
                  <TableCell>{earning.appointmentsCount}</TableCell>
                  <TableCell>{earning.totalRevenue.toLocaleString()} د.م</TableCell>
                  <TableCell className="text-green-600 font-semibold">
                    {earning.totalCommission.toLocaleString()} د.م
                  </TableCell>
                  <TableCell className="text-primary font-semibold">
                    {(earning.totalRevenue - earning.totalCommission).toLocaleString()} د.م
                  </TableCell>
                </TableRow>
              ))}
              {staffEarnings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    لا توجد بيانات للفترة المحددة
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
            <CardTitle>تفاصيل الخدمات - {selectedStaff}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الخدمة</TableHead>
                  <TableHead className="text-right">نسبة العمولة</TableHead>
                  <TableHead className="text-right">عدد المرات</TableHead>
                  <TableHead className="text-right">الإيرادات</TableHead>
                  <TableHead className="text-right">العمولة</TableHead>
                  <TableHead className="text-right">حصة الصالون</TableHead>
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
                      <TableCell>{data.revenue.toLocaleString()} د.م</TableCell>
                      <TableCell className="text-green-600">
                        {data.commission.toLocaleString()} د.م
                      </TableCell>
                      <TableCell className="text-primary">
                        {(data.revenue - data.commission).toLocaleString()} د.م
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
                <CardTitle>نسب العمولة حسب الخدمة</CardTitle>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${commissionRatesOpen ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الخدمة</TableHead>
                    <TableHead className="text-right">السعر</TableHead>
                    <TableHead className="text-right">نسبة العمولة</TableHead>
                    <TableHead className="text-right">عمولة الموظف</TableHead>
                    <TableHead className="text-right">حصة الصالون</TableHead>
                    <TableHead className="text-right w-[100px]">تعديل</TableHead>
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
                        <TableCell>{service.price} د.م</TableCell>
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
                          {staffAmount} د.م
                        </TableCell>
                        <TableCell className="text-primary">
                          {salonAmount} د.م
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

      {/* Expenses Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            المصاريف والتكاليف
          </CardTitle>
          <Dialog open={showChargeDialog} onOpenChange={setShowChargeDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 ml-2" />
                إضافة مصروف
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>إضافة مصروف جديد</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>نوع المصروف</Label>
                  <Select value={newCharge.type} onValueChange={(v) => setNewCharge({ ...newCharge, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rent">إيجار</SelectItem>
                      <SelectItem value="utilities">مرافق (ماء/كهرباء)</SelectItem>
                      <SelectItem value="products">منتجات</SelectItem>
                      <SelectItem value="equipment">معدات</SelectItem>
                      <SelectItem value="maintenance">صيانة</SelectItem>
                      <SelectItem value="other">أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الوصف</Label>
                  <Input
                    value={newCharge.name}
                    onChange={(e) => setNewCharge({ ...newCharge, name: e.target.value })}
                    placeholder="وصف المصروف"
                  />
                </div>
                <div>
                  <Label>المبلغ (د.م)</Label>
                  <Input
                    type="number"
                    value={newCharge.amount || ""}
                    onChange={(e) => setNewCharge({ ...newCharge, amount: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>التاريخ</Label>
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
                  حفظ
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">الوصف</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCharges.map((charge) => (
                <TableRow key={charge.id}>
                  <TableCell>
                    {charge.type === "rent" && "إيجار"}
                    {charge.type === "utilities" && "مرافق"}
                    {charge.type === "products" && "منتجات"}
                    {charge.type === "equipment" && "معدات"}
                    {charge.type === "maintenance" && "صيانة"}
                    {charge.type === "other" && "أخرى"}
                  </TableCell>
                  <TableCell>{charge.name}</TableCell>
                  <TableCell className="text-red-600 font-semibold">{charge.amount.toLocaleString()} د.م</TableCell>
                  <TableCell>{format(parseISO(charge.date), "d MMM yyyy", { locale: ar })}</TableCell>
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
                    لا توجد مصاريف للفترة المحددة
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Staff Deductions Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <UserMinus className="h-5 w-5" />
            خصومات الموظفين
          </CardTitle>
          <Dialog open={showDeductionDialog} onOpenChange={setShowDeductionDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 ml-2" />
                إضافة خصم
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>إضافة خصم للموظف</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>الموظف</Label>
                  <Select value={newDeduction.staffName} onValueChange={(v) => setNewDeduction({ ...newDeduction, staffName: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الموظف" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>نوع الخصم</Label>
                  <Select value={newDeduction.type} onValueChange={(v) => setNewDeduction({ ...newDeduction, type: v as "advance" | "loan" | "penalty" | "other" })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="advance">سلفة</SelectItem>
                      <SelectItem value="loan">قرض</SelectItem>
                      <SelectItem value="penalty">غرامة</SelectItem>
                      <SelectItem value="other">أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الوصف</Label>
                  <Input
                    value={newDeduction.description}
                    onChange={(e) => setNewDeduction({ ...newDeduction, description: e.target.value })}
                    placeholder="وصف الخصم"
                  />
                </div>
                <div>
                  <Label>المبلغ (د.م)</Label>
                  <Input
                    type="number"
                    value={newDeduction.amount || ""}
                    onChange={(e) => setNewDeduction({ ...newDeduction, amount: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>التاريخ</Label>
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
                  حفظ
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الموظف</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">الوصف</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDeductions.map((deduction) => (
                <TableRow key={deduction.id}>
                  <TableCell className="font-medium">{deduction.staffName}</TableCell>
                  <TableCell>
                    {deduction.type === "advance" && "سلفة"}
                    {deduction.type === "loan" && "قرض"}
                    {deduction.type === "penalty" && "غرامة"}
                    {deduction.type === "other" && "أخرى"}
                  </TableCell>
                  <TableCell>{deduction.description}</TableCell>
                  <TableCell className="text-orange-600 font-semibold">{deduction.amount.toLocaleString()} د.م</TableCell>
                  <TableCell>{format(parseISO(deduction.date), "d MMM yyyy", { locale: ar })}</TableCell>
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
                    لا توجد خصومات للفترة المحددة
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
