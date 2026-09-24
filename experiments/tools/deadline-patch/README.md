# Deadline patch

Builds a copy of the installed Electron in which resizing a web contents view
waits for the renderer's frame at the new size (surface synchronisation with
the default deadline), instead of Chromium's hard-coded deadline of 0. This is
the experimental form of option D in the
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

It needs `gh` (to download the symbols), Xcode command-line tools (`dwarfdump`,
`otool`, `codesign`), and `unzip`. Then launch any script with the patched copy:

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

1. Downloads `electron-v<version>-darwin-arm64-symbols.zip` (about 129 MB,
   official breakpad symbols) from the Electron release, once.
2. Copies `node_modules/electron/dist/Electron.app` with `ditto`.
3. Patches it with `patchElectronFramework`, which checks that the symbols
   match the framework's UUID and that `__TEXT` maps addresses to file
   offsets, finds each function's address in the `FUNC` records, compares the
   instructions there with the expected original bytes (stopping if any
   differ), and only then writes the replacements.
4. Gives the copy its own bundle identifier
   (`com.github.Electron.deadline-patch`), so automation tools do not mistake
   it for the stock Electron. This is for the experiments only.
5. Re-signs the copy ad hoc.

## Limits

- **Tied to one build:** the expected bytes are for Electron 44.4.5 on arm64.
  Any other build fails the check rather than being patched blindly.
- **Experiment only, not for distribution:** the ad hoc signature is local.
  A product needs the same change as a source patch to Electron:
  [`electron-v44.4.5-resize-deadline.patch`](../../../packages/resize-deadline/electron-v44.4.5-resize-deadline.patch)
  adds `webPreferences.resizeDeadlineFrames` (written and checked to apply,
  not built). See [shipping option D](../../../docs/research/2026-09-24/shipping-option-d.md).
- **Deadline:** the default deadline is `--deadline-to-synchronize-surfaces`
  frames (4 unless set). A renderer slower than that still misses it. The app
  can set the switch itself: `ELECTRON_RESIZE_SYNC_DEADLINE_FRAMES=30` makes
  `apps/demo/src/main/main.ts` append it (through `enableResizeDeadline`), together with
  `--disable-features=RemoteCoreAnimationAPI`.
