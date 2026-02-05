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
  hourHeight = 60,
}: CalendarWeekProps) {
  const [currentTimeTop, setCurrentTimeTop] = useState<number | null>(null);

  const dayName = date
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();
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
    <div className="flex flex-col flex-1 overflow-hidden bg-white">
      <div className="flex border-b border-[#c6c6c8]">
        <div className="w-14 shrink-0" />
        <div className="flex-1 py-2 text-center border-l border-[#c6c6c8]">
          <p className="text-[11px] font-medium text-[#8e8e93] tracking-wide">
            {dayName}
          </p>
          <div
            className={`text-lg font-light mt-0.5 ${
              isToday
                ? "text-white bg-[#ff3b30] rounded-full w-7 h-7 flex items-center justify-center mx-auto"
                : "text-[#1c1c1e]"
            }`}
          >
            {dayNumber}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-auto">
        <TimeColumn
          startHour={startHour}
          endHour={endHour}
          hourHeight={hourHeight}
        />

        <div className="flex-1 relative border-l border-[#c6c6c8]">
          {Array.from({ length: endHour - startHour }).map((_, i) => (
            <div
              key={i}
              className="border-b border-[#e5e5ea]"
              style={{ height: hourHeight }}
            />
          ))}

          <div
            className="absolute inset-x-0 top-0 px-0.5"
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
              <div className="w-2 h-2 rounded-full bg-[#ff3b30] -ml-1" />
              <div className="flex-1 h-[2px] bg-[#ff3b30]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
