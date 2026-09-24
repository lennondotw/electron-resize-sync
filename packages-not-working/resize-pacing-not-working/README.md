# @electron-resize-sync/resize-pacing-not-working

**Status: does not work.** It does not keep the page in step with the window
frame. Kept for comparison. Use [`resize-deadline`](../../packages/resize-deadline/README.md)
instead.

Option B in the [resize sync plan](../../docs/plans/2026-09-24/resize-sync.md):
each user resize is cancelled, and the latest proposed size is applied with
`setBounds` only once the page reports it has rendered the previous size.
That paces the window to the page's frame rate, but every size still reaches
the screen before the page has rendered it:

- [Resize pacing](../../docs/experiments/2026-09-24/resize-pacing/README.md):
  the unpainted time is not zero.
- [Resize recording](../../docs/experiments/2026-09-24/resize-recording/README.md):
  60–95 % of drag frames out of step, with or without pacing.
- [Built-in display matrix](../../docs/experiments/2026-09-24/resize-matrix-builtin/README.md)
  (`m-bprime`, with the busy work skipped): the error falls from 180 px to
  40 px but does not go away.

Re-applying a cancelled resize also needs the dragged edges, which macOS does
not report. They are guessed from the pointer by
[`drag-edge-heuristic`](../../packages/drag-edge-heuristic/README.md), and the guess can
be wrong.

## Use

```ts
// main
paceResizes(win, win.webContents); // off until the page calls setSync(true)
// preload
contextBridge.exposeInMainWorld("pacing", createResizePacingBridge());
// renderer
window.pacing.setSync(true);
ackRenderedSizes(window.pacing); // acknowledges the first frame at each size
```
