# Resize with the default surface deadline (option D)

Date: 2026-09-24\
Status: executed; real AppKit drags on one display; the content stays in step in every drag with the patch, a 30-frame deadline and RemoteCoreAnimationAPI off\
Data: [`data.json`](data.json)\
Scripts: [`experiments/deadline-patch`](../../../../experiments/deadline-patch/README.md), [`experiments/resize-recording`](../../../../experiments/resize-recording/README.md)

## Question and acceptance criteria

The [source reading](../../../research/2026-09-24/chromium-resize-sync.md)
traced the out-of-step content to one decision: when the web contents view
resizes, Chromium embeds the renderer's new surface with a deadline of 0, so
the window's new frame is drawn with the renderer's previous content. Does
making that resize use the default deadline, as Chrome's PWA windows do, keep
the content in step with the window frame?

Pass, as in the [baseline series](../resize-recording/README.md), means no out-of-step
frames: all four edge markers stay at their rest offset (±1 px) and visible.
Fewer window size updates per second are acceptable.

## Environment

| Field      | Value                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------- |
| OS         | macOS 27.0 (26A428)                                                                            |
| Hardware   | Mac15,8, Apple M3 Max                                                                          |
| Display    | VX2781-4K-PRO: 3008×1692 pt, scale 2, 120 Hz, 24-bit                                           |
| Runtime    | Electron 44.4.5, Chromium 152.0.7977.130, arm64                                                |
| Electron   | Patched copy from `experiments/deadline-patch` (`13720c7`); the unpatched copy for `c1`        |
| App        | Busy 30 ms unless noted, playing, dithering on; window at rest 800×600 pt                      |
| Repository | `13720c7`; `analyze.ts` then gained size-update counts (`5f45a63`) and was rerun on the videos |
| Capture    | ffmpeg AVFoundation, 60 fps, no pointer; drags by a computer-use tool, 10 pt per move          |

Each run's `environment` in the data file records the same values, captured by
`stage.ts` at staging time.

## Procedure

```bash
node experiments/deadline-patch/patch.ts
ELECTRON_OVERRIDE_DIST_PATH=$PWD/tmp/deadline-patch/dist \
  node experiments/resize-recording/stage.ts --busy 30 --sync off \
    --electron-arg=--deadline-to-synchronize-surfaces=30 \
    --electron-arg=--disable-features=RemoteCoreAnimationAPI --frame-width 1456 --out tmp/rec/geometry.json
```

Then record, drag and analyse as in the resize-recording README. Every run is
a fresh isolated session. "+" drags move the edge 120 pt out and back, "−"
drags 120 pt in and back.

## Results

| Run             | Electron  | Deadline (frames) | RemoteCoreAnimationAPI | Busy | `resize sync` | Drags                   | Out of step                          |
| --------------- | --------- | ----------------- | ---------------------- | ---- | ------------- | ----------------------- | ------------------------------------ |
| `patch`         | patched   | 4 (default)       | on                     | 30   | off           | right ±                 | 82/119, 33/100                       |
| `patch-d30`     | patched   | 30                | on                     | 30   | off           | right ±                 | 8/144, 5/142                         |
| `best`          | patched   | 30                | off                    | 30   | off           | right ±                 | 0/168, 0/136                         |
| `best-edges`    | patched   | 30                | off                    | 30   | off           | bottom ±, left ±, top ± | 0 in all six (114–177 frames each)   |
| `best-corners`  | patched   | 30                | off                    | 30   | off           | all four corners ±      | 0 in all eight (137–208 frames each) |
| `c1-no-patch`   | unpatched | 30                | off                    | 30   | off           | right ±                 | 98/102, 90/98                        |
| `c2-default-dl` | patched   | 4 (default)       | off                    | 30   | off           | right ±                 | 91/102, 90/101                       |
| `c6-d8`         | patched   | 8                 | off                    | 30   | off           | right ±                 | 19/158, 28/129                       |
| `c5-busy65`     | patched   | 30                | off                    | 65   | off           | right ±                 | 0/193, 0/194                         |
| `c4-busy0`      | patched   | 30                | off                    | 0    | off           | right ±                 | 0/225, 0/198                         |
| `c3-sync-on`    | patched   | 30                | off                    | 30   | on            | right ±                 | 0/161, 0/144                         |

Controls added later (`127541b`), all busy 30 and `resize sync` off, right ±:

| Run                     | Electron  | Deadline (frames) | RemoteCoreAnimationAPI | Dithering | `yield on resize` | Out of step    |
| ----------------------- | --------- | ----------------- | ---------------------- | --------- | ----------------- | -------------- |
| `c7-yield`              | patched   | 30                | off                    | on        | on                | 0/212, 0/190   |
| `c8-nodither`           | patched   | 30                | off                    | off       | off               | 0/101, 0/99    |
| `c9-yield-nodither`     | patched   | 30                | off                    | off       | on                | 0/99, 0/100    |
| `c10-no-patch-nodither` | unpatched | 4 (default)       | on                     | off       | off               | 53/100, 47/101 |

In every run each drag produced 22–23 window size updates. The drags took
1.6–1.7 s without the patch and 2.1–3.7 s with it and dithering on, and
1.6–1.7 s with it and dithering off (per-drag `seconds` and `sizeUpdates` in
the data file).

### Observations

- **The patch is necessary.** The same switches on the unpatched Electron
  (`c1`) behave like the baseline.
