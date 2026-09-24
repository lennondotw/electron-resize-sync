// What the demo's preload exposes on `window.resizeBridge`: the bridges of the
// workaround packages, plus the demo's own measurement hooks.
import type { RevealBridge } from "@electron-resize-sync/render-before-reveal-not-working/shared";
import type { ResizeActivityBridge } from "@electron-resize-sync/resize-activity/shared";
import type {
  ContentSize,
  ResizePacingBridge,
} from "@electron-resize-sync/resize-pacing-not-working/shared";

export type { ContentSize } from "@electron-resize-sync/resize-pacing-not-working/shared";

/** A content size the window has just taken on, in CSS pixels. */
export interface ResizeCommit extends ContentSize {
  /** When the size changed, as `performance.timeOrigin + performance.now()`. */
  at: number;
}

export interface ResizeBridge extends ResizeActivityBridge, ResizePacingBridge, RevealBridge {
  /** Called with each new content size, for measuring paint latency. */
  onCommit(listener: (commit: ResizeCommit) => void): () => void;
  /** Whether to draw edge markers that screen-recording experiments track. */
  readonly markers: boolean;
}

/** Renderer argument that turns on edge markers; set by ELECTRON_RESIZE_SYNC_MARKERS. */
export const MARKERS_ARGUMENT = "--resize-sync-markers";

export const RESIZE_COMMIT_CHANNEL = "resize:commit";
