import { useBusinessSettings } from "./use-salon-data";

/**
 * Returns the salon's currency symbol (from business settings) and a
 * formatMoney() helper that formats numbers as "1,234.50 DH".
 * Falls back to "DH" if settings haven't loaded yet.
 */
export function useCurrency() {
  const settings = useBusinessSettings();
  const symbol = settings?.currencySymbol || "DH";

  const formatMoney = (amount: number | string | null | undefined): string => {
    const num = Number(amount ?? 0);
    if (isNaN(num)) return `0 ${symbol}`;
    return `${num.toLocaleString("fr-MA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${symbol}`;
  };

  return { symbol, formatMoney };
}
