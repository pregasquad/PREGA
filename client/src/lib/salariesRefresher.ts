import { queryClient } from "./queryClient";
import { saveSalariesCache } from "./offlineDb";

let pendingRefresh: ReturnType<typeof setTimeout> | null = null;

export function refreshSalariesBackground(delayMs = 0): void {
  if (!navigator.onLine) return;

  if (pendingRefresh) clearTimeout(pendingRefresh);

  pendingRefresh = setTimeout(() => {
    pendingRefresh = null;
    fetch("/api/salaries/compute", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          queryClient.setQueryData(["/api/salaries/compute"], data);
          saveSalariesCache(data).catch(() => {});
        }
      })
      .catch(() => {});
  }, delayMs);
}
