import { useEffect, useState } from "react";
import TimeColumn from "./TimeColumn";
import AppointmentCard from "./AppointmentCard";

interface Appointment {
  id: string | number;
  start: number;
  duration: number;
  color: string;
  client: string;
  service: string;
  time: string;
}

interface CalendarWeekProps {
  appointments: Appointment[];
  date?: Date;
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
}

export default function CalendarWeek({
  appointments,
  date = new Date(),
  startHour = 9,
  endHour = 21,
  hourHeight = 80,
}: CalendarWeekProps) {
  const [currentTimeTop, setCurrentTimeTop] = useState<number | null>(null);

  const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
  const dayNumber = date.getDate();
  const isToday = new Date().toDateString() === date.toDateString();

  useEffect(() => {
    const updateCurrentTime = () => {
      const now = new Date();
      const currentHour = now.getHours() + now.getMinutes() / 60;
      
      if (currentHour >= startHour && currentHour < endHour) {
        setCurrentTimeTop((currentHour - startHour) * hourHeight);
      } else {
        setCurrentTimeTop(null);
      }
    };

    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 60000);
    return () => clearInterval(interval);
  }, [startHour, endHour, hourHeight]);

  const totalHeight = (endHour - startHour) * hourHeight;

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex border-b border-gray-200">
        <div className="w-16 shrink-0" />
        <div className="flex-1 py-3 px-2 text-center">
          <p className="text-xs font-medium text-gray-500 uppercase">
            {dayName}
          </p>
          <p
            className={`text-xl font-semibold mt-0.5 ${
              isToday
                ? "text-white bg-rose-500 rounded-full w-8 h-8 flex items-center justify-center mx-auto"
                : "text-gray-900"
            }`}
          >
            {dayNumber}
          </p>
        </div>
      </div>

      <div className="flex flex-1 overflow-auto">
        <TimeColumn
          startHour={startHour}
          endHour={endHour}
          hourHeight={hourHeight}
        />

        <div className="flex-1 overflow-x-auto">
          <div className="min-w-[160px] relative">
          {Array.from({ length: endHour - startHour }).map((_, i) => (
            <div
              key={i}
              className="border-b border-gray-100"
              style={{ height: hourHeight }}
            />
          ))}

          <div
            className="absolute inset-x-0 top-0"
            style={{ height: totalHeight }}
          >
            {appointments.map((a) => (
              <AppointmentCard
                key={a.id}
                top={(a.start - startHour) * hourHeight}
                height={a.duration * hourHeight}
                color={a.color}
                client={a.client}
                service={a.service}
                time={a.time}
              />
            ))}
          </div>

            {currentTimeTop !== null && (
              <div
                className="absolute left-0 right-0 flex items-center z-10 pointer-events-none"
                style={{ top: currentTimeTop }}
              >
                <div className="w-2 h-2 rounded-full bg-rose-500 -ml-1" />
                <div className="flex-1 h-0.5 bg-rose-500" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
