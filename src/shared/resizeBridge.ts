// IPC contract between the main process, the preload script, and the renderer
// for measuring (and later pacing) window resizes.

/** A content size the window has just taken on, in CSS pixels. */
export interface ResizeCommit {
  width: number;
  height: number;
  /** When the size changed, as `performance.timeOrigin + performance.now()`. */
  at: number;
}

/** What the preload script exposes on `window.resizeBridge`. */
export interface ResizeBridge {
  onCommit(listener: (commit: ResizeCommit) => void): () => void;
}

export const RESIZE_COMMIT_CHANNEL = "resize:commit";
