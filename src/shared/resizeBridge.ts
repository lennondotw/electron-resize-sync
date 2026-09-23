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
  /** Whether to draw edge markers that screen-recording experiments track. */
  readonly markers: boolean;
}

/** Renderer argument that turns on edge markers; set by ELECTRON_RESIZE_SYNC_MARKERS. */
export const MARKERS_ARGUMENT = "--resize-sync-markers";

export const RESIZE_COMMIT_CHANNEL = "resize:commit";
export const RESIZE_ACK_CHANNEL = "resize:ack";
export const RESIZE_SYNC_CHANNEL = "resize:set-sync";
