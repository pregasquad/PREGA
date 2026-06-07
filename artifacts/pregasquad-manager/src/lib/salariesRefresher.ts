import { queryClient } from "./queryClient";
import { saveSalariesCache } from "./offlineDb";

let pendingRefresh: ReturnType<typeof setTimeout> | null = null;

export function refreshSalariesBackground(delayMs = 0): void {
  if (!navigator.onLine) return;

  if (pendingRefresh) clearTimeout(pendingRefresh);

  pendingRefresh = setTimeout(() => {
    pendingRefresh = null;
    // Use invalidateQueries so the refetch uses whatever queryFn (with date params)
    // is registered for the active query — works regardless of which key format is in use.
    queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
  }, delayMs);
}
