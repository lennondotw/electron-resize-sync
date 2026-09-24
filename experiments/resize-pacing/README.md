# Resize pacing

Measures, for each window size change, how long the window shows that size
before the renderer finishes the first frame at it: the time the canvas
background can leak through. Compares paced resizing (`resize sync` on) with
the default, across busy-work budgets, for all four edges and four corners in
both directions.

## Run

```bash
pnpm build
node experiments/resize-pacing/run.ts
```

Options (defaults in brackets): `--busy` [`0,30,65`], `--edges`
[`right,left,bottom,top,top-left,top-right,bottom-left,bottom-right`],
`--directions` [`grow,shrink`], `--repetitions` [`2`], and `--out <file>` to
write the JSON somewhere other than the run directory. The full matrix takes
about 12 minutes.

## Procedure

For each busy budget and each `resize sync` setting, in a fresh session:

1. Count rAF callbacks for 2 s to record the frame rate.
2. For each edge or corner and direction, place the window centred in the work
   area at 760×480 (grow) or at 760×480 pushed out 240 px on the dragged edges
   (shrink), and wait 800 ms. Dragging a left or top edge moves the window
   origin with it.
3. From the main process, move the dragged edges 240 px in 4 px steps, one
   proposal every 16 ms, by emitting `will-resize` with that edge; apply
   `setBounds` only when no handler prevented it, as AppKit would.
4. Record every `resize` event and every renderer ack (`resize:ack`, sent right
   after the first frame at a size finishes rendering) with `performance.now()`
   in the main process. Wait 1 s after the last proposal.
5. For each ack, the unpainted duration is the time since the window last took on
   that size.

## Output

`scenarios[].drags[]` holds, per edge, direction and repetition: proposals,
sizes actually applied, acks, whether the window ended at the target bounds, the
unpainted durations (`samples`, ms) and their
count/median/p90/max. `environment` records the machine and build.

## Limits

- Emitting `will-resize` exercises the pacer, not AppKit's live-resize loop; a
  real drag may differ (see the dated record).
- The ack marks the end of the renderer's main-thread frame. Compositing and
  display add a little more time that is not measured.
- When shrinking, no background is exposed; the duration there measures how long
  the content lays out at a stale size instead.
- Acks without a matching size (for example sizes the renderer skipped) are not
  counted.

Since the pacer guesses the dragged edge from the pointer on macOS (see
`packages/drag-edge-heuristic`), the script sets
`ELECTRON_RESIZE_SYNC_TRUST_REPORTED_EDGE=1` so the pacer uses the edge its
simulated `will-resize` reports.
