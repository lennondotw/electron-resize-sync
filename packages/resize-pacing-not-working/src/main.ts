// DOES NOT WORK: pacing does not keep the page in step with the window
// frame. Each size still reaches the screen before the page has rendered it.
// See this package's README.
import { trackDraggedEdges } from "@electron-resize-sync/drag-edge-heuristic/main";
import { ipcMain, type BaseWindow, type Rectangle, type WebContents } from "electron";
import { RESIZE_ACK_CHANNEL, RESIZE_SYNC_CHANNEL, type ContentSize } from "./shared.ts";

/** Stop waiting for an ack after this long, e.g. when the renderer is hidden or hung. */
const ACK_TIMEOUT_MS = 500;

/**
 * Paces user resizes of `win` to the renderer's frames. While enabled (the
 * page calls `setSync(true)`), each resize the system proposes is cancelled
 * and remembered; the latest one is applied with `setBounds` only when the
 * page in `webContents` reports it has rendered the previous size.
 *
 * Re-applying a cancelled resize needs the dragged edges, which macOS does
 * not report: they are guessed from the pointer, and the guess can be wrong
 * (see @electron-resize-sync/drag-edge-heuristic).
 */
export function paceResizes(
  win: BaseWindow,
  webContents: WebContents,
  options: { trustReportedEdge?: boolean } = {},
) {
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

  // Which edges are dragged is a guess; see trackDraggedEdges.
  const place = trackDraggedEdges(win, options);
  win.on("will-resize", (event, newBounds, { edge }) => {
    if (!enabled) return;
    event.preventDefault();
    pending = place(win.getBounds(), newBounds, edge);
    commitNext();
  });

  const onAck = (event: Electron.IpcMainEvent, size: unknown) => {
    if (event.sender !== webContents || inFlight === undefined) return;
    // An ack for an older size must not release the commit still in flight.
    if (isContentSize(size) && sizeKey(size.width, size.height) === inFlight) release();
  };
  const onSetSync = (event: Electron.IpcMainEvent, value: unknown) => {
    if (event.sender !== webContents) return;
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
