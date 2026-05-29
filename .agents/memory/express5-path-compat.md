---
name: Express 5 path-to-regexp compatibility
description: Express 5 uses path-to-regexp v8 which has breaking changes for wildcard route syntax.
---

# Express 5 path-to-regexp compatibility

Express 5 bundles path-to-regexp v8, which has strict syntax rules.

**The rule:** Never use `(*)`, `/*`, or `/:param+` wildcard patterns in Express 5 routes.

**Why:** path-to-regexp v8 rejects these patterns at route registration time with `PathError`. The old patterns worked in Express 4 (path-to-regexp v0.x).

**How to apply:** Replace any wildcard routes with a RegExp:
```ts
// ❌ Express 4 style — breaks in Express 5
app.get("/objects/:objectPath(*)", handler)
app.get("/objects/*", handler)
app.get("/objects/:path+", handler)

// ✅ Express 5 compatible
app.get(/^\/objects\/(.+)$/, handler)
```

The fix was applied to `artifacts/api-server/src/replit_integrations/object_storage/routes.ts`.
