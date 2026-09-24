# Deadline patch

Builds a copy of the installed Electron in which resizing a web contents view
waits for the renderer's frame at the new size (surface synchronisation with
the default deadline), instead of Chromium's hard-coded deadline of 0. This is
the experimental form of resize deadline in the
[resize synchronisation plan](../../../docs/plans/2026-09-24/resize-sync.md); see
the [source reading](../../../docs/research/2026-09-24/chromium-resize-sync.md)
for why this is the switch that matters.

The patching itself is `patchElectronFramework` in
[`packages/resize-deadline`](../../../packages/resize-deadline/README.md); this
script prepares the copy around it. The copy lives in
`tmp/deadline-patch/dist`. `node_modules` is never modified.

## Run

```bash
node experiments/tools/deadline-patch/patch.ts
```

It copies the installed Electron and patches it from the build table in
[`packages/resize-deadline`](../../../packages/resize-deadline/README.md), so
no symbols are needed — only `codesign` to re-sign. Then launch any script
with the patched copy:

```bash
ELECTRON_OVERRIDE_DIST_PATH=$PWD/tmp/deadline-patch/dist node experiments/tools/resize-recording/stage.ts …
```

The `electron` npm package resolves its binary from `ELECTRON_OVERRIDE_DIST_PATH`.

## What it changes

Chromium 152 (`content/browser/renderer_host/browser_compositor_view_mac.mm`):

```cpp
cc::DeadlinePolicy BrowserCompositorMac::GetResizeDeadlinePolicy() const {
  if (client_->ShouldUseDefaultDeadlineOnResize()) {
    return cc::DeadlinePolicy::UseDefaultDeadline();
  }
  return cc::DeadlinePolicy::UseSpecifiedDeadline(0u);
}
```

In the Electron 44.4.5 arm64 build the call to
`ShouldUseDefaultDeadlineOnResize()` is inlined into this function, so the
patch rewrites the function itself:

| Symbol                                                                       | Change                                                                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `content::BrowserCompositorMac::GetResizeDeadlinePolicy() const`             | First instruction becomes `b +0x14`, the existing branch that returns `UseDefaultDeadline()` (x8 untouched) |
| `content::RenderWidgetHostViewMac::ShouldUseDefaultDeadlineOnResize() const` | `mov w0, #1; ret`, so other callers agree                                                                   |
| non-virtual thunk to the same                                                | `mov w0, #1; ret`                                                                                           |

The script:

1. Copies `node_modules/electron/dist/Electron.app` with `ditto`.
2. Patches it with `patchElectronFramework`, which finds the build by the
   framework's UUID, checks the bytes at each site against the expected
   original (stopping if any differ), and writes the replacements. The offsets
   come from the package's build table, so no symbols are downloaded.
3. Gives the copy its own bundle identifier
   (`com.github.Electron.deadline-patch`), so automation tools do not mistake
   it for the stock Electron. This is for the experiments only.
4. Re-signs the copy ad hoc and stamps `patched.json`.

To add a build to the table (a new Electron version, or Intel x64), run
`find-sites.ts <Electron.app> <symbols.zip> --arch <arm64|x64>` once. It needs
that release's breakpad symbols and prints an entry for
`packages/resize-deadline/src/builds.ts`.

## Limits

- **Tied to known builds:** the table covers Electron 44.4.5 on arm64. Any
  other build fails the check rather than being patched blindly; add it with
  `find-sites.ts`.
- **Experiment only, not for distribution:** the ad hoc signature is local. A
  product patches its own packaged app (the package's `afterpack` hook) or
  ships a source-patched Electron:
  [`electron-v44.4.5-resize-deadline.patch`](../../../packages/resize-deadline/electron-v44.4.5-resize-deadline.patch)
  adds `webPreferences.resizeDeadlineFrames` (written and checked to apply,
  not built). See [shipping resize deadline](../../../docs/research/2026-09-24/shipping-resize-deadline.md).
- **Deadline:** the default deadline is `--deadline-to-synchronize-surfaces`
  frames (4 unless set). A renderer slower than that still misses it. The app
  can set the switch itself: `ELECTRON_RESIZE_SYNC_DEADLINE_FRAMES=30` makes
  `apps/demo/src/main/main.ts` append it (through `enableResizeDeadline`), together with
  `--disable-features=RemoteCoreAnimationAPI`.
