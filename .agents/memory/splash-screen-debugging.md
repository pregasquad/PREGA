---
name: Splash screen debugging
description: How to diagnose a frontend that remains on a static startup loader
---

When the app remains on its static splash screen, treat it first as a possible early JavaScript or React bootstrap crash rather than a route-specific loading problem. Capture browser console exceptions and inspect the root element before changing API loading behavior.

**Why:** A missing imported component used during the initial layout render can prevent React from mounting at all, leaving the static loader visible indefinitely even when route APIs and lazy chunks respond successfully.

**How to apply:** Reproduce the affected URL in a browser context, check uncaught exceptions and the root DOM, then verify the rebuilt bundle and preview after correcting the startup error.