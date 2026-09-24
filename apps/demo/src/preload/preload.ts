import { createRevealBridge } from "@electron-resize-sync/render-before-reveal-not-working/preload";
import { createResizeActivityBridge } from "@electron-resize-sync/resize-activity/preload";
import { createResizePacingBridge } from "@electron-resize-sync/resize-pacing-not-working/preload";
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  DEADLINE_ARGUMENT,
  MARKERS_ARGUMENT,
  PACING_ARGUMENT,
  type DeadlineState,
  RESIZE_COMMIT_CHANNEL,
  type ResizeBridge,
  type ResizeCommit,
} from "../shared/resize-bridge.ts";

const resizeBridge: ResizeBridge = {
  ...createResizeActivityBridge(),
  ...createResizePacingBridge(),
  ...createRevealBridge(),
  onCommit(listener) {
    const handler = (_event: IpcRendererEvent, commit: ResizeCommit) => listener(commit);
    ipcRenderer.on(RESIZE_COMMIT_CHANNEL, handler);
    return () => ipcRenderer.off(RESIZE_COMMIT_CHANNEL, handler);
  },
  markers: process.argv.includes(MARKERS_ARGUMENT),
  pacing: process.argv.includes(PACING_ARGUMENT),
  deadline: readDeadlineArgument(),
};

function readDeadlineArgument() {
  const argument = process.argv.find((arg) => arg.startsWith(DEADLINE_ARGUMENT));
  if (!argument) return undefined;
  return JSON.parse(decodeURIComponent(argument.slice(DEADLINE_ARGUMENT.length))) as DeadlineState;
}

contextBridge.exposeInMainWorld("resizeBridge", resizeBridge);
