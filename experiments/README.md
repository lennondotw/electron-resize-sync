# Experiments

Reproducible measurement scripts for this app. Each experiment lives in its own
directory with a README, a `run.ts` entry point and no state shared with the
others. Dated conclusions and published data live under
[`docs/experiments`](../docs/experiments); this directory keeps the code that
produced them.

## Isolation

Every run goes through [`harness/session.ts`](harness/session.ts), which:

- launches the built app (`pnpm build` first) with a fresh Electron user data
  directory under `tmp/experiments/<experiment>/<UTC timestamp>/`, so runs never
  read or change the settings of your own app profile or of another run;
- picks free ports for the page debugger and the main-process inspector;
- writes the HUD settings the scenario needs into that fresh profile and reloads;
- keeps the window always on top, because Chromium pauses rAF for covered windows;
- records the OS, hardware, display, Electron/Chromium versions and repository
  commit (plus uncommitted paths) alongside the results.

`tmp/` is ignored by Git. To publish a run, pass `--out` pointing at the dated
record's data file, or copy `results.json` there, and commit it with the record.

## Experiments

| Experiment                                       | Question                                                                           | Latest record                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [resize-pacing](resize-pacing/README.md)         | How long does a new window size stay unpainted, per edge, with and without pacing? | [2026-09-24](../docs/experiments/2026-09-24/resize-pacing.md)         |
| [resize-recording](resize-recording/README.md)   | Does the content stay fixed relative to the window frame during a real drag?       | [2026-09-24](../docs/experiments/2026-09-24/resize-recording.md)      |
| [tile-dithering](tile-dithering/README.md)       | Do dithered tiles average to fractional 8-bit values?                              | [2026-09-24](../docs/experiments/2026-09-24/tile-dithering.md)        |
| [deadline-patch](deadline-patch/README.md)       | Builds a patched Electron copy that waits for the renderer frame on resize         | [2026-09-24](../docs/experiments/2026-09-24/resize-deadline-patch.md) |
| [display-bit-depth](display-bit-depth/README.md) | Is the display path 8-bit or deeper?                                               | [2026-09-24](../docs/experiments/2026-09-24/display-bit-depth.md)     |

## Limits

- The window must stay on screen and the Mac awake for the whole run.
- Scripts drive the app through debugging protocols. They cannot perform a real
  AppKit live-resize drag (that needs accessibility permission), so resize runs
  replay `will-resize` from the main process instead.
