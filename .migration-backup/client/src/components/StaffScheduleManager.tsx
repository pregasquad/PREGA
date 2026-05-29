import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, Coffee, CalendarOff, Check, X, Trash2, Plus, Save } from "lucide-react";
import {
  useStaffSchedule,
  useSaveStaffSchedule,
  useStaffBreaks,
  useCreateStaffBreak,
  useDeleteStaffBreak,
  useStaffTimeOff,
  useCreateStaffTimeOff,
  useUpdateStaffTimeOff,
  useDeleteStaffTimeOff,
} from "@/hooks/use-salon-data";
import type { Staff as StaffType, StaffSchedule, StaffBreak, StaffTimeOff } from "@shared/schema";

interface Props {
  staff: StaffType;
  onClose: () => void;
  defaultTab?: "schedule" | "breaks" | "timeoff";
}

const DAYS_OF_WEEK = [
  { value: 0, key: "sunday" },
  { value: 1, key: "monday" },
  { value: 2, key: "tuesday" },
  { value: 3, key: "wednesday" },
  { value: 4, key: "thursday" },
  { value: 5, key: "friday" },
  { value: 6, key: "saturday" },
];

const DEFAULT_SCHEDULE = DAYS_OF_WEEK.map(day => ({
  dayOfWeek: day.value,
  startTime: "09:00",
  endTime: "18:00",
  isActive: day.value !== 0 && day.value !== 6,
}));

