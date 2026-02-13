import { Home, Scissors, Users, Wallet, Package, CreditCard, BarChart3, User, Star, Briefcase, Gift, History, LayoutGrid } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ShortcutOption {
  key: string;
  route: string;
  icon: LucideIcon;
  labelKey: string;
}

export const SHORTCUT_OPTIONS: ShortcutOption[] = [
  { key: "home", route: "/home", icon: Home, labelKey: "nav.home" },
  { key: "services", route: "/services", icon: Scissors, labelKey: "nav.services" },
  { key: "clients", route: "/clients", icon: Users, labelKey: "nav.clients" },
  { key: "salaries", route: "/salaries", icon: Wallet, labelKey: "nav.salaries" },
  { key: "inventory", route: "/inventory", icon: Package, labelKey: "nav.inventory" },
  { key: "expenses", route: "/charges", icon: CreditCard, labelKey: "nav.expenses" },
  { key: "reports", route: "/reports", icon: BarChart3, labelKey: "nav.reports" },
  { key: "staff", route: "/staff", icon: User, labelKey: "nav.staff" },
  { key: "staffPerformance", route: "/staff-performance", icon: Star, labelKey: "nav.staffPerformance" },
  { key: "commissions", route: "/staff-commissions", icon: Briefcase, labelKey: "nav.staffCommissions" },
  { key: "packages", route: "/packages", icon: Gift, labelKey: "nav.packages" },
  { key: "bookingHistory", route: "/booking-history", icon: History, labelKey: "nav.bookingHistory" },
  { key: "loyalty", route: "/loyalty-rewards", icon: Gift, labelKey: "nav.loyaltyRewards" },
  { key: "settings", route: "/admin-settings", icon: LayoutGrid, labelKey: "nav.adminSettings" },
];

export const DEFAULT_SHORTCUTS = ["services", "clients", "salaries", "inventory"];
