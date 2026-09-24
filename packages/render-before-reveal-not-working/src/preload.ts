import { ipcRenderer, type IpcRendererEvent } from "electron";
import {
  REVEAL_ACK_CHANNEL,
  REVEAL_ARGUMENT,
  REVEAL_LAYOUT_CHANNEL,
  REVEAL_REQUEST_CHANNEL,
  type RevealBridge,
  type RevealLayout,
} from "./shared.ts";

export type { RevealBridge, RevealLayout } from "./shared.ts";

/** Methods for the host's preload to expose to the page (with `contextBridge`). */
export function createRevealBridge(): RevealBridge {
  return {
    reveal: process.argv.includes(REVEAL_ARGUMENT),
    onLayout(listener) {
      const handler = (_event: IpcRendererEvent, layout: RevealLayout) => listener(layout);
      ipcRenderer.on(REVEAL_LAYOUT_CHANNEL, handler);
      return () => ipcRenderer.off(REVEAL_LAYOUT_CHANNEL, handler);
    },
    requestLayout() {
      ipcRenderer.send(REVEAL_REQUEST_CHANNEL);
    },
    ackLayout(id) {
      ipcRenderer.send(REVEAL_ACK_CHANNEL, id);
    },
  };
}
