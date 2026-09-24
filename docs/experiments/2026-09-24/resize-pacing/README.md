# Resize pacing

Date: 2026-09-24\
Status: executed; simulated drags only; inconclusive for the synchronisation goal\
Data: [`data.json`](data.json)\
Script: [`experiments/resize-pacing`](../../../../experiments/resize-pacing/README.md)

## Question and acceptance criteria

Does pacing window resizes to renderer acks (`resize sync`) stop the window
from showing sizes the renderer has not rendered yet, for every edge and corner
in both directions?

The [plan](../../../plans/2026-09-24/resize-sync.md) goal would be supported if the
unpainted duration (window takes on a size → renderer finishes its first frame
at that size) stayed near zero with pacing on, at every busy budget. Fewer
applied sizes under load are acceptable.

## Environment

From `environment` in the data file:

| Field      | Value                                                         |
| ---------- | ------------------------------------------------------------- |
| OS         | macOS 27.0 (26A428)                                           |
| Hardware   | Mac15,8, Apple M3 Max                                         |
| Display    | 3008×1692 points, scale 2, 95.03 Hz, 24-bit, P3, no HDR       |
| Runtime    | Electron 44.4.5, Chromium 152.0.7977.130, Node 24.21.0, arm64 |
| Repository | `0dbf83b`, no uncommitted changes under `src`, `experiments`  |
| Captured   | 2026-09-23T16:40Z (2026-09-24 local)                          |

## Procedure

```bash
pnpm build
node experiments/resize-pacing/run.ts --out docs/experiments/2026-09-24/resize-pacing/data.json
```

Defaults: busy 0, 30 and 65 ms; `resize sync` off and on; eight edges and
corners; grow and shrink; two repetitions; 60 proposals of 4 px every 16 ms per
drag. Each busy/sync pair ran in its own fresh session. Drags are replayed by
emitting `will-resize` from the main process, not by a real pointer drag.

## Results

Unpainted duration in ms, all edges and directions pooled; "applied" is sizes
the window actually took on out of 60 proposals per drag.

| Busy | Sync | fps  | Applied / 60 | Samples | Median | p90   | Max    |
| ---- | ---- | ---- | ------------ | ------- | ------ | ----- | ------ |
| 0    | off  | 42.8 | 60           | 495     | 111.6  | 151.4 | 314.6  |
| 0    | on   | 57.8 | 59–60        | 1919    | 73.6   | 118.7 | 302.0  |
| 30   | off  | 30.5 | 60           | 789     | 90.7   | 132.4 | 5447.1 |
| 30   | on   | 30.5 | 21–24        | 702     | 66.4   | 70.1  | 235.6  |
| 65   | off  | 14.3 | 60           | 363     | 154.1  | 199.1 | 384.4  |
| 65   | on   | 14.4 | 9–10 ¹       | 196     | 136.6  | 139.3 | 207.5  |

¹ Only the first 20 drags. See anomalies.

Per edge and direction the medians were close within each row (for example
busy 30 with sync on: 65.4–68.1 across all eight edges; grow 66.3, shrink 66.6).
The per-drag numbers are in `scenarios[].drags[]`.

### Anomalies

- **Busy 65, sync on:** from the 21st drag (`top-right` grow) on, the renderer
  sent no acks at all; 3–4 sizes per drag were applied through the 500 ms
  timeout and no samples were recorded. The cause was not investigated (a
  stalled or hidden renderer is likely). Those 12 drags are excluded from the
  row above and need a rerun.
- **Busy 30, sync off:** `top` grow #0 has a 5447 ms sample, almost certainly
  an ack matched to an old commit of the same size; `bottom` shrink #0 did not
  end at the target bounds.
- **Busy 0, sync on:** every proposal was applied (60/60), which means acks
  arrived within about 16 ms, yet the recorded unpainted medians are 60–100 ms.
  Both cannot describe the same timeline, so the pairing of acks to resizes or
  the main-process timestamps (for example `setBounds` blocking the main
  thread) are suspect.

## Conclusion and limits

- **Pacing limits the commit rate:** with pacing on, the commit rate follows the
  renderer (about 21–24 applied sizes per drag at 30 ms busy, 9–10 at 65 ms), and
  the unpainted duration becomes steadier (busy 30: p90 70 ms vs 132 ms).
- **The unpainted duration does not approach zero:** at 30 ms busy it is about
  two renderer frames (66 ms) with pacing. Pacing therefore does **not** meet
  the synchronisation goal: each new size still lands before its frame exists.
- **Grow and shrink behave the same:** so do edges and corners, within noise.
- **What the method cannot measure:**
  - It never sees what is on screen. It cannot tell whether content stays
    fixed relative to the window frame, which is how the goal shows up to a
    user (for example the `#root ↘` label jittering during a bottom-right
    drag).
  - It does not exercise AppKit's live-resize loop, so a real drag with
    `will-resize` cancelled may behave differently.
  - The busy 0 inconsistency above means the absolute numbers should not be
    trusted until the measurement is cross-checked against a screen recording.

## Next step

Measure the goal directly: record the screen during real drags in every
direction and track, frame by frame, the offset between the window frame and
content anchored to each edge (the `#root ↘` label, the first tile). Needs
Screen Recording and Accessibility permission, or recordings supplied by hand.
Then rerun the anomalous cells.
