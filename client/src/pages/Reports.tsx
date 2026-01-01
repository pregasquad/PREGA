import { useMemo, useState } from "react";
import { useAppointments, useStaff } from "@/hooks/use-salon-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { TrendingUp, Users, CalendarCheck, Calendar as CalendarIcon, ChevronRight, ChevronLeft } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths, isWithinInterval, parseISO, startOfDay, endOfDay } from "date-fns";
import { ar } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#a4de6c', '#d0ed57'];

type ViewMode = "weekly" | "monthly" | "custom";

export default function Reports() {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [customRange, setCustomRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date()
  });
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { data: appointments = [] } = useAppointments();
  const { data: staffList = [] } = useStaff();

  const dateRange = useMemo(() => {
    if (viewMode === "weekly") {
      return {
        start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
        end: endOfWeek(selectedDate, { weekStartsOn: 1 })
      };
    } else if (viewMode === "monthly") {
      return {
        start: startOfMonth(selectedDate),
        end: endOfMonth(selectedDate)
      };
    } else {
      return {
        start: customRange?.from ? startOfDay(customRange.from) : startOfDay(new Date()),
        end: customRange?.to ? endOfDay(customRange.to) : endOfDay(new Date())
      };
    }
  }, [viewMode, selectedDate, customRange]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter(app => {
      try {
        const appDate = parseISO(app.date);
        return isWithinInterval(appDate, { start: dateRange.start, end: dateRange.end });
      } catch {
        return false;
      }
    });
  }, [appointments, dateRange]);

  const navigatePeriod = (direction: "prev" | "next") => {
    if (viewMode === "weekly") {
      setSelectedDate(direction === "prev" ? subWeeks(selectedDate, 1) : addWeeks(selectedDate, 1));
    } else if (viewMode === "monthly") {
      setSelectedDate(direction === "prev" ? subMonths(selectedDate, 1) : addMonths(selectedDate, 1));
    }
  };

  const stats = useMemo(() => {
    const totalRevenue = filteredAppointments.reduce((sum, app) => sum + Number(app.total || 0), 0);
    const paidRevenue = filteredAppointments.filter(app => app.paid).reduce((sum, app) => sum + Number(app.total || 0), 0);
    const totalAppointments = filteredAppointments.length;
    
    const staffRevenue = staffList.map(s => {
      const revenue = filteredAppointments
        .filter(app => app.staff === s.name)
        .reduce((sum, app) => sum + Number(app.total || 0), 0);
      return { name: s.name, value: revenue, color: s.color };
    }).filter(item => item.value > 0);

    const serviceCounts = filteredAppointments.reduce((acc, app) => {
      acc[app.service] = (acc[app.service] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const serviceData = Object.entries(serviceCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return { totalRevenue, paidRevenue, totalAppointments, staffRevenue, serviceData };
  }, [filteredAppointments, staffList]);

  const staffPerformance = useMemo(() => {
    return staffList.map(staff => {
      const staffApps = filteredAppointments.filter(app => app.staff === staff.name);
      const totalEarnings = staffApps.reduce((sum, app) => sum + Number(app.total || 0), 0);
      const paidEarnings = staffApps.filter(app => app.paid).reduce((sum, app) => sum + Number(app.total || 0), 0);
      
      const serviceBreakdown = staffApps.reduce((acc, app) => {
        if (!acc[app.service]) {
          acc[app.service] = { count: 0, revenue: 0 };
        }
        acc[app.service].count += 1;
        acc[app.service].revenue += Number(app.total || 0);
        return acc;
      }, {} as Record<string, { count: number; revenue: number }>);

      return {
        name: staff.name,
        color: staff.color,
        appointmentCount: staffApps.length,
        totalEarnings,
        paidEarnings,
        unpaidEarnings: totalEarnings - paidEarnings,
        serviceBreakdown: Object.entries(serviceBreakdown)
          .map(([service, data]) => ({ service, ...data }))
          .sort((a, b) => b.revenue - a.revenue)
      };
    });
  }, [staffList, filteredAppointments]);

  const periodLabel = useMemo(() => {
    if (viewMode === "weekly") {
      return `${format(dateRange.start, "d MMM", { locale: ar })} - ${format(dateRange.end, "d MMM yyyy", { locale: ar })}`;
    } else if (viewMode === "monthly") {
      return format(selectedDate, "MMMM yyyy", { locale: ar });
    } else {
      if (customRange?.from && customRange?.to) {
        return `${format(customRange.from, "d MMM", { locale: ar })} - ${format(customRange.to, "d MMM yyyy", { locale: ar })}`;
      } else if (customRange?.from) {
        return format(customRange.from, "d MMM yyyy", { locale: ar });
      }
      return "اختر الفترة";
    }
  }, [viewMode, dateRange, selectedDate, customRange]);

  const periodSubLabel = useMemo(() => {
    if (viewMode === "weekly") return "هذا الأسبوع";
    if (viewMode === "monthly") return "هذا الشهر";
    return "فترة مخصصة";
  }, [viewMode]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">التحليلات والتقارير</h1>
          <p className="text-muted-foreground">نظرة عامة على أداء الصالون الخاص بك.</p>
        </div>

        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="weekly">أسبوعي</TabsTrigger>
              <TabsTrigger value="monthly">شهري</TabsTrigger>
              <TabsTrigger value="custom">مخصص</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 bg-muted rounded-xl p-3">
        {viewMode !== "custom" && (
          <Button variant="ghost" size="icon" onClick={() => navigatePeriod("next")}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        )}
        
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-w-[220px] gap-2">
              <CalendarIcon className="h-4 w-4" />
              {periodLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            {viewMode === "custom" ? (
              <Calendar
                mode="range"
                selected={customRange}
                onSelect={(range) => {
                  setCustomRange(range);
                  if (range?.from && range?.to) {
                    setCalendarOpen(false);
                  }
                }}
                numberOfMonths={2}
                initialFocus
              />
            ) : (
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(date);
                    setCalendarOpen(false);
                  }
                }}
                initialFocus
              />
            )}
          </PopoverContent>
        </Popover>

        {viewMode !== "custom" && (
          <Button variant="ghost" size="icon" onClick={() => navigatePeriod("prev")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white border-0 shadow-lg shadow-indigo-500/20">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-indigo-100 font-medium text-sm">إجمالي الإيرادات</p>
                <h3 className="text-4xl font-bold mt-2">{stats.totalRevenue.toLocaleString()} DH</h3>
                <div className="mt-4 flex items-center text-indigo-100 text-sm">
                  <span>تم تحصيل {stats.paidRevenue.toLocaleString()} DH</span>
                </div>
              </div>
              <div className="p-3 bg-white/20 rounded-xl">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-muted-foreground font-medium text-sm">المواعيد</p>
                <h3 className="text-4xl font-bold mt-2 text-foreground">{stats.totalAppointments}</h3>
                <div className="mt-4 flex items-center text-emerald-600 text-sm font-medium">
                  <CalendarCheck className="w-4 h-4 ml-1" />
                  <span>{periodSubLabel}</span>
                </div>
              </div>
              <div className="p-3 bg-primary/20 rounded-xl">
                <CalendarCheck className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-muted-foreground font-medium text-sm">الموظفون النشطون</p>
                <h3 className="text-4xl font-bold mt-2 text-foreground">{staffList.length}</h3>
                <div className="mt-4 flex items-center text-blue-600 text-sm font-medium">
                  <Users className="w-4 h-4 ml-1" />
                  <span>أعضاء</span>
                </div>
              </div>
              <div className="p-3 bg-blue-100 rounded-xl">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg border">
        <CardHeader>
          <CardTitle>أداء الموظفين</CardTitle>
          <CardDescription>الخدمات والإيرادات لكل موظف خلال الفترة المحددة</CardDescription>
        </CardHeader>
        <CardContent>
          {staffPerformance.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد بيانات للفترة المحددة</p>
          ) : (
            <div className="space-y-6">
              {staffPerformance.map((staff) => (
                <div key={staff.name} className="border rounded-xl p-4 bg-muted">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: staff.color }}
                      />
                      <h3 className="font-bold text-lg">{staff.name}</h3>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="bg-primary/20 text-primary px-3 py-1 rounded-full font-medium">
                        {staff.appointmentCount} موعد
                      </span>
                      <span className="bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full font-bold">
                        {staff.totalEarnings.toLocaleString()} DH
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-background rounded-lg p-3 border">
                      <p className="text-xs text-muted-foreground">تم تحصيله</p>
                      <p className="text-lg font-bold text-emerald-600">{staff.paidEarnings.toLocaleString()} DH</p>
                    </div>
                    <div className="bg-background rounded-lg p-3 border">
                      <p className="text-xs text-muted-foreground">غير محصل</p>
                      <p className="text-lg font-bold text-orange-500">{staff.unpaidEarnings.toLocaleString()} DH</p>
                    </div>
                  </div>

                  {staff.serviceBreakdown.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">تفاصيل الخدمات:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {staff.serviceBreakdown.map((svc) => (
                          <div key={svc.service} className="flex items-center justify-between bg-background rounded-lg px-3 py-2 border text-sm">
                            <span className="truncate flex-1">{svc.service}</span>
                            <div className="flex items-center gap-2 mr-2">
                              <span className="text-muted-foreground">×{svc.count}</span>
                              <span className="font-medium text-primary">{svc.revenue} DH</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-lg border">
          <CardHeader>
            <CardTitle>الإيرادات حسب الموظف</CardTitle>
            <CardDescription>توزيع الأداء لكل عضو في الفريق</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {stats.staffRevenue.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                لا توجد بيانات للفترة المحددة
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.staffRevenue} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    formatter={(value: number) => [`${value.toLocaleString()} DH`, 'الإيرادات']}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30}>
                    {stats.staffRevenue.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg border">
          <CardHeader>
            <CardTitle>أفضل الخدمات</CardTitle>
            <CardDescription>أكثر العلاجات شعبية المحجوزة</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {stats.serviceData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                لا توجد بيانات للفترة المحددة
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.serviceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {stats.serviceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
