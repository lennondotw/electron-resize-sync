# @electron-resize-sync/resize-activity

**Status: works, as a signal.** Tells the page while a user resize is in
progress, so it can skip optional work. It does not synchronise anything by
itself. With [`resize-deadline`](../resize-deadline/README.md) it keeps each
resize step's wait short: at 30 ms of busy work per frame, the longest
main-thread wait fell from 65 ms to 34 ms
([deadline patch record, cost](../../docs/experiments/2026-09-24/resize-deadline-patch/README.md)).

## Use

```ts
// main
import { reportResizeActivity } from "@electron-resize-sync/resize-activity/main";
reportResizeActivity(win, win.webContents);

// preload
import { createResizeActivityBridge } from "@electron-resize-sync/resize-activity/preload";
contextBridge.exposeInMainWorld("resizeActivity", createResizeActivityBridge());

// renderer
import { trackResizeActivity } from "@electron-resize-sync/resize-activity/renderer";
const isResizing = trackResizeActivity(window.resizeActivity);
function frame() {
  if (!isResizing()) doOptionalWork();
  requestAnimationFrame(frame);
}
```

`isResizing()` is a plain read, cheap enough for every frame. A resize starts
with the first `will-resize` and ends with `resized`, so resizes that do not
come from a user drag are not reported.
