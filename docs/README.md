# Documentation

Plans, experiment records and work logs for electron-resize-sync. Start here
for the current state; dated records preserve how conclusions changed.

## Start here

- [Resize and rAF synchronisation](plans/2026-09-24/resize-sync.md): the goal
  (window size and content change together; dropped resize frames under load
  are acceptable), options considered, and what has been tried.
- [Resize with the default surface deadline](experiments/2026-09-24/resize-deadline-patch.md):
  option D works. A binary-patched Electron with a 30-frame deadline and
  RemoteCoreAnimationAPI off keeps content in step in every direction.
- [Chromium resize synchronisation](research/2026-09-24/chromium-resize-sync.md):
  why the content trails the frame on macOS, from Chromium 152 and Electron
  44.4.5 source, and candidate fixes.
- [Resize recording](experiments/2026-09-24/resize-recording.md): screen-recorded
  real drags; content is out of step in 60–95 % of drag frames with no switch,
  with pacing, and with three Chromium switches.
- [Resize pacing](experiments/2026-09-24/resize-pacing.md): how long each new
  window size stays unpainted, per edge and direction, with and without pacing.
- [Tile dithering](experiments/2026-09-24/tile-dithering.md): per-tile blue-noise
  dithering removes 8-bit plateaus between neighbouring tiles.
- [Display bit depth](experiments/2026-09-24/display-bit-depth.md): the current
  display path is 8-bit, so higher-precision rendering would not help here.

## Date index

| Date                                | Records                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [2026-09-24](worklog/2026-09-24.md) | [Resize sync plan](plans/2026-09-24/resize-sync.md), [Chromium resize sync research](research/2026-09-24/chromium-resize-sync.md), [Resize recording](experiments/2026-09-24/resize-recording.md), [Deadline patch](experiments/2026-09-24/resize-deadline-patch.md), [Resize pacing](experiments/2026-09-24/resize-pacing.md), [Tile dithering](experiments/2026-09-24/tile-dithering.md), [Display bit depth](experiments/2026-09-24/display-bit-depth.md) |
| [2026-09-23](worklog/2026-09-23.md) | Toolchain, janky renderer app, title bar and HUD                                                                                                                                                                                                                                                                                                                                                                                                             |

## Organization

```text
docs/
  README.md
  research/YYYY-MM-DD/<topic>.md
  plans/YYYY-MM-DD/<topic>.md
  experiments/YYYY-MM-DD/<topic>.md
  experiments/YYYY-MM-DD/<topic>.json   published data for that record
  worklog/YYYY-MM-DD.md
  templates/
experiments/<topic>/                    scripts that produce the data
```

Category first, then date. Worklogs use one file per day and link that day's
records. Create only directories that contain records. Use lowercase
kebab-case filenames.

| Type        | Purpose                                                   | Required distinction                   | Template                              |
| ----------- | --------------------------------------------------------- | -------------------------------------- | ------------------------------------- |
| Research    | Source reading and prior art behind a decision            | Source facts vs. reports vs. inference | [Research](templates/research.md)     |
| Plans       | Goal, options, decisions and what has been tried          | Proposed vs. accepted vs. implemented  | [Plan](templates/plan.md)             |
| Experiments | Question, procedure, environment, measurements and limits | Expected vs. actually measured         | [Experiment](templates/experiment.md) |
| Worklog     | Completed changes, validation and next steps              | Local checks vs. real-use validation   | [Worklog](templates/worklog.md)       |

## Adding a record

1. Copy the matching template into the category and date directory.
2. For an experiment, run its script from [`experiments/`](../experiments/README.md)
   on a committed tree, publish the JSON next to the record with `--out`, and
   quote the commit and environment the JSON records.
3. Link the record from that day's worklog and the date index above; keep
   "Start here" pointing at the current records.
4. Record a changed conclusion or a new run as a new dated record, linked both
   ways with `Supersedes` / `Superseded by`. Fix typos and links in place.
5. Run `pnpm format` and `pnpm check`, and check relative links, before committing.

## Evidence

- Every number in a record comes from a published data file or a command in
  the record. Do not replace a missing result with an expectation.
- Separate what the script measured from what a person saw on screen, and a
  simulated resize from a real AppKit drag.
- Keep screenshots and other binaries out of Git; describe what they showed
  and how to reproduce them.
- Run state and scratch output belong in the ignored `tmp/` directory.
