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
  /** Reports that a frame at the latest size has finished painting. */
  ack(): void;
  /** Turns paced resizing on or off in the main process. */
  setSync(enabled: boolean): void;
}

export const RESIZE_COMMIT_CHANNEL = "resize:commit";
export const RESIZE_ACK_CHANNEL = "resize:ack";
export const RESIZE_SYNC_CHANNEL = "resize:set-sync";
