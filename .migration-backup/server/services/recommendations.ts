import { db, schema } from "../db";
import { desc, sql } from "drizzle-orm";
import { differenceInDays, parseISO } from "date-fns";

export interface ServiceRecommendation {
  type: "timing" | "upsell" | "popular_pairing";
  serviceName: string;
  serviceId?: number;
  price: number;
  duration: number;
  message: string;
  messageKey: string;
  priority: number;
  daysSinceLastBooking?: number;
  usualIntervalWeeks?: number;
}

interface ServiceFrequency {
  serviceName: string;
  bookings: { date: string }[];
  averageIntervalDays: number;
  lastBookingDate: string;
}

interface AppointmentRecord {
  id: number;
  date: string;
  service: string | null;
  servicesJson: string | null;
  total: number;
}

interface ServiceRecord {
  id: number;
  name: string;
  price: number;
  duration: number;
  category: string;
}

export async function getClientRecommendations(phone: string): Promise<ServiceRecommendation[]> {
  const recommendations: ServiceRecommendation[] = [];
  
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  if (cleanPhone.length < 6) return recommendations;

  const s = schema();
  
  const clientAppointments: AppointmentRecord[] = await db()
    .select({
      id: s.appointments.id,
      date: s.appointments.date,
      service: s.appointments.service,
      servicesJson: s.appointments.servicesJson,
      total: s.appointments.total,
    })
    .from(s.appointments)
    .where(sql`REPLACE(REPLACE(${s.appointments.phone}, ' ', ''), '-', '') LIKE ${'%' + cleanPhone + '%'}`)
    .orderBy(desc(s.appointments.date));

  if (clientAppointments.length === 0) {
    return [];
  }

  const allServices: ServiceRecord[] = await db().select().from(s.services);
  const serviceMap = new Map<string, ServiceRecord>(
    allServices.map(svc => [svc.name.toLowerCase(), svc])
  );

  const serviceHistory = analyzeServiceHistory(clientAppointments);
  const today = new Date();

  for (const [serviceName, history] of Object.entries(serviceHistory)) {
    const service = serviceMap.get(serviceName.toLowerCase());
    if (!service) continue;

    const lastBooking = parseISO(history.lastBookingDate);
    const daysSince = differenceInDays(today, lastBooking);
    const usualIntervalDays = history.averageIntervalDays;

    if (history.bookings.length >= 2 && usualIntervalDays > 0) {
      const usualIntervalWeeks = Math.round(usualIntervalDays / 7);

      if (daysSince >= usualIntervalDays * 0.8) {
        const isOverdue = daysSince > usualIntervalDays;
        
        recommendations.push({
          type: "timing",
          serviceName: service.name,
          serviceId: service.id,
          price: service.price,
          duration: service.duration,
          message: isOverdue 
            ? `Il est temps pour votre ${service.name} ! (habituellement toutes les ${usualIntervalWeeks} semaines)`
            : `Votre ${service.name} approche (habituellement toutes les ${usualIntervalWeeks} semaines)`,
          messageKey: isOverdue ? "recommendations.timingOverdue" : "recommendations.timingApproaching",
          priority: isOverdue ? 100 : 80,
          daysSinceLastBooking: daysSince,
          usualIntervalWeeks,
        });
      }
    }
  }

  const pairingRecommendations = await getPopularPairings(clientAppointments, serviceMap);
  recommendations.push(...pairingRecommendations);

  const upsellRecommendations = getUpsellRecommendations(clientAppointments, allServices);
  recommendations.push(...upsellRecommendations);

  recommendations.sort((a, b) => b.priority - a.priority);
  
  return recommendations.slice(0, 4);
}

function analyzeServiceHistory(appointments: AppointmentRecord[]): Record<string, ServiceFrequency> {
  const serviceMap: Record<string, { dates: string[] }> = {};

  for (const appt of appointments) {
    const serviceNames = extractServiceNames(appt);
    
    for (const name of serviceNames) {
      const normalizedName = name.toLowerCase().trim();
      if (!serviceMap[normalizedName]) {
        serviceMap[normalizedName] = { dates: [] };
      }
      serviceMap[normalizedName].dates.push(appt.date);
    }
  }

  const result: Record<string, ServiceFrequency> = {};
  
  for (const [name, data] of Object.entries(serviceMap)) {
    const sortedDates = data.dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    
    let totalIntervalDays = 0;
    let intervals = 0;
    
    for (let i = 0; i < sortedDates.length - 1; i++) {
      const diff = differenceInDays(parseISO(sortedDates[i]), parseISO(sortedDates[i + 1]));
      if (diff > 0 && diff < 365) {
        totalIntervalDays += diff;
        intervals++;
      }
    }
    
    result[name] = {
      serviceName: name,
      bookings: sortedDates.map(d => ({ date: d })),
      averageIntervalDays: intervals > 0 ? Math.round(totalIntervalDays / intervals) : 0,
      lastBookingDate: sortedDates[0],
    };
  }
  
  return result;
}

