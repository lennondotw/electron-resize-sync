# @electron-resize-sync/resize-deadline

**Status: works.** Option D in the
[resize sync plan](../../docs/plans/2026-09-24/resize-sync.md): the window's
new size and the page's frame at that size reach the screen together, in
every direction, with and without busy work
([deadline patch record](../../docs/experiments/2026-09-24/resize-deadline-patch/README.md),
[built-in display matrix](../../docs/experiments/2026-09-24/resize-matrix-builtin/README.md)).

The cost: each size step waits for the page's frame, so the window resizes
at most at the page's frame rate, and the browser main thread waits up to one
page frame per step. A page that skips optional work while resizing (see
[`resize-activity`](../resize-activity/README.md)) keeps the wait short.

It needs two things, and neither works alone.

## 1. An Electron that waits for the page on resize

Stock Electron embeds a resized page with a deadline of 0 (Chromium M147+),
which no switch or API changes. Either:

- **Patch the built framework** with `patchElectronFramework` (from `./patch`,
  Node, macOS arm64). It finds the functions through the release's breakpad
  symbols, checks the bytes, and patches them. Sign the app again afterwards.
  The expected bytes are those of Electron 44.4.5; any other build fails the
  check instead of being patched.

  ```ts
  import { patchElectronFramework } from "@electron-resize-sync/resize-deadline/patch";

  await patchElectronFramework({
    appPath: "out/MyApp.app", // or a copy of node_modules/electron/dist/Electron.app
    symbolsZip: "electron-v44.4.5-darwin-arm64-symbols.zip",
  });
  ```

- **Or build Electron** with
  [`electron-v44.4.5-resize-deadline.patch`](electron-v44.4.5-resize-deadline.patch),
  which adds `webPreferences.resizeDeadlineFrames`. It applies cleanly to
  v44.4.5 but has not been built or run; see
  [shipping option D](../../docs/research/2026-09-24/shipping-option-d.md).

## 2. Two switches, from the app

```ts
import { enableResizeDeadline } from "@electron-resize-sync/resize-deadline/main";

// Before app.whenReady().
enableResizeDeadline({ frames: 30 });
```

- `--deadline-to-synchronize-surfaces=30`: the wait must cover the page's
  slowest frame (4 frames by default, too short for a busy page).
- `--disable-features=RemoteCoreAnimationAPI`: removes a race between the GPU
  and browser processes' Core Animation commits (single-frame errors
  otherwise). Its power cost was not measured.

## Limits

- macOS arm64 only; measured on macOS 27.0 with Electron 44.4.5.
- A hung page makes each resize step wait up to the deadline.
- Measured with synthetic drags; a person's drag was only tried by eye.
