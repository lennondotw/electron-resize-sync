import { ipcMain, type BrowserWindow, type Rectangle } from "electron";
import {
  RESIZE_ACK_CHANNEL,
  RESIZE_SYNC_CHANNEL,
  type ContentSize,
} from "../shared/resizeBridge.ts";

/** Stop waiting for an ack after this long, e.g. when the renderer is hidden or hung. */
const ACK_TIMEOUT_MS = 500;

/**
 * Paces user resizes of `win` to the renderer's frames. While enabled, each
 * resize the system proposes is cancelled and remembered; the latest one is
 * applied with `setBounds` only when the renderer reports it has rendered
 * the previous size.
 */
export function paceResizes(win: BrowserWindow) {
  let enabled = false;
  let pending: Rectangle | undefined;
  /** Content size the renderer must report before the next commit, if any. */
  let inFlight: string | undefined;
  let ackTimer: NodeJS.Timeout | undefined;

  const commitNext = () => {
    if (inFlight !== undefined || !pending) return;
    const bounds = pending;
    pending = undefined;

    const current = win.getBounds();
    if (bounds.width === current.width && bounds.height === current.height) {
      // A pure move produces no new frame to wait for.
      win.setBounds(bounds);
      return;
    }
    win.setBounds(bounds);
    const [width = 0, height = 0] = win.getContentSize();
    inFlight = sizeKey(width, height);
    ackTimer = setTimeout(release, ACK_TIMEOUT_MS);
  };

  const release = () => {
    clearTimeout(ackTimer);
    inFlight = undefined;
    commitNext();
  };

  win.on("will-resize", (event, newBounds) => {
    if (!enabled) return;
    event.preventDefault();
    pending = newBounds;
    commitNext();
  });

  const onAck = (event: Electron.IpcMainEvent, size: unknown) => {
    if (event.sender !== win.webContents || inFlight === undefined) return;
    // An ack for an older size must not release the commit still in flight.
    if (isContentSize(size) && sizeKey(size.width, size.height) === inFlight) release();
  };
  const onSetSync = (event: Electron.IpcMainEvent, value: unknown) => {
    if (event.sender !== win.webContents) return;
    enabled = value === true;
    if (!enabled) {
      pending = undefined;
      release();
    }
  };
  ipcMain.on(RESIZE_ACK_CHANNEL, onAck);
  ipcMain.on(RESIZE_SYNC_CHANNEL, onSetSync);
  win.on("closed", () => {
    clearTimeout(ackTimer);
    ipcMain.off(RESIZE_ACK_CHANNEL, onAck);
    ipcMain.off(RESIZE_SYNC_CHANNEL, onSetSync);
  });
}

function sizeKey(width: number, height: number) {
  return `${width}×${height}`;
}

function isContentSize(value: unknown): value is ContentSize {
  if (typeof value !== "object" || value === null) return false;
  const { width, height } = value as Record<string, unknown>;
  return typeof width === "number" && typeof height === "number";
}
