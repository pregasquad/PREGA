import { useState, useMemo } from "react";
import { useStaff, useServices, useCreateAppointment, useAppointments } from "@/hooks/use-salon-data";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const TIME_SLOTS = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30", "22:00", "22:30",
  "23:00", "23:30", "00:00", "00:30", "01:00", "01:30", "02:00"
];

export default function Booking() {
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<{ name: string; price: number; duration: number } | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const { data: staffList = [] } = useStaff();
  const { data: services = [] } = useServices();
  const { data: appointments = [] } = useAppointments(selectedDate);
  const createMutation = useCreateAppointment();

  const categories = useMemo(() => {
    return Array.from(new Set(services.map(s => s.category)));
  }, [services]);

  const getAvailableSlots = useMemo(() => {
    if (!selectedStaff || !selectedDate) return TIME_SLOTS;
    
    const staffAppointments = appointments.filter(a => a.staff === selectedStaff);
    const duration = selectedService?.duration || 30;
    
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
  }, [selectedStaff, selectedDate, appointments, selectedService]);

  const handleSubmit = async () => {
    if (!selectedService || !selectedStaff || !selectedDate || !selectedTime || !clientName) return;

    const fullClientName = clientPhone ? `${clientName} (${clientPhone})` : clientName;

    const appointmentData = {
      client: fullClientName,
      service: selectedService.name,
      staff: selectedStaff,
      duration: selectedService.duration,
      price: selectedService.price,
      total: selectedService.price,
      date: selectedDate,
      startTime: selectedTime,
      paid: false
    };

    createMutation.mutate(appointmentData, {
      onSuccess: async () => {
        setIsSuccess(true);
        queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });

        if (clientPhone) {
          try {
            let formattedPhone = clientPhone.replace(/[^0-9]/g, "");
            if (formattedPhone.startsWith("0")) {
              formattedPhone = "212" + formattedPhone.substring(1);
            } else if (!formattedPhone.startsWith("212")) {
              formattedPhone = "212" + formattedPhone;
            }

            const dateObj = new Date(selectedDate);
            await fetch("/api/notifications/booking-confirmation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                clientPhone: formattedPhone,
                clientName: clientName,
                appointmentDate: format(dateObj, "PPP", { locale: ar }),
                appointmentTime: selectedTime,
                serviceName: selectedService.name,
              }),
            });
          } catch (err) {
            console.log("WhatsApp notification failed:", err);
          }
        }
      }
    });
  };

  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center p-4">
        <div className="w-full max-w-md bg-white shadow-lg rounded-2xl p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">تم الحجز بنجاح!</h1>
            <p className="text-gray-500">شكراً لك، سنراك في الموعد المحدد.</p>
          </div>
          <div className="bg-gray-100 rounded-xl p-4 text-sm space-y-2 text-right">
            <div className="flex justify-between">
              <span className="font-semibold">{selectedDate && format(new Date(selectedDate), "PPP", { locale: ar })}</span>
              <span className="text-gray-500">:التاريخ</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">{selectedTime}</span>
              <span className="text-gray-500">:الوقت</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">{selectedService?.name}</span>
              <span className="text-gray-500">:الخدمة</span>
            </div>
            <div className="flex justify-between border-t pt-2 mt-2">
              <span className="font-bold text-lg">{selectedService?.price} DH</span>
              <span className="text-gray-500">:السعر</span>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-black text-white rounded-xl p-4 font-semibold"
          >
            حجز موعد جديد
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center">
      <div className="w-full max-w-md bg-white shadow-lg rounded-2xl p-6 mt-6 mb-6">
        <h1 className="text-2xl font-bold text-center mb-1">PREGA SQUAD</h1>
        <p className="text-center text-gray-500 mb-6">احجز موعدك</p>

        <div className="flex justify-between mb-6 text-sm">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={cn(
                "flex-1 text-center py-2 rounded-lg mx-1 transition-all",
                step >= s 
                  ? "bg-black text-white font-semibold" 
                  : "bg-gray-100 text-gray-400"
              )}
            >
              {s}
            </div>
          ))}
        </div>

        {step > 1 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex items-center gap-1 text-gray-500 mb-4 hover:text-black transition"
          >
            <ChevronLeft className="w-4 h-4" />
            رجوع
          </button>
        )}

        {step === 1 && (
          <div>
            <h2 className="font-semibold mb-3 text-right">اختر الخدمة</h2>
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {categories.map(cat => (
                <div key={cat}>
                  <div className="text-xs font-bold text-gray-400 uppercase bg-gray-50 px-3 py-2 rounded-lg mb-2">
                    {cat}
                  </div>
                  {services.filter(s => s.category === cat).map(service => (
                    <button
                      key={service.id}
                      onClick={() => {
                        setSelectedService({ name: service.name, price: service.price, duration: service.duration });
                        setStep(2);
                      }}
                      className={cn(
                        "w-full border rounded-xl p-4 mb-2 text-right transition flex justify-between items-center",
                        selectedService?.name === service.name
                          ? "bg-black text-white border-black"
                          : "hover:bg-gray-50"
                      )}
                    >
                      <span className="font-bold text-primary">{service.price} DH</span>
                      <span>{service.name}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="font-semibold mb-3 text-right">اختر الموظف</h2>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {staffList.map(staff => (
                <button
                  key={staff.id}
                  onClick={() => {
                    setSelectedStaff(staff.name);
                  }}
                  className={cn(
                    "border rounded-xl p-4 transition flex flex-col items-center gap-2",
                    selectedStaff === staff.name
                      ? "ring-2 ring-black"
                      : "hover:bg-gray-50"
                  )}
                >
                  <div
                    className="w-10 h-10 rounded-full"
                    style={{ backgroundColor: staff.color }}
                  />
                  <span className="font-medium">{staff.name}</span>
                </button>
              ))}
            </div>
            
            <h2 className="font-semibold mb-3 text-right">اختر التاريخ</h2>
            <input
              type="date"
              min={getMinDate()}
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedTime("");
                if (selectedStaff) setStep(3);
              }}
              className="w-full border rounded-xl p-3 text-right"
            />
            
            {selectedStaff && selectedDate && (
              <button
                onClick={() => setStep(3)}
                className="w-full bg-black text-white rounded-xl p-4 font-semibold mt-4"
              >
                التالي
              </button>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="font-semibold mb-3 text-right">اختر الوقت</h2>
            <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-y-auto">
              {getAvailableSlots.map((time) => (
                <button
                  key={time}
                  onClick={() => {
                    setSelectedTime(time);
                    setStep(4);
                  }}
                  className={cn(
                    "border rounded-xl p-3 transition",
                    selectedTime === time
                      ? "bg-black text-white"
                      : "hover:bg-gray-50"
                  )}
                >
                  {time}
                </button>
              ))}
            </div>
            {getAvailableSlots.length === 0 && (
              <p className="text-center text-gray-500 py-8">
                لا توجد أوقات متاحة في هذا اليوم
              </p>
            )}
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="font-semibold mb-3 text-right">معلوماتك</h2>
            <input
              placeholder="الاسم الكامل"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full border rounded-xl p-3 mb-3 text-right"
              dir="rtl"
            />
            <input
              placeholder="رقم الهاتف (اختياري)"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              className="w-full border rounded-xl p-3 mb-4 text-right"
              dir="rtl"
            />

            <div className="bg-gray-100 rounded-xl p-4 mb-4 text-sm space-y-2 text-right">
              <div className="flex justify-between">
                <span className="font-semibold">{selectedService?.name}</span>
                <span className="text-gray-500">الخدمة:</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">{selectedStaff}</span>
                <span className="text-gray-500">الموظف:</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">{selectedDate && format(new Date(selectedDate), "PPP", { locale: ar })}</span>
                <span className="text-gray-500">التاريخ:</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">{selectedTime}</span>
                <span className="text-gray-500">الوقت:</span>
              </div>
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="font-bold text-lg">{selectedService?.price} DH</span>
                <span className="text-gray-500">السعر:</span>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!clientName || createMutation.isPending}
              className={cn(
                "w-full rounded-xl p-4 font-semibold transition",
                clientName && !createMutation.isPending
                  ? "bg-black text-white"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              )}
            >
              {createMutation.isPending ? "جاري الحجز..." : "تأكيد الحجز"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
