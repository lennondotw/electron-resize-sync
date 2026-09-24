# Tile dithering

Date: 2026-09-24\
Status: executed; passes on Chromium's composited output\
Data: [`data.json`](data.json), [`data-webgl.json`](data-webgl.json) (rerun)\
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

## Rerun: WebGL shader dithering

The tiles were later redrawn as one WebGL canvas that dithers in the fragment
shader (per device pixel, per channel, against the same 64×64 blue-noise
map), with HUD modes `off`, `spatial` and `temporal`. The script was ported
to work out tile rects from the canvas size and rerun on `off` and `spatial`,
on top of `3be0580` with the shader change uncommitted:

```bash
node experiments/2026-09-24/tile-dithering/run.ts --out experiments/2026-09-24/tile-dithering/data-webgl.json
```

| Scheme | Dithering | Distinct values per tile | Flat neighbour steps |
| ------ | --------- | ------------------------ | -------------------- |
| light  | off       | 1 for all 13             | 7 of 12              |
| light  | spatial   | 2 for all 13             | 0 of 12              |
| dark   | off       | 1 for all 13             | 9 of 12              |
| dark   | spatial   | 2 for all 13             | 1 of 12              |

`off` matches the DOM version tile for tile, so the canvas reproduces the same
geometry and colours. The one flat step with `spatial` (dark) is +0.04 at the
wave's trough, where two neighbours sit either side of the minimum and their
exact values differ by about that much; it is under the 0.05 cut-off, not a
plateau (the DOM version's step there was +0.07). `temporal` is not covered:
a single capture shows one frame, not the average over frames.

## Next step

None planned; revisit if the display path changes (see
[display bit depth](../display-bit-depth/README.md)).
