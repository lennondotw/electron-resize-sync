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

| Script        | Purpose                                                        |
| ------------- | -------------------------------------------------------------- |
| `pnpm dev`    | Vite dev server + main-process watch build + Electron restarts |
| `pnpm start`  | Production build, then launch Electron on it                   |
| `pnpm build`  | Build renderer (`dist/`) and main process (`dist-electron/`)   |
| `pnpm check`  | `typecheck` (TypeScript 7) + `lint` (oxlint) + `format:check`  |
| `pnpm format` | Format with oxfmt                                              |
