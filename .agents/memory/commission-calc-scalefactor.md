---
name: Commission calc scaleFactor
description: The commissionCalc.ts servicesJson path must always scale commission by appTotal/sumPrices, not just when discounting
---

## Rule
In `artifacts/pregasquad-manager/src/lib/commissionCalc.ts`, when an appointment has `servicesJson`, commission is calculated as:
```
scaleFactor = sumPrices > 0 ? appTotal / sumPrices : 1
effectivePrice = item.price * scaleFactor
commission += effectivePrice * (rate / 100)
```

**Why:** The old code used `discountRatio` capped at 1 — when `app.total > sum(servicesJson prices)` (e.g. service price in DB was 50 DH but appointment was charged 60 DH), commission was computed on 50 instead of 60. Screenshot showed KHALIL 3x Brushing: 75 DH instead of correct 90 DH (50% of 180 DH).

**How to apply:** Any time commission is computed from servicesJson items, always use `appTotal / sumPrices` as a scale factor on item prices. Both Salaries.tsx and Charges.tsx call `calcAppointmentCommission()` — fixing commissionCalc.ts fixes both.

## Service matching
servicesJson items now carry the catalog service `id`; all commission lookups prefer id, then exact name, then case-insensitive name (legacy items without id keep working). There are TWO copies of commissionCalc.ts (frontend lib + api-server lib) plus a duplicated block in the staff-token earnings route — any matching change must be applied to all three. **Never trust a client-supplied service id on the public booking route** — resolve it from the catalog by name server-side.
