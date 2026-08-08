---
name: PWA query conventions (Planning/finance)
description: Rules for adding React Query fetches in the salon PWA — offline fallback and month-boundary keys
---

- **Every appointments-related query needs an offline fallback.** The app is an offline-capable PWA; `useAppointments` falls back to the IndexedDB store (`@/lib/offlineDb`). Any new direct `fetch` queryFn must do the same (online first, then `getFromOfflineStore('appointments')` filtered locally), or offline circles/totals silently show zero.
  **Why:** without a fallback, offline totals silently show zero.
- **Bounded salary compute:** the Salaries page derives a `from` bound from last staff/salon payments (small pre-queries) before calling the compute endpoint; wallets never need appointments older than the last payment minus 1 day. Falls back to full history if any wallet was never paid.
- **Month-scoped query keys must roll over at the month boundary.** Don't memoize month ranges with `[]` deps — compute the `yyyy-MM-dd` strings on each render so the query key changes naturally when the month flips on a long-open tab.
- **Prefer server-side date-range filtering over full-history fetches.** Use `GET /api/appointments/range?startDate=&endDate=` and `GET /api/salaries/compute?from=&to=` (both exist) instead of unbounded lists; keep query keys prefixed with the base path so existing `invalidateQueries` prefix matching still hits them. The range key is `/api/appointments/range` — the `["/api/appointments"]` prefix does NOT match it, so invalidate it explicitly.