function extractServiceNames(appointment: AppointmentRecord): string[] {
  const names: string[] = [];
  
  if (appointment.servicesJson) {
    try {
      const parsed = typeof appointment.servicesJson === 'string' 
        ? JSON.parse(appointment.servicesJson) 
        : appointment.servicesJson;
      if (Array.isArray(parsed)) {
        for (const svc of parsed) {
          if (svc.name) names.push(svc.name);
        }
      }
    } catch {}
  }
  
  if (appointment.service && names.length === 0) {
    const serviceParts = appointment.service.split(',').map((str: string) => str.trim());
    names.push(...serviceParts);
  }
  
  return names;
}

async function getPopularPairings(
  clientAppointments: AppointmentRecord[],
  serviceMap: Map<string, ServiceRecord>,
  selectedServices: string[] = []
): Promise<ServiceRecommendation[]> {
  const recommendations: ServiceRecommendation[] = [];
  
  const pairCounts = new Map<string, Map<string, number>>();
  const serviceFrequency = new Map<string, number>();
  
  for (const appt of clientAppointments) {
    const names = extractServiceNames(appt).map(n => n.toLowerCase().trim());
    
    for (const name of names) {
      serviceFrequency.set(name, (serviceFrequency.get(name) || 0) + 1);
    }
    
    if (names.length >= 2) {
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const [a, b] = [names[i], names[j]].sort();
          if (!pairCounts.has(a)) {
            pairCounts.set(a, new Map());
          }
          const pairMap = pairCounts.get(a)!;
          pairMap.set(b, (pairMap.get(b) || 0) + 1);
        }
      }
    }
  }
  
  const allPairs: { serviceA: string; serviceB: string; count: number }[] = [];
  for (const [a, pairMap] of pairCounts) {
    for (const [b, count] of pairMap) {
      allPairs.push({ serviceA: a, serviceB: b, count });
    }
  }
  
  allPairs.sort((x, y) => y.count - x.count);
  
  for (const pair of allPairs) {
    if (pair.count < 2) break;
    
    const serviceARecord = serviceMap.get(pair.serviceA);
    const serviceBRecord = serviceMap.get(pair.serviceB);
    
    if (!serviceARecord || !serviceBRecord) continue;
    
    const pairedService = serviceBRecord;
    const baseService = serviceARecord;
    
    if (!selectedServices.includes(pairedService.name.toLowerCase())) {
      recommendations.push({
        type: "popular_pairing",
        serviceName: pairedService.name,
        serviceId: pairedService.id,
        price: pairedService.price,
        duration: pairedService.duration,
        message: `Vous combinez souvent ${baseService.name} avec ${pairedService.name}`,
        messageKey: "recommendations.popularPairing",
        priority: 70,
      });
      break;
    }
    
    if (!selectedServices.includes(baseService.name.toLowerCase())) {
      recommendations.push({
        type: "popular_pairing",
        serviceName: baseService.name,
        serviceId: baseService.id,
        price: baseService.price,
        duration: baseService.duration,
        message: `Vous combinez souvent ${pairedService.name} avec ${baseService.name}`,
        messageKey: "recommendations.popularPairing",
        priority: 70,
      });
      break;
    }
  }

  const treatmentKeywords = ["soin", "traitement", "masque", "hydratation", "kératine", "botox"];
  const colorKeywords = ["couleur", "coloration", "mèches", "balayage"];
  
  const hasColor = Array.from(serviceFrequency.keys()).some(svcName => 
    colorKeywords.some(k => svcName.includes(k))
  );
  
  const hasTreatment = Array.from(serviceFrequency.keys()).some(svcName =>
    treatmentKeywords.some(k => svcName.includes(k))
  );

  if (hasColor && !hasTreatment) {
    for (const [name, service] of serviceMap) {
      if (treatmentKeywords.some(k => name.includes(k))) {
        recommendations.push({
          type: "upsell",
          serviceName: service.name,
          serviceId: service.id,
          price: service.price,
          duration: service.duration,
          message: `Protégez vos cheveux colorés avec un ${service.name}`,
          messageKey: "recommendations.treatmentForColor",
          priority: 60,
        });
        break;
      }
    }
  }
  
  return recommendations;
}

function getUpsellRecommendations(
  clientAppointments: AppointmentRecord[],
  allServices: ServiceRecord[]
): ServiceRecommendation[] {
  const recommendations: ServiceRecommendation[] = [];
  
  const bookedServiceNames = new Set<string>();
  for (const appt of clientAppointments) {
    const names = extractServiceNames(appt);
    names.forEach(n => bookedServiceNames.add(n.toLowerCase()));
  }

  const popularTreatments = allServices
    .filter(svc => {
      const nameLower = svc.name.toLowerCase();
      return (
        (nameLower.includes("soin") || nameLower.includes("traitement") || nameLower.includes("masque")) &&
        !bookedServiceNames.has(nameLower)
      );
    })
    .slice(0, 2);

  for (const treatment of popularTreatments) {
    recommendations.push({
      type: "upsell",
      serviceName: treatment.name,
      serviceId: treatment.id,
      price: treatment.price,
      duration: treatment.duration,
      message: `Ajouter un ${treatment.name} aujourd'hui ?`,
      messageKey: "recommendations.addTreatment",
      priority: 40,
    });
  }
  
  return recommendations;
}

