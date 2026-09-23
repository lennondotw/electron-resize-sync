# Tile dithering

Checks that per-tile blue-noise dithering makes each tile's rendered pixels
average to the fractional 8-bit value it should have, removing the plateaus
where neighbouring tiles round to the same level.

## Run

```bash
pnpm build
node experiments/tile-dithering/run.ts
```

## Procedure

For light and dark, with dithering off and on, in a fresh session:

1. Launch paused with no busy work. A paused launch holds the wave at time 0,
   so every run renders the same tile colours.
2. Capture the page with `Page.captureScreenshot`.
3. For each bottom-row tile not covered by the `#root` label, read the green
   channel of the pixels at least 4 CSS px inside the tile, and record their
   mean and number of distinct values.
4. Record the mean difference between neighbouring tiles; a difference under
   0.05 counts as a flat step.

## Output

`cases[]` holds, per scheme and dithering setting: per-tile mean and distinct
values, neighbour steps and the flat-step count.

## Limits

- The screenshot is Chromium's composited output before macOS colour
  management; what reaches the panel is not measured.
- Only the green channel is sampled.
