import { QueryClient } from "@tanstack/react-query";
import { getFromOfflineStore, getSalariesCache, initOfflineDb } from "./offlineDb";
import { format, subDays } from "date-fns";

function getTodayStr(): string {
  const now = new Date();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  const currentMins = hour * 60 + minutes;
  // Before 3am is still "yesterday" for overnight businesses
  if (currentMins < 3 * 60) {
    return format(subDays(now, 1), "yyyy-MM-dd");
  }
  return format(now, "yyyy-MM-dd");
}

export async function seedQueryCache(queryClient: QueryClient): Promise<void> {
  try {
    await initOfflineDb();

    const todayStr = getTodayStr();

    const [
      appointments,
      staff,
      services,
      clients,
      businessSettings,
      charges,
      products,
    ] = await Promise.all([
      getFromOfflineStore<any>("appointments").catch(() => []),
      getFromOfflineStore<any>("staff").catch(() => []),
      getFromOfflineStore<any>("services").catch(() => []),
      getFromOfflineStore<any>("clients").catch(() => []),
      getFromOfflineStore<any>("businessSettings").catch(() => []),
      getFromOfflineStore<any>("charges").catch(() => []),
      getFromOfflineStore<any>("products").catch(() => []),
    ]);

    if (appointments.length > 0) {
      const todayAppts = appointments.filter((a: any) => a.date === todayStr);
      // Seed today's appointments
      if (todayAppts.length > 0) {
        queryClient.setQueryData(["/api/appointments", todayStr], todayAppts);
      }
      // Seed all appointments
      queryClient.setQueryData(["/api/appointments", undefined], appointments);
    }

    if (staff.length > 0) {
      queryClient.setQueryData(["/api/staff"], staff);
    }

    if (services.length > 0) {
      queryClient.setQueryData(["/api/services"], services);
    }

    if (clients.length > 0) {
      queryClient.setQueryData(["/api/clients"], clients);
    }

    if (businessSettings.length > 0) {
      queryClient.setQueryData(["/api/business-settings"], businessSettings[0]);
    }

    if (charges.length > 0) {
      queryClient.setQueryData(["/api/charges"], charges);
    }

    if (products.length > 0) {
      queryClient.setQueryData(["/api/products"], products);
    }

    const salariesCache = await getSalariesCache().catch(() => null);
    if (salariesCache) {
      queryClient.setQueryData(["/api/salaries/compute"], salariesCache);
    }
  } catch (e) {
    // Silently fail — seeding is best-effort, network will fill in
  }
}