export default function StaffScheduleManager({ staff, onClose, defaultTab = "schedule" }: Props) {
  const { t } = useTranslation();
  const { data: scheduleData = [] } = useStaffSchedule(staff.id);
  const { data: breaksData = [] } = useStaffBreaks(staff.id);
  const { data: timeOffData = [] } = useStaffTimeOff(staff.id);

  const saveSchedule = useSaveStaffSchedule();
  const createBreak = useCreateStaffBreak();
  const deleteBreak = useDeleteStaffBreak();
  const createTimeOff = useCreateStaffTimeOff();
  const updateTimeOff = useUpdateStaffTimeOff();
  const deleteTimeOff = useDeleteStaffTimeOff();

  const [schedules, setSchedules] = useState(DEFAULT_SCHEDULE);
  const [newBreak, setNewBreak] = useState({ date: "", startTime: "12:00", endTime: "13:00", reason: "" });
  const [newTimeOff, setNewTimeOff] = useState({ startDate: "", endDate: "", reason: "" });

  useEffect(() => {
    if (scheduleData.length > 0) {
      const mergedSchedule = DEFAULT_SCHEDULE.map(defaultDay => {
        const existing = scheduleData.find((s: StaffSchedule) => s.dayOfWeek === defaultDay.dayOfWeek);
        return existing ? {
          dayOfWeek: existing.dayOfWeek,
          startTime: existing.startTime,
          endTime: existing.endTime,
          isActive: existing.isActive,
        } : defaultDay;
      });
      setSchedules(mergedSchedule);
    }
  }, [scheduleData]);

  const handleSaveSchedule = async () => {
    await saveSchedule.mutateAsync({ staffId: staff.id, schedules });
  };

  const handleAddBreak = async () => {
    if (!newBreak.date || !newBreak.startTime || !newBreak.endTime) return;
    await createBreak.mutateAsync({
      staffId: staff.id,
      date: newBreak.date,
      startTime: newBreak.startTime,
      endTime: newBreak.endTime,
      reason: newBreak.reason || undefined,
    });
    setNewBreak({ date: "", startTime: "12:00", endTime: "13:00", reason: "" });
  };

  const handleAddTimeOff = async () => {
    if (!newTimeOff.startDate || !newTimeOff.endDate) return;
    await createTimeOff.mutateAsync({
      staffId: staff.id,
      startDate: newTimeOff.startDate,
      endDate: newTimeOff.endDate,
      reason: newTimeOff.reason || undefined,
    });
    setNewTimeOff({ startDate: "", endDate: "", reason: "" });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500">{t("schedule.approved", "Approved")}</Badge>;
      case "rejected":
        return <Badge variant="destructive">{t("schedule.rejected", "Rejected")}</Badge>;
      default:
        return <Badge variant="secondary">{t("schedule.pending", "Pending")}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: staff.color }}
          >
            {staff.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="font-semibold text-lg">{staff.name}</h3>
            <p className="text-sm text-muted-foreground">{t("schedule.manageSchedule", "Manage Schedule")}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="schedule" className="gap-2">
            <Calendar className="h-4 w-4" />
            {t("schedule.weeklySchedule", "Weekly")}
          </TabsTrigger>
          <TabsTrigger value="breaks" className="gap-2">
            <Coffee className="h-4 w-4" />
            {t("schedule.breaks", "Breaks")}
          </TabsTrigger>
          <TabsTrigger value="timeoff" className="gap-2">
            <CalendarOff className="h-4 w-4" />
            {t("schedule.timeOff", "Time Off")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-4 mt-4">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t("schedule.workingHours", "Working Hours")}
              </CardTitle>
              <CardDescription>{t("schedule.workingHoursDesc", "Set the working hours for each day")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {schedules.map((day, index) => (
                <div key={day.dayOfWeek} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div className="w-24">
                    <span className="font-medium text-sm">
                      {t(`days.${DAYS_OF_WEEK[day.dayOfWeek].key}`, DAYS_OF_WEEK[day.dayOfWeek].key)}
                    </span>
                  </div>
                  <Switch
                    checked={day.isActive}
                    onCheckedChange={(checked) => {
                      const updated = [...schedules];
                      updated[index].isActive = checked;
                      setSchedules(updated);
                    }}
                  />
                  {day.isActive && (
                    <>
                      <Input
                        type="time"
                        value={day.startTime}
                        onChange={(e) => {
                          const updated = [...schedules];
                          updated[index].startTime = e.target.value;
                          setSchedules(updated);
                        }}
                        className="w-24"
                      />
                      <span className="text-muted-foreground">-</span>
                      <Input
                        type="time"
                        value={day.endTime}
                        onChange={(e) => {
                          const updated = [...schedules];
                          updated[index].endTime = e.target.value;
                          setSchedules(updated);
                        }}
                        className="w-24"
                      />
                    </>
                  )}
                  {!day.isActive && (
                    <span className="text-sm text-muted-foreground">{t("schedule.dayOff", "Day Off")}</span>
                  )}
                </div>
              ))}
              <Button onClick={handleSaveSchedule} className="w-full mt-4 gap-2" disabled={saveSchedule.isPending}>
                <Save className="h-4 w-4" />
                {t("schedule.saveSchedule", "Save Schedule")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breaks" className="space-y-4 mt-4">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {t("schedule.addBreak", "Add Break")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("schedule.date", "Date")}</Label>
                  <Input
                    type="date"
                    value={newBreak.date}
                    onChange={(e) => setNewBreak({ ...newBreak, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("schedule.reason", "Reason")}</Label>
                  <Input
                    placeholder={t("schedule.reasonPlaceholder", "Lunch, Personal, etc.")}
                    value={newBreak.reason}
                    onChange={(e) => setNewBreak({ ...newBreak, reason: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("schedule.startTime", "Start Time")}</Label>
                  <Input
                    type="time"
                    value={newBreak.startTime}
                    onChange={(e) => setNewBreak({ ...newBreak, startTime: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("schedule.endTime", "End Time")}</Label>
                  <Input
                    type="time"
                    value={newBreak.endTime}
                    onChange={(e) => setNewBreak({ ...newBreak, endTime: e.target.value })}
                  />
                </div>
              </div>
              <Button onClick={handleAddBreak} className="w-full gap-2" disabled={createBreak.isPending || !newBreak.date}>
                <Plus className="h-4 w-4" />
                {t("schedule.addBreakBtn", "Add Break")}
              </Button>
            </CardContent>
          </Card>

          {(breaksData as StaffBreak[]).length > 0 && (
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("schedule.scheduledBreaks", "Scheduled Breaks")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(breaksData as StaffBreak[]).map((brk) => (
                  <div key={brk.id} className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg">
                    <div>
                      <div className="font-medium text-sm">{brk.date}</div>
                      <div className="text-xs text-muted-foreground">
                        {brk.startTime} - {brk.endTime}
                        {brk.reason && ` • ${brk.reason}`}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteBreak.mutate({ id: brk.id, staffId: staff.id })}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="timeoff" className="space-y-4 mt-4">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {t("schedule.requestTimeOff", "Request Time Off")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("schedule.startDate", "Start Date")}</Label>
                  <Input
                    type="date"
                    value={newTimeOff.startDate}
                    onChange={(e) => setNewTimeOff({ ...newTimeOff, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("schedule.endDate", "End Date")}</Label>
                  <Input
                    type="date"
                    value={newTimeOff.endDate}
                    onChange={(e) => setNewTimeOff({ ...newTimeOff, endDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t("schedule.reason", "Reason")}</Label>
                <Textarea
                  placeholder={t("schedule.timeOffReasonPlaceholder", "Vacation, Sick leave, etc.")}
                  value={newTimeOff.reason}
                  onChange={(e) => setNewTimeOff({ ...newTimeOff, reason: e.target.value })}
                  rows={2}
                />
              </div>
              <Button
                onClick={handleAddTimeOff}
                className="w-full gap-2"
                disabled={createTimeOff.isPending || !newTimeOff.startDate || !newTimeOff.endDate}
              >
                <Plus className="h-4 w-4" />
                {t("schedule.submitRequest", "Submit Request")}
              </Button>
            </CardContent>
          </Card>

          {(timeOffData as StaffTimeOff[]).length > 0 && (
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("schedule.timeOffRequests", "Time Off Requests")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(timeOffData as StaffTimeOff[]).map((request) => (
                  <div key={request.id} className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {request.startDate} → {request.endDate}
                        </span>
                        {getStatusBadge(request.status)}
                      </div>
                      {request.reason && (
                        <div className="text-xs text-muted-foreground mt-1">{request.reason}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {request.status === "pending" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => updateTimeOff.mutate({ id: request.id, staffId: staff.id, status: "approved" })}
                            className="text-green-500 hover:text-green-600"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => updateTimeOff.mutate({ id: request.id, staffId: staff.id, status: "rejected" })}
                            className="text-red-500 hover:text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteTimeOff.mutate({ id: request.id, staffId: staff.id })}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
