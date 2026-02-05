interface TimeColumnProps {
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
}

export default function TimeColumn({
  startHour = 9,
  endHour = 21,
  hourHeight = 80,
}: TimeColumnProps) {
  const hours = Array.from(
    { length: endHour - startHour },
    (_, i) => i + startHour
  );

  const formatHour = (hour: number) => {
    const h = hour % 12 || 12;
    const ampm = hour < 12 ? "AM" : "PM";
    return `${h}:00 ${ampm}`;
  };

  return (
    <div className="w-16 shrink-0 border-r border-gray-100 bg-gray-50/50">
      {hours.map((hour) => (
        <div
          key={hour}
          className="relative border-b border-gray-50"
          style={{ height: hourHeight }}
        >
          <span className="absolute -top-2.5 right-3 text-[11px] font-medium text-gray-400">
            {formatHour(hour)}
          </span>
        </div>
      ))}
    </div>
  );
}
