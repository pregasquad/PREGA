#!/bin/bash
set -e
pnpm install --frozen-lockfile
node scripts/apply-migrations.js
