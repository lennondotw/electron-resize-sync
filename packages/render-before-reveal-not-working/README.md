# @electron-resize-sync/render-before-reveal-not-working

**Status: does not work.** When the window shrinks, the page shrinks first
and the window follows later, so the background shows in between; it is also
the slowest option. Kept for comparison. Use
[`resize-deadline`](../resize-deadline/README.md) instead.

Option C in the [resize sync plan](../../docs/plans/2026-09-24/resize-sync.md):
the page lives in a `WebContentsView` larger than any window, so resizing the
window never resizes the page's surface. Each user resize is cancelled; the
page first lays its root element out at the next size, and the window takes
that size once the page has rendered it.

[Built-in display matrix](../../docs/experiments/2026-09-24/resize-matrix-builtin/README.md)
(`m-c`):

- Growing: nearly in step (2 px on the moving edge).
- Shrinking: the content trailed by up to 140 px.
- 127 ms per step at 30 ms of busy work, against 64 ms for option D.
- Once, the window's top edge jumped 75 pt for two frames at the start of a
  drag (unexplained).

Re-applying a cancelled resize also needs the dragged edges, which macOS does
not report. They are guessed from the pointer by
[`drag-edge-heuristic`](../drag-edge-heuristic/README.md), and the guess can
be wrong.

## Use

```ts
// main: a BaseWindow with an oversized WebContentsView
const { win, view } = createRevealWindow(windowOptions, webPreferences);
// preload
contextBridge.exposeInMainWorld("reveal", createRevealBridge());
// renderer: the element to lay out, usually the app's root
followRevealLayout(document.getElementById("root")!, window.reveal);
```
