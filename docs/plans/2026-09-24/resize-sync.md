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

A summary from memory of how Chromium on macOS behaves; not yet verified
against source:

1. During a drag, AppKit changes the native window frame on the browser main
   thread first.
2. The browser sends the new size to the renderer and allocates a new surface.
3. The compositor (viz) waits briefly, a few vsyncs, for a frame of the new size.
4. The renderer is inside its busy work, so the frame arrives late; the
   compositor presents the old frame and the new area shows the window
   background (`--canvas`).

The window size is decided by the system, independently of when the renderer
is free.

## Options

| Option                              | How                                                                                                                                                                  | Meets the goal?                                                                                                                                   | Status                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A. Renderer only                    | React to `resize` in the page                                                                                                                                        | No: the window has already changed when the page hears about it. Matching `html` to `#root` only hides the leak.                                  | Rejected                                                                                      |
| B. Pace commits                     | Main process cancels `will-resize`, keeps the latest bounds, applies them with `setBounds` after the renderer acks the previous size                                 | No: commit rate follows the renderer, but each size still lands before it is rendered                                                             | Implemented (`resize sync` switch), [measured](../../experiments/2026-09-24/resize-pacing.md) |
| B′. Pace commits and yield          | As B, and the renderer skips its busy work while a committed size is unrendered                                                                                      | Shortens the unpainted time; does not remove it. Changes the workload during resize.                                                              | Not started                                                                                   |
| C. Render before reveal             | Put the page in a `WebContentsView` sized independently of the window. Growing: enlarge the view (overflow is clipped), wait for its frame, then enlarge the window. | Growing: yes in principle. Shrinking: either the window shrinks first (stale layout clipped) or the view does (background exposed) for one frame. | Not started                                                                                   |
| D. Atomic window and content commit | Hold the window's Core Animation transaction until the renderer's frame at the new size is ready, as Chromium on macOS reportedly can during live resize             | Yes in principle, both directions                                                                                                                 | Unverified: whether Electron 44 enables it, its timeout, and whether it can be driven         |

## Decision

Open. Option B is kept behind a switch as a measurement baseline. C is the most
promising option under our control for growing; D is the only one that also
covers shrinking and needs research first.

## Tried so far

- Measurement bridge and HUD readout: `edf186e`.
- Pacing (option B): `b378089`; ack carries the rendered size: `8a3483f`.
- [Resize pacing experiment](../../experiments/2026-09-24/resize-pacing.md):
  pacing cuts applied sizes to about the renderer's frame rate but does not
  bring the unpainted duration to zero.

## Next steps

1. Record real drags in all eight directions, both ways, with `resize sync` off
   and on, and measure content offset against the window frame per frame. This
   needs Screen Recording and Accessibility permission for scripted drags, or
   recordings made by hand. It also checks that cancelling `will-resize` and
   calling `setBounds` does not break a real AppKit drag.
2. Research option D in the Chromium and Electron sources for 44.4.5.
3. Prototype option C behind its own switch, and extend the resize-pacing run
   to report, per size, whether the window changed before or after the frame.
