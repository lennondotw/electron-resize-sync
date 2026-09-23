# Resize recording

Measures what the user sees during a real live-resize drag: whether the web
content stays fixed relative to the window frame. The screen is recorded while
the window is dragged, and each video frame is analysed for the position of
every window edge and of a marker the page draws at the middle of each edge.

This is the primary measure for the [resize synchronisation plan](../../docs/plans/2026-09-24/resize-sync.md).

## Requirements

- macOS with Screen Recording permission for the process that runs `ffmpeg`
  (AVFoundation capture; `screencapture` is not used).
- `ffmpeg` and `ffprobe` on `PATH`.
- A way to perform real pointer drags. Scripts cannot post mouse events without
  Accessibility permission, so the drags are performed with a computer-use
  tool from the ready-made paths `stage.ts` writes (see Procedure).
- `pnpm build` first.

## Run

1. Stage the app (keeps running until interrupted):

   ```bash
   node experiments/resize-recording/stage.ts --busy 30 --sync off \
     --frame-width <width of the drag tool's coordinate frame> --out tmp/rec/geometry.json
   ```

   `--sync on` enables paced resizing; `--electron-arg=<switch>` passes Chromium
   switches (repeatable); `--env NAME=value` sets environment variables.

2. Start a recording long enough to cover the drags:

   ```bash
   node experiments/resize-recording/record.ts --geometry tmp/rec/geometry.json --seconds 45 --out tmp/rec/run.mp4
   ```

3. While it records, perform the drags listed under `drags` in the geometry
   file (for example `"right outward"` then `"right inward"`), leaving about a
   second between drags.

4. Analyse:

   ```bash
   node experiments/resize-recording/analyze.ts --geometry tmp/rec/geometry.json --video tmp/rec/run.mp4 --out tmp/rec/run.json
   ```

5. Optional: timing from the main process. Run `node experiments/resize-recording/probe.ts install`
   before a drag and `probe.ts dump` after it. It prints the resize interval
   and how long the main thread was blocked.

## Staging

- The app runs in an isolated session (see [`harness`](../harness/session.ts))
  with `ELECTRON_RESIZE_SYNC_MARKERS=1`. The page then draws a 10×10 pt pure
  green square 2 pt inside the middle of each edge of `#root`.
- The window rests at 800×600 pt, centred on the primary display, always on
  top. Behind it is a frameless pure magenta window with a 160 pt margin, so
  the frame is easy to find in every video frame and drags stay over the app.
- Drags press 1 pt inside an edge or corner, move it 120 pt in 12 steps
  ("outward" grows, "inward" shrinks), return to the start, then nudge one
  frame unit sideways and back. Without the nudge AppKit drops the last move
  and the window does not return to its rest size.

## Analysis

- **Decoding:** frames are decoded with `-fps_mode passthrough`. AVFoundation
  capture is variable-rate, and constant-rate output would insert duplicate
  frames.
- **Window edges:** scanned outwards from the rest window's centre to the
  first magenta pixel. The test is by hue, so the darkened magenta under the
  window shadow still counts as backdrop.
- **Marker offsets:** the extent of green pixels in a 200 px band inside each
  edge. The offset is the gap between marker and edge.
- **Deviation from rest:** the offset minus its value at rest (the first 15
  frames).
  - Positive (_behind_): the content is smaller than the window, so the
    background shows.
  - Negative (_ahead_): the content is larger than the window and is clipped.
  - `null` (_hidden_): the marker is not visible.
- **Out of step:** a frame where any of the four markers deviates by more
  than 1 px or is hidden. All four markers count, because stale content stays
  anchored to the window origin: dragging a left or top edge shows the error
  on the opposite side.
- **Drags:** runs of frames in which the edges change, split at pauses longer
  than 0.6 s, plus 10 frames after the last change.

## Limits

- **Ahead deviations are underestimated:** a clipped marker only shows the
  sliver still inside the window.
- **Timing depends on the drag tool:** one move per ~15–20 ms from the
  computer-use tool, so each move is about 10 pt.
- **Display dependent:** results depend on the display (size, scale, refresh
  rate); the geometry file records it. Restage after changing displays.
