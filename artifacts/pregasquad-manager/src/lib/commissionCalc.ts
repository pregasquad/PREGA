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

function findService(services: ServiceDef[], name: string | undefined): ServiceDef | undefined {
  if (!name) return undefined;
  // Exact match first, then case-insensitive fallback
  return (
    services.find(s => s.name === name) ||
    services.find(s => s.name.toLowerCase() === name.toLowerCase())
  );
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
    // Multi-service: split app.total proportionally across services by their listed prices,
    // then apply each service's commission rate to its effective share.
    // Handles discounts (total < sum), price updates (total > sum), and tips.
    const sumPrices = serviceItems.reduce((s, i) => s + Number(i.price || 0), 0);
    const appTotal = Number(app.total || 0);

    if (sumPrices > 0) {
      // Scale every item's price by the ratio of actual charged vs listed total
      const scaleFactor = appTotal / sumPrices;
      let total = 0;
      for (const item of serviceItems) {
        const effectivePrice = Number(item.price || 0) * scaleFactor;
        const svcDef = findService(services, item.name);
        const rate = getRate(svcDef, staffMember, staffCommissions);
        total += effectivePrice * (rate / 100);
      }
      return total;
    }
    // sumPrices === 0: all servicesJson item prices are zero.
    // Fall through to the legacy single-service path so app.total is used instead.
  }

  // Legacy single-service fallback
  const svcDef = findService(services, app.service);
  const rate = getRate(svcDef, staffMember, staffCommissions);
  return Number(app.total || 0) * (rate / 100);
}