- **The deadline has to cover the renderer's slowest frame.** With the
  default of 4 frames (33 ms at 120 Hz), a 30 ms busy renderer misses it most
  of the time (`patch`, `c2`). With 8 frames (67 ms) it misses occasionally
  (`c6`); with 30 frames (250 ms) it does not miss (`best`, `c5` at 65 ms busy).
- **With RemoteCoreAnimationAPI on, a few single-frame errors remain**
  (`patch-d30`): 4 px clipping at the moving edge, about every sixth frame.
  They match the race the source reading describes between the GPU
  process's and the browser's Core Animation commits. Turning the feature off
  removes them.
- **The best configuration holds in every direction:** four edges and four
  corners, growing and shrinking, 0 of 2,818 drag frames out of step.
  Dragging the left or top edge, which moves the window origin, is covered
  too.
- **Paced resizing is compatible but no longer needed** (`c3`).
- **Dithering does not change the outcome:** without it the patch still
  keeps every frame in step (`c8`, `c9`), and the unpatched build still
  falls out of step (`c10`).
- **The cost is time:** each size step now waits for a renderer frame, and the
  browser main thread is blocked while it waits. How much slower a drag feels
  cannot be read reliably from these runs, because the drag tool's pace also
  depends on the blocked main thread (busy 0 was not faster than busy 30).

### Cost: resize interval and main-thread blocking

Measured separately with a main-process probe (now
[`probe.ts`](../../../../experiments/resize-recording/probe.ts)) during one
right-edge drag per run; data in
[`cost.json`](cost.json).

| Run                  | Busy (ms) | Resize interval, median (ms) | Longest main-thread block (ms) | Blocks over 16 ms |
| -------------------- | --------- | ---------------------------- | ------------------------------ | ----------------- |
| Unpatched, no switch | 30        | 66.8                         | 54.1                           | 12                |
| Best configuration   | 0         | 166.2                        | 172.2                          | 23                |
| Best configuration   | 30        | 99.8                         | 102.7                          | 23                |
| Best configuration   | 65        | 136.6                        | 139.5                          | 23                |

- **The baseline keeps pace with the drag tool:** one move per ~67 ms. It
  still blocks the main thread briefly, because Chromium already holds each
  commit for the browser's own frame.
- **With the patch, the main thread blocks once per size step**, for about
  one renderer frame plus the time to finish the frame in progress, and the
  window updates only that often. At 30 ms busy that is ~10 updates per second.
- **Most of that time was GPU work from the per-tile dithering.** A
  `contentTracing` trace of the best configuration showed the GPU process
  saturated: `IOSurfaceImageBacking::WaitForCommandsToBeScheduled` took up
  to 83 ms, from the masked layers the dithering adds to every tile. This
  also explains why busy 0 was the slowest (166 ms per step): the renderer
  produced frames as fast as it could, each queueing more GPU work.
  Summary of the trace (busy 30, yield on, dithering on):
  [`trace.json`](trace.json),
  made with `trace.ts`. The GPU main thread spent 7.4 s in 285 swaps of
  20 ms or more, and the browser's Core Animation pre-commit handler waited
  up to 158 ms.

With dithering off (`127541b`, both right-edge drags per run, so 46 resizes):

| Run                        | Yield on resize | Resize interval, median (ms) | Longest main-thread block (ms) | Blocks over 16 ms |
| -------------------------- | --------------- | ---------------------------- | ------------------------------ | ----------------- |
| Unpatched, no switch       | off             | 66.6                         | 14.7                           | 0                 |
| Best configuration         | off             | 66.7                         | 65.2                           | 46                |
| Best configuration         | on              | 66.8                         | 34.3                           | 1                 |
| Best configuration, dither | on              | 144.0                        | 178.3                          | 46                |

- **Without the GPU load, the patched build keeps pace with the drag tool**
  (one step per ~67 ms, like the baseline) and stays in step.
- **The main thread still waits for the renderer on every step:** up to
  one busy frame plus the frame in progress (65 ms at busy 30).
- **Skipping the busy work during a resize** (`yield on resize`) shortens
  that wait to at most 34 ms, with one wait over 16 ms. The window stays in
  step because the renderer only has to produce frames quickly, which it
  can once it stops doing extra work.
- **Yield does not help while the GPU is the bottleneck** (last row).

## Conclusion and limits

- **Pass:** with the default surface deadline on resize, a deadline above the
  renderer's worst frame time, and RemoteCoreAnimationAPI off, the web
  content and the window frame reach the screen together.
- **The patch cannot ship:** it is a binary patch of one Electron build,
  ad hoc signed. A product needs the same behaviour from source: call
  `SetShouldUseDefaultDeadlineOnResize(true)` on the window's
  `RenderWidgetHostView` in a patched Electron (or upstream it as an option),
  plus the two switches. Alternatively, patch the framework as a
  build step and re-sign it with the app. The script's byte checks keep this
  from applying to a different build, but it has to be redone for every
  Electron version.
- **Unmeasured risks:**
  - A long deadline blocks the browser main thread for each size step, up to
    the deadline. A hung renderer would make resizing crawl.
  - Disabling RemoteCoreAnimationAPI moves compositing work into the browser
    process; its power and performance cost was not measured.
  - Heavy GPU work in the page slows every resize step, since each step now
    waits for a finished frame.
- **Coverage:**
  - One display at 120 Hz with 60 fps capture: a mismatch shorter than one
    capture frame can be missed.
  - The drags were coarse (10 pt per move); a person's continuous drag
    produces more, smaller steps.
  - Only this app was tested.

## Next step

- Try a real, continuous drag by hand with the patched build.
- Decide whether to carry a source patch of Electron.
