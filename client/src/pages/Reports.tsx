import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppointments, useStaff, useServices, useBusinessSettings } from "@/hooks/use-salon-data";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, AreaChart, Area
} from "recharts";
import { TrendingUp, CalendarCheck, Calendar as CalendarIcon, ChevronRight, ChevronLeft, RefreshCw, DollarSign, Users, Clock, BarChart3, UserCheck } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths, isWithinInterval, parseISO, startOfDay, endOfDay, getDay, eachDayOfInterval } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { ar, enUS, fr } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6'];

const tooltipStyle = {
  borderRadius: '8px',
  border: 'none',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  fontSize: '12px',
};

const RTLXTick = ({ x, y, payload, fontSize = 11 }: any) => (
  <foreignObject x={x - 40} y={y + 2} width={80} height={22} overflow="visible" style={{ pointerEvents: 'none' }}>
    <div style={{ textAlign: 'center', fontSize, color: 'hsl(var(--muted-foreground))', direction: 'rtl' as const, lineHeight: '18px', whiteSpace: 'nowrap' }}>
      {payload.value}
    </div>
  </foreignObject>
);

const RTLYTick = ({ x, y, payload, fontSize = 11, width = 70 }: any) => (
  <foreignObject x={x - width} y={y - 10} width={width} height={22} overflow="visible" style={{ pointerEvents: 'none' }}>
    <div style={{ textAlign: 'end', fontSize, color: 'hsl(var(--muted-foreground))', direction: 'rtl' as const, lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {payload.value}
    </div>
  </foreignObject>
);

const RTLPieLabel = ({ cx, cy, midAngle, outerRadius, name, percent }: any) => {
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 28;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <foreignObject x={x - 55} y={y - 12} width={110} height={24}>
      <div style={{ textAlign: 'center', fontSize: 11, direction: 'rtl' as const, whiteSpace: 'nowrap', color: 'hsl(var(--foreground))' }}>
        {name} {(percent * 100).toFixed(0)}%
      </div>
    </foreignObject>
  );
};

type ViewMode = "weekly" | "monthly" | "custom";
type ReportCategory = "financial" | "staff" | "scheduling" | "clients";

export default function Reports() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const rtlTooltipStyle = useMemo(() => ({
    ...tooltipStyle,
    ...(isRtl ? { direction: 'rtl' as const, textAlign: 'right' as const } : {}),
  }), [isRtl]);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [customRange, setCustomRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date()
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ReportCategory>("financial");

  const { data: bSettings } = useBusinessSettings();
  const { data: appointments = [] } = useAppointments();
  const { data: staffList = [] } = useStaff();
  const { data: services = [] } = useServices();
  const { data: charges = [] } = useQuery<any[]>({ queryKey: ["/api/charges"] });
  const { data: expenseCategories = [] } = useQuery<any[]>({ queryKey: ["/api/expense-categories"] });
  const { data: staffCommissions = [] } = useQuery<{ id: number; staffId: number; serviceId: number; percentage: number }[]>({
    queryKey: ["/api/staff-commissions"],
  });

  const dateLocale = useMemo(() => {
    if (i18n.language === "ar") return ar;
    if (i18n.language === "fr") return fr;
    return enUS;
  }, [i18n.language]);

  const dayNames = useMemo(() => [
    t("reports.sun"), t("reports.mon"), t("reports.tue"), t("reports.wed"),
    t("reports.thu"), t("reports.fri"), t("reports.sat")
  ], [t]);

  const dateRange = useMemo(() => {
    if (viewMode === "weekly") {
      return { start: startOfWeek(selectedDate, { weekStartsOn: 1 }), end: endOfWeek(selectedDate, { weekStartsOn: 1 }) };
    } else if (viewMode === "monthly") {
      return { start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) };
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
        return isWithinInterval(parseISO(app.date), { start: dateRange.start, end: dateRange.end });
      } catch { return false; }
    });
  }, [appointments, dateRange]);

  const filteredCharges = useMemo(() => {
    return (charges || []).filter((ch: any) => {
      try {
        return isWithinInterval(parseISO(ch.date), { start: dateRange.start, end: dateRange.end });
      } catch { return false; }
    });
  }, [charges, dateRange]);

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
    const unpaidRevenue = totalRevenue - paidRevenue;
    const totalExpenses = filteredCharges.reduce((sum: number, ch: any) => sum + Number(ch.amount || 0), 0);

    let totalCommissions = 0;
    filteredAppointments.forEach((app: any) => {
      const service = services.find((s: any) => s.name === app.service);
      let commissionRate = service?.commissionPercent ?? 50;
      if (service) {
        const staffMember = staffList.find((s: any) => s.name === app.staff || s.id === app.staffId);
        if (staffMember) {
          const customComm = staffCommissions.find(c => c.staffId === staffMember.id && c.serviceId === service.id);
          if (customComm) commissionRate = customComm.percentage;
        }
      }
      totalCommissions += Number(app.total || 0) * (commissionRate / 100);
    });

    const salonPortion = totalRevenue - totalCommissions;
    const netProfit = salonPortion - totalExpenses;
    const totalAppointments = filteredAppointments.length;

    const staffRevenue = staffList.map(s => {
      const revenue = filteredAppointments
        .filter(app => app.staffId === s.id || (!app.staffId && app.staff === s.name))
        .reduce((sum, app) => sum + Number(app.total || 0), 0);
      return { name: s.name, value: revenue, color: s.color };
    }).filter(item => item.value > 0);

    const serviceCounts = filteredAppointments.reduce((acc, app) => {
      const serviceName = app.service || "Unknown";
      acc[serviceName] = (acc[serviceName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const serviceData = Object.entries(serviceCounts)
      .map(([name, value]) => ({ name, value: value as number }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    return { totalRevenue, paidRevenue, unpaidRevenue, totalExpenses, netProfit, totalAppointments, staffRevenue, serviceData };
  }, [filteredAppointments, filteredCharges, staffList, services, staffCommissions]);

  const dailyRevenueData = useMemo(() => {
    try {
      const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
      return days.map(day => {
        const dateStr = format(day, "yyyy-MM-dd");
        const dayRevenue = filteredAppointments
          .filter(app => {
            try { return format(parseISO(app.date), "yyyy-MM-dd") === dateStr; } catch { return app.date === dateStr; }
          })
          .reduce((sum, app) => sum + Number(app.total || 0), 0);
        const dayExpenses = filteredCharges
          .filter((ch: any) => {
            try { return format(parseISO(ch.date), "yyyy-MM-dd") === dateStr; } catch { return ch.date === dateStr; }
          })
          .reduce((sum: number, ch: any) => sum + Number(ch.amount || 0), 0);
        return {
          date: format(day, "d MMM", { locale: dateLocale }),
          revenue: dayRevenue,
          expenses: dayExpenses,
          profit: dayRevenue - dayExpenses,
        };
      });
    } catch { return []; }
  }, [filteredAppointments, filteredCharges, dateRange, dateLocale]);

  const paymentStatusData = useMemo(() => {
    const paid = filteredAppointments.filter(a => a.paid).length;
    const unpaid = filteredAppointments.filter(a => !a.paid).length;
    if (paid === 0 && unpaid === 0) return [];
    return [
      { name: t("reports.paid"), value: paid, color: '#22c55e' },
      { name: t("reports.unpaid"), value: unpaid, color: '#ef4444' },
    ];
  }, [filteredAppointments, t]);

  const appointmentsByDayData = useMemo(() => {
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    filteredAppointments.forEach(app => {
      try {
        const dayIdx = getDay(parseISO(app.date));
        dayCounts[dayIdx]++;
      } catch {}
    });
    // Reorder to start from Monday (1) to Sunday (0) for the chart
    return [1, 2, 3, 4, 5, 6, 0].map(i => ({
      day: dayNames[i],
      count: dayCounts[i],
    }));
  }, [filteredAppointments, dayNames]);

  const categoryRevenueData = useMemo(() => {
    const serviceToCategory: Record<string, string> = {};
    services.forEach((s: any) => { serviceToCategory[s.name] = s.category || "Other"; });
    const catRevenue: Record<string, number> = {};
    filteredAppointments.forEach(app => {
      const cat = serviceToCategory[app.service || ""] || "Other";
      catRevenue[cat] = (catRevenue[cat] || 0) + Number(app.total || 0);
    });
    return Object.entries(catRevenue)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filteredAppointments, services]);

  const staffAppointmentsData = useMemo(() => {
    return staffList.map(s => {
      const count = filteredAppointments.filter(app => app.staffId === s.id || (!app.staffId && app.staff === s.name)).length;
      return { name: s.name, count, color: s.color };
    }).filter(s => s.count > 0).sort((a, b) => b.count - a.count);
  }, [filteredAppointments, staffList]);

  const clientFrequencyData = useMemo(() => {
    const clientCounts: Record<string, number> = {};
    filteredAppointments.forEach(app => {
      const name = app.client || "Unknown";
      clientCounts[name] = (clientCounts[name] || 0) + 1;
    });
    return Object.entries(clientCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filteredAppointments]);

  const hourlyData = useMemo(() => {
    const openH = parseInt(bSettings?.openingTime?.split(":")[0] || "9", 10);
    const closeH = parseInt(bSettings?.closingTime?.split(":")[0] || "19", 10);
    const hours: Record<number, number> = {};
    filteredAppointments.forEach(app => {
      try {
        const hour = parseInt(app.startTime?.split(":")[0] || "0", 10);
        hours[hour] = (hours[hour] || 0) + 1;
      } catch {}
    });
    const result = [];
    for (let h = openH; h <= closeH; h++) {
      result.push({ hour: `${h}:00`, count: hours[h] || 0 });
    }
    return result;
  }, [filteredAppointments, bSettings]);

  const expenseCategoryData = useMemo(() => {
    const catMap: Record<number, string> = {};
    (expenseCategories || []).forEach((ec: any) => { catMap[ec.id] = ec.name; });
    const catTotals: Record<string, number> = {};
    filteredCharges.forEach((ch: any) => {
      const catName = ch.categoryId ? (catMap[ch.categoryId] || ch.type || "Other") : (ch.type || "Other");
      catTotals[catName] = (catTotals[catName] || 0) + Number(ch.amount || 0);
    });
    return Object.entries(catTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredCharges, expenseCategories]);

  const staffPerformance = useMemo(() => {
    return staffList.map(staff => {
      const staffApps = filteredAppointments.filter(app => app.staffId === staff.id || (!app.staffId && app.staff === staff.name));
      const totalEarnings = staffApps.reduce((sum, app) => sum + Number(app.total || 0), 0);
      const paidEarnings = staffApps.filter(app => app.paid).reduce((sum, app) => sum + Number(app.total || 0), 0);
      const serviceBreakdown = staffApps.reduce((acc, app) => {
        const serviceName = app.service || "Unknown";
        if (!acc[serviceName]) acc[serviceName] = { count: 0, revenue: 0 };
        acc[serviceName].count += 1;
        acc[serviceName].revenue += Number(app.total || 0);
        return acc;
      }, {} as Record<string, { count: number; revenue: number }>);
      return {
        name: staff.name, color: staff.color,
        appointmentCount: staffApps.length, totalEarnings, paidEarnings,
        unpaidEarnings: totalEarnings - paidEarnings,
        serviceBreakdown: Object.entries(serviceBreakdown)
          .map(([service, data]) => ({ service, ...(data as { count: number; revenue: number }) }))
          .sort((a, b) => b.revenue - a.revenue)
      };
    });
  }, [staffList, filteredAppointments]);

  const periodLabel = useMemo(() => {
    if (viewMode === "weekly") {
      return `${format(dateRange.start, "d MMM", { locale: dateLocale })} - ${format(dateRange.end, "d MMM yyyy", { locale: dateLocale })}`;
    } else if (viewMode === "monthly") {
      return format(selectedDate, "MMMM yyyy", { locale: dateLocale });
    } else {
      if (customRange?.from && customRange?.to) {
        return `${format(customRange.from, "d MMM", { locale: dateLocale })} - ${format(customRange.to, "d MMM yyyy", { locale: dateLocale })}`;
      } else if (customRange?.from) {
        return format(customRange.from, "d MMM yyyy", { locale: dateLocale });
      }
      return t("reports.selectPeriod");
    }
  }, [viewMode, dateRange, selectedDate, customRange, dateLocale, t]);

  const periodSubLabel = useMemo(() => {
    if (viewMode === "weekly") return t("common.thisWeek");
    if (viewMode === "monthly") return t("common.thisMonth");
    return t("reports.customPeriod");
  }, [viewMode, t]);

  const noData = (arr: any[]) => arr.length === 0;

  const EmptyState = () => (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      {t("reports.noDataForPeriod")}
    </div>
  );

  const categories: { key: ReportCategory; label: string; icon: typeof TrendingUp }[] = [
    { key: "financial", label: t("reports.catFinancial"), icon: DollarSign },
    { key: "staff", label: t("reports.catStaff"), icon: Users },
    { key: "scheduling", label: t("reports.catScheduling"), icon: BarChart3 },
    { key: "clients", label: t("reports.catClients"), icon: UserCheck },
  ];

  return (
    <div className="space-y-4 md:space-y-5 max-w-6xl mx-auto p-2 md:p-4 lg:p-6 animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-display font-bold" data-testid="text-reports-title">{t("reports.pageTitle")}</h1>
          <p className="text-sm md:text-base text-muted-foreground">{t("reports.pageDesc")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              queryClient.invalidateQueries();
              toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
            }}
            title={t("common.refresh")}
            data-testid="button-refresh-reports"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="weekly" data-testid="tab-weekly">{t("reports.weekly")}</TabsTrigger>
              <TabsTrigger value="monthly" data-testid="tab-monthly">{t("reports.monthly")}</TabsTrigger>
              <TabsTrigger value="custom" data-testid="tab-custom">{t("reports.custom")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 bg-muted rounded-xl p-3">
        {viewMode !== "custom" && (
          <Button variant="ghost" size="icon" onClick={() => navigatePeriod("next")} data-testid="button-period-next">
            {isRtl ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </Button>
        )}
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-w-[220px] gap-2" data-testid="button-date-picker">
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
                  if (range?.from && range?.to) setCalendarOpen(false);
                }}
                numberOfMonths={2}
                initialFocus
              />
            ) : (
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => { if (date) { setSelectedDate(date); setCalendarOpen(false); } }}
                initialFocus
              />
            )}
          </PopoverContent>
        </Popover>
        {viewMode !== "custom" && (
          <Button variant="ghost" size="icon" onClick={() => navigatePeriod("prev")} data-testid="button-period-prev">
            {isRtl ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </Button>
        )}
      </div>

      {/* Summary Cards - Always visible */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs text-muted-foreground font-medium">{t("reports.totalRevenue")}</p>
              <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>
            <p className="text-lg md:text-2xl font-bold mt-1" data-testid="text-total-revenue">{formatCurrency(stats.totalRevenue)} DH</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t("reports.collected")} {formatCurrency(stats.paidRevenue)} DH</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs text-muted-foreground font-medium">{t("reports.expenses")}</p>
              <DollarSign className="w-4 h-4 text-red-500 shrink-0" />
            </div>
            <p className="text-lg md:text-2xl font-bold mt-1 text-red-600 dark:text-red-400" data-testid="text-total-expenses">{formatCurrency(stats.totalExpenses)} DH</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs text-muted-foreground font-medium">{t("reports.appointments")}</p>
              <CalendarCheck className="w-4 h-4 text-primary shrink-0" />
            </div>
            <p className="text-lg md:text-2xl font-bold mt-1" data-testid="text-total-appointments">{stats.totalAppointments}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{periodSubLabel}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs text-muted-foreground font-medium">{t("reports.netProfit")}</p>
              <TrendingUp className="w-4 h-4 text-pink-500 shrink-0" />
            </div>
            <p className={`text-lg md:text-2xl font-bold mt-1 ${stats.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-net-profit">
              {formatCurrency(stats.netProfit)} DH
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Category Tabs */}
      <div className="grid grid-cols-4 gap-2 md:gap-3">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`flex flex-col items-center gap-1.5 p-3 md:p-4 rounded-xl border transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary shadow-md'
                  : 'bg-card border-border hover-elevate'
              }`}
              data-testid={`button-cat-${cat.key}`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs md:text-sm font-medium">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Financial Section */}
      {activeCategory === "financial" && (
        <div className="space-y-4 md:space-y-5 animate-fade-in">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("reports.dailyRevenueTrend")}</CardTitle>
              <CardDescription className="text-xs">{t("reports.dailyRevenueTrendDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="h-64 md:h-72" data-testid="chart-revenue-trend">
              {noData(dailyRevenueData) ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyRevenueData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tick={isRtl ? <RTLXTick fontSize={10} /> : { fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={50} />
                    <Tooltip contentStyle={rtlTooltipStyle} formatter={(v: number) => [`${formatCurrency(v)} DH`]} />
                    <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#gradRevenue)" strokeWidth={2} name={t("reports.revenue")} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("reports.revenueVsExpenses")}</CardTitle>
              <CardDescription className="text-xs">{t("reports.revenueVsExpensesDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="h-64 md:h-72" data-testid="chart-revenue-vs-expenses">
              {noData(dailyRevenueData) ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyRevenueData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tick={isRtl ? <RTLXTick fontSize={10} /> : { fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={50} />
                    <Tooltip contentStyle={rtlTooltipStyle} formatter={(v: number) => [`${formatCurrency(v)} DH`]} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} name={t("reports.revenue")} />
                    <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name={t("reports.expenses")} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("reports.paymentStatus")}</CardTitle>
                <CardDescription className="text-xs">{t("reports.paymentStatusDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="h-64" data-testid="chart-payment-status">
                {noData(paymentStatusData) ? <EmptyState /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value" label={isRtl ? RTLPieLabel : ({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {paymentStatusData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={rtlTooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("reports.categoryBreakdown")}</CardTitle>
                <CardDescription className="text-xs">{t("reports.categoryBreakdownDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="h-64" data-testid="chart-category-revenue">
                {noData(categoryRevenueData) ? <EmptyState /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryRevenueData} cx="50%" cy="45%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                        {categoryRevenueData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={rtlTooltipStyle} formatter={(v: number) => [`${formatCurrency(v)} DH`]} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("reports.expenseCategories")}</CardTitle>
              <CardDescription className="text-xs">{t("reports.expenseCategoriesDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="h-64" data-testid="chart-expense-categories">
              {noData(expenseCategoryData) ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={expenseCategoryData} cx="50%" cy="45%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                      {expenseCategoryData.map((_, i) => (
                        <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={rtlTooltipStyle} formatter={(v: number) => [`${formatCurrency(v)} DH`]} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Staff Section */}
      {activeCategory === "staff" && (
        <div className="space-y-4 md:space-y-5 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("reports.revenueByStaff")}</CardTitle>
                <CardDescription className="text-xs">{t("reports.staffRevenueDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="h-72" data-testid="chart-revenue-by-staff">
                {noData(stats.staffRevenue) ? <EmptyState /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.staffRevenue} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={70} tick={isRtl ? <RTLYTick fontSize={11} width={70} /> : { fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={rtlTooltipStyle} cursor={{ fill: 'transparent' }} formatter={(v: number) => [`${formatCurrency(v)} DH`, t("reports.revenue")]} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                        {stats.staffRevenue.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("reports.staffAppointments")}</CardTitle>
                <CardDescription className="text-xs">{t("reports.staffAppointmentsDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="h-72" data-testid="chart-staff-appointments">
                {noData(staffAppointmentsData) ? <EmptyState /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={staffAppointmentsData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
                      <XAxis type="number" allowDecimals={false} hide />
                      <YAxis dataKey="name" type="category" width={70} tick={isRtl ? <RTLYTick fontSize={11} width={70} /> : { fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={rtlTooltipStyle} cursor={{ fill: 'transparent' }} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24} name={t("reports.count")}>
                        {staffAppointmentsData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("reports.staffPerformance")}</CardTitle>
              <CardDescription className="text-xs">{t("reports.staffPerformanceDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {staffPerformance.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">{t("reports.noDataForPeriod")}</p>
              ) : (
                <div className="space-y-4">
                  {staffPerformance.map((staff) => (
                    <div key={staff.name} className="border rounded-xl p-3 md:p-4 bg-muted" data-testid={`card-staff-perf-${staff.name}`}>
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: staff.color }} />
                          <h3 className="font-bold text-sm md:text-base">{staff.name}</h3>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">
                            {staff.appointmentCount} {t("reports.appointment")}
                          </span>
                          <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 px-2 py-0.5 rounded-full font-bold">
                            {formatCurrency(staff.totalEarnings)} DH
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-background rounded-lg p-2.5 border">
                          <p className="text-[10px] text-muted-foreground">{t("reports.collectedAmount")}</p>
                          <p className="text-sm font-bold text-emerald-600">{formatCurrency(staff.paidEarnings)} DH</p>
                        </div>
                        <div className="bg-background rounded-lg p-2.5 border">
                          <p className="text-[10px] text-muted-foreground">{t("reports.uncollected")}</p>
                          <p className="text-sm font-bold text-sky-500">{formatCurrency(staff.unpaidEarnings)} DH</p>
                        </div>
                      </div>
                      {staff.serviceBreakdown.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">{t("reports.serviceDetailsLabel")}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                            {staff.serviceBreakdown.map((svc) => (
                              <div key={svc.service} className="flex items-center justify-between bg-background rounded-lg px-2.5 py-1.5 border text-xs">
                                <span className="truncate flex-1">{svc.service}</span>
                                <div className="flex items-center gap-1.5 ms-2">
                                  <span className="text-muted-foreground">{svc.count}x</span>
                                  <span className="font-medium text-primary">{formatCurrency(svc.revenue)} DH</span>
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
        </div>
      )}

      {/* Scheduling Section */}
      {activeCategory === "scheduling" && (
        <div className="space-y-4 md:space-y-5 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("reports.appointmentsByDay")}</CardTitle>
                <CardDescription className="text-xs">{t("reports.appointmentsByDayDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="h-64" data-testid="chart-appointments-by-day">
                {noData(appointmentsByDayData.filter(d => d.count > 0)) ? <EmptyState /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={appointmentsByDayData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="day" tick={isRtl ? <RTLXTick fontSize={11} /> : { fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} width={30} />
                      <Tooltip contentStyle={rtlTooltipStyle} />
                      <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} name={t("reports.count")} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("reports.hourlyDistribution")}</CardTitle>
                <CardDescription className="text-xs">{t("reports.hourlyDistributionDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="h-64" data-testid="chart-hourly-distribution">
                {noData(hourlyData.filter(h => h.count > 0)) ? <EmptyState /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="hour" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} width={25} />
                      <Tooltip contentStyle={rtlTooltipStyle} />
                      <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} name={t("reports.count")} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("reports.topServices")}</CardTitle>
              <CardDescription className="text-xs">{t("reports.topServicesDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="h-64" data-testid="chart-top-services">
              {noData(stats.serviceData) ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats.serviceData} cx="50%" cy="45%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value">
                      {stats.serviceData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={rtlTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Clients Section */}
      {activeCategory === "clients" && (
        <div className="space-y-4 md:space-y-5 animate-fade-in">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("reports.clientFrequency")}</CardTitle>
              <CardDescription className="text-xs">{t("reports.clientFrequencyDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="h-64 md:h-72" data-testid="chart-client-frequency">
              {noData(clientFrequencyData) ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientFrequencyData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
                    <XAxis type="number" allowDecimals={false} hide />
                    <YAxis dataKey="name" type="category" width={90} tick={isRtl ? <RTLYTick fontSize={11} width={90} /> : { fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={rtlTooltipStyle} cursor={{ fill: 'transparent' }} formatter={(v: number) => [`${v} ${t("reports.visits")}`]} />
                    <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} name={t("reports.visits")} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
