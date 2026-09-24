# Resize recording: baseline, pacing and Chromium switches

Date: 2026-09-24\
Status: executed; real AppKit drags on one display; no configuration keeps content in step\
Data: [`data.json`](data.json)\
Script: [`experiments/tools/resize-recording`](../../tools/resize-recording/README.md)

## Question and acceptance criteria

During a real live-resize drag, does the content stay fixed relative to the
window frame? This is the [plan](../../../docs/plans/2026-09-24/resize-sync.md)'s goal
measured directly on screen.

- **Pass:** no out-of-step frames during a drag. Every edge marker stays at its
  rest offset (±1 px) and stays visible.
- **Checked for:**
  - the default behaviour;
  - paced resizing (`resize sync`, option B);
  - three Chromium switches that the [source reading](../../../docs/research/2026-09-24/chromium-resize-sync.md)
    predicted would not help (part of option D).

## Environment

| Field      | Value                                                                                  |
| ---------- | -------------------------------------------------------------------------------------- |
| OS         | macOS 27.0 (26A428)                                                                    |
| Hardware   | Mac15,8, Apple M3 Max                                                                  |
| Display    | VX2781-4K-PRO as the only primary display: 3008×1692 pt, scale 2, 120 Hz               |
| Runtime    | Electron 44.4.5, Chromium 152.0.7977.130                                               |
| App        | Busy work 30 ms per frame, playing, dithering on; window at rest 800×600 pt            |
| Repository | App at `1853363`; experiment code as committed in `dac568f` (runs predate that commit) |
| Capture    | ffmpeg AVFoundation, 60 fps, no pointer, 2 px per pt; drags by a computer-use tool     |

The geometry files of these runs predate environment recording in `stage.ts`;
the values above were read from the same session (`system_profiler`, `sw_vers`,
`process.versions`).

## Procedure

For each configuration, stage, record and analyse as in the script README. The
drags move one edge 120 pt out and back ("+"), or in and back ("−"), in 10 pt
steps at about one move per 15–20 ms. Runs:

| Label          | `resize sync` | Electron switch                                     | Drags                     |
| -------------- | ------------- | --------------------------------------------------- | ------------------------- |
| `off`          | off           | none                                                | right ±, bottom ±, left ± |
| `off-left-top` | off           | none                                                | left +, top ±             |
| `on`           | on            | none                                                | right ±                   |
| `deadline30`   | off           | `--deadline-to-synchronize-surfaces=30`             | right ±                   |
| `no-remote-ca` | off           | `--disable-features=RemoteCoreAnimationAPI`         | right ±                   |
| `catv2-async`  | off           | `--enable-features=CATransactionV2,AsyncLiveResize` | right ±                   |

`off-left-top` was recorded before the end-of-drag nudge was added. Its `left +`
drag ended 10 pt short, so the following `left −` drag missed the edge and is
absent. Top drags in the `off` run fell outside its 55 s recording.

## Results

Out-of-step frames per drag (frames from the first edge change to 10 frames
after the last). "Behind" is the largest marker lag inside the window (content
smaller than the frame, background exposed). "Ahead" is content larger than
the frame, clipped; a clipped marker only shows its last 4 px, so ahead values
are lower bounds.

| Run            | Drag     | Out of step | Worst marker | Behind / ahead (px) |
| -------------- | -------- | ----------- | ------------ | ------------------- |
| `off`          | right +  | 89 / 98     | right        | 42 / 4              |
| `off`          | right −  | 86 / 101    | right        | 22 / 4              |
| `off`          | bottom + | 75 / 117    | bottom       | 42 / 4              |
| `off`          | bottom − | 61 / 101    | bottom       | 42 / 4              |
| `off`          | left +   | 76 / 120    | right        | 42 / 4              |
| `off`          | left −   | 74 / 92     | right        | 42 / 4              |
| `off-left-top` | top +    | 91 / 102    | bottom       | 40 / 4              |
| `off-left-top` | top −    | 78 / 99     | bottom       | 22 / 4              |
| `on`           | right +  | 95 / 109    | right        | 40 / 4              |
| `on`           | right −  | 84 / 100    | right        | 22 / 4              |
| `deadline30`   | right +  | 89 / 101    | right        | 40 / 4              |
| `deadline30`   | right −  | 93 / 98     | right        | 42 / 4              |
| `no-remote-ca` | right +  | 91 / 100    | right        | 42 / 4              |
| `no-remote-ca` | right −  | 92 / 100    | right        | 22 / 4              |
| `catv2-async`  | right +  | 91 / 99     | right        | 62 / 4              |
| `catv2-async`  | right −  | 93 / 100    | right        | 42 / 4              |

(2 px = 1 pt; one drag step is 10 pt = 20 px.)

### Observations

- **The content trails the frame:** in every configuration it is one or two
  drag steps behind (20–42 px), in both directions. Growing exposes the
  background; shrinking clips stale layout.
- **Stale content stays anchored to the window's top-left corner:** dragging
  the left or top edge moves that corner, so the error shows on the opposite
  side (the right or bottom marker), while the marker at the dragged edge
  stays in place.
- **Pacing (`on`) does not change the share of out-of-step frames:** each
  committed size still lands before its frame.
- **None of the three switches helps.** This matches the source reading: the
  resize path embeds the renderer with a fixed deadline of 0, which
  `--deadline-to-synchronize-surfaces` does not affect, and Electron's
  `windowWillResize:toSize:` bypasses `AsyncLiveResize`.

### Found along the way

With `resize sync` on, Electron's `will-resize` bounds on macOS keep the
window's bottom-left corner fixed whichever edge is dragged, so applying them
made a window dragged down grow upwards. Fixed in `1853363` by anchoring the
edges opposite `details.edge`; checked with real drags on the bottom, top,
left and top-right edges.

## Conclusion and limits

- **Result: fail for every configuration tested.** No switch available to an
  unmodified Electron 44.4.5 keeps the content in step with the frame.
- **Coverage is partial:** corners were not recorded in this series, and only
  the right edge was recorded for the switch runs.
- **Drag input is coarse:** the drag tool moves 10 pt at a time, faster than
  a person's drag.
- **Single display:** results come from one 120 Hz display; the capture itself
  runs at 60 fps, so single-frame mismatches at 120 Hz can be missed.

## Next step

Option D proper: make the resize path wait for the renderer's frame by forcing
`RenderWidgetHostViewMac::ShouldUseDefaultDeadlineOnResize()` to return true
(a patched Electron, or a binary patch of the framework for the experiment),
with a longer `--deadline-to-synchronize-surfaces`. Measure it with this script.
