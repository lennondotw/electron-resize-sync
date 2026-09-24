# Resize options side by side on the built-in display

Date: 2026-09-24\
Status: executed; synthetic background drags of the right, bottom and bottom-right edges; option D in step in every drag, with busy work and without\
Data: [`data.json`](data.json)\
Scripts: [`experiments/resize-recording`](../../../../experiments/resize-recording/README.md)

## Question and acceptance criteria

The earlier series ran on an external 120 Hz display, with the switches of
option D on the command line. This series compares the options on the
built-in display:

- Option D with its two switches set by the app
  (`ELECTRON_RESIZE_SYNC_DEADLINE_FRAMES=30`, see
  [shipping option D](../../../research/2026-09-24/shipping-option-d.md)).
- Option C, the render-before-reveal window (`9f7010f`), measured for the
  first time.
- Option B′, paced resizing with the busy work skipped during a resize.
- Everything off: no busy work and no animation. This shows how smooth
  resizing gets at best, and whether option D costs anything then.

Pass, as before: no out-of-step frames. All four edge markers stay at their
rest offset (±1 px) and visible.

## Environment

From each run's `environment` in the data file:

| Field      | Value                                                                               |
| ---------- | ----------------------------------------------------------------------------------- |
| OS         | macOS 27.0 (26A428)                                                                 |
| Hardware   | Mac15,8, Apple M3 Max                                                               |
| Display    | Built-in Retina Display, 1800×1169 pt, scale 2, 120 Hz, 30-bit; not the primary one |
| Runtime    | Electron 44.4.5, Chromium 152.0.7977.130, arm64                                     |
| Electron   | Stock (`node_modules/…`) or the patched copy (`tmp/deadline-patch/dist`), per run   |
| App        | Dithering off, resize rate overlay off; other settings per run                      |
| Repository | `6ceea54`                                                                           |
| Capture    | ffmpeg AVFoundation, 60 fps, no pointer                                             |

## Procedure

Every run is a fresh isolated session, staged on the built-in display:

```bash
node experiments/resize-recording/stage.ts --display Built-in --frame-width 1372 \
  --dither off <run settings> --out tmp/rec/geometry-<run>.json
```

The six `appDrags` from the geometry file (right, bottom and bottom-right,
each 120 pt outward and back, then inward and back) were performed in one
batch with the computer-use `app_drag` tool. That tool acts in the
background, in the app window's points. A short screenshot between drags
served as the pause. Each run was recorded, analysed with `analyze.ts`, and
timed with `probe.ts`.

The tool delivers a whole path in well under a second, and AppKit coalesces
it. Outward drags therefore produced 2–4 size changes, and inward drags
6–22. Top and left drags cannot be expressed with this tool (see the
[overlay record](../resize-rate-overlay/README.md)). They were covered for option D on
the external display in [the deadline patch record](../resize-deadline-patch/README.md).

| Run          | Electron | Settings                                                    |
| ------------ | -------- | ----------------------------------------------------------- |
| `m-base`     | stock    | busy 30, playing                                            |
| `m-d`        | patched  | busy 30, playing, `ELECTRON_RESIZE_SYNC_DEADLINE_FRAMES=30` |
| `m-c`        | stock    | busy 30, playing, `ELECTRON_RESIZE_SYNC_REVEAL=1`           |
| `m-bprime`   | stock    | busy 30, playing, `resize sync` on, `yield on resize` on    |
| `m-off-base` | stock    | busy 0, paused                                              |
| `m-off-d`    | patched  | busy 0, paused, `ELECTRON_RESIZE_SYNC_DEADLINE_FRAMES=30`   |

## Results

| Run          | Out of step (frames) | Largest gap (px) | Size changes per drag | Resize interval, median (ms) | Longest main-thread block (ms) |
| ------------ | -------------------- | ---------------- | --------------------- | ---------------------------- | ------------------------------ |
| `m-base`     | 83 / 166             | 180              | 2, 14, 2, 12, 4, 13   | 19.1                         | 82.5                           |
| `m-d`        | **0 / 167**          | 0                | 2, 7, 2, 6, 4, 6      | 64.3                         | 263.6                          |
| `m-c`        | 60 / 227             | 150              | 2, 10, 8, 4 (merged)  | 126.6                        | 73.5                           |
| `m-bprime`   | 40 / 166             | 40               | 2, 14, 2, 11, 4, 14   | 18.7                         | 38.5                           |
| `m-off-base` | 24 / 191             | 40               | 2, 15, 2, 12, 22      | 20.5                         | 36.4                           |
| `m-off-d`    | **0 / 165**          | 0                | 2, 15, 2, 10, 4, 18   | 20.8                         | 77.9                           |

"Largest gap" is the largest distance by which a marker trailed its edge.
The analyser merges drags separated by less than 0.6 s, which happened in
`m-c` and `m-off-base`.

### Observations

- **Option D holds on this display, with the switches set by the app:** 0
  out-of-step frames with busy work and without.
- **With nothing to render, option D costs nothing measurable here.** The
  resize interval is 20.8 ms against 20.5 ms for stock Electron, bound by
  the input. Stock Electron is still out of step then, by up to 40 px when
  shrinking.
- **With 30 ms of busy work, option D resizes about three times less
  often** (64 ms against 19 ms), as on the external display. This is the
  accepted trade: fewer size changes, all in step.
- **Option C does not help.**
  - Growing was nearly in step: the only deviations were 2 px on the moving
    edge.
  - Shrinking trailed by up to 140 px. The page shrinks #root first, and the
    window follows only after the acknowledgement two frames later. The
    canvas shows in between, as predicted.
  - It was the slowest option (127 ms per step): each step waits for two
    busy frames.
  - One glitch: at the start of the bottom-outward drag, the window's top
    edge jumped 75 pt up for two frames. The window briefly took a size
    other than the one C applies, probably the macOS `will-resize` proposal
    that keeps the bottom-left corner fixed.
- **Option B′ reduces the error but does not remove it:** at most 40 px
  instead of 180 px. The resize rate stays at the input's (18.7 ms).

## Conclusion and limits

- **Pass:**
  - `m-d` and `m-off-d`.
  - Option D, with its switches set by the app, keeps content in step on
    the built-in display, and costs nothing measurable when the page has
    little to do.
- **Fail:**
  - `m-base`, `m-off-base`, `m-bprime` and `m-c`.
  - C fails when shrinking by design. The top-edge glitch is unexplained.
- **Limits:**
  - Synthetic input: whole paths per drag, coalesced by AppKit. The size
    changes are fewer and larger than in a person's drag.
  - Only right, bottom and bottom-right drags.
  - One run per configuration.
  - The resize intervals are bound by the input and are not the fastest the
    window could go.

## Next step

- A person's continuous drag with option D and everything off, to judge
  smoothness directly.
- Drop option C, or keep it only for growing.
