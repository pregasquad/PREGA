import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Users, DollarSign, Calendar, TrendingUp, Award } from "lucide-react";
import { LogoSpinner } from "@/components/LogoSpinner";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import type { Staff, Appointment, Service } from "@shared/schema";

const formatCurrency = (value: number): string => {
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export default function StaffPerformance() {
  const { t, i18n } = useTranslation();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [selectedStaff, setSelectedStaff] = useState<string>("all");

  const { data: staffList = [], isLoading: loadingStaff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: services = [], isLoading: loadingServices } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: appointments = [], isLoading: loadingAppointments } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments/all"],
  });

  const isLoading = loadingStaff || loadingServices || loadingAppointments;

  const serviceMap = useMemo(() => new Map(services.map((s) => [s.name, s])), [services]);

  const { startDate, endDate } = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const start = startOfMonth(new Date(year, month - 1));
    const end = endOfMonth(start);
    return {
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
    };
  }, [selectedMonth]);

  const monthAppointments = useMemo(() => 
    appointments.filter((a) => a.date >= startDate && a.date <= endDate),
    [appointments, startDate, endDate]
  );

  const calculateStaffStats = useCallback((staffName: string) => {
    const staffAppts = monthAppointments.filter((a) => a.staff === staffName);
    let totalRevenue = 0;
    let totalCommission = 0;
    const serviceBreakdown: Record<string, { count: number; revenue: number }> = {};

    for (const appt of staffAppts) {
      totalRevenue += appt.total;
      const service = serviceMap.get(appt.service);
      const commissionRate = service?.commissionPercent || 50;
      totalCommission += (appt.total * commissionRate) / 100;

      if (!serviceBreakdown[appt.service]) {
        serviceBreakdown[appt.service] = { count: 0, revenue: 0 };
      }
      serviceBreakdown[appt.service].count++;
      serviceBreakdown[appt.service].revenue += appt.total;
    }

    return {
      staffName,
      totalAppointments: staffAppts.length,
      totalRevenue,
      totalCommission,
      serviceBreakdown,
    };
  }, [monthAppointments, serviceMap]);

  const allStaffStats = useMemo(() => 
    staffList.map((s) => calculateStaffStats(s.name)),
    [staffList, calculateStaffStats]
  );

  const { totalRevenue, totalAppointments, totalCommissions, topPerformer } = useMemo(() => ({
    totalRevenue: allStaffStats.reduce((sum, s) => sum + s.totalRevenue, 0),
    totalAppointments: allStaffStats.reduce((sum, s) => sum + s.totalAppointments, 0),
    totalCommissions: allStaffStats.reduce((sum, s) => sum + s.totalCommission, 0),
    topPerformer: allStaffStats.reduce(
      (top, s) => (s.totalRevenue > (top?.totalRevenue || 0) ? s : top),
      allStaffStats[0]
    ),
  }), [allStaffStats]);

  const COLORS = ["#d63384", "#20c997", "#0d6efd", "#ffc107", "#6610f2"];

  const chartData = useMemo(() => allStaffStats.map((s) => ({
    name: s.staffName,
    appointments: s.totalAppointments,
    revenue: s.totalRevenue,
    commission: s.totalCommission,
  })), [allStaffStats]);

  const pieData = useMemo(() => allStaffStats.map((s, i) => ({
    name: s.staffName,
    value: s.totalRevenue,
    color: COLORS[i % COLORS.length],
  })), [allStaffStats]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return {
      value: format(date, "yyyy-MM"),
      label: format(date, "MMMM yyyy"),
    };
  }), []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
        <LogoSpinner size="md" />
      </div>
    );
  }

  return (
    <div className="p-2 md:p-4 lg:p-6 space-y-4 md:space-y-6" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{t("staffPerformance.pageTitle")}</h1>
          <p className="text-sm md:text-base text-muted-foreground">{t("staffPerformance.pageDesc")}</p>
        </div>
        <div className="flex flex-wrap gap-2 md:gap-4">
          <div>
            <Label className="text-xs md:text-sm">{t("staffPerformance.month")}</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-36 md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs md:text-sm">{t("staffPerformance.staff")}</Label>
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger className="w-36 md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("staffPerformance.allStaff")}</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("staffPerformance.staffCount")}</p>
                <p className="text-2xl font-bold">{staffList.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("staffPerformance.totalRevenue")}</p>
                <p className="text-2xl font-bold">{totalRevenue} {t("common.currency")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Calendar className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("staffPerformance.totalAppointments")}</p>
                <p className="text-2xl font-bold">{totalAppointments}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Award className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("staffPerformance.topPerformer")}</p>
                <p className="text-xl font-bold">{topPerformer?.staffName || "-"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader className="pb-2 md:pb-4">
            <CardTitle className="text-base md:text-lg">{t("staffPerformance.performanceComparison")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value} ${t("common.currency")}`} />
                <Bar dataKey="revenue" fill="#d63384" name={t("staffPerformance.revenue")} />
                <Bar dataKey="commission" fill="#20c997" name={t("staffPerformance.commission")} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 md:pb-4">
            <CardTitle className="text-base md:text-lg">{t("staffPerformance.revenueDistribution")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${value} ${t("common.currency")}`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 md:pb-4">
          <CardTitle className="text-base md:text-lg">{t("staffPerformance.staffDetails")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {allStaffStats.map((stats, i) => {
              const staffInfo = staffList.find((s) => s.name === stats.staffName);
              return (
                <Card key={stats.staffName} className="border-2" style={{ borderColor: staffInfo?.color }}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-lg">{stats.staffName}</CardTitle>
                      {stats.staffName === topPerformer?.staffName && (
                        <Badge className="bg-yellow-500">
                          <Award className="w-3 h-3 ml-1" />
                          {t("staffPerformance.best")}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("staffPerformance.appointments")}</span>
                      <span className="font-bold">{stats.totalAppointments}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("staffPerformance.revenue")}</span>
                      <span className="font-bold text-green-600">{formatCurrency(stats.totalRevenue)} {t("common.currency")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("staffPerformance.commission")}</span>
                      <span className="font-bold text-blue-600">{formatCurrency(stats.totalCommission)} {t("common.currency")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("staffPerformance.avgPerAppointment")}</span>
                      <span className="font-bold">
                        {stats.totalAppointments > 0
                          ? (stats.totalRevenue / stats.totalAppointments).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2})
                          : 0}{" "}
                        {t("common.currency")}
                      </span>
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-sm text-muted-foreground mb-2">{t("staffPerformance.topServices")}</p>
                      {Object.entries(stats.serviceBreakdown)
                        .sort((a, b) => b[1].count - a[1].count)
                        .slice(0, 3)
                        .map(([service, data]) => (
                          <div key={service} className="flex justify-between text-sm">
                            <span className="truncate max-w-32">{service}</span>
                            <span>{data.count}x</span>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
