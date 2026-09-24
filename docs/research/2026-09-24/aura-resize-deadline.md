# Resize deadline on Windows and Linux (Aura)

Date: 2026-09-24\
Status: source reading at Chromium 152.0.7977.130; not run on Windows or Linux yet\
Evidence: source permalinks ([S]), code search ([I]), inference ([Inf])

Chromium files were fetched from
`https://raw.githubusercontent.com/chromium/chromium/152.0.7977.130/<path>`.

## Question and scope

On macOS, resize deadline works by making a resize wait for the page's frame
([Chromium resize synchronisation](chromium-resize-sync.md),
[shipping resize deadline](shipping-resize-deadline.md)). The Windows and
Linux test builds set only `--deadline-to-synchronize-surfaces`, because the
binary patch is macOS only. Does that switch change how a resize waits on
Windows and Linux, where the web contents view is `RenderWidgetHostViewAura`?
And what would make a resize wait there?

## Sources and observations

**A resize on Aura embeds the page with a deadline of 0, as on macOS.** [S]

- A new size reaches `RenderWidgetHostViewAura::SynchronizeVisualProperties`,
  which calls `DelegatedFrameHost::EmbedSurface` with the new size.
  [render_widget_host_view_aura.cc L3013-3031](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/render_widget_host_view_aura.cc#L3013-L3031)
- `EmbedSurface` is shared by Windows, Linux and macOS. For a resize it
  replaces the deadline policy with `client_->GetResizeDeadlinePolicy()`
  (unless the policy is infinite), and `force_specified_deadline_`, when set,
  overrides both. The comment there reads: "Until we can block resize on
  surface synchronization on these platforms, we will not block UI on the
  top-level renderer."
  [delegated_frame_host.cc L347-376](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/delegated_frame_host.cc#L347-L376)
- On Aura the client is `DelegatedFrameHostClientAura`. Its
  `GetResizeDeadlinePolicy()` returns `UseDefaultDeadline()` only when the
  view's `ShouldUseDefaultDeadlineOnResize()` is true, and otherwise the base
  class's `UseSpecifiedDeadline(0)`.
  [delegated_frame_host_client_aura.cc L70-76](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/delegated_frame_host_client_aura.cc#L70-L76),
  [delegated_frame_host.cc L52-54](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/delegated_frame_host.cc#L52-L54)
- `ShouldUseDefaultDeadlineOnResize()` returns `use_default_deadline_on_resize_`,
  which only `SetShouldUseDefaultDeadlineOnResize(bool)` sets; it starts false.
  [render_widget_host_view_aura.cc L3129-3132](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/render_widget_host_view_aura.cc#L3129-L3132),
  [L3774-3776](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/render_widget_host_view_aura.cc#L3774-L3776)
- A GitHub code search of `electron/electron` (default branch) found no call
  to `SetShouldUseDefaultDeadlineOnResize` or `SetForceSpecifiedDeadline`. [I]
  Electron v44.4.5 itself was not searched.

**So the switch alone does nothing for resizes.** [Inf]
`--deadline-to-synchronize-surfaces` sets how many frames `UseDefaultDeadline()`
waits. With the resize policy at `UseSpecifiedDeadline(0)`, the default
deadline is never used for a resize.

**Both public content APIs that change this are implemented on Aura.** [S]

- `RenderWidgetHostView::SetShouldUseDefaultDeadlineOnResize(bool)` and
  `SetForceSpecifiedDeadline(std::optional<uint32_t>)` are public.
  [render_widget_host_view.h L329-337](https://github.com/chromium/chromium/blob/152.0.7977.130/content/public/browser/render_widget_host_view.h#L329-L337)
- Aura forwards `SetForceSpecifiedDeadline` to its `DelegatedFrameHost`.
  [render_widget_host_view_aura.cc L1021-1026](https://github.com/chromium/chromium/blob/152.0.7977.130/content/browser/renderer_host/render_widget_host_view_aura.cc#L1021-L1026)
- The [Electron source patch](../../../packages/resize-deadline/electron-v44.4.5-resize-deadline.patch)
  calls `SetForceSpecifiedDeadline`, so a build of it would apply on Windows
  and Linux too. [Inf]

## Conclusion and alternatives

- **The Windows and Linux "patched" builds are expected to resize like
  baseline.** They set only the switch, which a resize does not use. Running
  them now tests whether the problem exists there, not whether a fix works.
- **Making a resize wait on Aura** needs one of:
  1. An Electron build with the source patch (`SetForceSpecifiedDeadline`),
     or one that calls `SetShouldUseDefaultDeadlineOnResize(true)` together
     with the switch.
  2. A binary patch of `RenderWidgetHostViewAura::ShouldUseDefaultDeadlineOnResize`
     to return true, as on macOS. That needs its own site table for
     `electron.exe` (PE) and the Linux `electron` (ELF), located from the
     release's symbols.
- **Waiting may not look better there.** [Inf] On macOS the window and its
  content reach the screen in one Core Animation commit. On Windows the frame
  is resized by DWM and on Linux by the window manager, independently of the
  compositor, which is what the source comment warns about ("the OS will
  create an additional black gutter"). A wait could trade stale content for
  an unpainted gutter.

## Unknowns and next check

- Whether the resize problem shows at all on Windows and Linux (the baseline
  test builds).
- What a wait looks like there: build the source patch, or add an Aura entry
  to the binary patch, and record drags on each platform.
- Whether Electron v44.4.5 calls either API anywhere.
