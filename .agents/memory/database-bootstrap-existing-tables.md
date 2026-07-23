---
name: Database bootstrap with existing tables
description: Replit database initialization behavior when imported projects already contain auxiliary tables
---

When bootstrapping this project on a fresh Replit database, auxiliary runtime tables may already exist before the core application schema. The schema bootstrap must preserve those tables and remain noninteractive.

**Why:** The API expects core tables that may be absent from a newly provisioned database, while a plain migration replay can conflict and Drizzle’s prompt is unreliable without a TTY.

**How to apply:** Keep PostgreSQL provisioning enabled and use an idempotent, noninteractive schema bootstrap that tolerates pre-existing auxiliary tables.