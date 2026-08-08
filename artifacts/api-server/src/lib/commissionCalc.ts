/**
 * Canonical commission calculation — single source of truth.
 * Mirrors artifacts/pregasquad-manager/src/lib/commissionCalc.ts exactly.
 * Import this in every route / storage method instead of copy-pasting the logic.
 */

interface ServiceItem {
  id?: number; // service catalog id — preferred for matching (survives renames)
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

function findService(services: ServiceDef[], name: string | undefined, id?: number): ServiceDef | undefined {
  // Prefer id match (survives renames / duplicate names), then exact name, then case-insensitive
  if (id != null) {
    const byId = services.find(s => s.id === Number(id));
    if (byId) return byId;
  }
  if (!name) return undefined;
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
 * commission is always based on the real charged amount (app.total).
 */
export function calcAppointmentCommission(
  app: any,
  services: ServiceDef[],
  staffList: StaffDef[],
  staffCommissions: StaffCommission[]
): number {
  const staffMember = staffList.find(
    s => s.name === app.staff || (app.staffId != null && s.id === Number(app.staffId))
  );

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
    const sumPrices = serviceItems.reduce((s, i) => s + Number(i.price || 0), 0);
    const appTotal = Number(app.total || 0);

    if (sumPrices > 0) {
      const scaleFactor = appTotal / sumPrices;
      let total = 0;
      for (const item of serviceItems) {
        const effectivePrice = Number(item.price || 0) * scaleFactor;
        const svcDef = findService(services, item.name, (item as any).id);
        const rate = getRate(svcDef, staffMember, staffCommissions);
        total += effectivePrice * (rate / 100);
      }
      return total;
    }
    // sumPrices === 0: all item prices zero — fall through to legacy path
  }

  // Legacy single-service fallback
  const svcDef = findService(services, app.service);
  const rate = getRate(svcDef, staffMember, staffCommissions);
  return Number(app.total || 0) * (rate / 100);
}

// ── Fast path: pre-built index for bulk commission calculations ───────────────

export interface CommissionIndex {
  serviceById: Map<number, ServiceDef>;
  serviceByName: Map<string, ServiceDef>;
  serviceByNameLower: Map<string, ServiceDef>;
  staffById: Map<number, StaffDef>;
  staffByName: Map<string, StaffDef>;
  commissionKey: Map<string, number>;
}

/**
 * Build lookup Maps once before processing many appointments.
 * Use with calcAppointmentCommissionFast to eliminate O(N) .find() calls.
 */
export function buildCommissionIndex(
  services: ServiceDef[],
  staffList: StaffDef[],
  staffCommissions: StaffCommission[]
): CommissionIndex {
  const serviceById = new Map<number, ServiceDef>();
  const serviceByName = new Map<string, ServiceDef>();
  const serviceByNameLower = new Map<string, ServiceDef>();
  for (const s of services) {
    serviceById.set(s.id, s);
    serviceByName.set(s.name, s);
    serviceByNameLower.set(s.name.toLowerCase(), s);
  }
  const staffById = new Map(staffList.map(s => [s.id, s]));
  const staffByName = new Map(staffList.map(s => [s.name, s]));
  const commissionKey = new Map(
    staffCommissions.map(c => [`${c.staffId}:${c.serviceId}`, c.percentage])
  );
  return { serviceById, serviceByName, serviceByNameLower, staffById, staffByName, commissionKey };
}

/**
 * Fast commission calc using pre-built Maps — O(1) lookups instead of O(N) .find().
 * Build the index once with buildCommissionIndex(), then call this per appointment.
 */
export function calcAppointmentCommissionFast(app: any, idx: CommissionIndex): number {
  const staffMember =
    (app.staffId != null ? idx.staffById.get(Number(app.staffId)) : undefined) ??
    idx.staffByName.get(app.staff);

  const findSvc = (name: string | undefined, id?: number): ServiceDef | undefined => {
    if (id != null) {
      const byId = idx.serviceById.get(Number(id));
      if (byId) return byId;
    }
    if (!name) return undefined;
    return idx.serviceByName.get(name) ?? idx.serviceByNameLower.get(name.toLowerCase());
  };

  const getRateFast = (svc: ServiceDef | undefined): number => {
    const base = svc?.commissionPercent ?? 50;
    if (svc && staffMember) {
      const custom = idx.commissionKey.get(`${staffMember.id}:${svc.id}`);
      if (custom != null) return custom;
    }
    return base;
  };

  let serviceItems: ServiceItem[] | null = null;
  if (app.servicesJson) {
    try {
      const parsed =
        typeof app.servicesJson === "string" ? JSON.parse(app.servicesJson) : app.servicesJson;
      if (Array.isArray(parsed) && parsed.length > 0) serviceItems = parsed;
    } catch {
      serviceItems = null;
    }
  }

  if (serviceItems && serviceItems.length > 0) {
    const sumPrices = serviceItems.reduce((s, i) => s + Number(i.price || 0), 0);
    const appTotal = Number(app.total || 0);
    if (sumPrices > 0) {
      const scaleFactor = appTotal / sumPrices;
      let total = 0;
      for (const item of serviceItems) {
        const effectivePrice = Number(item.price || 0) * scaleFactor;
        total += effectivePrice * (getRateFast(findSvc(item.name, (item as any).id)) / 100);
      }
      return total;
    }
  }

  return Number(app.total || 0) * (getRateFast(findSvc(app.service)) / 100);
}
