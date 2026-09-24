# electron-resize-sync

Keep an Electron window's content in step with its frame while the user resizes
it on macOS, and the experiments that got there.

## The problem

Drag the edge of an Electron window on macOS and the page lags behind the
frame: while growing, the window background shows along the moving edge; while
shrinking, the page is clipped; content anchored to the right or bottom edge
jitters. The slower the page renders, the worse it gets.

The cause is in Chromium (M147 and later): when a web contents view is
resized, the renderer's new surface is embedded with a deadline of 0, so the
window's new frame reaches the screen with the page's previous frame. No
Electron API or Chromium switch changes that
([source reading](docs/research/2026-09-24/chromium-resize-sync.md)).

## What works

[`@electron-resize-sync/resize-deadline`](packages/resize-deadline/README.md)
makes each resize wait for the page's frame at the new size. It needs an
Electron patched to use a deadline on resize (a build-time binary patch
included in the package, or a source patch), plus two switches the app sets:

```ts
import { enableResizeDeadline } from "@electron-resize-sync/resize-deadline/main";

enableResizeDeadline({ frames: 30 }); // before app.whenReady()
```

Measured by screen-recording drags through AppKit's live resize (the pointer
input was synthetic; a person's drag was only judged by eye): 0 out-of-step
frames in every direction, with 30 ms of busy work per frame and without
([deadline patch](experiments/2026-09-24/resize-deadline-patch/README.md),
[built-in display](experiments/2026-09-24/resize-matrix-builtin/README.md)).
The price is that the window resizes at most at the page's frame rate; with
little to render it resizes as often as stock Electron.

Tested on macOS 27.0, Apple M3 Max, Electron 44.4.5 (Chromium 152); the binary
patch is specific to Electron 44.4.5 on arm64 and refuses other builds.

## Packages

| Package                                                                                               | Status                | What it does                                                                             |
| ----------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| [`resize-deadline`](packages/resize-deadline/README.md)                                               | **Works**             | A resize waits for the page's frame at the new size: the Electron patch and its switches |
| [`resize-activity`](packages/resize-activity/README.md)                                               | Works (a signal)      | Tells the page while a user resize is in progress, so it can skip optional work          |
| [`resize-rate-overlay`](packages/resize-rate-overlay/README.md)                                       | Works (a diagnostic)  | A click-through label showing how often the window actually changes size                 |
| [`drag-edge-heuristic`](packages/drag-edge-heuristic/README.md)                                       | A guess, can be wrong | Guesses the dragged edges on macOS from the pointer                                      |
| [`resize-pacing-not-working`](packages-not-working/resize-pacing-not-working/README.md)               | **Does not work**     | Paces resizes to the page's frames. Kept for comparison, not published                   |
| [`render-before-reveal-not-working`](packages-not-working/render-before-reveal-not-working/README.md) | **Does not work**     | Lays the page out before the window takes a new size. Kept for comparison, not published |

## What was tried

| Option                                              | Result                                                                   | Record                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium switches alone                             | Out of step in 60–95 % of drag frames                                    | [resize recording](experiments/2026-09-24/resize-recording/README.md)                                                                       |
| B: pace resizes to the page's frames                | Still out of step; with busy work skipped, errors fall from 180 to 40 px | [resize pacing](experiments/2026-09-24/resize-pacing/README.md), [built-in display](experiments/2026-09-24/resize-matrix-builtin/README.md) |
| C: render before reveal                             | In step when growing, up to 140 px behind when shrinking, and slowest    | [built-in display](experiments/2026-09-24/resize-matrix-builtin/README.md)                                                                  |
| **D: wait for the page's frame (patched Electron)** | **In step in every direction**                                           | [deadline patch](experiments/2026-09-24/resize-deadline-patch/README.md)                                                                    |

The [plan](docs/plans/2026-09-24/resize-sync.md) tracks the options and
decisions; [docs](docs/README.md) indexes every record, each with its
environment and published data.

## Repository

A pnpm workspace:

- `packages/`: the packages above that work; `packages-not-working/`: the
  ones that do not.
- `apps/demo`: a deliberately slow app to see the problem. A frame loop blocks
  the renderer for a configurable time per frame and animates a grid of
  tiles; `<html>` and `#root` are painted in slightly different greys, so any
  unpainted area shows during a resize. A HUD switches the workarounds.
- `experiments/`: scripts that stage the demo, record drags on screen and
  measure, per frame, whether the content stays in step with the frame.
- `docs/`: plans, research and experiment records.

| Script             | Purpose                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| `pnpm dev`         | Demo: Vite dev server + main-process watch build + Electron restarts        |
| `pnpm dev:patched` | The same, with option D: the patched Electron copy and its switches         |
| `pnpm start`       | Build everything, then launch the demo                                      |
| `pnpm build`       | Build every package (in dependency order), then the demo                    |
| `pnpm check`       | `typecheck` (TypeScript 7) + `lint` (oxlint) + `format:check`, all packages |
| `pnpm format`      | Format with oxfmt                                                           |

`pnpm dev` runs the demo on stock Electron, where the problem shows.
`pnpm dev:patched` runs it with option D: on a copy of Electron patched by
[`deadline-patch`](experiments/tools/deadline-patch/README.md) (built under
`tmp/` on first use, which downloads the release's symbols, about 129 MB), with
the two switches set.

## Windows and Linux test builds

The binary patch is macOS only. Whether the resize problem exists on Windows
and Linux, and whether the `--deadline-to-synchronize-surfaces` switch (the
one cross-platform lever) changes anything there, is untested — these builds
are to find out.

```bash
pnpm --filter @electron-resize-sync/demo package:linux  # or package:win
```

Each writes two portable zips under `tmp/packages/`: a **baseline** (stock,
no switches) and a **patched** (the switch baked in) variant. Unzip and run
the executable on the target OS, resize the window, and compare. The patched
variant here only sets the switch; it does not binary-patch the framework, so
it may behave the same as baseline.

### Package builds

Each package builds with `tsc` to ESM and declarations in `dist/`. In the
workspace every entry point also has a `development` condition that points at
`src/*.ts`, which TypeScript (`customConditions`), the demo's Vite dev server
and its main and preload watch builds resolve, so edits to a package apply
without building it; `pnpm build` and `pnpm start` use `dist/`. On publish,
`publishConfig.exports` drops the `development` condition and `workspace:^`
becomes a version range.

The packages are not on npm yet. Publishing needs the `@electron-resize-sync`
scope on npm; then `pnpm -r publish` publishes the packages in `packages/`
(each builds in `prepack`), and skips the private ones in
`packages-not-working/`.

## License

[MIT](LICENSE)
