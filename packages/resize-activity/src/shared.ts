// IPC contract of @electron-resize-sync/resize-activity.

export const RESIZE_ACTIVITY_CHANNEL = "electron-resize-sync:resize-activity";

/** What the host's preload exposes to the page, from `createResizeActivityBridge`. */
export interface ResizeActivityBridge {
  /** Called with true when a user resize starts and false when it ends. */
  onResizeActive(listener: (active: boolean) => void): () => void;
}
