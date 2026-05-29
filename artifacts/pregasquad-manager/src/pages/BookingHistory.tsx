import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, User, Clock, Calendar, Check, UserPlus, Filter, RefreshCw, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { ar, enUS, fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

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
}

interface Staff {
  id: number;
  name: string;
  color: string;
}

export default function BookingHistory() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Synchronous init — no effect needed, avoids layout flash on mobile
  const [isMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStaff, setFilterStaff] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

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

  const { data: staffList = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

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
      toast({
        title: t("common.success"),
        description: t("bookingHistory.staffAssigned", { defaultValue: "Staff assigné avec succès" }),
      });
    },
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/appointments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({
        title: t("common.success"),
        description: t("bookingHistory.appointmentDeleted", { defaultValue: "Rendez-vous supprimé" }),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("bookingHistory.deleteFailed", { defaultValue: "Échec de la suppression" }),
        variant: "destructive",
      });
    },
  });

  const sortedAppointments = useMemo(() => {
    return [...appointments].sort((a, b) => {
      const aUnassigned = a.staff === "À assigner" || !a.staff;
      const bUnassigned = b.staff === "À assigner" || !b.staff;
      if (aUnassigned && !bUnassigned) return -1;
      if (!aUnassigned && bUnassigned) return 1;
      const dateA = new Date(`${a.date}T${a.startTime}`);
      const dateB = new Date(`${b.date}T${b.startTime}`);
      return dateB.getTime() - dateA.getTime();
    });
  }, [appointments]);

  const filteredAppointments = useMemo(() => {
    return sortedAppointments.filter((appt) => {
      const matchesSearch = 
        appt.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        appt.service?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const filterStaffId = filterStaff !== "all" && filterStaff !== "À assigner" ? parseInt(filterStaff) : null;
      const matchesStaff = filterStaff === "all" || filterStaff === "À assigner" ? (filterStaff === "all" || appt.staff === "À assigner" || !appt.staff) : (filterStaffId && (appt.staffId === filterStaffId || (!appt.staffId && appt.staff === staffList.find(s => s.id === filterStaffId)?.name)));
      
      const isUnassigned = appt.staff === "À assigner" || !appt.staff;
      const matchesStatus = 
        filterStatus === "all" ||
        (filterStatus === "unassigned" && isUnassigned) ||
        (filterStatus === "assigned" && !isUnassigned) ||
        (filterStatus === "paid" && appt.paid) ||
        (filterStatus === "unpaid" && !appt.paid);
      
      return matchesSearch && matchesStaff && matchesStatus;
    });
  }, [sortedAppointments, searchTerm, filterStaff, filterStatus]);

  const unassignedCount = appointments.filter(a => a.staff === "À assigner" || !a.staff).length;

  const formatDateLabel = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      if (isToday(date)) return t("common.today", { defaultValue: "Aujourd'hui" });
      if (isYesterday(date)) return t("common.yesterday", { defaultValue: "Hier" });
      return format(date, "dd MMM yyyy", { locale: getDateLocale() });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">
            {t("bookingHistory.title")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("bookingHistory.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unassignedCount > 0 && (
            <Badge variant="destructive" className="px-3 py-1">
              <UserPlus className="w-4 h-4 mr-1" />
              {unassignedCount} {t("bookingHistory.toAssign")}
            </Badge>
          )}
          <Button variant="outline" size="sm" disabled={isLoading} onClick={async () => { await refetch(); }}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("bookingHistory.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="w-4 h-4 mr-2" />
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
                <SelectTrigger className="w-[150px]">
                  <User className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("bookingHistory.allStaff")}</SelectItem>
                  <SelectItem value="À assigner">
                    <span className="text-sky-600">{t("bookingHistory.toAssignOption")}</span>
                  </SelectItem>
                  {staffList.map((staff) => (
                    <SelectItem key={staff.id} value={String(staff.id)}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: staff.color || "#888" }}
                        />
                        {staff.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className={isMobile ? "px-2" : undefined}>
          {isLoading ? (
            isMobile ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="p-3 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-48" />
                    <div className="flex items-center justify-between pt-2 border-t">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>{t("bookingHistory.client")}</TableHead>
                      <TableHead>{t("bookingHistory.service")}</TableHead>
                      <TableHead>{t("common.date")}</TableHead>
                      <TableHead>{t("planning.time")}</TableHead>
                      <TableHead>{t("common.price")}</TableHead>
                      <TableHead>{t("bookingHistory.status")}</TableHead>
                      <TableHead>{t("bookingHistory.staff")}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-32 rounded-md" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : filteredAppointments.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">{t("bookingHistory.noResults")}</p>
          ) : isMobile ? (
            <div className="space-y-2">
              {filteredAppointments.map((appt) => {
                const isUnassigned = appt.staff === "À assigner" || !appt.staff;
                return (
                  <div
                    key={appt.id}
                    className={cn(
                      "p-3 rounded-lg border",
                      isUnassigned && "bg-sky-500/5 border-sky-200 dark:border-sky-800"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm truncate">{appt.client}</span>
                      </div>
                      <Badge variant={appt.paid ? "default" : "secondary"} className="text-[10px] shrink-0">
                        {appt.paid ? t("common.paid") : t("common.unpaid")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{appt.service} · {appt.duration} min</p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t">
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
                      <span className="font-semibold text-sm text-primary">{appt.total} DH</span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Select
                        value={appt.staff || "À assigner"}
                        onValueChange={(value) => {
                          updateAppointmentMutation.mutate({ id: appt.id, staff: value });
                        }}
                      >
                        <SelectTrigger className={cn(
                          "h-8 text-xs flex-1",
                          isUnassigned && "border-sky-500/50 text-sky-600"
                        )}>
                          <div className="flex items-center gap-2">
                            {isUnassigned ? (
                              <UserPlus className="w-3 h-3" />
                            ) : (
                              <Check className="w-3 h-3 text-green-500" />
                            )}
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="À assigner">
                            <span className="text-sky-600">{t("bookingHistory.toAssignOption")}</span>
                          </SelectItem>
                          {staffList.map((staff) => (
                            <SelectItem key={staff.id} value={staff.name}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: staff.color || "#888" }}
                                />
                                {staff.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("bookingHistory.deleteConfirmTitle", { defaultValue: "Supprimer ce rendez-vous ?" })}</AlertDialogTitle>
                            <AlertDialogDescription>
                              <strong>{appt.client}</strong> — {appt.service}<br />
                              {formatDateLabel(appt.date)} à {appt.startTime}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive hover:bg-destructive/90"
                              onClick={() => deleteAppointmentMutation.mutate(appt.id)}
                            >
                              {t("common.delete")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
                    <TableHead className="w-[180px]">{t("bookingHistory.client")}</TableHead>
                    <TableHead>{t("bookingHistory.service")}</TableHead>
                    <TableHead className="w-[140px]">{t("common.date")}</TableHead>
                    <TableHead className="w-[80px]">{t("planning.time")}</TableHead>
                    <TableHead className="w-[100px]">{t("common.price")}</TableHead>
                    <TableHead className="w-[80px]">{t("bookingHistory.status")}</TableHead>
                    <TableHead className="w-[180px]">{t("bookingHistory.staff")}</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAppointments.map((appt) => {
                    const isUnassigned = appt.staff === "À assigner" || !appt.staff;
                    return (
                      <TableRow 
                        key={appt.id}
                        className={cn(
                          isUnassigned && "bg-sky-500/5"
                        )}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium truncate max-w-[140px]">{appt.client}</span>
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
                          <span className="font-semibold text-primary">{appt.total} DH</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={appt.paid ? "default" : "secondary"} className="text-xs">
                            {appt.paid ? t("common.paid") : t("common.unpaid")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={appt.staff || "À assigner"}
                            onValueChange={(value) => {
                              updateAppointmentMutation.mutate({ id: appt.id, staff: value });
                            }}
                          >
                            <SelectTrigger className={cn(
                              "h-8 text-xs",
                              isUnassigned && "border-sky-500/50 text-sky-600"
                            )}>
                              <div className="flex items-center gap-2">
                                {isUnassigned ? (
                                  <UserPlus className="w-3 h-3" />
                                ) : (
                                  <Check className="w-3 h-3 text-green-500" />
                                )}
                                <SelectValue />
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="À assigner">
                                <span className="text-sky-600">{t("bookingHistory.toAssignOption")}</span>
                              </SelectItem>
                              {staffList.map((staff) => (
                                <SelectItem key={staff.id} value={staff.name}>
                                  <div className="flex items-center gap-2">
                                    <div 
                                      className="w-3 h-3 rounded-full" 
                                      style={{ backgroundColor: staff.color || "#888" }}
                                    />
                                    {staff.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("bookingHistory.deleteConfirmTitle", { defaultValue: "Supprimer ce rendez-vous ?" })}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  <strong>{appt.client}</strong> — {appt.service}<br />
                                  {formatDateLabel(appt.date)} à {appt.startTime}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive hover:bg-destructive/90"
                                  onClick={() => deleteAppointmentMutation.mutate(appt.id)}
                                >
                                  {t("common.delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          
          <div className="mt-4 text-sm text-muted-foreground text-center">
            {t("bookingHistory.showingCount", { count: filteredAppointments.length })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
