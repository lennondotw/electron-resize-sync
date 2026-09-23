import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  RESIZE_COMMIT_CHANNEL,
  type ResizeBridge,
  type ResizeCommit,
} from "../shared/resizeBridge.ts";

const resizeBridge: ResizeBridge = {
  onCommit(listener) {
    const handler = (_event: IpcRendererEvent, commit: ResizeCommit) => listener(commit);
    ipcRenderer.on(RESIZE_COMMIT_CHANNEL, handler);
    return () => ipcRenderer.off(RESIZE_COMMIT_CHANNEL, handler);
  },
};

contextBridge.exposeInMainWorld("resizeBridge", resizeBridge);
