# drag-edge-heuristic run

Checks [`drag-edge-heuristic`](../../../packages/drag-edge-heuristic/README.md)
where the demo uses it: paced resizing (`resize sync` on).

```bash
pnpm build
node experiments/2026-09-24/drag-edge-heuristic/run.ts --out experiments/2026-09-24/drag-edge-heuristic/data.json
```

It launches the demo in an isolated session and, in the main process, for each
case:

1. Restores the window's bounds and waits 700 ms, longer than the heuristic's
   500 ms drag gap, so each case is a new drag.
2. Replaces `screen.getCursorScreenPoint` with a fixed pointer position.
3. Emits two `will-resize` proposals of one drag the way macOS reports them:
   the bottom-left corner kept, and `details.edge` "right" or "bottom" by the
   larger size change.
4. Records which edges of the window moved.

Eight cases put the pointer on each edge and corner. Two more reproduce
failures the heuristic documents: a left-edge drag with the pointer just past
the centre line, and a left-edge resize with the pointer resting elsewhere, as
with a keyboard resize.

It does not drag: AppKit's live resize, and where the pointer really is at the
first proposal of a real drag, are not exercised.
