import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Users, DollarSign, Calendar, TrendingUp, Award, RefreshCw, Target, Plus, Calculator, CheckCircle, XCircle, Clock } from "lucide-react";
import { SpinningLogo } from "@/components/ui/spinning-logo";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import type { Staff, Appointment, Service, StaffGoal } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";


export default function StaffPerformance() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [selectedStaff, setSelectedStaff] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("performance");
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [selectedGoalStaff, setSelectedGoalStaff] = useState<Staff | null>(null);
  const [goalForm, setGoalForm] = useState({
    revenueTarget: 0,
    appointmentsTarget: 0,
    bonusPercentage: 5,
  });

  const { data: staffList = [], isLoading: loadingStaff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: services = [], isLoading: loadingServices } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: appointments = [], isLoading: loadingAppointments } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments/all"],
  });

  const { data: staffCommissions = [] } = useQuery<{ id: number; staffId: number; serviceId: number; percentage: number }[]>({
    queryKey: ["/api/staff-commissions"],
  });

  const { data: staffGoals = [], isLoading: loadingGoals } = useQuery<StaffGoal[]>({
    queryKey: ["/api/staff/goals/summary", selectedMonth],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/staff/goals/summary?period=${selectedMonth}`);
      return res.json();
    },
  });

  const saveGoalMutation = useMutation({
    mutationFn: (data: { staffId: number; goal: any }) =>
      apiRequest("POST", `/api/staff/${data.staffId}/goals`, data.goal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/goals/summary"] });
      setGoalDialogOpen(false);
      toast({ title: t("goals.goalSaved"), description: t("goals.goalSavedDesc") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("goals.goalSaveFailed"), variant: "destructive" });
    },
  });

  const calculateGoalMutation = useMutation({
    mutationFn: (data: { staffId: number; period: string }) =>
      apiRequest("POST", `/api/staff/${data.staffId}/goals/calculate`, { period: data.period }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/goals/summary"] });
      toast({ title: t("goals.calculated"), description: t("goals.calculatedDesc") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("goals.calculateFailed"), variant: "destructive" });
    },
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

  const calculateStaffStats = useCallback((staffId: number, staffName: string) => {
    const staffAppts = monthAppointments.filter((a) => a.staffId === staffId || (!a.staffId && a.staff === staffName));
    let totalRevenue = 0;
    let totalCommission = 0;
    const serviceBreakdown: Record<string, { count: number; revenue: number }> = {};

    for (const appt of staffAppts) {
      totalRevenue += appt.total;
      const serviceName = appt.service || "Unknown";
      const service = serviceMap.get(serviceName);
      let commissionRate = service?.commissionPercent || 50;
      if (service) {
        const customComm = staffCommissions.find(c => c.staffId === staffId && c.serviceId === service.id);
        if (customComm) {
          commissionRate = customComm.percentage;
        }
      }
      totalCommission += (appt.total * commissionRate) / 100;

      if (!serviceBreakdown[serviceName]) {
        serviceBreakdown[serviceName] = { count: 0, revenue: 0 };
      }
      serviceBreakdown[serviceName].count++;
      serviceBreakdown[serviceName].revenue += appt.total;
    }

    return {
      staffName,
      totalAppointments: staffAppts.length,
      totalRevenue,
      totalCommission,
      serviceBreakdown,
    };
  }, [monthAppointments, serviceMap, staffCommissions]);

  const allStaffStats = useMemo(() => 
    staffList.map((s) => calculateStaffStats(s.id, s.name)),
    [staffList, calculateStaffStats]
  );

  const filteredStaffStats = useMemo(() => {
    if (selectedStaff === "all") {
      return allStaffStats;
    }
    return allStaffStats.filter((s) => s.staffName === selectedStaff);
  }, [allStaffStats, selectedStaff]);

  const { totalRevenue, totalAppointments, totalCommissions, topPerformer } = useMemo(() => ({
    totalRevenue: filteredStaffStats.reduce((sum, s) => sum + s.totalRevenue, 0),
    totalAppointments: filteredStaffStats.reduce((sum, s) => sum + s.totalAppointments, 0),
    totalCommissions: filteredStaffStats.reduce((sum, s) => sum + s.totalCommission, 0),
    topPerformer: filteredStaffStats.reduce(
      (top, s) => (s.totalRevenue > (top?.totalRevenue || 0) ? s : top),
      filteredStaffStats[0]
    ),
  }), [filteredStaffStats]);

  const COLORS = ["#d63384", "#20c997", "#0d6efd", "#ffc107", "#6610f2"];

  const chartData = useMemo(() => filteredStaffStats.map((s) => ({
    name: s.staffName,
    appointments: s.totalAppointments,
    revenue: s.totalRevenue,
    commission: s.totalCommission,
  })), [filteredStaffStats]);

  const pieData = useMemo(() => filteredStaffStats.map((s, i) => ({
    name: s.staffName,
    value: s.totalRevenue,
    color: COLORS[i % COLORS.length],
  })), [filteredStaffStats]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return {
      value: format(date, "yyyy-MM"),
      label: format(date, "MMMM yyyy"),
    };
  }), []);

  const getGoalForStaff = (staffId: number) => staffGoals.find(g => g.staffId === staffId);

  const getProgressPercent = (actual: number, target: number) => {
    if (target <= 0) return 0;
    return Math.min(100, Math.round((actual / target) * 100));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "achieved": return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "missed": return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const openGoalDialog = (staff: Staff) => {
    setSelectedGoalStaff(staff);
    const existingGoal = getGoalForStaff(staff.id);
    if (existingGoal) {
      setGoalForm({
        revenueTarget: existingGoal.revenueTarget,
        appointmentsTarget: existingGoal.appointmentsTarget,
        bonusPercentage: existingGoal.bonusPercentage,
      });
    } else {
      setGoalForm({ revenueTarget: 0, appointmentsTarget: 0, bonusPercentage: 5 });
    }
    setGoalDialogOpen(true);
  };

  const handleSaveGoal = () => {
    if (!selectedGoalStaff) return;
    saveGoalMutation.mutate({
      staffId: selectedGoalStaff.id,
      goal: { ...goalForm, period: selectedMonth },
    });
  };

  const handleCalculateAll = () => {
    staffGoals.forEach(goal => {
      calculateGoalMutation.mutate({ staffId: goal.staffId, period: selectedMonth });
    });
  };

  if (isLoading) {
    return (
      <div className="loading-container min-h-[60vh]" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
        <SpinningLogo size="lg" />
      </div>
    );
  }

  return (
    <div className="p-2 md:p-4 lg:p-6 space-y-4 md:space-y-6 animate-fade-in" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{t("staffPerformance.pageTitle")}</h1>
          <p className="text-sm md:text-base text-muted-foreground">{t("staffPerformance.pageDesc")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2 md:gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              queryClient.invalidateQueries();
              toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
            }}
            title={t("common.refresh")}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            {t("staffPerformance.title")}
          </TabsTrigger>
          <TabsTrigger value="goals" className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            {t("goals.title")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4 md:space-y-6 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-pink-100 rounded-lg">
                    <Users className="w-5 h-5 text-pink-600" />
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
                  <div className="p-2 bg-pink-100 rounded-lg">
                    <Calendar className="w-5 h-5 text-pink-600" />
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
                          <span className="font-bold text-pink-600">{formatCurrency(stats.totalCommission)} {t("common.currency")}</span>
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
        </TabsContent>

        <TabsContent value="goals" className="space-y-4 md:space-y-6 mt-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">{t("goals.monthlyGoals")}</h2>
              <p className="text-sm text-muted-foreground">{t("goals.monthlyGoalsDesc")}</p>
            </div>
            <Button onClick={handleCalculateAll} disabled={staffGoals.length === 0 || calculateGoalMutation.isPending}>
              <Calculator className="w-4 h-4 mr-2" />
              {t("goals.calculateAll")}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {staffList.map((staff) => {
              const goal = getGoalForStaff(staff.id);
              const stats = allStaffStats.find(s => s.staffName === staff.name);
              const revenueProgress = goal ? getProgressPercent(goal.actualRevenue, goal.revenueTarget) : 0;
              const appointmentsProgress = goal ? getProgressPercent(goal.actualAppointments, goal.appointmentsTarget) : 0;

              return (
                <Card key={staff.id} className="border-2" style={{ borderColor: staff.color }}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-lg">{staff.name}</CardTitle>
                      {goal && (
                        <div className="flex items-center gap-1">
                          {getStatusIcon(goal.status)}
                          <Badge variant={goal.status === "achieved" ? "default" : goal.status === "missed" ? "destructive" : "secondary"}>
                            {t(`goals.status.${goal.status}`)}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {goal ? (
                      <>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>{t("goals.revenueTarget")}</span>
                            <span>{formatCurrency(goal.actualRevenue)} / {formatCurrency(goal.revenueTarget)} {t("common.currency")}</span>
                          </div>
                          <Progress value={revenueProgress} className="h-2" />
                          <p className="text-xs text-muted-foreground text-right">{revenueProgress}%</p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>{t("goals.appointmentsTarget")}</span>
                            <span>{goal.actualAppointments} / {goal.appointmentsTarget}</span>
                          </div>
                          <Progress value={appointmentsProgress} className="h-2" />
                          <p className="text-xs text-muted-foreground text-right">{appointmentsProgress}%</p>
                        </div>
                        <div className="pt-2 border-t space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>{t("goals.bonusPercentage")}</span>
                            <span>{goal.bonusPercentage}%</span>
                          </div>
                          {goal.status === "achieved" && (
                            <div className="flex justify-between text-sm font-bold text-green-600">
                              <span>{t("goals.bonusEarned")}</span>
                              <span>{formatCurrency(goal.bonusAmount)} {t("common.currency")}</span>
                            </div>
                          )}
                        </div>
                        <Button variant="outline" size="sm" className="w-full" onClick={() => openGoalDialog(staff)}>
                          {t("goals.editGoal")}
                        </Button>
                      </>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground mb-4">{t("goals.noGoalSet")}</p>
                        <Button onClick={() => openGoalDialog(staff)}>
                          <Plus className="w-4 h-4 mr-2" />
                          {t("goals.setGoal")}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedGoalStaff ? `${t("goals.setGoalFor")} ${selectedGoalStaff.name}` : t("goals.setGoal")}
            </DialogTitle>
            <DialogDescription>{t("goals.setGoalDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("goals.revenueTarget")} ({t("common.currency")})</Label>
              <Input
                type="number"
                value={goalForm.revenueTarget}
                onChange={(e) => setGoalForm({ ...goalForm, revenueTarget: parseFloat(e.target.value) || 0 })}
                placeholder="5000"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("goals.appointmentsTarget")}</Label>
              <Input
                type="number"
                value={goalForm.appointmentsTarget}
                onChange={(e) => setGoalForm({ ...goalForm, appointmentsTarget: parseInt(e.target.value) || 0 })}
                placeholder="50"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("goals.bonusPercentage")} (%)</Label>
              <Input
                type="number"
                value={goalForm.bonusPercentage}
                onChange={(e) => setGoalForm({ ...goalForm, bonusPercentage: parseFloat(e.target.value) || 0 })}
                placeholder="5"
                min={0}
                max={100}
              />
              <p className="text-xs text-muted-foreground">{t("goals.bonusExplanation")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSaveGoal} disabled={saveGoalMutation.isPending}>
              {saveGoalMutation.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
