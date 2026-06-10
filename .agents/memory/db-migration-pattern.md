---
name: DB migration pattern
description: How to safely add columns to the Postgres dev DB given the build/run pattern
---

## Rule
Startup migrations in `artifacts/api-server/src/db.ts` only run if the api-server has been rebuilt. The `start.sh` script only rebuilds `dist/index.js` when it is missing.

**Pattern for adding a new column:**
1. Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` to the correct `DO $$ BEGIN ... END $$;` block in `db.ts`
2. Also apply the SQL directly to the running Postgres DB:
   ```js
   node -e "const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL}); p.query('ALTER TABLE t ADD COLUMN IF NOT EXISTS col TYPE').then(()=>{console.log('done');p.end()}).catch(e=>{console.error(e.message);p.end()})"
   ```
3. Delete `artifacts/api-server/dist/index.js` to force rebuild on next restart

**Why:** The workflow caches the compiled dist. Code changes to db.ts are only compiled at next forced rebuild. Deleting dist/index.js triggers the rebuild on next `start.sh` run. Applying SQL directly handles the currently running DB immediately.
