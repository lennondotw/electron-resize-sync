import { trackResizeActivity } from "@electron-resize-sync/resize-activity/renderer";

/**
 * Whether a user resize is in progress, as reported by the main process. A
 * plain read, so the frame loop can call it every frame.
 */
export const isResizing = window.resizeBridge
  ? trackResizeActivity(window.resizeBridge)
  : () => false;
