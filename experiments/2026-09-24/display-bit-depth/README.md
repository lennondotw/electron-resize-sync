# Display bit depth

Date: 2026-09-24\
Status: executed on one external display\
Data: [`data.json`](data.json)\
Script: [`experiments/2026-09-24/display-bit-depth`](run.md)

## Question and acceptance criteria

Would rendering at higher precision (10-bit or float16) reduce the tile
banding on this setup? Only if both macOS and Chromium drive the display
deeper than 8 bits per channel.

## Environment

Same machine and runtime as the [resize pacing record](../resize-pacing/README.md#environment);
one external display, LG ULTRAGEAR+ (6016×3384, "looks like" 3008×1692 at 95 Hz).
Repository `0dbf83b`.

## Procedure

```bash
pnpm build
node experiments/2026-09-24/display-bit-depth/run.ts --out experiments/2026-09-24/display-bit-depth/data.json
```

## Results

| Source   | Check                              | Result                |
| -------- | ---------------------------------- | --------------------- |
| macOS    | `NSScreen.depth` bits per sample   | 8 (24 bits per pixel) |
| macOS    | EDR headroom (potential / current) | 1.0 / 1.0             |
| macOS    | Colour space                       | LG ULTRAGEAR+ profile |
| Chromium | `screen.colorDepth`                | 24                    |
| Chromium | `(min-color: 10)`                  | false                 |
| Chromium | `(color-gamut: p3)` / `rec2020`    | true / false          |
| Chromium | `(dynamic-range: high)`            | false                 |
| Chromium | 2D canvas `colorType: "float16"`   | supported             |
| Chromium | WebGPU                             | available             |

## Conclusion and limits

The display path is 8-bit on this display: macOS reports an 8-bit framebuffer
and Chromium sees 24-bit colour and no HDR headroom. Float16 canvases and
WebGPU exist, but their output would be quantised to 8 bits at the end, so
higher-precision rendering would not reduce banding here. Dithering is the
applicable fix ([tile dithering](../tile-dithering/README.md)).

Limits: one display. The panel may support 10-bit or 8-bit + FRC over a
different connection or setting; `NSScreen.depth` reports the framebuffer, not
the panel. Rerun on a 10-bit display (for example a built-in XDR panel) before
generalising.

## Next step

Rerun on another display only if higher-precision rendering is reconsidered.
