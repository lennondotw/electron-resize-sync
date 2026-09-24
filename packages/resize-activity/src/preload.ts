import { ipcRenderer, type IpcRendererEvent } from "electron";
import { RESIZE_ACTIVITY_CHANNEL, type ResizeActivityBridge } from "./shared.ts";

export type { ResizeActivityBridge } from "./shared.ts";

/** Methods for the host's preload to expose to the page (with `contextBridge`). */
export function createResizeActivityBridge(): ResizeActivityBridge {
  return {
    onResizeActive(listener) {
      const handler = (_event: IpcRendererEvent, active: boolean) => listener(active);
      ipcRenderer.on(RESIZE_ACTIVITY_CHANNEL, handler);
      return () => ipcRenderer.off(RESIZE_ACTIVITY_CHANNEL, handler);
    },
  };
}
