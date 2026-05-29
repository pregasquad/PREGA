import {
  Home, CalendarDays, Scissors, Users, Wallet, Package,
  PackageOpen, CreditCard, BarChart3, User, Star, Briefcase,
  Gift, History, LayoutGrid, MessageCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ShortcutOption {
  key: string;
  route: string;
  icon: LucideIcon;
  labelKey: string;
  permission: string | null;
}

export const SHORTCUT_OPTIONS: ShortcutOption[] = [
  { key: "planning",        route: "/planning",          icon: CalendarDays,  labelKey: "nav.planning",        permission: "view_planning" },
  { key: "home",            route: "/home",              icon: Home,          labelKey: "nav.home",            permission: "view_home" },
  { key: "clients",         route: "/clients",           icon: Users,         labelKey: "nav.clients",         permission: "view_clients" },
  { key: "salaries",        route: "/salaries",          icon: Wallet,        labelKey: "nav.salaries",        permission: "view_salaries" },
  { key: "services",        route: "/services",          icon: Scissors,      labelKey: "nav.services",        permission: "view_services" },
  { key: "packages",        route: "/packages",          icon: PackageOpen,   labelKey: "nav.packages",        permission: "view_packages" },
  { key: "inventory",       route: "/inventory",         icon: Package,       labelKey: "nav.inventory",       permission: "view_inventory" },
  { key: "expenses",        route: "/charges",           icon: CreditCard,    labelKey: "nav.expenses",        permission: "view_expenses" },
  { key: "reports",         route: "/reports",           icon: BarChart3,     labelKey: "nav.reports",         permission: "view_reports" },
  { key: "bookingHistory",  route: "/booking-history",   icon: History,       labelKey: "nav.bookingHistory",  permission: "view_booking_history" },
  { key: "loyalty",         route: "/loyalty-rewards",   icon: Gift,          labelKey: "nav.loyaltyRewards",  permission: "view_loyalty" },
  { key: "whatsapp",        route: "/whatsapp",          icon: MessageCircle, labelKey: "nav.whatsapp",        permission: "admin_settings" },
  { key: "staff",           route: "/staff",             icon: User,          labelKey: "nav.staffManagement", permission: "view_staff" },
  { key: "commissions",     route: "/staff-commissions", icon: Briefcase,     labelKey: "nav.staffCommissions",permission: "view_salaries" },
  { key: "staffPerformance",route: "/staff-performance", icon: Star,          labelKey: "nav.staffPerformance",permission: "view_staff_performance" },
  { key: "settings",        route: "/admin-settings",    icon: LayoutGrid,    labelKey: "nav.adminSettings",   permission: "admin_settings" },
];

export const DEFAULT_SHORTCUTS = ["planning", "home", "clients", "salaries"];

export function normalizePlanningShortcuts(keys: unknown): string[] {
  const input = Array.isArray(keys) ? keys : [];
  const seen = new Set<string>();
  const valid: string[] = [];

  for (const k of input) {
    if (
      typeof k === "string" &&
      SHORTCUT_OPTIONS.some(o => o.key === k) &&
      !seen.has(k)
    ) {
      seen.add(k);
      valid.push(k);
    }
    if (valid.length === 4) break;
  }

  for (const def of DEFAULT_SHORTCUTS) {
    if (valid.length >= 4) break;
    if (!seen.has(def)) {
      seen.add(def);
      valid.push(def);
    }
  }

  return valid;
}
