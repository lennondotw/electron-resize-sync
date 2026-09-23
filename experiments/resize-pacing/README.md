# Resize pacing

Measures, for each window size change, how long the window shows that size
before the renderer finishes the first frame at it: the time the canvas
background can leak through. Compares paced resizing (`resize sync` on) with
the default, across busy-work budgets.

## Run

```bash
pnpm build
node experiments/resize-pacing/run.ts --busy 0,30,65 --repetitions 3
```

`--out <file>` writes the JSON somewhere other than the run directory.

## Procedure

For each busy budget and each `resize sync` setting, in a fresh session:

1. Count rAF callbacks for 2 s to record the frame rate.
2. Set the window to 760×480 and wait 800 ms.
3. From the main process, propose widths 764…1000 in 4 px steps every 16 ms by
   emitting `will-resize`; apply `setBounds` only when no handler prevented it,
   as AppKit would.
4. Record every `resize` event and every renderer ack (`resize:ack`, sent right
   after the first frame at a size finishes rendering) with `performance.now()`
   in the main process. Wait 1 s after the last proposal.
5. For each ack, the unpainted duration is the time since the window last took on
   that size.

## Output

`scenarios[].drags[]` holds, per repetition: proposals, sizes actually applied,
acks, the final width, the unpainted durations (`samples`, ms) and their
count/median/p90/max. `environment` records the machine and build.

## Limits

- Emitting `will-resize` exercises the pacer, not AppKit's live-resize loop; a
  real drag may differ (see the dated record).
- The ack marks the end of the renderer's main-thread frame. Compositing and
  display add a little more time that is not measured.
- Acks without a matching size (for example sizes the renderer skipped) are not
  counted.
