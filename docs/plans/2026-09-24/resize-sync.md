# Resize and rAF synchronisation

Date: 2026-09-24\
Status: proposed; pacing implemented and measured, goal not met

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

## Next steps

1. Option D: force `ShouldUseDefaultDeadlineOnResize()` to true in a copy of
   the Electron framework (binary patch located with the official breakpad
   symbols), run with `--deadline-to-synchronize-surfaces` raised, and
   measure with the resize recording. Then decide whether a source patch of
   Electron is worth it.
2. Record corners and the remaining edges for the baseline.
3. Research option D in the Chromium and Electron sources for 44.4.5.
4. Prototype option C behind its own switch, and extend the resize-pacing run
   to report, per size, whether the window changed before or after the frame.
