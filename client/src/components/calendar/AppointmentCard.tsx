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
        "absolute left-0.5 right-0.5 rounded-md overflow-hidden",
        "border-l-[3px]"
      )}
      style={{
        top,
        height: Math.max(height, 24),
        backgroundColor: color,
        borderLeftColor: adjustColorBrightness(color, -30),
      }}
    >
      <div className="px-1.5 py-1 h-full overflow-hidden">
        <p
          className="text-[11px] font-semibold leading-tight truncate"
          style={{ color: getContrastColor(color) }}
        >
          {client}
        </p>
        {height > 35 && (
          <p
            className="text-[10px] leading-tight truncate mt-0.5 opacity-80"
            style={{ color: getContrastColor(color) }}
          >
            {service}
          </p>
        )}
        {height > 55 && (
          <p
            className="text-[10px] leading-tight mt-0.5 opacity-70"
            style={{ color: getContrastColor(color) }}
          >
            {time}
          </p>
        )}
      </div>
    </div>
  );
}

function adjustColorBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(Math.min((num >> 16) + amt, 255), 0);
  const G = Math.max(Math.min(((num >> 8) & 0x00ff) + amt, 255), 0);
  const B = Math.max(Math.min((num & 0x0000ff) + amt, 255), 0);
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function getContrastColor(hex: string): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = num >> 16;
  const g = (num >> 8) & 0x00ff;
  const b = num & 0x0000ff;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1c1c1e" : "#ffffff";
}
