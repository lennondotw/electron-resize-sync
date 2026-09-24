// IPC contract between the main process, the preload script, and the renderer
// for measuring (and later pacing) window resizes.

export interface ContentSize {
  width: number;
  height: number;
}

/** A content size the window has just taken on, in CSS pixels. */
export interface ResizeCommit extends ContentSize {
  /** When the size changed, as `performance.timeOrigin + performance.now()`. */
  at: number;
}

/** What the preload script exposes on `window.resizeBridge`. */
export interface ResizeBridge {
  onCommit(listener: (commit: ResizeCommit) => void): () => void;
  /** Reports that the first frame at `size` has finished rendering. */
  ack(size: ContentSize): void;
  /** Turns paced resizing on or off in the main process. */
  setSync(enabled: boolean): void;
  /** Called with true when a user resize starts and false when it ends. */
  onResizeActive(listener: (active: boolean) => void): () => void;
  /** Whether to draw edge markers that screen-recording experiments track. */
  readonly markers: boolean;
  /** Whether the page runs in a render-before-reveal window (option C). */
  readonly reveal: boolean;
  /** Called with where to lay out #root, in a render-before-reveal window. */
  onLayout(listener: (layout: RevealLayout) => void): () => void;
  /** Asks for the current layout, once the page listens for it. */
  requestLayout(): void;
  /** Reports that a frame with layout `id` has been rendered. */
  ackLayout(id: number): void;
}

/** #root's rectangle in page coordinates (CSS pixels), for option C. */
export interface RevealLayout {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Renderer argument that turns on edge markers; set by ELECTRON_RESIZE_SYNC_MARKERS. */
export const MARKERS_ARGUMENT = "--resize-sync-markers";

/** Renderer argument for a render-before-reveal window; set by ELECTRON_RESIZE_SYNC_REVEAL. */
export const REVEAL_ARGUMENT = "--resize-sync-reveal";

export const RESIZE_COMMIT_CHANNEL = "resize:commit";
export const RESIZE_ACK_CHANNEL = "resize:ack";
export const RESIZE_SYNC_CHANNEL = "resize:set-sync";
export const RESIZE_ACTIVE_CHANNEL = "resize:active";
export const REVEAL_LAYOUT_CHANNEL = "reveal:layout";
export const REVEAL_REQUEST_CHANNEL = "reveal:request";
export const REVEAL_ACK_CHANNEL = "reveal:ack";
