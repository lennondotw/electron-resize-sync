# @electron-resize-sync/drag-edge-heuristic

**Status: a guess, not a measurement. It can be wrong.** It guesses which
edges of a window a user resize drags on macOS, so that a cancelled
`will-resize` can be re-applied with the opposite edges kept in place. Only
the not-working options need it:
[`resize-pacing-not-working`](../../packages-not-working/resize-pacing-not-working/README.md) and
[`render-before-reveal-not-working`](../../packages-not-working/render-before-reveal-not-working/README.md).
[`resize-deadline`](../resize-deadline/README.md) leaves resizing to AppKit
and does not need it.

## Why guess

On macOS nothing reports the dragged edge:

- AppKit's `windowWillResize:toSize:` gives only the new size.
- Electron's `will-resize` bounds keep the bottom-left corner fixed whatever
  is dragged, and `details.edge` is only ever `"right"` or `"bottom"`: Electron
  picks it by whichever of width and height changed more.

Trusting either makes a window dragged by its left or top edge grow the other
way.

## The guess

The first time a drag changes the width, the side of the window's vertical
centre line that the pointer is on is taken as the dragged side; likewise for
the height. Each side is then kept until the drag ends (`resized`, or no
proposal for 500 ms).

Known ways it goes wrong:

- Resizing without the pointer: keyboard, accessibility, tiling, zoom.
- A pointer on or very near the centre line.
- A first proposal that arrives before the pointer is on the edge.
- A pointer that the system moves or hides during the drag.

Checked only by emitting `will-resize` with a stubbed pointer on each edge and
corner (8 of 8), not with real drags of every edge.

On other platforms (Windows) Electron reports the edge from the system; with
`trustReportedEdge` (the default there) that report is used instead.

```ts
import { trackDraggedEdges } from "@electron-resize-sync/drag-edge-heuristic/main";

const place = trackDraggedEdges(win);
win.on("will-resize", (event, proposed, { edge }) => {
  event.preventDefault();
  const bounds = place(win.getBounds(), proposed, edge); // a guess
  // …apply bounds later
});
```
