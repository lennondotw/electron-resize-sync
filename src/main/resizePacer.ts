import { ipcMain, type BrowserWindow, type Rectangle } from "electron";
import { RESIZE_ACK_CHANNEL, RESIZE_SYNC_CHANNEL } from "../shared/resizeBridge.ts";

/** Stop waiting for an ack after this long, e.g. when the renderer is hidden or hung. */
const ACK_TIMEOUT_MS = 500;

/**
 * Paces user resizes of `win` to the renderer's frames. While enabled, each
 * resize the system proposes is cancelled and remembered; the latest one is
 * applied with `setBounds` only when the renderer has painted the previous
 * size, so a new size never lands while the renderer is mid-frame.
 */
export function paceResizes(win: BrowserWindow) {
  let enabled = false;
  let pending: Rectangle | undefined;
  let inFlight = false;
  let ackTimer: NodeJS.Timeout | undefined;

  const commitNext = () => {
    if (inFlight || !pending) return;
    const bounds = pending;
    pending = undefined;

    const current = win.getBounds();
    if (bounds.width === current.width && bounds.height === current.height) {
      // A pure move produces no new frame to wait for.
      win.setBounds(bounds);
      return;
    }
    inFlight = true;
    ackTimer = setTimeout(release, ACK_TIMEOUT_MS);
    win.setBounds(bounds);
  };

  const release = () => {
    clearTimeout(ackTimer);
    inFlight = false;
    commitNext();
  };

  win.on("will-resize", (event, newBounds) => {
    if (!enabled) return;
    event.preventDefault();
    pending = newBounds;
    commitNext();
  });

  const onAck = (event: Electron.IpcMainEvent) => {
    if (event.sender === win.webContents && inFlight) release();
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
