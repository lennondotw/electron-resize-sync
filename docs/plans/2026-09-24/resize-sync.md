# Resize and rAF synchronisation

Date: 2026-09-24\
Status: option D meets the goal in an experiment (binary-patched Electron); productisation open

## Goal

Whichever edge or corner is dragged, in either direction, the content inside
the window stays stable relative to the window frame: every frame the user
sees shows the window at a size the renderer has already rendered. No canvas
background is exposed while growing, no stale layout is clipped while
shrinking, and edge-anchored content (such as the `#root ↘` label in the
bottom-right corner, or the whole page when a left or top edge moves the
window origin) never jitters.

Explicitly acceptable: under busy work the window may resize at a lower rate
than the pointer moves (dropped resize frames). Low latency is not the goal;
synchronisation is.

Measure, primary: in a screen recording of real drags, the frame-by-frame
offset between the window frame and content anchored to each edge; the target
is a constant offset. Secondary, scripted: for each size the window takes on,
the time until the renderer finishes its first frame at that size ("unpainted
duration", see [resize pacing](../../experiments/2026-09-24/resize-pacing.md));
the target is that the window never presents a size before that frame exists.
The secondary measure cannot see the screen and showed internal
inconsistencies, so it does not decide on its own.

## Why the background leaks

Verified in source; see [the research record](../../research/2026-09-24/chromium-resize-sync.md):

1. **The window frame waits, but only for the browser's frame.** During a
   drag, AppKit changes the native window frame on the browser main thread,
   and Chromium holds that Core Animation transaction (up to 500 ms) until the
   window's own compositor has a frame at the new size.
2. **The web content is not waited for.** When the web contents' view
   resizes, its new surface is embedded with a deadline of 0
   (`BrowserCompositorMac::GetResizeDeadlinePolicy`). The browser frame
   therefore uses the renderer's previous frame at the old size, and the
   frame change and that stale content reach the screen together. Chromium
   made this change in M147 to keep resizing at 60 fps. Only PWA windows
   (`ShouldUseDefaultDeadlineOnResize`) still wait.
3. **Nothing public changes this.** Electron uses the same path and exposes
   no API or switch for it.

## Options

| Option                              | How                                                                                                                                                                  | Meets the goal?                                                                                                                                   | Status                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A. Renderer only                    | React to `resize` in the page                                                                                                                                        | No: the window has already changed when the page hears about it. Matching `html` to `#root` only hides the leak.                                  | Rejected                                                                                      |
| B. Pace commits                     | Main process cancels `will-resize`, keeps the latest bounds, applies them with `setBounds` after the renderer acks the previous size                                 | No: commit rate follows the renderer, but each size still lands before it is rendered                                                             | Implemented (`resize sync` switch), [measured](../../experiments/2026-09-24/resize-pacing.md) |
| B′. Pace commits and yield          | As B, and the renderer skips its busy work while a committed size is unrendered                                                                                      | Shortens the unpainted time; does not remove it. Changes the workload during resize.                                                              | Not started                                                                                   |
| C. Render before reveal             | Put the page in a `WebContentsView` sized independently of the window. Growing: enlarge the view (overflow is clipped), wait for its frame, then enlarge the window. | Growing: yes in principle. Shrinking: either the window shrinks first (stale layout clipped) or the view does (background exposed) for one frame. | Not started                                                                                   |
| D. Atomic window and content commit | Hold the window's Core Animation transaction until the renderer's frame at the new size is ready, as Chromium on macOS reportedly can during live resize             | Yes in principle, both directions                                                                                                                 | Unverified: whether Electron 44 enables it, its timeout, and whether it can be driven         |

## Decision

Open, with D as the focus (decided by the user on 2026-09-24): every option is
to be tried, D in most depth. Option B stays behind a switch as a baseline.

## Tried so far

- Measurement bridge and HUD readout: `edf186e`.
- Pacing (option B): `b378089`; ack carries the rendered size: `8a3483f`.
- [Resize pacing experiment](../../experiments/2026-09-24/resize-pacing.md):
  pacing cuts applied sizes to about the renderer's frame rate but does not
  bring the unpainted duration to zero.
- Pacing anchors the edge opposite the drag (`1853363`); Electron's
  `will-resize` bounds are wrong on macOS for bottom and right drags.
- [Source reading](../../research/2026-09-24/chromium-resize-sync.md) of
  Chromium 152 and Electron 44.4.5: why the content trails, and candidate
  implementations of D.
- [Resize recording](../../experiments/2026-09-24/resize-recording.md): the
  screen-recorded measure (`dac568f`). With no switch, with pacing, and with
  three Chromium switches, 60–95 % of drag frames are out of step.
- [Deadline patch](../../experiments/2026-09-24/resize-deadline-patch.md)
  (`13720c7`): forcing the default surface deadline on resize,
  `--deadline-to-synchronize-surfaces=30` and
  `--disable-features=RemoteCoreAnimationAPI` together keep every drag in
  step, in all eight directions and both ways (0 of 2,818 frames). Each part
  is necessary; paced resizing is no longer needed.
- Cost of D (`a7d1567`, `127541b`): each size step waits for a renderer
  frame. With the tiles' dithering off, a drag keeps the input's pace and
  the longest wait is one busy frame (65 ms); skipping the busy work during a
  resize (`yield on resize`) cuts it to 34 ms. The slow steps seen first
  (100–166 ms) came from GPU load of the dithering masks, found with a trace.

- [Resize matrix on the built-in display](../../experiments/2026-09-24/resize-matrix-builtin.md)
  (`6ceea54`): option D with the switches set by the app is in step with and
  without busy work, and costs nothing measurable with nothing to render.
  Option C (render before reveal, `9f7010f`) fails when shrinking and is the
  slowest. B′ reduces the error without removing it.

## Next steps

1. Try a continuous drag by hand with the patched build and everything off,
   to judge smoothness directly.
2. Decide how to ship D: build Electron with the
   [source patch](../../../experiments/deadline-patch/electron-v44.4.5-resize-deadline.patch),
   or run the binary patch at build time and re-sign the app.
3. Record top and left drags on the built-in display, which the background
   drag tool cannot express.
