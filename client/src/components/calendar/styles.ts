export const COLORS = {
  teal: "#0D9488",
  purple: "#7C3AED",
  coral: "#F43F5E",
  blue: "#3B82F6",
  amber: "#F59E0B",
  emerald: "#10B981",
  pink: "#EC4899",
  indigo: "#6366F1",
};

export const APPOINTMENT_COLORS = [
  COLORS.teal,
  COLORS.purple,
  COLORS.coral,
  COLORS.blue,
  COLORS.amber,
  COLORS.emerald,
  COLORS.pink,
  COLORS.indigo,
];

export const getColorForService = (serviceId: number | string): string => {
  const index =
    typeof serviceId === "number"
      ? serviceId
      : serviceId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return APPOINTMENT_COLORS[index % APPOINTMENT_COLORS.length];
};
