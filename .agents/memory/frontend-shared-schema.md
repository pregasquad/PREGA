---
name: Frontend shared schema alias setup
description: How @shared/routes and @shared/schema are resolved in the pregasquad-manager frontend.
---

# Frontend shared schema alias setup

The original app used `@shared/routes` and `@shared/schema` for shared contracts between server and client. In the monorepo, these are resolved via Vite aliases.

**Why:** The server-side packages use `@workspace/db` (drizzle+pg) and `zod/v4` which can't be directly imported in the browser. The frontend needs client-compatible versions.

**How to apply:**
- `artifacts/pregasquad-manager/src/lib/sharedRoutes.ts` — client-side API route constants (paths/methods/basic Zod schemas using `z.any()`)
- `artifacts/pregasquad-manager/src/lib/schema.ts` — copied from `.migration-backup/shared/schema/postgres.ts`, uses drizzle-orm/pg-core (types only, no runtime pg connection)
- Both are aliased in `artifacts/pregasquad-manager/vite.config.ts`:
  ```ts
  "@shared/routes": path.resolve(import.meta.dirname, "src/lib/sharedRoutes.ts"),
  "@shared/schema": path.resolve(import.meta.dirname, "src/lib/schema.ts"),
  ```
- Frontend deps include: `drizzle-orm`, `drizzle-zod`, `zod`, `i18next`, `react-i18next`, `i18next-browser-languagedetector`, `socket.io-client`, `html-to-image`, `react-image-crop`, `qz-tray`
