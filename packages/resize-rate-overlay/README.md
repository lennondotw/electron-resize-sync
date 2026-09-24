# @electron-resize-sync/resize-rate-overlay

**Status: works (a diagnostic).** A click-through label over a window's
top-right corner that shows how often the window actually changes size, such
as `resize  14.9 Hz   67 ms`, or `resize idle`. The rate comes from the
window's `resize` events in the main process, so a busy page does not affect
it.

```ts
import { showResizeRateOverlay } from "@electron-resize-sync/resize-rate-overlay/main";

// Centred in a 44 pt custom title bar; without it, 8 pt from the corner.
showResizeRateOverlay(win, { titleBarHeight: 44 });
```

It is a separate child window (`setIgnoreMouseEvents(true)`), moved on every
`resize` and `move`. In a recording with option D it kept its place in every
frame in which the window's edges moved
([overlay record](https://github.com/lennondotw/electron-resize-sync/blob/main/experiments/2026-09-24/resize-rate-overlay/README.md)).
It costs a renderer process and some main-thread work per resize; keep it out
of measurements of the main thread.
