# Does the resize rate overlay keep up with the window?

Date: 2026-09-24\
Status: executed; one recording with synthetic drags; the overlay was in step at every size change; one unexplained 1 pt mismatch between the window frame and everything that follows the window's reported size\
Data: [`resize-rate-overlay.json`](resize-rate-overlay.json)\
Scripts: [`experiments/resize-recording`](../../../experiments/resize-recording/README.md) (`overlay.ts`, `analyze.ts`)

## Question and acceptance criteria

The resize rate overlay (`src/main/resizeRateOverlay.ts`, `686faf1`) is a
separate click-through child window. The main process moves it to the
window's top-right corner on every `resize` event. The concern was that the
move and the main window's size change are separate commits, so the label
could trail the window's edge by a frame while dragging the right or top
edge.

Pass: in every captured frame in which the window's right or top edge moved,
the label's offset from that corner equals its rest offset (±3 px, the
precision of finding the label's edge by brightness).

## Environment

From the data file's `environment`:

| Field      | Value                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------- |
| OS         | macOS 27.0 (26A428)                                                                               |
| Hardware   | Mac15,8, Apple M3 Max                                                                             |
| Display    | Built-in Retina Display, 1800×1169 pt, scale 2, 120 Hz, 30-bit; not the primary display           |
| Runtime    | Electron 44.4.5, Chromium 152.0.7977.130, arm64                                                   |
| Electron   | Patched copy (`tmp/deadline-patch/dist`, option D)                                                |
| Switches   | Set by the app: `--deadline-to-synchronize-surfaces=30 --disable-features=RemoteCoreAnimationAPI` |
| App        | Busy 30 ms, playing, dithering off, yield on resize off, resize sync off, overlay on              |
| Repository | `e55d000`, with the tool changes later committed in `60cbecc`                                     |
| Capture    | ffmpeg AVFoundation, 60 fps, no pointer                                                           |

## Procedure

```bash
node experiments/deadline-patch/patch.ts
ELECTRON_OVERRIDE_DIST_PATH=$PWD/tmp/deadline-patch/dist \
  node experiments/resize-recording/stage.ts --display Built-in --frame-width 1372 \
    --busy 30 --dither off \
    --env ELECTRON_RESIZE_SYNC_DEADLINE_FRAMES=30 --env ELECTRON_RESIZE_SYNC_OVERLAY=1 \
    --out tmp/rec/geometry-overlay-lag.json
node experiments/resize-recording/record.ts --geometry tmp/rec/geometry-overlay-lag.json \
  --seconds 150 --out tmp/rec/overlay-lag.mp4
node experiments/resize-recording/overlay.ts --geometry tmp/rec/geometry-overlay-lag.json \
  --video tmp/rec/overlay-lag.mp4 --out tmp/rec/overlay-lag-summary.json
node experiments/resize-recording/analyze.ts --geometry tmp/rec/geometry-overlay-lag.json \
  --video tmp/rec/overlay-lag.mp4 --out tmp/rec/overlay-lag-analysis.json
```

The drags came from the computer-use `app_drag` tool, which acts on a granted
app in the background, in the window's own points:

- 6 right-edge drags, 120 pt out and back.
- 3 top-edge and 3 top-right-corner drags, 120 pt in and back.

Each drag is a path of about 15 points, delivered in well under a second and
ending with a 1 pt sideways nudge. AppKit coalesces such a fast path, so each
drag produced only 2–6 size changes, of 20–80 pt each.

The window-local coordinates made the top-edge drags run away: the frame's
origin moves with the top edge. The first top-edge drag stopped at the
minimum height (420 pt), and the corner drags then changed only the width.

## Results

**The overlay was in step at every size change.**

| Measure                                     | Value |
| ------------------------------------------- | ----- |
| Captured frames                             | 3,653 |
| Frames in which the right or top edge moved | 26    |
| …with the label off its rest offset         | 0     |
| Frames in the 10 frames after each move     | 154   |
| …with the label off its rest offset         | 0     |

- The label's rest offset was 23 px from the right edge and 23 px from the
  top edge. That is the 11 pt inset plus the window's 1 px border.
- **Large moves were in step.** The top edge moved 40–160 px between two
  frames, and the right edge 40–120 px. In the same frame the label kept both
  offsets.

**The content stayed in step with option D, except where the window frame
disagreed with its reported size.**

- The corner drags (reported as `right-`) were in step: 0 of 91 frames out
  of step.
- **One unexplained 1 pt mismatch:**
  - After the first right-edge drags, the window frame on screen was 1 pt
    wider (the right edge 2 px further out) than both the page content and
    the overlay placed it. The right edge marker trailed by 2 px, and the
    label sat 25 px instead of 23 px from the edge.
  - This lasted about 32 s, until the next drag. It covers the two
    out-of-step drags in the data (11 of 46 and 27 of 38 frames).
  - A `setBounds` to the rest size in that interval changed nothing on
    screen, and `getBounds` reported the rest size throughout. So Electron
    believed the window was 800 pt wide while the screen showed 801 pt.
  - Setting 1 pt size changes with `setBounds` did not reproduce it: the
    overlay followed each change, and each one emitted `resize`.

## Conclusion and limits

- **Pass for the overlay:** at 60 fps capture, the label moved in the same
  frame as the window edge at every size change. The expected one-frame lag
  did not appear.
  - A plausible reason, not verified: the overlay's `setPosition` runs
    synchronously inside the `resize` event, while option D holds the main
    window's commit until the renderer's frame is ready, so both reach the
    same screen refresh.
- **Not seen:** a lag shorter than one capture frame (16.7 ms), since the
  display runs at 120 Hz and the capture at 60 fps.
- **Open: frame and reported size disagreed by 1 pt after synthetic drags.**
  Everything that follows the reported size, the page and the overlay, was
  off by that 1 pt until the next resize. Whether a person's drag can cause
  this is unknown. The fast, coalesced `app_drag` paths and the final nudge
  are the likely trigger.
- **Only one run, with synthetic input:** no human drag, and no run without
  option D.

## Next step

- Top and left drags need a tool that drags in screen coordinates: `app_drag`
  sends events to one window in that window's points, so dragging in the
  backdrop window's points resizes nothing.
- Watch for the 1 pt mismatch in the next recordings.
