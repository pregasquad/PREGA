import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DollarSign, Users, CalendarIcon, TrendingUp, Building2, Edit2, Check, X, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import type { Staff, Service, Appointment } from "@shared/schema";

type PeriodType = "day" | "week" | "month" | "custom";

export default function Salaries() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [period, setPeriod] = useState<PeriodType>("month");
  const [selectedStaff, setSelectedStaff] = useState<string>("all");
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

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
    const aptDate = parseISO(apt.date);
    const inRange = isWithinInterval(aptDate, { start, end });
    const staffMatch = selectedStaff === "all" || apt.staff === selectedStaff;
    return inRange && staffMatch && apt.paid;
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
      if (earnings[apt.staff]) {
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
      }
    });

    return Object.values(earnings);
  };

  const staffEarnings = calculateStaffEarnings();
  const totalRevenue = staffEarnings.reduce((sum, e) => sum + e.totalRevenue, 0);
  const totalCommissions = staffEarnings.reduce((sum, e) => sum + e.totalCommission, 0);
  const totalAppointments = staffEarnings.reduce((sum, e) => sum + e.appointmentsCount, 0);
  const salonPortion = totalRevenue - totalCommissions;

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

      <Card>
        <CardHeader>
          <CardTitle>نسب العمولة حسب الخدمة</CardTitle>
        </CardHeader>
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
      </Card>
    </div>
  );
}
