import { startOfToday, subDays } from "date-fns";

/**
 * Returns the current "business work day" date.
 *
 * If the salon closes past midnight (e.g. opens 09:00, closes 02:00), then
 * any hour before closing time still belongs to the PREVIOUS calendar day's
 * work session. Without business hours, the cutoff defaults to 2:00 AM.
 */
export function getWorkDayDate(openingTime?: string, closingTime?: string): Date {
  const now = new Date();
  const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

  if (openingTime && closingTime) {
    const [openH, openM] = openingTime.split(":").map(Number);
    const [closeH, closeM] = closingTime.split(":").map(Number);
    const openingMinutes = openH * 60 + openM;
    const closingMinutes = closeH * 60 + closeM;

    if (closingMinutes < openingMinutes) {
      // Overnight session (e.g. 09:00 → 02:00): before closing = still previous work day
      if (currentTotalMinutes < closingMinutes) {
        return subDays(startOfToday(), 1);
      }
    } else {
      // Same-day session (e.g. 09:00 → 19:00): before opening = still previous work day
      if (currentTotalMinutes < openingMinutes) {
        return subDays(startOfToday(), 1);
      }
    }
  } else {
    // No settings: default cutoff is 02:00 AM
    if (currentTotalMinutes < 2 * 60) {
      return subDays(startOfToday(), 1);
    }
  }

  return startOfToday();
}
