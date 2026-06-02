---
name: Dev env port squatting
description: Stale process can squat port 5000 in Replit dev, blocking API server start.
---

# Problem
After DB migrations or server crashes, a stale `server/index.ts` (ts-node) process can hold port 5000, causing the esbuild-compiled server to fail silently.

# How to apply
Before restarting the API Server workflow, run:
```
lsof -ti:5000 | xargs kill -9 2>/dev/null || true
```
Or kill by PID if `lsof` is unavailable. This is only needed in Replit dev — production (Koyeb) manages process lifecycle separately.

**Why:** Replit's workflow restart sends SIGTERM but does not wait for the port to be released before spawning the new process when the old one is a different binary (ts-node vs compiled node).
