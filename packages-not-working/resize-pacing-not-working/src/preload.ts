import { ipcRenderer } from "electron";
import { RESIZE_ACK_CHANNEL, RESIZE_SYNC_CHANNEL, type ResizePacingBridge } from "./shared.ts";

export type { ContentSize, ResizePacingBridge } from "./shared.ts";

/** Methods for the host's preload to expose to the page (with `contextBridge`). */
export function createResizePacingBridge(): ResizePacingBridge {
  return {
    ack(size) {
      ipcRenderer.send(RESIZE_ACK_CHANNEL, size);
    },
    setSync(enabled) {
      ipcRenderer.send(RESIZE_SYNC_CHANNEL, enabled);
    },
  };
}
