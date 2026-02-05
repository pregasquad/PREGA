interface TimeColumnProps {
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
}

export default function TimeColumn({
  startHour = 9,
  endHour = 21,
  hourHeight = 60,
}: TimeColumnProps) {
  const hours = Array.from(
    { length: endHour - startHour + 1 },
    (_, i) => i + startHour
  );

  const formatHour = (hour: number) => {
    if (hour === 0 || hour === 24) return "12 AM";
    if (hour === 12) return "12 PM";
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };

  return (
    <div className="w-14 shrink-0 relative">
      {hours.map((hour, index) => (
        <div
          key={hour}
          className="relative"
          style={{ height: index === hours.length - 1 ? 20 : hourHeight }}
        >
          <span className="absolute -top-[7px] right-2 text-[11px] font-normal text-[#8e8e93] tracking-tight">
            {formatHour(hour)}
          </span>
        </div>
      ))}
    </div>
  );
}
