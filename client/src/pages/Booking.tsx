import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useStaff, useServices, useCreateAppointment, useAppointments } from "@/hooks/use-salon-data";
import { queryClient } from "@/lib/queryClient";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Clock, CheckCircle2, Scissors, User, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";

const bookingSchema = z.object({
  client: z.string().min(1, "الاسم مطلوب"),
  service: z.string().min(1, "الخدمة مطلوبة"),
  staff: z.string().min(1, "الموظف مطلوب"),
  duration: z.coerce.number(),
  price: z.coerce.number(),
  total: z.coerce.number(),
  phone: z.string().optional(),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

const TIME_SLOTS = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30", "22:00", "22:30",
  "23:00", "23:30", "00:00", "00:30", "01:00", "01:30", "02:00"
];

export default function Booking() {
  const [date, setDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [isSuccess, setIsSuccess] = useState(false);
  
  const { data: staffList = [] } = useStaff();
  const { data: services = [] } = useServices();
  const formattedDate = date ? format(date, "yyyy-MM-dd") : "";
  const { data: appointments = [] } = useAppointments(formattedDate);
  const createMutation = useCreateAppointment();

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      client: "",
      service: "",
      staff: "",
      duration: 30,
      price: 0,
      total: 0,
      phone: "",
    },
  });

  const selectedStaff = form.watch("staff");
  const selectedService = form.watch("service");
  const serviceDuration = form.watch("duration");

  const categories = useMemo(() => {
    return Array.from(new Set(services.map(s => s.category)));
  }, [services]);

  const getAvailableSlots = useMemo(() => {
    if (!selectedStaff || !date) return [];
    
    const staffAppointments = appointments.filter(a => a.staff === selectedStaff);
    const duration = serviceDuration || 30;
    
    return TIME_SLOTS.filter(slot => {
      const slotMinutes = parseInt(slot.split(":")[0]) * 60 + parseInt(slot.split(":")[1]);
      
      for (const app of staffAppointments) {
        const appStart = parseInt(app.startTime.split(":")[0]) * 60 + parseInt(app.startTime.split(":")[1]);
        const appEnd = appStart + app.duration;
        const slotEnd = slotMinutes + duration;
        
        if ((slotMinutes >= appStart && slotMinutes < appEnd) || 
            (slotEnd > appStart && slotEnd <= appEnd) ||
            (slotMinutes <= appStart && slotEnd >= appEnd)) {
          return false;
        }
      }
      return true;
    });
  }, [selectedStaff, date, appointments, serviceDuration]);

  const onSubmit = async (data: BookingFormValues) => {
    if (!date || !selectedTime) return;
    
    const clientName = data.phone ? `${data.client} (${data.phone})` : data.client;
    
    const appointmentData = {
      client: clientName,
      service: data.service,
      staff: data.staff,
      duration: data.duration,
      price: data.price,
      total: data.total,
      date: formattedDate, 
      startTime: selectedTime,
      paid: false 
    };
    
    createMutation.mutate(appointmentData, {
      onSuccess: async () => {
        setIsSuccess(true);
        queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
        
        if (data.phone) {
          try {
            await fetch("/api/notifications/booking-confirmation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                clientPhone: data.phone,
                clientName: data.client,
                appointmentDate: format(date, "PPP", { locale: ar }),
                appointmentTime: selectedTime,
                serviceName: data.service,
              }),
            });
          } catch (err) {
            console.log("WhatsApp notification failed:", err);
          }
        }
      }
    });
  };

  const handleServiceChange = (serviceName: string) => {
    const service = services.find(s => s.name === serviceName);
    if (service) {
      form.setValue("service", serviceName);
      form.setValue("duration", service.duration);
      form.setValue("price", service.price);
      form.setValue("total", service.price);
    }
  };

  const canSubmit = selectedService && selectedStaff && date && selectedTime && form.watch("client");

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex items-center justify-center p-4" dir="rtl">
        <Card className="w-full max-w-md text-center py-12 px-8 space-y-6 shadow-2xl border-0">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 animate-in zoom-in duration-500" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-display font-bold">تم الحجز بنجاح!</h1>
            <p className="text-muted-foreground text-base">شكراً لك، سنراك في الموعد المحدد.</p>
          </div>
          <div className="bg-muted rounded-xl p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">التاريخ:</span>
              <span className="font-semibold">{date && format(date, "PPP", { locale: ar })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الوقت:</span>
              <span className="font-semibold">{selectedTime}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الخدمة:</span>
              <span className="font-semibold">{selectedService}</span>
            </div>
            <div className="flex justify-between border-t pt-2 mt-2">
              <span className="text-muted-foreground">السعر:</span>
              <span className="font-bold text-primary text-lg">{form.getValues("total")} DH</span>
            </div>
          </div>
          <Button onClick={() => window.location.reload()} className="w-full h-12 text-lg mt-4">
            حجز موعد جديد
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4 md:p-6" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-display font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            احجز موعدك
          </h1>
          <p className="text-muted-foreground">اختر الخدمة والوقت المناسب لك</p>
        </div>

        <Card className="shadow-xl border-0">
          <CardContent className="p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <FormField
                      control={form.control}
                      name="client"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            اسمك بالكامل
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="أدخل اسمك" className="h-11" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            رقم الهاتف (اختياري)
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="06XXXXXXXX" className="h-11" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="service"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Scissors className="w-4 h-4" />
                            الخدمة المطلوبة
                          </FormLabel>
                          <Select onValueChange={handleServiceChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="اختر الخدمة" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[300px]">
                              {categories.map(cat => (
                                <div key={cat}>
                                  <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase bg-muted/50">
                                    {cat}
                                  </div>
                                  {services.filter(s => s.category === cat).map(s => (
                                    <SelectItem key={s.id} value={s.name}>
                                      <div className="flex justify-between items-center w-full gap-4">
                                        <span>{s.name}</span>
                                        <span className="text-primary font-bold">{s.price} DH</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </div>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedService && (
                            <p className="text-sm text-muted-foreground">
                              المدة: {form.getValues("duration")} دقيقة • السعر: {form.getValues("total")} DH
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="staff"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الموظف المفضل</FormLabel>
                          <div className="grid grid-cols-3 gap-2">
                            {staffList.map(s => (
                              <Button
                                key={s.id}
                                type="button"
                                variant={field.value === s.name ? "default" : "outline"}
                                className={cn(
                                  "h-14 flex-col gap-1 transition-all",
                                  field.value === s.name && "ring-2 ring-primary ring-offset-2"
                                )}
                                style={field.value === s.name ? { backgroundColor: s.color } : {}}
                                onClick={() => field.onChange(s.name)}
                              >
                                <div 
                                  className="w-6 h-6 rounded-full border-2 border-white/50"
                                  style={{ backgroundColor: s.color }}
                                />
                                <span className="text-xs font-medium">{s.name}</span>
                              </Button>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-6">
                    <div>
                      <FormLabel className="flex items-center gap-2 mb-3">
                        اختر التاريخ
                      </FormLabel>
                      <div className="flex justify-center">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={(d) => {
                            setDate(d);
                            setSelectedTime("");
                          }}
                          disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                          className="rounded-xl border shadow-sm"
                        />
                      </div>
                    </div>

                    {date && (
                      <div>
                        <FormLabel className="flex items-center gap-2 mb-3">
                          <Clock className="w-4 h-4" />
                          اختر الوقت المتاح
                        </FormLabel>
                        <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto p-1">
                          {getAvailableSlots.map(slot => (
                            <Button
                              key={slot}
                              type="button"
                              variant={selectedTime === slot ? "default" : "outline"}
                              size="sm"
                              className={cn(
                                "h-9",
                                selectedTime === slot && "ring-2 ring-primary ring-offset-1"
                              )}
                              onClick={() => setSelectedTime(slot)}
                            >
                              {slot}
                            </Button>
                          ))}
                        </div>
                        {getAvailableSlots.length === 0 && (
                          <p className="text-center text-muted-foreground py-4">
                            لا توجد أوقات متاحة في هذا اليوم
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t pt-6">
                  <Button
                    type="submit"
                    className="w-full h-14 text-lg"
                    disabled={createMutation.isPending || !canSubmit}
                  >
                    {createMutation.isPending ? "جاري الحجز..." : "تأكيد الحجز"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          PREGASQUAD Beauty Salon
        </p>
      </div>
    </div>
  );
}
