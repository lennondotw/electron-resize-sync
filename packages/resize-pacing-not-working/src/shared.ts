// IPC contract of @electron-resize-sync/resize-pacing-not-working.

export const RESIZE_ACK_CHANNEL = "electron-resize-sync:pacing-ack";
export const RESIZE_SYNC_CHANNEL = "electron-resize-sync:pacing-enable";

export interface ContentSize {
  width: number;
  height: number;
}

/** What the host's preload exposes to the page, from `createResizePacingBridge`. */
export interface ResizePacingBridge {
  /** Reports that the first frame at `size` (CSS pixels) has finished rendering. */
  ack(size: ContentSize): void;
  /** Turns paced resizing on or off in the main process. */
  setSync(enabled: boolean): void;
}
