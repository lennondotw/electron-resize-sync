import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  MARKERS_ARGUMENT,
  RESIZE_ACK_CHANNEL,
  RESIZE_COMMIT_CHANNEL,
  RESIZE_SYNC_CHANNEL,
  type ResizeBridge,
  type ResizeCommit,
} from "../shared/resizeBridge.ts";

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
  markers: process.argv.includes(MARKERS_ARGUMENT),
};

contextBridge.exposeInMainWorld("resizeBridge", resizeBridge);
