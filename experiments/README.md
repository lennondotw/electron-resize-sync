# Experiments

Every experiment record, with its published data and the code that produced
it. Records are grouped by date, one directory per experiment:

```text
experiments/
  YYYY-MM-DD/<experiment>/
    README.md    the record: question, environment, procedure, results, limits
    data.json    its published data (and any other data files)
    run.ts       the script, when only this experiment uses it (run.md explains it)
  tools/<tool>/  scripts that several experiments share
```

Write a record from the [experiment template](../docs/templates/experiment.md).
Plans, research and worklogs stay in [`docs/`](../docs/README.md).

## Records

| Date       | Experiment                                                          | Question                                                                           |
| ---------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 2026-09-24 | [resize-matrix-builtin](2026-09-24/resize-matrix-builtin/README.md) | Which options keep the content in step on the built-in display, busy and idle?     |
| 2026-09-24 | [resize-rate-overlay](2026-09-24/resize-rate-overlay/README.md)     | Does the resize rate overlay keep up with the window?                              |
| 2026-09-24 | [resize-deadline-patch](2026-09-24/resize-deadline-patch/README.md) | Does resizing with the default surface deadline (option D) keep content in step?   |
| 2026-09-24 | [resize-recording](2026-09-24/resize-recording/README.md)           | Does the content stay fixed relative to the window frame during a real drag?       |
| 2026-09-24 | [resize-pacing](2026-09-24/resize-pacing/README.md)                 | How long does a new window size stay unpainted, per edge, with and without pacing? |
| 2026-09-24 | [tile-dithering](2026-09-24/tile-dithering/README.md)               | Do dithered tiles average to fractional 8-bit values?                              |
| 2026-09-24 | [display-bit-depth](2026-09-24/display-bit-depth/README.md)         | Is the display path 8-bit or deeper?                                               |

## Tools

| Tool                                                 | Used for                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| [harness](tools/harness/session.ts)                  | Launching the demo in an isolated session and recording the environment   |
| [resize-recording](tools/resize-recording/README.md) | Staging, screen-recording and analysing real resize drags, frame by frame |
| [deadline-patch](tools/deadline-patch/README.md)     | Building the patched Electron copy for option D                           |

## Isolation

Every run goes through [`tools/harness/session.ts`](tools/harness/session.ts),
which:

- launches the built demo (`pnpm build` first) with a fresh Electron user data
  directory under `tmp/experiments/<experiment>/<UTC timestamp>/`, so runs never
  read or change the settings of your own app profile or of another run;
- picks free ports for the page debugger and the main-process inspector;
- writes the HUD settings the scenario needs into that fresh profile and reloads;
- keeps the window always on top, because Chromium pauses rAF for covered windows;
- records the OS, hardware, display, Electron/Chromium versions and repository
  commit (plus uncommitted paths) alongside the results.

`tmp/` is ignored by Git. To publish a run, pass `--out` pointing at the
record's data file, or copy the result there, and commit it with the record.

## Limits

- The window must stay on screen and the Mac awake for the whole run.
- The scripts cannot drag by themselves. The single-experiment scripts replay
  `will-resize` from the main process; the recording tools need an input tool
  (or a person) to drag, and measure what reaches the screen.
