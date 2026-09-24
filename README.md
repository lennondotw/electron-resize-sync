# electron-resize-sync

A deliberately slow Electron app for observing the canvas background leaking
through while a window is being resized, and a lab for keeping window resize
in sync with requestAnimationFrame rendering.

## What it does

- A `requestAnimationFrame` loop blocks the renderer for a configurable amount
  of busy work per frame (30ms by default, at most about 33fps) and re-renders a grid
  of tiles with React on every frame.
- `<html>` and the native window are painted with `--canvas`; `#root` fills
  the viewport and is painted with `--surface`. The two greys differ slightly
  in both light and dark mode, so any area the renderer has not painted yet
  shows up during a resize.

## Scripts

A pnpm workspace. The demo app lives in `apps/demo`, each workaround in its
own package under `packages/`; `experiments/` holds the measurement scripts
and `docs/` the records.

| Package                                                                                   | Status                | What it does                                                                                         |
| ----------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| [`resize-deadline`](packages/resize-deadline/README.md)                                   | **Works**             | Option D: a resize waits for the page's frame at the new size (a patched Electron plus two switches) |
| [`resize-activity`](packages/resize-activity/README.md)                                   | Works (a signal)      | Tells the page while a user resize is in progress, so it can skip optional work                      |
| [`resize-rate-overlay`](packages/resize-rate-overlay/README.md)                           | Works (a diagnostic)  | A click-through label showing how often the window actually changes size                             |
| [`drag-edge-heuristic`](packages/drag-edge-heuristic/README.md)                           | A guess, can be wrong | Guesses the dragged edges on macOS from the pointer                                                  |
| [`resize-pacing-not-working`](packages/resize-pacing-not-working/README.md)               | **Does not work**     | Option B: paces resizes to the page's frames                                                         |
| [`render-before-reveal-not-working`](packages/render-before-reveal-not-working/README.md) | **Does not work**     | Option C: lays the page out before the window takes the size                                         |

| Script        | Purpose                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `pnpm dev`    | Demo: Vite dev server + main-process watch build + Electron restarts        |
| `pnpm start`  | Demo: production build, then launch Electron on it                          |
| `pnpm build`  | Build every workspace package (the demo into `apps/demo/dist*`)             |
| `pnpm check`  | `typecheck` (TypeScript 7) + `lint` (oxlint) + `format:check`, all packages |
| `pnpm format` | Format with oxfmt                                                           |
