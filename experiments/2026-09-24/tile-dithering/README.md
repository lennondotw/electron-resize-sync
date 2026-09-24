# Tile dithering

Date: 2026-09-24\
Status: executed; passes on Chromium's composited output\
Data: [`data.json`](data.json)\
Script: [`experiments/2026-09-24/tile-dithering`](run.md)

## Question and acceptance criteria

With per-tile blue-noise dithering (`b3ca902`), does each tile render as a mix
of two adjacent 8-bit levels whose mean follows the exact colour, so that
neighbouring tiles no longer sit on the same level (plateaus)?

Pass if, with dithering on, every sampled tile has exactly two distinct values
(one would mean no dithering; more would mean the mask was resampled) and no
neighbour step is flat, while dithering off shows plateaus.

## Environment

Same machine, display and runtime as the
[resize pacing record](../resize-pacing/README.md#environment); repository `0dbf83b`,
no uncommitted changes under `src` or `experiments`.

## Procedure

```bash
pnpm build
node experiments/2026-09-24/tile-dithering/run.ts --out experiments/2026-09-24/tile-dithering/data.json
```

Paused at time 0 with no busy work, so every run renders the same wave phase.
Green channel of the 13 bottom-row tiles not covered by the `#root` label,
at least 4 CSS px inside each tile.

## Results

| Scheme | Dithering | Distinct values per tile | Flat neighbour steps |
| ------ | --------- | ------------------------ | -------------------- |
| light  | off       | 1 for all 13             | 7 of 12              |
| light  | on        | 2 for all 13             | 0 of 12              |
| dark   | off       | 1 for all 13             | 9 of 12              |
| dark   | on        | 2 for all 13             | 0 of 12              |

Per-tile means and steps are in the data file.

## Conclusion and limits

Passes: dithered tiles average to fractional levels and the plateaus between
neighbours disappear in both schemes; the masks stay aligned to device pixels.

Limits: this is Chromium's composited output as returned by
`Page.captureScreenshot`, before macOS colour management converts it for the
display profile; the pixels that reach the panel are not measured. Only the
green channel is sampled. Whether the result looks smoother is a visual
judgement that was not recorded.

## Next step

None planned; revisit if the display path changes (see
[display bit depth](../display-bit-depth/README.md)).
