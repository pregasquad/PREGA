---
name: SIGTERM forced exit
description: httpServer.close() hangs indefinitely when Socket.io connections are open; need a forced exit timeout.
---

## Rule
Always pair `httpServer.close()` in SIGTERM/SIGINT handlers with a forced `setTimeout(() => process.exit(0), 3000).unref()`.

**Why:** Node's `httpServer.close()` stops accepting new connections but waits for all existing ones to close before firing its callback. Socket.io keeps persistent WebSocket connections alive indefinitely, so `httpServer.close()` callback never fires — the process stays alive, holds port 5000, and blocks the next restart (EADDRINUSE).

**How to apply:** In `artifacts/api-server/src/index.ts` SIGTERM/SIGINT handlers, the 3-second forced timeout is already in place. Any new server or worker that opens an httpServer should use the same pattern.
