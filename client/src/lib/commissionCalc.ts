/**
 * Shared commission calculation utility.
 *
 * Correctly handles multi-service appointments (servicesJson):
 * - iterates each service item and applies its own commission rate
 * - falls back to app.service + app.total for legacy single-service appointments
 *
 * Only call this on PAID appointments when computing cash-in-hand (caisse).
 */

interface ServiceItem {
  name: string;
  price: number;
  duration?: number;
}

interface ServiceDef {
  id: number;
  name: string;
  commissionPercent?: number | null;
}

interface StaffDef {
  id: number;
  name: string;
}

interface StaffCommission {
  staffId: number;
  serviceId: number;
  percentage: number;
}

function getRate(
  service: ServiceDef | undefined,
  staffMember: StaffDef | undefined,
  staffCommissions: StaffCommission[]
): number {
  const base = service?.commissionPercent ?? 50;
  if (service && staffMember) {
    const custom = staffCommissions.find(
      c => c.staffId === staffMember.id && c.serviceId === service.id
    );
    if (custom != null) return custom.percentage;
  }
  return base;
}

/**
 * Calculate the staff commission amount for a single appointment.
 * Uses per-service rates when servicesJson is available.
 */
export function calcAppointmentCommission(
  app: any,
  services: ServiceDef[],
  staffList: StaffDef[],
  staffCommissions: StaffCommission[]
): number {
  const staffMember = staffList.find(
    s => s.name === app.staff || s.id === app.staffId
  );

  // Parse servicesJson if available
  let serviceItems: ServiceItem[] | null = null;
  if (app.servicesJson) {
    try {
      const parsed =
        typeof app.servicesJson === "string"
          ? JSON.parse(app.servicesJson)
          : app.servicesJson;
      if (Array.isArray(parsed) && parsed.length > 0) {
        serviceItems = parsed;
      }
    } catch {
      serviceItems = null;
    }
  }

  if (serviceItems && serviceItems.length > 0) {
    // Multi-service: sum per-service commissions.
    // If a discount was applied (app.total < sum of item prices), distribute it
    // proportionally across services so commissions reflect actual charged amounts.
    const sumPrices = serviceItems.reduce((s, i) => s + Number(i.price || 0), 0);
    const appTotal = Number(app.total || 0);
    const discountRatio = sumPrices > 0 && appTotal >= 0 && appTotal < sumPrices
      ? appTotal / sumPrices
      : 1;

    let total = 0;
    for (const item of serviceItems) {
      const effectivePrice = Number(item.price || 0) * discountRatio;
      const svcDef = services.find(s => s.name === item.name);
      const rate = getRate(svcDef, staffMember, staffCommissions);
      total += effectivePrice * (rate / 100);
    }
    return total;
  }

  // Legacy single-service fallback
  const svcDef = services.find(s => s.name === app.service);
  const rate = getRate(svcDef, staffMember, staffCommissions);
  return Number(app.total || 0) * (rate / 100);
}
