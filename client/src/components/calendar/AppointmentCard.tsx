import { cn } from "@/lib/utils";

interface AppointmentCardProps {
  top: number;
  height: number;
  color: string;
  client: string;
  service: string;
  time: string;
}

export default function AppointmentCard({
  top,
  height,
  color,
  client,
  service,
  time,
}: AppointmentCardProps) {
  return (
    <div
      className={cn(
        "absolute left-1 right-1 bg-white rounded-lg overflow-hidden",
        "border border-gray-100 shadow-sm",
        "hover:shadow-md transition-shadow duration-200",
        "flex"
      )}
      style={{ top, height: Math.max(height, 40) }}
    >
      <div
        className="w-1 shrink-0"
        style={{ backgroundColor: color }}
      />
      
      <div className="flex-1 px-2.5 py-1.5 min-w-0 overflow-hidden">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {client}
        </p>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {service}
        </p>
        {height > 50 && (
          <p className="text-[11px] text-gray-400 mt-1">
            {time}
          </p>
        )}
      </div>
    </div>
  );
}
