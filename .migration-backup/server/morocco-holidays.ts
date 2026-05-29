/**
 * Moroccan public holidays — fixed national + Islamic (hardcoded per year).
 * Islamic dates shift yearly (lunar calendar) — sourced from official Moroccan calendars.
 * Dates may be ±1 day depending on moon sighting announcement.
 */

export interface MoroccoHoliday {
  date: string;    // "YYYY-MM-DD"
  nameAr: string;  // Arabic name shown to clients
  nameFr: string;  // French name (for reference)
  emoji: string;
}

/** Fixed national holidays — same month/day every year */
const FIXED_HOLIDAYS: { month: number; day: number; nameAr: string; nameFr: string; emoji: string }[] = [
  { month: 1,  day: 1,  nameAr: "رأس السنة الميلادية",           nameFr: "Jour de l'An",                    emoji: "🎊" },
  { month: 1,  day: 14, nameAr: "رأس السنة الأمازيغية (ينيار)",  nameFr: "Nouvel An Amazigh (Yennayer)",     emoji: "🏔️" },
  { month: 5,  day: 1,  nameAr: "عيد الشغل",                    nameFr: "Fête du Travail",                  emoji: "🛠️" },
  { month: 7,  day: 30, nameAr: "عيد العرش",                    nameFr: "Fête du Trône",                    emoji: "👑" },
  { month: 8,  day: 14, nameAr: "ذكرى استرداد وادي الذهب",       nameFr: "Journée Oued Ed-Dahab",            emoji: "🌅" },
  { month: 8,  day: 20, nameAr: "ذكرى ثورة الملك والشعب",        nameFr: "Révolution du Roi et du Peuple",   emoji: "🇲🇦" },
  { month: 8,  day: 21, nameAr: "عيد الشباب",                   nameFr: "Fête de la Jeunesse",              emoji: "🎂" },
  { month: 10, day: 31, nameAr: "عيد الوحدة",                   nameFr: "Journée de l'Unité",               emoji: "🤝" },
  { month: 11, day: 6,  nameAr: "ذكرى المسيرة الخضراء",          nameFr: "Marche Verte",                     emoji: "🌿" },
  { month: 11, day: 18, nameAr: "عيد الاستقلال",                nameFr: "Fête de l'Indépendance",           emoji: "🕊️" },
];

/**
 * Islamic holidays — hardcoded by year (lunar calendar shifts ~11 days/year).
 * Each entry can span 1-3 days (the celebration period).
 */
const ISLAMIC_HOLIDAYS: Record<number, { dates: string[]; nameAr: string; nameFr: string; emoji: string }[]> = {
  2025: [
    { dates: ["2025-03-30", "2025-03-31", "2025-04-01"], nameAr: "عيد الفطر",         nameFr: "Aïd al-Fitr",   emoji: "🌙" },
    { dates: ["2025-06-06", "2025-06-07", "2025-06-08"], nameAr: "عيد الأضحى",        nameFr: "Aïd al-Adha",   emoji: "🐑" },
    { dates: ["2025-06-26", "2025-06-27"],               nameAr: "فاتح محرم",          nameFr: "Nouvel An Hégire", emoji: "🌙" },
    { dates: ["2025-09-04", "2025-09-05"],               nameAr: "عيد المولد النبوي", nameFr: "Mawlid",         emoji: "✨" },
  ],
  2026: [
    { dates: ["2026-03-20", "2026-03-21", "2026-03-22"], nameAr: "عيد الفطر",         nameFr: "Aïd al-Fitr",   emoji: "🌙" },
    { dates: ["2026-05-27", "2026-05-28", "2026-05-29"], nameAr: "عيد الأضحى",        nameFr: "Aïd al-Adha",   emoji: "🐑" },
    { dates: ["2026-06-16", "2026-06-17"],               nameAr: "فاتح محرم",          nameFr: "Nouvel An Hégire", emoji: "🌙" },
    { dates: ["2026-08-24", "2026-08-25"],               nameAr: "عيد المولد النبوي", nameFr: "Mawlid",         emoji: "✨" },
  ],
  2027: [
    { dates: ["2027-03-10", "2027-03-11", "2027-03-12"], nameAr: "عيد الفطر",         nameFr: "Aïd al-Fitr",   emoji: "🌙" },
    { dates: ["2027-05-17", "2027-05-18", "2027-05-19"], nameAr: "عيد الأضحى",        nameFr: "Aïd al-Adha",   emoji: "🐑" },
    { dates: ["2027-06-06", "2027-06-07"],               nameAr: "فاتح محرم",          nameFr: "Nouvel An Hégire", emoji: "🌙" },
    { dates: ["2027-08-13", "2027-08-14"],               nameAr: "عيد المولد النبوي", nameFr: "Mawlid",         emoji: "✨" },
  ],
};

/** Build the complete holiday map for a given year → "YYYY-MM-DD" → holiday */
export function getMoroccanHolidayMap(year: number): Map<string, MoroccoHoliday> {
  const map = new Map<string, MoroccoHoliday>();

  // Fixed national holidays
  for (const h of FIXED_HOLIDAYS) {
    const date = `${year}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`;
    map.set(date, { date, nameAr: h.nameAr, nameFr: h.nameFr, emoji: h.emoji });
  }

  // Islamic holidays for the year
  const islamic = ISLAMIC_HOLIDAYS[year] || [];
  for (const h of islamic) {
    for (const date of h.dates) {
      map.set(date, { date, nameAr: h.nameAr, nameFr: h.nameFr, emoji: h.emoji });
    }
  }

  return map;
}

/**
 * Check if a specific date (YYYY-MM-DD) is a Moroccan public holiday.
 * Checks both the year of the date and adjacent years (for multi-year Islamic coverage).
 */
export function getMoroccanHolidayForDate(date: string): MoroccoHoliday | null {
  const year = parseInt(date.split("-")[0], 10);
  // Check current year and adjacent years (Islamic holidays can span year boundary)
  for (const y of [year - 1, year, year + 1]) {
    const map = getMoroccanHolidayMap(y);
    const h = map.get(date);
    if (h) return h;
  }
  return null;
}
