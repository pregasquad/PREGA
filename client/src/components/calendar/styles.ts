export const COLORS = {
  red: "#ff3b30",
  orange: "#ff9500",
  yellow: "#ffcc00",
  green: "#34c759",
  teal: "#5ac8fa",
  blue: "#007aff",
  indigo: "#5856d6",
  purple: "#af52de",
  pink: "#ff2d55",
  brown: "#a2845e",
};

export const APPOINTMENT_COLORS = [
  "#ffd6d6",
  "#ffe5cc",
  "#fff4cc",
  "#d4f5dc",
  "#d6f0fb",
  "#cce4ff",
  "#e0dffa",
  "#f0dcf5",
  "#ffd6e0",
  "#e8ddd4",
];

export const getColorForService = (serviceId: number | string): string => {
  const index =
    typeof serviceId === "number"
      ? serviceId
      : serviceId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return APPOINTMENT_COLORS[index % APPOINTMENT_COLORS.length];
};

export const IOS_SYSTEM_COLORS = {
  label: "#1c1c1e",
  secondaryLabel: "#8e8e93",
  tertiaryLabel: "#c7c7cc",
  separator: "#c6c6c8",
  opaqueSeparator: "#e5e5ea",
  systemBackground: "#ffffff",
  secondarySystemBackground: "#f2f2f7",
  systemRed: "#ff3b30",
  systemBlue: "#007aff",
};
