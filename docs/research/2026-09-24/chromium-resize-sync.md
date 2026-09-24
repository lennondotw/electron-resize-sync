# Chromium and Electron resize synchronisation on macOS

Date: 2026-09-24\
Status: source reading at Chromium 152.0.7977.130 and Electron v44.4.5; runtime checks in [resize recording](../../experiments/2026-09-24/resize-recording/README.md)\
Evidence: source permalinks ([S]), issue and commit claims ([I]), inference ([Inf])

Sources were read at the exact tags: Chromium files were fetched from
`https://raw.githubusercontent.com/chromium/chromium/152.0.7977.130/<path>`,
Electron was shallow-cloned at `v44.4.5` (commit `694f45852a0f`, whose `DEPS`
pins `chromium_version = 152.0.7977.130`). Every file listed below was fetched
successfully; nothing is quoted from memory.

Legend used throughout:

- **[S]** verified in source at the tags above (with permalink)
- **[I]** claim from an issue, PR or commit message (with link)
- **[Inf]** my own inference, not verified at runtime

Chromium permalinks point at `https://github.com/chromium/chromium/blob/152.0.7977.130/…`,
Electron permalinks at `https://github.com/electron/electron/blob/v44.4.5/…`.

---

## TL;DR

1. Chromium on macOS **does** hold the window's CATransaction during resize, but
   it waits only for the **browser's own `ui::Compositor` frame** at the new size,
   not for the **renderer's** frame. [S]
2. Since M147 (crrev.com/c/7274976, Feb 2026), in-process windows embed the resized
   renderer surface with **deadline 0**. Viz therefore draws the browser frame at
   the new size straight away, using the renderer's old surface as a fallback plus
   the gutter colour. The window frame and that frame reach the screen together,
   while the web content arrives one or more frames later. This matches the symptom
   exactly. [S] + [I]
3. The same code runs for an Electron `BrowserWindow`: it is a
   `NativeWidgetNSWindowBridge`, and its web contents are composited into the
   window's `ui::Compositor` through `views::WebView`. Electron neither disables nor
   extends the mechanism. [S] (runtime confirmation still recommended)
4. The switch that would make it wait for the renderer is a **public content API**:
   `RenderWidgetHostView::SetShouldUseDefaultDeadlineOnResize(true)` or
   `SetForceSpecifiedDeadline(n)`. Chrome itself uses it for PWA windows and during
   side-panel animations. Electron does not call or expose it. The Electron
   Framework binary exports only `node::`/`v8::` symbols, so a Node addon **cannot**
   call it. [S] (checked with `nm`)
5. No command-line switch or feature alone makes live resize wait for the renderer.
   `--deadline-to-synchronize-surfaces=N` only lengthens _default_ deadlines, and
   resize uses a _specified_ deadline of 0. [S]
6. The most direct route to a true atomic commit in both directions is a small
   Electron/Chromium patch: default (or longer) deadline on resize for the window's
   main RWHV, plus `--deadline-to-synchronize-surfaces=N`, optionally with
   `--disable-features=RemoteCoreAnimationAPI`. Without rebuilding, the best
   available option is "render before reveal" (plan option C), which is atomic for
   growing only.

---

## 1. How Chromium on macOS synchronises window resizes with frames

### 1.1 CATransactionCoordinator (ui/accelerated_widget_mac)

