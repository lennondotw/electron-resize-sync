import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  MARKERS_ARGUMENT,
  RESIZE_ACK_CHANNEL,
  RESIZE_ACTIVE_CHANNEL,
  RESIZE_COMMIT_CHANNEL,
  RESIZE_SYNC_CHANNEL,
  REVEAL_ACK_CHANNEL,
  REVEAL_ARGUMENT,
  REVEAL_LAYOUT_CHANNEL,
  REVEAL_REQUEST_CHANNEL,
  type ResizeBridge,
  type ResizeCommit,
  type RevealLayout,
} from "../shared/resize-bridge.ts";

const resizeBridge: ResizeBridge = {
  onCommit(listener) {
    const handler = (_event: IpcRendererEvent, commit: ResizeCommit) => listener(commit);
    ipcRenderer.on(RESIZE_COMMIT_CHANNEL, handler);
    return () => ipcRenderer.off(RESIZE_COMMIT_CHANNEL, handler);
  },
  ack(size) {
    ipcRenderer.send(RESIZE_ACK_CHANNEL, size);
  },
  setSync(enabled) {
    ipcRenderer.send(RESIZE_SYNC_CHANNEL, enabled);
  },
  onResizeActive(listener) {
    const handler = (_event: IpcRendererEvent, active: boolean) => listener(active);
    ipcRenderer.on(RESIZE_ACTIVE_CHANNEL, handler);
    return () => ipcRenderer.off(RESIZE_ACTIVE_CHANNEL, handler);
  },
  markers: process.argv.includes(MARKERS_ARGUMENT),
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

contextBridge.exposeInMainWorld("resizeBridge", resizeBridge);
