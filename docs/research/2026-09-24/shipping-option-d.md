# Shipping option D

Date: 2026-09-24\
Status: source patch written and checked to apply, not built; app-set switches confirmed to reach the processes that read them\
Evidence: source at Chromium 152.0.7977.130 and Electron v44.4.5 ([S]), local process checks ([R]), inference ([Inf])

## Question and scope

The [deadline patch experiment](../../experiments/2026-09-24/resize-deadline-patch.md)
showed that option D keeps the content in step with the window frame when
three things hold:

1. Resizing the web contents view embeds the renderer's new surface with a
   deadline instead of 0 (done there by a binary patch).
2. The deadline covers the renderer's slowest frame
   (`--deadline-to-synchronize-surfaces=30`).
3. RemoteCoreAnimationAPI is off.

This record asks which of these an app can do by itself, and what the rest
needs from Electron. Upstreaming and a real build of Electron are out of
scope.

## Sources and observations

**The two switches can be set by the app.** [S] + [R]

- `--deadline-to-synchronize-surfaces` is read only in the browser process,
  from `base::CommandLine::ForCurrentProcess()`, when the GPU process host
  starts; the value reaches viz through its init parameters. [S]
  [gpu_process_host.cc L984-985](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/gpu/gpu_process_host.cc#L984-L985),
  [switches.cc L69-81](https://github.com/chromium/chromium/blob/152.0.7977.130/components/viz/common/switches.cc#L69-L81)
- `app.commandLine.appendSwitch` before `ready` edits that same command line.
  With `ELECTRON_RESIZE_SYNC_DEADLINE_FRAMES=30` (see `src/main/main.ts`),
  the GPU and renderer processes were launched with
  `--disable-features=…,RemoteCoreAnimationAPI,…`. [R]
- Whether the deadline switch set this way has the same effect as on the
  command line is not yet confirmed on screen (next check).

**Only the deadline on resize needs Electron.** [S]

- `RenderWidgetHostView::SetShouldUseDefaultDeadlineOnResize(bool)` and
  `SetForceSpecifiedDeadline(std::optional<uint32_t>)` are public content API.
  [render_widget_host_view.h L328-336](https://github.com/chromium/chromium/blob/152.0.7977.130/content/public/browser/render_widget_host_view.h#L328-L336)
- The Mac view implements the second by forwarding to its
  `DelegatedFrameHost`.
  [render_widget_host_view_mac.mm L1147-1154](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/render_widget_host_view_mac.mm#L1147-L1154)
- `DelegatedFrameHost::EmbedSurface` applies a forced deadline after the
  resize policy, and only when a new surface is embedded (a new size or
  scale), so it replaces the deadline of 0 on resize.
  [delegated_frame_host.cc L347-371](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/delegated_frame_host.cc#L347-L371)
- A specified deadline of N frames is exactly N frames. The default deadline
  used by the binary patch is `max(4, --deadline-to-synchronize-surfaces)`.
  So forcing 30 frames on one view is the binary patch plus the switch,
  scoped to that view.
  [frame_deadline.cc L20-29](https://github.com/chromium/chromium/blob/152.0.7977.130/components/viz/common/quads/frame_deadline.cc#L20-L29)
- Electron creates no path to either call: no switch or option reaches them.
  [Chromium resize research](chromium-resize-sync.md#3-switches-and-features)
- A Node addon cannot call them, because the framework exports no `content::`
  symbols (the same research, section 4).

**Where Electron would call it.** [S]
`WebContents::HandleNewRenderFrame` runs for every new render frame, sets the
view's background colour, and already reads per-web-contents options from
`webPreferences` (`backgroundThrottling`). A new top-level view after a
cross-process navigation goes through it too.
[electron_api_web_contents.cc L2103-2138](https://github.com/electron/electron/blob/v44.4.5/shell/browser/api/electron_api_web_contents.cc#L2103-L2138)

## Conclusion and alternatives

1. **Electron source patch (recommended).**
   [`electron-v44.4.5-resize-deadline.patch`](../../../experiments/deadline-patch/electron-v44.4.5-resize-deadline.patch)
   adds `webPreferences.resizeDeadlineFrames`. When it is set,
   `HandleNewRenderFrame` calls `SetForceSpecifiedDeadline` on the main
   frame's view.
   - The app then sets `resizeDeadlineFrames: 30` and appends
     `--disable-features=RemoteCoreAnimationAPI`. The global
     `--deadline-to-synchronize-surfaces` is no longer needed.
   - The patch applies cleanly to the v44.4.5 sources. It has not been
     compiled or run; building Electron was out of reach here. [R]
   - It is small enough to upstream as an opt-in; it fits
     electron/electron#36280. [Inf]
2. **Binary patch at build time.** Run `experiments/deadline-patch/patch.ts`
   on the packaged app's framework and sign it with the app's identity.
   - It needs the release's symbols and byte checks for every Electron
     version.
   - It changes every view in the process, not one window.
   - The only route available today without building Electron.
3. **App-only settings (not enough).** The two switches alone do nothing:
   the unpatched Electron with both stays out of step (`c1` in the
   experiment).

The cost is the same for 1 and 2 and is measured in the experiment:

- The window resizes at most at the renderer's frame rate.
- The browser main thread waits up to one renderer frame per step, or up to
  the deadline for a hung renderer. Pausing heavy work during a resize
  (`yield on resize`) keeps that wait short.

## Unknowns and next check

- Record a drag with the deadline switch set by the app instead of on the
  command line (`ELECTRON_RESIZE_SYNC_DEADLINE_FRAMES=30` with the patched
  build), to confirm the equivalence on screen.
- Build Electron with the source patch and repeat the recording series;
  until then option 1 is unverified.
- A forced deadline also applies to the first frame after a scale change or
  when the view is shown. Whether that delays anything visible was not
  checked.
