# @electron-resize-sync/resize-deadline

**Status: works.** Resize deadline: the window's new size and the page's frame at
that size reach the screen together, in every direction, with and without busy
work
([deadline patch record](https://github.com/lennondotw/electron-resize-sync/blob/main/experiments/2026-09-24/resize-deadline-patch/README.md),
[built-in display](https://github.com/lennondotw/electron-resize-sync/blob/main/experiments/2026-09-24/resize-matrix-builtin/README.md)).

Stock Electron embeds a resized page with a deadline of 0 (Chromium M147+), so
the window's new frame reaches the screen with the page's previous frame. This
package makes the resize wait for the page instead. It needs two things.

## 1. Patch the framework

The patch rewrites a few instruction words in the Electron framework binary.
It works on **one build at a time**, identified by the binary's UUID, and
refuses any build it does not have an entry for. Today that is:

| Electron | Platform | Arch  | Verified                                                                                              |
| -------- | -------- | ----- | ----------------------------------------------------------------------------------------------------- |
| 44.4.5   | macOS    | arm64 | screen-recorded drags, in step                                                                        |
| 44.4.5   | macOS    | x64   | patched and resizes without crashing under Rosetta; resize sync not screen-verified on Intel hardware |

`knownBuilds()` returns this list. Other versions need an entry added first
(see [Adding a build](#adding-a-build)); Windows and Linux are not supported —
the resize problem there has not been confirmed or solved. A resize there
also embeds the page with a deadline of 0, so the switches alone do nothing;
the equivalent patch would target `RenderWidgetHostViewAura`
([Aura resize deadline](https://github.com/lennondotw/electron-resize-sync/blob/main/docs/research/2026-09-24/aura-resize-deadline.md)).

Patch at package time, in an electron-builder `afterPack` hook:

```js
// electron-builder.config.js
import { afterPack } from "@electron-resize-sync/resize-deadline/afterpack";
export default {
  mac: { target: "dmg" }, // arm64, or a universal build
  afterPack, // patches the packed app; electron-builder then signs it
};
```

The hook skips quietly (packaging still succeeds) on a platform or build it
does not know. Without electron-builder, call `patchElectronFramework` on the
`.app` yourself and sign it afterwards:

```ts
import { patchElectronFramework } from "@electron-resize-sync/resize-deadline/patch";

await patchElectronFramework({ appPath: "dist/mac-arm64/MyApp.app" });
// then: codesign --force --deep --sign <identity> "dist/mac-arm64/MyApp.app"
```

No symbols or Xcode tools are needed to patch — only to add a new build. The
patch invalidates the code signature, so the app must be signed again; an
`afterPack` hook is before electron-builder's signing step, so it is signed
for you.

## 2. Enable it at runtime

```ts
import { enableResizeDeadline } from "@electron-resize-sync/resize-deadline/main";

// Before app.whenReady().
const status = enableResizeDeadline({ frames: 30 });
```

`enableResizeDeadline` checks the running Electron's own framework and sets the
switches **only if it is patched**; otherwise it does nothing (no power cost)
and logs why. It returns the framework status, also available on its own from
`getResizeDeadlineStatus()`:

```ts
{ electron: "44.4.5", arch: "arm64", uuid: "…", supported: true, patched: true }
```

The two switches, when enabled:

- `--deadline-to-synchronize-surfaces=<frames>`: how many display frames a
  resize may wait for the page's frame. It must cover the page's slowest frame
  (4 frames by default is too short for a busy page); 30 is 250 ms at 120 Hz.
- `--disable-features=RemoteCoreAnimationAPI`: removes a race between the GPU
  and browser processes' Core Animation commits. Its power cost was not
  measured.

If you ship a source-patched Electron (below) that this package cannot
recognise by UUID, pass `enableResizeDeadline({ force: true })`.

## The cost

Each size step waits for the page's frame, so the window resizes at most at
the page's frame rate, and the browser main thread waits up to one page frame
per step. A page that skips optional work while resizing (see
[`resize-activity`](https://github.com/lennondotw/electron-resize-sync/tree/main/packages/resize-activity))
keeps the wait short. A hung page makes each step wait up to the deadline.

## Adding a build

Support for a new Electron version is an entry in `src/builds.ts`: the
framework UUID, and the offset, original bytes and replacement bytes of each
patch site. The maintainer tool locates the three functions from that
release's breakpad symbols (`electron-v<version>-darwin-<arch>-symbols.zip`)
and disassembles them:

```bash
node experiments/tools/deadline-patch/find-sites.ts \
  path/to/Electron.app path/to/symbols.zip --arch arm64
```

The replacement bytes are hand-authored per architecture from the
disassembly (see the existing entries: on arm64, force `GetResizeDeadlinePolicy`
down its default-deadline branch and make `ShouldUseDefaultDeadlineOnResize`
return true; on x64, flip the corresponding `jne` to `jmp` and rewrite the two
boolean functions to `mov al, 1; ret`). Then re-run the recordings on that
build.

## Source patch (alternative)

[`electron-v44.4.5-resize-deadline.patch`](electron-v44.4.5-resize-deadline.patch)
adds `webPreferences.resizeDeadlineFrames` to Electron. It applies cleanly to
v44.4.5 but has not been built or run; see
[shipping resize deadline](https://github.com/lennondotw/electron-resize-sync/blob/main/docs/research/2026-09-24/shipping-resize-deadline.md).
A source-built Electron works on any platform Chromium's deadline API supports,
without the binary patch: `SetForceSpecifiedDeadline` is implemented on
Windows and Linux (Aura) too, though whether a wait looks right there is
untested.

## Limits

- macOS only; the binary patch is per build (UUID) and today covers Electron
  44.4.5 on arm64 and x64. arm64 was measured on macOS 27.0, Apple M3 Max;
  x64 was derived from the same functions and confirmed to patch and resize
  without crashing under Rosetta, but its resize sync was not screen-verified
  on Intel hardware.
- The peer dependency is Electron 44.4.5 exactly, because that is the only
  build the binary patch matches.
- Measured with synthetic drags; a person's drag was only judged by eye.
