import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, User, Clock, Calendar, Check, UserPlus, Filter,
  RefreshCw, Trash2, RotateCcw, Loader2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  format, parseISO, isToday, isYesterday, isFuture, isAfter, isBefore,
  startOfDay, endOfDay, addDays, subDays,
} from "date-fns";
import { ar, enUS, fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Appointment {
  id: number;
  client: string;
  service: string;
  staff: string;
  staffId?: number | null;
  date: string;
  startTime: string;
  duration: number;
  price: number;
  total: number;
  paid: boolean;
  bookingStatus?: string;
}

interface Staff {
  id: number;
  name: string;
  color: string;
}

type MainTab = "incoming" | "history";

export default function BookingHistory() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

  const [mainTab, setMainTab] = useState<MainTab>("incoming");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStaff, setFilterStaff] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // History tab: selected date (null = all)
  const [historyDate, setHistoryDate] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd")
  );

  const [rebookApt, setRebookApt] = useState<Appointment | null>(null);
  const [rebookDate, setRebookDate] = useState<string>("");
  const [rebookTime, setRebookTime] = useState<string>("");

  const getDateLocale = () => {
    switch (i18n.language) {
      case "ar": return ar;
      case "fr": return fr;
      default: return enUS;
    }
  };

  const { data: appointments = [], isLoading, refetch } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments/all"],
    queryFn: async () => {
      const res = await fetch("/api/appointments/all");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: staffList = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, staff }: { id: number; staff: string }) => {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      toast({ title: t("common.success") });
    },
  });

  const rebookMutation = useMutation({
    mutationFn: async ({ apt, date, time }: { apt: Appointment; date: string; time: string }) => {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: apt.client, service: apt.service, staff: apt.staff, staffId: apt.staffId,
          date, startTime: time, duration: apt.duration, price: apt.price, total: apt.total,
          paid: false, bookingStatus: "confirmed", createdBy: "rebook",
        }),
      });
      if (!res.ok) throw new Error("Failed to rebook");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setRebookApt(null);
      toast({ title: t("bookingHistory.rebookSuccess", { defaultValue: "Rendez-vous réservé ✅" }) });
    },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/appointments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: t("common.success") });
    },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
  });

  const today = startOfDay(new Date());

  // Split appointments into incoming vs history
  const incomingAppointments = useMemo(() => {
    return appointments.filter(a => {
      try {
        const d = parseISO(a.date);
        return isAfter(d, subDays(today, 1)) || isToday(d);
      } catch { return false; }
    }).sort((a, b) => {
      const da = new Date(`${a.date}T${a.startTime}`);
      const db = new Date(`${b.date}T${b.startTime}`);
      return da.getTime() - db.getTime();
    });
  }, [appointments, today]);

  const historyAppointments = useMemo(() => {
    return appointments.filter(a => {
      try {
        const d = parseISO(a.date);
        return isBefore(d, today) && !isToday(d);
      } catch { return false; }
    }).sort((a, b) => {
      const da = new Date(`${a.date}T${a.startTime}`);
      const db = new Date(`${b.date}T${b.startTime}`);
      return db.getTime() - da.getTime();
    });
  }, [appointments, today]);

  // Apply search/filter to current tab's data
  const applyFilters = (list: Appointment[]) =>
    list.filter((appt) => {
      const matchesSearch =
        appt.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        appt.service?.toLowerCase().includes(searchTerm.toLowerCase());

      const filterStaffId = filterStaff !== "all" && filterStaff !== "À assigner" ? parseInt(filterStaff) : null;
      const matchesStaff =
        filterStaff === "all" ? true :
        filterStaff === "À assigner" ? (!appt.staff || appt.staff === "À assigner") :
        filterStaffId ? (appt.staffId === filterStaffId || appt.staff === staffList.find(s => s.id === filterStaffId)?.name) :
        true;

      const isUnassigned = appt.staff === "À assigner" || !appt.staff;
      const matchesStatus =
        filterStatus === "all" ? true :
        filterStatus === "unassigned" ? isUnassigned :
        filterStatus === "assigned" ? !isUnassigned :
        filterStatus === "paid" ? appt.paid :
        filterStatus === "unpaid" ? !appt.paid :
        true;

      return matchesSearch && matchesStaff && matchesStatus;
    });

  // History: also filter by selected date
  const filteredIncoming = useMemo(() => applyFilters(incomingAppointments), [incomingAppointments, searchTerm, filterStaff, filterStatus]);
  const filteredHistoryByDate = useMemo(() => {
    const base = applyFilters(historyAppointments);
    if (!historyDate) return base;
    return base.filter(a => a.date === historyDate);
  }, [historyAppointments, historyDate, searchTerm, filterStaff, filterStatus]);

  const currentList = mainTab === "incoming" ? filteredIncoming : filteredHistoryByDate;

  const unassignedIncoming = incomingAppointments.filter(a => a.staff === "À assigner" || !a.staff).length;

  const formatDateLabel = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      if (isToday(date)) return t("common.today", { defaultValue: "اليوم" });
      if (isYesterday(date)) return t("common.yesterday", { defaultValue: "أمس" });
      return format(date, "dd MMM yyyy", { locale: getDateLocale() });
    } catch { return dateStr; }
  };

  const getStatusBadge = (appt: Appointment) => {
    if (appt.bookingStatus === "completed" || appt.paid) return <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200 hover:bg-green-100">{t("common.paid")}</Badge>;
    if (appt.bookingStatus === "confirmed") return <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200">{t("bookingHistory.confirmed", { defaultValue: "مؤكد" })}</Badge>;
    if (appt.bookingStatus === "cancelled") return <Badge variant="destructive" className="text-[10px]">{t("bookingHistory.cancelled", { defaultValue: "ملغى" })}</Badge>;
    return <Badge variant="secondary" className="text-[10px]">{t("bookingHistory.pending", { defaultValue: "قيد الانتظار" })}</Badge>;
  };

  // Calendar day navigation for history tab
  const navigateHistoryDay = (dir: 1 | -1) => {
    try {
      const d = parseISO(historyDate);
      const next = dir === 1 ? addDays(d, 1) : subDays(d, 1);
      // Don't go into the future for history tab
      if (!isAfter(next, today)) {
        setHistoryDate(format(next, "yyyy-MM-dd"));
      }
    } catch {}
  };

  const AppointmentActions = ({ appt }: { appt: Appointment }) => {
    const isUnassigned = appt.staff === "À assigner" || !appt.staff;
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
          title={t("bookingHistory.rebook", { defaultValue: "إعادة حجز" })}
          onClick={() => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            setRebookDate(tomorrow.toISOString().split("T")[0]);
            setRebookTime(appt.startTime);
            setRebookApt(appt);
          }}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("bookingHistory.deleteConfirmTitle", { defaultValue: "حذف هذا الموعد؟" })}</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{appt.client}</strong> — {appt.service}<br />
                {formatDateLabel(appt.date)} — {appt.startTime}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteAppointmentMutation.mutate(appt.id)}>
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  };

  const StaffSelect = ({ appt }: { appt: Appointment }) => {
    const isUnassigned = appt.staff === "À assigner" || !appt.staff;
    return (
      <Select value={appt.staff || "À assigner"} onValueChange={(value) => updateAppointmentMutation.mutate({ id: appt.id, staff: value })}>
        <SelectTrigger className={cn("h-7 text-xs", isUnassigned && "border-sky-500/50 text-sky-600")}>
          <div className="flex items-center gap-1.5">
            {isUnassigned ? <UserPlus className="w-3 h-3" /> : <Check className="w-3 h-3 text-green-500" />}
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="À assigner"><span className="text-sky-600">{t("bookingHistory.toAssignOption")}</span></SelectItem>
          {staffList.map(s => (
            <SelectItem key={s.id} value={s.name}>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color || "#888" }} />
                {s.name}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="flex flex-col h-full p-4 md:p-6 gap-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">{t("bookingHistory.title")}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t("bookingHistory.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {unassignedIncoming > 0 && (
            <Badge variant="destructive" className="px-3 py-1">
              <UserPlus className="w-3.5 h-3.5 mr-1" />
              {unassignedIncoming} {t("bookingHistory.toAssign")}
            </Badge>
          )}
          <Button variant="outline" size="sm" disabled={isLoading} onClick={() => refetch()}>
            <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 shrink-0 w-fit">
        <button
          onClick={() => setMainTab("incoming")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            mainTab === "incoming"
              ? "bg-background shadow-sm text-primary border border-primary/20"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Calendar className="w-4 h-4" />
          الحجوزات القادمة
          {incomingAppointments.length > 0 && (
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
              mainTab === "incoming" ? "bg-primary text-white" : "bg-muted text-muted-foreground"
            )}>
              {incomingAppointments.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setMainTab("history")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            mainTab === "history"
              ? "bg-background shadow-sm text-primary border border-primary/20"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <RotateCcw className="w-4 h-4" />
          السجل
          {historyAppointments.length > 0 && (
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
              mainTab === "history" ? "bg-primary text-white" : "bg-muted text-muted-foreground"
            )}>
              {historyAppointments.length}
            </span>
          )}
        </button>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Filters bar */}
        <div className="px-4 pt-4 pb-3 border-b shrink-0 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("bookingHistory.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[130px] h-9 text-xs">
                  <Filter className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  <SelectItem value="unassigned">{t("bookingHistory.unassigned")}</SelectItem>
                  <SelectItem value="assigned">{t("bookingHistory.assigned")}</SelectItem>
                  <SelectItem value="paid">{t("bookingHistory.paid")}</SelectItem>
                  <SelectItem value="unpaid">{t("bookingHistory.unpaid")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStaff} onValueChange={setFilterStaff}>
                <SelectTrigger className="w-[130px] h-9 text-xs">
                  <User className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("bookingHistory.allStaff")}</SelectItem>
                  <SelectItem value="À assigner"><span className="text-sky-600">{t("bookingHistory.toAssignOption")}</span></SelectItem>
                  {staffList.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color || "#888" }} />
                        {s.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* History tab date picker */}
          {mainTab === "history" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateHistoryDay(-1)}
                className="p-1.5 rounded-lg border hover:bg-muted transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="flex-1 relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  value={historyDate}
                  max={format(subDays(new Date(), 1), "yyyy-MM-dd")}
                  onChange={e => setHistoryDate(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
              <button
                onClick={() => navigateHistoryDay(1)}
                disabled={historyDate >= format(subDays(new Date(), 1), "yyyy-MM-dd")}
                className="p-1.5 rounded-lg border hover:bg-muted transition-colors disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setHistoryDate("")}
                className={cn(
                  "px-3 py-1.5 text-xs rounded-lg border transition-colors",
                  !historyDate ? "bg-primary text-white border-primary" : "hover:bg-muted"
                )}
              >
                الكل
              </button>
            </div>
          )}
        </div>

        {/* Table / cards */}
        <CardContent className={cn("flex-1 min-h-0 overflow-auto", isMobile ? "px-2 pt-3" : "pt-3")}>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-3 rounded-lg border space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              ))}
            </div>
          ) : currentList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Calendar className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">
                {mainTab === "incoming" ? "لا توجد حجوزات قادمة" : "لا توجد مواعيد في هذا التاريخ"}
              </p>
            </div>
          ) : isMobile ? (
            <div className="space-y-2 pb-4">
              {currentList.map((appt) => {
                const isUnassigned = appt.staff === "À assigner" || !appt.staff;
                return (
                  <div
                    key={appt.id}
                    className={cn(
                      "p-3 rounded-xl border",
                      isUnassigned && "bg-sky-500/5 border-sky-200 dark:border-sky-800",
                      mainTab === "incoming" && "border-l-4"
                    )}
                    style={mainTab === "incoming" ? {
                      borderLeftColor: staffList.find(s => s.id === appt.staffId || s.name === appt.staff)?.color || "transparent"
                    } : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="font-semibold text-sm truncate">{appt.client}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{appt.service} · {appt.duration} min</p>
                      </div>
                      {getStatusBadge(appt)}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t gap-2">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDateLabel(appt.date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {appt.startTime}
                        </span>
                      </div>
                      <span className="font-bold text-sm text-primary shrink-0">{appt.total} DH</span>
                    </div>
                    <div className="mt-2 flex gap-2 items-center">
                      <div className="flex-1 min-w-0"><StaffSelect appt={appt} /></div>
                      <AppointmentActions appt={appt} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[170px]">{t("bookingHistory.client")}</TableHead>
                    <TableHead>{t("bookingHistory.service")}</TableHead>
                    <TableHead className="w-[130px]">{t("common.date")}</TableHead>
                    <TableHead className="w-[75px]">{t("planning.time")}</TableHead>
                    <TableHead className="w-[90px]">{t("common.price")}</TableHead>
                    <TableHead className="w-[90px]">{t("bookingHistory.status")}</TableHead>
                    <TableHead className="w-[170px]">{t("bookingHistory.staff")}</TableHead>
                    <TableHead className="w-[70px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentList.map((appt) => {
                    const isUnassigned = appt.staff === "À assigner" || !appt.staff;
                    const staffColor = staffList.find(s => s.id === appt.staffId || s.name === appt.staff)?.color;
                    return (
                      <TableRow
                        key={appt.id}
                        className={cn(isUnassigned && "bg-sky-500/5")}
                        style={mainTab === "incoming" && staffColor ? { borderLeft: `3px solid ${staffColor}` } : undefined}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate max-w-[130px] text-sm">{appt.client}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm truncate max-w-[200px] block">{appt.service}</span>
                          <span className="text-xs text-muted-foreground">{appt.duration} min</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="w-3 h-3 text-muted-foreground" />
                            {formatDateLabel(appt.date)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            {appt.startTime}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-primary text-sm">{appt.total} DH</span>
                        </TableCell>
                        <TableCell>{getStatusBadge(appt)}</TableCell>
                        <TableCell><StaffSelect appt={appt} /></TableCell>
                        <TableCell><AppointmentActions appt={appt} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {currentList.length > 0 && (
            <p className="text-xs text-muted-foreground text-center mt-3 pb-2">
              {t("bookingHistory.showingCount", { count: currentList.length })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Rebook Dialog */}
      <Dialog open={!!rebookApt} onOpenChange={(open) => { if (!open) setRebookApt(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-primary" />
              {t("bookingHistory.rebook", { defaultValue: "إعادة حجز" })}
            </DialogTitle>
          </DialogHeader>
          {rebookApt && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium">{rebookApt.client}</p>
                <p className="text-muted-foreground">{rebookApt.service} · {rebookApt.duration} min</p>
                <p className="text-muted-foreground">{t("bookingHistory.staff")}: {rebookApt.staff}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("common.date")}</label>
                <Input type="date" value={rebookDate} min={new Date().toISOString().split("T")[0]} onChange={(e) => setRebookDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("planning.time")}</label>
                <Input type="time" value={rebookTime} onChange={(e) => setRebookTime(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRebookApt(null)}>{t("common.cancel")}</Button>
            <Button
              disabled={!rebookDate || !rebookTime || rebookMutation.isPending}
              onClick={() => rebookApt && rebookMutation.mutate({ apt: rebookApt, date: rebookDate, time: rebookTime })}
            >
              {rebookMutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("common.loading")}</>
                : <><RotateCcw className="w-4 h-4 mr-2" />{t("bookingHistory.rebook", { defaultValue: "إعادة حجز" })}</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
