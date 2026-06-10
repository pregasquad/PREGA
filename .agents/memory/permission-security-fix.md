---
name: Permission security fix
description: requirePermission middleware must deny on empty permissions, not grant full access
---

## Rule
In `artifacts/api-server/src/replit_integrations/auth/replitAuth.ts`, `requirePermission()`:
- Owner role → always allow (bypass all checks)
- Empty `permissions` array → **deny** with 403
- Non-empty array → check if it includes the required permission

**Why:** The original code treated empty permissions as "full access" (opt-in restriction model). This is a security bug — any newly created role or a role with all permissions accidentally cleared would silently get admin access. Explicit opt-in (permission must be listed) is the correct model.

**How to apply:** When adding new role types or seeding roles, explicitly list every permission they need. Do not rely on empty-permissions as a wildcard.
