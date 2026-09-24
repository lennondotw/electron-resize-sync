import type { BaseWindow, WebContents } from "electron";
import { RESIZE_ACTIVITY_CHANNEL } from "./shared.ts";

/**
 * Tells `webContents` while a user resize of `win` is in progress:
 * `will-resize` fires for each step of a drag and `resized` once at the end.
 */
export function reportResizeActivity(win: BaseWindow, webContents: WebContents) {
  let resizing = false;
  win.on("will-resize", () => {
    if (resizing) return;
    resizing = true;
    webContents.send(RESIZE_ACTIVITY_CHANNEL, true);
  });
  win.on("resized", () => {
    resizing = false;
    webContents.send(RESIZE_ACTIVITY_CHANNEL, false);
  });
}