- `CATransactionCoordinator` wraps the private SPI
  `+[CATransaction addCommitHandler:forPhase:]`, with the phases pre-layout,
  pre-commit and post-commit. [S]
  [ca_transaction_observer.mm L23-32](https://github.com/chromium/chromium/blob/152.0.7977.130/ui/accelerated_widget_mac/ca_transaction_observer.mm#L23-L32)
- Interface: `PreCommitObserver { ShouldWaitInPreCommit(); PreCommitTimeout();
IsWindowInLiveResize(); }` and a ref-counted `PostCommitObserver`. The header
  comment says pre-commit is "Safe to block here waiting for drawing/layout in
  other processes". [S]
  [ca_transaction_observer.h L21-53](https://github.com/chromium/chromium/blob/152.0.7977.130/ui/accelerated_widget_mac/ca_transaction_observer.h#L21-L53)
- **V1 path, the default in 152.** `Synchronize()` calls `SynchronizeImpl()`, which
  registers pre-commit and post-commit handlers for the current transaction.
  `PreCommitHandler()` loops while any observer's `ShouldWaitInPreCommit()` is
  true. The deadline is the start time plus the largest `PreCommitTimeout()`. In
  the loop it pumps `WindowResizeHelperMac::WaitForSingleTaskToRun(time_left)`,
  which runs only tasks posted to its special task runner (compositor and
  display-client IPC). The post-commit timeout is `kPostCommitTimeout = 50 ms`. [S]
  [L39](https://github.com/chromium/chromium/blob/152.0.7977.130/ui/accelerated_widget_mac/ca_transaction_observer.mm#L39),
  [L47-118](https://github.com/chromium/chromium/blob/152.0.7977.130/ui/accelerated_widget_mac/ca_transaction_observer.mm#L47-L118),
  [L155-177](https://github.com/chromium/chromium/blob/152.0.7977.130/ui/accelerated_widget_mac/ca_transaction_observer.mm#L155-L177)
- **V2 path (`kCATransactionV2`).** `Synchronize()` creates a
  `ScopedCAActionDisabler` and runs the wait in `DidProcessTask`. However,
  **it returns early when the run-loop mode is not `NSDefaultRunLoopMode`**, and
  during a live-resize drag the mode is `NSEventTrackingRunLoopMode`. [S]
  [L159-174](https://github.com/chromium/chromium/blob/152.0.7977.130/ui/accelerated_widget_mac/ca_transaction_observer.mm#L159-L174),
  [L205-220](https://github.com/chromium/chromium/blob/152.0.7977.130/ui/accelerated_widget_mac/ca_transaction_observer.mm#L205-L220)
- Feature defaults in 152 [S]
  ([ui_base_features.cc L81-89](https://github.com/chromium/chromium/blob/152.0.7977.130/ui/base/ui_base_features.cc#L81-L89)):
  - `kOnlyUseWindowResizeHelperOnResize`: disabled.
  - `kCATransactionV2`: **disabled**.
  - `kAsyncLiveResize`: **disabled**.

  History [I]:
  - V2 was enabled on 2026-05-05, reverted, relanded
    ([fe362c86](https://github.com/chromium/chromium/commit/fe362c86c8fb424afb1e7de3b2c4ee56c4c6d12b)),
    then disabled again on 2026-06-03 because it caused "flickering during resize"
    (merged to M150,
    [87d71150](https://github.com/chromium/chromium/commit/87d71150fea39e70372a0f5c3c5edffc5a271e91),
    crbug 519500878).
  - AsyncLiveResize was split out because "comes with so many regressions"
    ([9cf46ff0](https://github.com/chromium/chromium/commit/9cf46ff0e8cb7958ea4f799f71d2590dcce7f5ef)).
  - Design notes: [5043968d](https://github.com/chromium/chromium/commit/5043968d417c4eabad6141f61181d2305795d377),
    [3742f9c0](https://github.com/chromium/chromium/commit/3742f9c0ca7ea4e7f2c55bb148d856a7a085a3bf).

### 1.2 NativeWidgetNSWindowBridge, the only PreCommitObserver

- Every bridge registers itself in `SetWindow()`. [S]
  [L448](https://github.com/chromium/chromium/blob/152.0.7977.130/components/remote_cocoa/app_shim/native_widget_ns_window_bridge.mm#L448)
- **Timeout:** `PreCommitTimeout()` returns `kUIPaintTimeout = 500 ms`. [S]
  [L86](https://github.com/chromium/chromium/blob/152.0.7977.130/components/remote_cocoa/app_shim/native_widget_ns_window_bridge.mm#L86),
  [L1758-1760](https://github.com/chromium/chromium/blob/152.0.7977.130/components/remote_cocoa/app_shim/native_widget_ns_window_bridge.mm#L1758-L1760)
- **Wait condition:** `ShouldWaitInPreCommit()` [S]
  ([L1735-1756](https://github.com/chromium/chromium/blob/152.0.7977.130/components/remote_cocoa/app_shim/native_widget_ns_window_bridge.mm#L1735-L1756))
  returns true only if all of the following hold:
  - the window is visible and wants to be visible;
  - sync is not suppressed;
  - the bridged view exists and the content size is not empty;
  - the window is not in a fullscreen transition;
  - `content_dip_size_ != compositor_frame_dip_size_`.
- `compositor_frame_dip_size_` is updated only in `SetCALayerParams()`, and only
  when the frame's DIP size equals `content_dip_size_`. Frames at stale sizes are
  ignored. `SetCALayerParams` then calls
  `display_ca_layer_tree_->UpdateCALayerTree()`. These `CALayerParams` are the
  **window's `ui::Compositor` output**, which is browser UI plus any embedded
  renderer surfaces. [S]
  [L1919-1968](https://github.com/chromium/chromium/blob/152.0.7977.130/components/remote_cocoa/app_shim/native_widget_ns_window_bridge.mm#L1919-L1968)
- **Trigger:**
  1. AppKit resizes the window.
  2. `-[BridgedContentView setFrameSize:]` or `OnSizeChanged()` calls
     `UpdateWindowGeometry()`.
  3. That calls `SendWindowFrameChangeToHost()`: synchronous views layout, in
     process.
  4. If the content was resized, sync is not suppressed and `kAsyncLiveResize` is
     off, it calls `CATransactionCoordinator::Get().Synchronize()`. [S]
     [L2156-2177](https://github.com/chromium/chromium/blob/152.0.7977.130/components/remote_cocoa/app_shim/native_widget_ns_window_bridge.mm#L2156-L2177),
     [bridged_content_view.mm L762-785](https://github.com/chromium/chromium/blob/152.0.7977.130/components/remote_cocoa/app_shim/bridged_content_view.mm#L762-L785)
- `SetBounds()` (the programmatic path through the bridge) calls `Synchronize()`
  only under V2. [S]
  [L651-659](https://github.com/chromium/chromium/blob/152.0.7977.130/components/remote_cocoa/app_shim/native_widget_ns_window_bridge.mm#L651-L659)
- Translucent (non-opaque) windows set `ca_transaction_sync_suppressed_` until the
  first frame arrives. [S]
  [L1520-1537](https://github.com/chromium/chromium/blob/152.0.7977.130/components/remote_cocoa/app_shim/native_widget_ns_window_bridge.mm#L1520-L1537)
- **AsyncLiveResize path (off):** `-[ViewsNSWindowDelegate windowWillResize:toSize:]`
  rejects the AppKit size and calls `OnLiveResizeToFrame()`. `SetCALayerParams()`
  later calls `-[NSWindow setFrame:]` once a compositor frame of that size exists.
  This is Chromium's own "hold the frame" implementation. [S]
  [views_nswindow_delegate.mm L156-205](https://github.com/chromium/chromium/blob/152.0.7977.130/components/remote_cocoa/app_shim/views_nswindow_delegate.mm#L156-L205),
  [bridge L2125-2154](https://github.com/chromium/chromium/blob/152.0.7977.130/components/remote_cocoa/app_shim/native_widget_ns_window_bridge.mm#L2125-L2154)

### 1.3 Why the renderer is not waited for: surface synchronisation deadline

- When the RWHV's NSView bounds change, `RenderWidgetHostViewMac::UpdateScreenInfo()`
  calls `BrowserCompositorMac::UpdateSurfaceFromNSView()`. That allocates a new
  `LocalSurfaceId` and calls `DelegatedFrameHost::EmbedSurface(...,
UseSpecifiedDeadline(0))`. [S]
  [render_widget_host_view_mac.mm L990-1040](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/render_widget_host_view_mac.mm#L990-L1040),
  [browser_compositor_view_mac.mm L115-144](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/browser_compositor_view_mac.mm#L115-L144)
- For a resize on Win/Linux/Mac, `DelegatedFrameHost::EmbedSurface` replaces the
  policy with `client_->GetResizeDeadlinePolicy()`, unless the policy is infinite.
  A `force_specified_deadline_` overrides both. [S]
  [delegated_frame_host.cc L347-376](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/delegated_frame_host.cc#L347-L376)
  The source comment says: "Until we can block resize on surface synchronization
  on these platforms, we will not block UI on the top-level renderer."
- `BrowserCompositorMac::GetResizeDeadlinePolicy()` returns `UseDefaultDeadline()`
  only if `ShouldUseDefaultDeadlineOnResize()` is true. Otherwise it returns
  `UseSpecifiedDeadline(0)`. [S]
  [L341-354](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/browser_compositor_view_mac.mm#L341-L354)
  `ShouldUseDefaultDeadlineOnResize()` is
  `use_default_deadline_on_resize_ || remote_ns_view_.is_bound()`, where the
  second term means a PWA app-shim window. [S]
  [rwhv_mac L231-233](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/render_widget_host_view_mac.mm#L231-L233)
- How the deadline works:
  - `SurfaceLayerImpl` adds the primary surface as an **activation dependency** of
    the parent (browser) CompositorFrame, with that deadline. [S]
    [surface_layer_impl.cc L229-238](https://github.com/chromium/chromium/blob/152.0.7977.130/cc/layers/surface_layer_impl.cc#L229-L238)
  - A specified deadline of 0 lets the parent frame activate at once, drawing the
    fallback surface. With a default deadline, the frame waits up to
    `max(n, default)` frames. [S]
    [frame_deadline.cc L20-29](https://github.com/chromium/chromium/blob/152.0.7977.130/components/viz/common/quads/frame_deadline.cc#L20-L29)
  - The default is `kDefaultActivationDeadlineInFrames = 4`, overridable with
    `--deadline-to-synchronize-surfaces=N`. `--run-all-compositor-stages-before-draw`
    makes it unlimited. [S]
    [constants.cc L9](https://github.com/chromium/chromium/blob/152.0.7977.130/components/viz/common/constants.cc#L9),
    [switches.cc L69-87](https://github.com/chromium/chromium/blob/152.0.7977.130/components/viz/common/switches.cc#L69-L87)
  - The browser reads the switch and passes it to viz. [S]
    [gpu_process_host.cc L984-985](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/gpu/gpu_process_host.cc#L984-L985)
- History [I]:
  - [8b74eeb7](https://github.com/chromium/chromium/commit/8b74eeb7900126d50c16bf36b010ce757b9ffc3a)
    ("[Mac] Use specified deadline 0 when resizing", crrev.com/c/7274976, M147).
    Waiting for the renderer dropped resize and animation frame rates from 60 to
    30 fps.
  - [6b18bb34](https://github.com/chromium/chromium/commit/6b18bb3434dd9869254d0d1b1dd16a07d82e119a)
    (crbug 493708175): PWA windows "show sluggish resize since M147 … stale
    content … highly visible because the entire window area is web content". The
    fix was the default deadline (4 frames) for app-shim windows only.

**Net answer to Q1.**

- **Timeout:** 500 ms in pre-commit (`kUIPaintTimeout`) and 50 ms in post-commit.
- **When the browser waits:** the window is visible, not translucent before its
  first frame, and not in a fullscreen transition, and the window's `ui::Compositor`
  has not yet delivered `CALayerParams` whose DIP size equals the new content size.
- **What the wait covers:** in 152 with in-process windows, the renderer surface is
  embedded with deadline 0. The awaited frame therefore contains the _old_ renderer
  surface (fallback) plus gutter, and never waits for the renderer's frame at the
  new size. [S]

### 1.4 Remote CoreAnimation: a sub-frame race even for the browser frame

- By default the GPU process publishes frames through a `CAContext`. The browser
  shows them with a `CALayerHost` (`GotCALayerFrame`) and only swaps the host when
  `contextId` changes. [S]
  [display_ca_layer_tree.mm L84-101, L140-170](https://github.com/chromium/chromium/blob/152.0.7977.130/ui/accelerated_widget_mac/display_ca_layer_tree.mm#L84-L170)
- Only V2 recreates the CAContext on resize and hands a **fence port** to the
  browser, which makes the GPU commit atomic with the browser's transaction. [S]
  [ca_layer_tree_coordinator.mm L221-235](https://github.com/chromium/chromium/blob/152.0.7977.130/ui/accelerated_widget_mac/ca_layer_tree_coordinator.mm#L221-L235)
- [Inf] In V1 the GPU process has already committed the new-size content by the
  time the browser receives `CALayerParams`. That content can briefly show inside
  the _old_ window frame, and the browser commits the window frame right after.
  This is usually within one vsync, but it is not guaranteed.
- `--disable-features=RemoteCoreAnimationAPI` makes `RemoteLayerAPISupported()`
  return false. [S]
  [remote_layer_api.mm L16-21](https://github.com/chromium/chromium/blob/152.0.7977.130/ui/base/cocoa/remote_layer_api.mm#L16-L21)
  Frames then arrive as IOSurfaces that the **browser main thread** sets as layer
  contents (`GotIOSurfaceFrame`), so they commit in the same browser transaction
  as the window frame. [S] for the code path, [Inf] for the atomicity.
  Cost: no remote layers or overlays, and more power. Electron's MAS patch notes
  1.5x to 2x power for video when CAContext is removed.
  ([mas patch](https://github.com/electron/electron/blob/v44.4.5/patches/chromium/mas_avoid_private_macos_api_usage.patch.patch))

---

## 2. Is it active for Electron `BrowserWindow`?

**Yes. The same bridge is used, and web contents are in the window compositor.**

- `ElectronNSWindow : NativeWidgetMacNSWindow` and
  `ElectronNSWindowDelegate : ViewsNSWindowDelegate`, so the window is driven by
  `NativeWidgetNSWindowBridge` and is registered as a PreCommitObserver. [S]
  [electron_ns_window.h L32](https://github.com/electron/electron/blob/v44.4.5/shell/browser/ui/cocoa/electron_ns_window.h#L32),
  [electron_ns_window_delegate.h L19-20](https://github.com/electron/electron/blob/v44.4.5/shell/browser/ui/cocoa/electron_ns_window_delegate.h#L19-L20)
- Web contents are shown through `views::WebView` in `InspectableWebContentsView`
  ([L98](https://github.com/electron/electron/blob/v44.4.5/shell/browser/ui/inspectable_web_contents_view.cc#L98)). [S] The chain:
  1. `NativeViewHostMac` gives the host a `ui::Layer`
     (`SetPaintToLayer(LAYER_NOT_DRAWN)`).
     [L64-66](https://github.com/chromium/chromium/blob/152.0.7977.130/ui/views/controls/native/native_view_host_mac.mm#L64-L66)
  2. `WebContentsViewMac::ViewsHostableAttach` calls
     `rwhv_mac->SetParentUiLayer(views_host_->GetUiLayer())`.
     [L736-778](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/web_contents/web_contents_view_mac.mm#L736-L778)
  3. That puts `BrowserCompositorMac` into `UseParentLayerCompositor`, so the page
     is a surface inside the window's `ui::Compositor` frame.
     [rwhv_mac L446-461](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/render_widget_host_view_mac.mm#L446-L461)

  [Inf] The description of Electron's `disable_compositor_recycling.patch` ("For
  Electron, there is no parent compositor") predates this and looks stale; the
  code it patches still applies. Confirm at runtime: while resizing, the
  `RenderWidgetHostViewCocoa` layer should have no `CALayerHost` sublayer of its
  own, only the window's `BridgedContentView`.

- **Electron does not disable or extend the mechanism** [S]:
  - No Electron source or patch mentions `CATransactionCoordinator`,
    `ShouldUseDefaultDeadlineOnResize`, `SetForceSpecifiedDeadline`,
    `DeadlinePolicy` (except in OSR), `kCATransactionV2` (except in the MAS-only
    patch) or `kAsyncLiveResize`.
  - `feature_list_mac.mm` enables only ScreenCaptureKit features and disables only
    `TimeoutHangingVideoCaptureStarts`.
    ([feature_list_mac.mm](https://github.com/electron/electron/blob/v44.4.5/shell/browser/feature_list_mac.mm))
  - The MAS-only patch removes CAContext from MAS builds, which puts them on the
    IOSurface path.
- **Electron bypasses `AsyncLiveResize`** [S]:
  `-[ElectronNSWindowDelegate windowWillResize:toSize:]` overrides the Chromium
  method and never calls `super`, so enabling the feature would not reach
  `OnLiveResizeToFrame`. It also runs the `will-resize` event; `preventDefault`
  returns `sender.frame.size`.
  [L147-223](https://github.com/electron/electron/blob/v44.4.5/shell/browser/ui/cocoa/electron_ns_window_delegate.mm#L147-L223)
- `BrowserWindow.setBounds()` calls `-[NSWindow setFrame:display:animate:]`
  directly ([native_window_mac.mm L747](https://github.com/electron/electron/blob/v44.4.5/shell/browser/native_window_mac.mm#L747)),
  not `bridge->SetBounds`. It still goes through `setFrameSize` and
  `UpdateWindowGeometry`, so the V1 pre-commit wait applies there too. [S]
- **Electron-specific IPC throttle** [S]: `fix_restore_original_resize_performance_on_macos.patch`
  (still in 44.4.5, `.patches` line 103) makes `NotifyScreenInfoChanged` always use
  the throttled `SynchronizeVisualProperties()`. While an earlier
  visual-properties ack is pending, **the new size is not sent to the renderer.**
  [patch](https://github.com/electron/electron/blob/v44.4.5/patches/chromium/fix_restore_original_resize_performance_on_macos.patch).
  On `main` this became `ThrottleResizeIpc` in
  [PR #53668](https://github.com/electron/electron/pull/53668), merged 2026-09-07
  and not in 44.4.5. [I] [Inf] With a 30 ms renderer, this adds latency on top of
  the deadline, and it would defeat any deadline-based waiting unless resizes are
  paced so that only one is in flight.

**Issues and PRs** [I]:

- [#36280 "Page content resizes with noticable delay"](https://github.com/electron/electron/issues/36280)
  (open):
  - 2022: zcbenz: Chrome's engine cannot fully synchronise resize with layout for
    all pages. Users posted videos showing Electron lagging more than Chrome.
  - 2023-11: bpasero posted a VS Code Electron vs web comparison.
  - [#40577](https://github.com/electron/electron/pull/40577): the IPC-throttle
    patch above.
  - 2025-12: nikwen landed Windows tearing fixes in Chromium; they shipped in
    Electron 39.2.6.
  - 2026-02-16 update: "Electron resizes slower than Chromium ❌ Not fixed yet".
- [#33354](https://github.com/electron/electron/issues/33354): flicker on resize
  compared with Chrome (closed).
- [#10801](https://github.com/electron/electron/issues/10801) and
  [#1391](https://github.com/electron/electron/issues/1391): white flashes on
  resize (old, closed).
- None of these discusses the M147 deadline-0 change or the pre-commit mechanism.
  I found no Electron issue for the post-M147 regression. [I] (searched the
  GitHub issue API)

---

## 3. Switches and features

All of these can be set with `app.commandLine.appendSwitch(...)` before `ready`.
Electron re-initialises the `FeatureList` after the main script runs, so
`enable-features`/`disable-features` appended from JS take effect. [S]
[electron_browser_main_parts.cc L378-387](https://github.com/electron/electron/blob/v44.4.5/shell/browser/electron_browser_main_parts.cc#L378-L387).
The feature name strings `kCATransactionV2`, `kAsyncLiveResize` and
`deadline-to-synchronize-surfaces` are present in the 44.4.5 binary.

| Switch / feature                                      | Effect                                                                                                            | Helps renderer sync?                                                                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--deadline-to-synchronize-surfaces=N`                | Default activation deadline (4 frames) [S]                                                                        | **No on its own**: resize uses a _specified_ deadline of 0. Useful only together with a patch that selects the default deadline.                        |
| `--run-all-compositor-stages-before-draw`             | Unlimited default deadline, plus a full-pipeline mode that changes scheduling (a test/headless-oriented mode) [S] | No: the specified 0 still wins. Heavy side effects.                                                                                                     |
| `--enable-features=CATransactionV2`                   | Fence-port atomic GPU/browser commit [S]                                                                          | No. Its `Synchronize()` bails out in tracking run-loop mode, so it does nothing during a drag, and it was disabled upstream for resize flicker. [S]/[I] |
| `--enable-features=AsyncLiveResize`                   | Holds the NSWindow frame until a compositor frame of the new size [S]                                             | Not in Electron (the delegate override skips it). Even in Chrome it waits only for the browser frame (renderer deadline 0).                             |
| `--enable-features=OnlyUseWindowResizeHelperOnResize` | Pumping tweak outside live resize [S]                                                                             | No.                                                                                                                                                     |
| `--disable-features=RemoteCoreAnimationAPI`           | Browser displays IOSurfaces itself [S]                                                                            | Removes the V1 GPU/browser commit race (1.4). Does not make it wait for the renderer. Costs power.                                                      |
| `--enable-features=ThrottleResizeIpc`                 | Not relevant in 44.4.5, where the Electron patch already throttles [S]                                            | No.                                                                                                                                                     |

No switch reaches `SetShouldUseDefaultDeadlineOnResize` or
`SetForceSpecifiedDeadline`. [S]

---

## 4. Implementing atomic commit ourselves

Key constraints:

- `RenderWidgetHostView::SetShouldUseDefaultDeadlineOnResize(bool)` and
  `SetForceSpecifiedDeadline(std::optional<uint32_t>)` are **public content API**.
  [S] [render_widget_host_view.h L329-337](https://github.com/chromium/chromium/blob/152.0.7977.130/content/public/browser/render_widget_host_view.h#L329-L337)
  Chrome calls the first for PWAs (implicitly) and for tab-contents animations.
  [S] [contents_web_view.cc L90-131](https://github.com/chromium/chromium/blob/152.0.7977.130/chrome/browser/ui/views/frame/contents_web_view.cc#L90-L131)
- `nm -gU "Electron Framework"` (44.4.5, this repo's `node_modules`) shows
  11,349 exported symbols. None is a `content::` symbol; they are
  `node::`/`v8::`/`cppgc`. **A Node addon cannot link against content or ui C++.**
  [S] (local binary check)
- ObjC classes (`ElectronNSWindow`, `ElectronNSWindowDelegate`,
  `RenderWidgetHostViewCocoa`, `BridgedContentView`) can be reached at runtime
  through the ObjC runtime, so swizzling from an addon is possible. [Inf]
- Web content arrives in the browser only as `CALayerParams` for the window
  compositor. In the default remote-layer mode that is a `CALayerHost` whose
  `contextId` does not change per frame, so the browser process cannot observe
  "renderer frame of size S is on screen" from CALayer or IOSurface state. [S] for
  the mechanism, [Inf] for observability.
- `CAMetalLayer.presentsWithTransaction` does not apply: the browser process does
  not present through a `CAMetalLayer`. [S] (display_ca_layer_tree.mm)

### Candidates, ranked by feasibility times effectiveness

**A. Patch Electron: default or longer deadline on resize for the window's main RWHV (best).**

- How:
  - On the primary `RenderWidgetHostView` of a window's web contents (for example
    in `WebContents::RenderViewReady`, `RenderViewHostChanged`, or when attaching
    to `NativeWindowMac`), call `rwhv->SetShouldUseDefaultDeadlineOnResize(true)`.
    Alternatively, override `BrowserCompositorMac::GetResizeDeadlinePolicy()`.
  - Launch with `--deadline-to-synchronize-surfaces=N`. The default of 4 frames is
    about 33 ms at 120 Hz, which is probably less than a 30 ms busy renderer plus
    commit and raster, so use something like 12-30.
  - For finer control, use `SetForceSpecifiedDeadline(N)` and expose it through a
    `webContents` API.
- Then, per resize step:
  1. AppKit changes the frame.
  2. The views layout produces a new LocalSurfaceId, embedded with a default
     deadline.
  3. The browser's `ui::Compositor` frame stays pending in viz until the renderer
     submits the new surface or N frames pass.
  4. The new-size `CALayerParams` arrives only after that.
  5. `ShouldWaitInPreCommit()` holds the CATransaction, and so the NSWindow frame,
     until then, up to 500 ms.

  This is the pre-M147 Chrome behaviour and today's PWA behaviour. [S] for the
  code path, [Inf] for the end-to-end result.

- Pair with plan option B (pace one size at a time) or drop the IPC-throttle
  patch, so that each new size actually reaches the renderer immediately (see 2).
- Optionally add `--disable-features=RemoteCoreAnimationAPI` to close the V1
  GPU/browser race (1.4).
- Risks:
  - The UI thread blocks in pre-commit for each step, up to about N vsyncs or
    500 ms; the resize frame rate falls to the renderer's rate. This is accepted in
    the goal.
  - A hung renderer costs the full deadline per step.
  - Synchronous renderer-to-browser-UI IPC could stall until the timeout, because
    pre-commit pumps only `WindowResizeHelperMac` tasks. [Inf]
  - Maintaining a custom Electron build (patch rebases, CI, signing).
  - Upstream deliberately moved away from this for Chrome tabs (M147).
- Could be upstreamed to Electron as an opt-in (a `BrowserWindow` option). It fits
  the open #36280. [Inf]

**B. Oversized WebContentsView ("render before reveal", plan option C): no patch, JS only (best without rebuilding).**

- How:
  - Use `BaseWindow` plus `WebContentsView`. Keep the view larger than the window
    (for example the screen size) so its surface, and so its LocalSurfaceId, does
    not change during a drag.
  - The page lays out `#root` to a CSS size sent over IPC.
  - Cancel `will-resize`, send the size, wait for the renderer's ack (at least
    double-rAF), then `setBounds`.
  - The window-frame commit then waits (V1 pre-commit) only for a browser frame
    that embeds an **already-rendered** surface.
- Growing: atomic, apart from the V1 race; add `--disable-features=RemoteCoreAnimationAPI`
  to remove it. [Inf]
- Shrinking and left/top edges: not atomic. Whichever commit goes first causes one
  frame of either clipped stale layout or an exposed strip, and edge-anchored
  content shifts for that frame. [Inf]
- Risks:
  - The oversized surface costs memory and raster.
  - Hit-testing, `window.innerWidth` and media queries see the view size, not the
    window size, so the page must use its own size signal.
  - Screen-edge clipping.
  - The ack is "submitted", not "presented".

**C. Native addon: own pre-commit handler that waits for a renderer signal (hacky, possible).**

- How:
  - During live resize (`windowWillStartLiveResize` via a swizzled delegate, or a
    notification observer), register a handler with the same SPI
    `+[CATransaction addCommitHandler:forPhase:kCATransactionPhasePreCommit]`.
  - Block, with a timeout, until the renderer signals that it has rendered size S.
    The signal must not go through the browser main thread, which is blocked:
    for example a pipe or mach port written by a native module in a
    non-sandboxed preload, or a shared-memory flag.
  - The renderer learns the new size without the main thread returning, because
    `SynchronizeVisualProperties` is sent synchronously during layout (subject to
    Electron's IPC throttle). Viz and the GPU process can draw the renderer's new
    surface into the root without the browser main thread. [Inf]
- Risks:
  - Private SPI, and possible handler-ordering interaction with Chromium's own
    handler.
  - The main thread is blocked with no task pumping, so any synchronous
    renderer-to-browser IPC deadlocks until the timeout.
  - The sandbox must be disabled for the signal channel.
  - Not atomic, only near-atomic: the GPU commit and the browser commit are still
    separate (1.4). "Frame submitted" is not "frame on screen".
  - Fragile across macOS and Chromium versions; unsuitable for MAS.
- Feasibility: medium. Correctness: medium to low.

**D. Native addon calling content API through raw vtable offsets or ivar pokes (not recommended).**

- For example, flip `use_default_deadline_on_resize_` by computing offsets from a
  `RenderWidgetHostViewCocoa`.
- No exported symbols, so offsets must be hard-coded per build.
- Undefined behaviour, and crash-prone.

**E. Hold the NSWindow frame in the addon (swizzle `setFrame:display:` or `windowWillResize:toSize:`).**

- This duplicates what `will-resize` plus `preventDefault` plus `setBounds` already
  gives (plan option B). It changes only _when_ the frame is applied, not whether
  the renderer's frame is inside the same commit.
- Adds nothing over B or C unless it is combined with C's wait.

**F. Cosmetic.** Match the window background to the page and anchor content away
from the dragged edges. This hides the problem; it does not meet the goal.

---

## 5. Other apps and Chrome itself

- **Chrome 147+ (tabs), including 152** [S]+[I]:
  - Browser UI (tab strip, toolbar) is synchronised with the window frame through
    the pre-commit wait.
  - **Web content is not**: deadline 0, so fallback plus gutter until the renderer
    catches up.
  - The commit that changed this justified it with smoother 60 fps resizing.
- **Chrome PWA windows (app shim)**: default 4-frame deadline, so content is
  synchronised when the renderer is fast enough. [S]+[I]
- **Chrome before M147**: resize waited for the renderer. The commit message cites
  a wait of up to 8 frames and the resulting 30 fps. [I] ([8b74eeb7](https://github.com/chromium/chromium/commit/8b74eeb7900126d50c16bf36b010ce757b9ffc3a))
  Users in #36280 (2021-2022) described Chrome as "syncs window and render sizes"
  and Electron as lagging. [I]
- **VS Code**: an Electron app with the same code path; bpasero's 2023 video shows
  Electron lagging compared with the web build. [I] Current VS Code (Electron 3x/4x)
  is not verified here.
- **Slack, Figma desktop**: both Electron. **Not verified.** No source available,
  and I found nothing authoritative about custom patches. They would inherit the
  same behaviour unless they ship patched Electron. [Inf]

---

## Suggested next checks (runtime)

1. Confirm the parent-layer compositing chain in Electron 44: inspect the layer tree
   during a drag, or trace `BrowserCompositorMac` state.
2. Take a Perfetto trace (`--trace-startup` or `contentTracing`) with categories
   `viz,ui,cc` during a drag. Expect:
   - `CATransactionCoordinator: pre-commit handler` slices;
   - `DelegatedFrameHost::EmbedSurface` with `DeadlinePolicy(UseSpecifiedDeadline, 0)`.

   This confirms 1.3 in this exact build.

3. If rebuilding Electron is acceptable, prototype A with a one-line
   `SetShouldUseDefaultDeadlineOnResize(true)` and
   `--deadline-to-synchronize-surfaces=20`, with and without
   `--disable-features=RemoteCoreAnimationAPI`. Measure it with the existing
   screen-recording offset metric.
