import {
  BaseWindow,
  ipcMain,
  screen,
  WebContentsView,
  type BaseWindowConstructorOptions,
  type Rectangle,
  type WebPreferences,
} from "electron";
import {
  REVEAL_ACK_CHANNEL,
  REVEAL_LAYOUT_CHANNEL,
  REVEAL_REQUEST_CHANNEL,
  type RevealLayout,
} from "../shared/resize-bridge.ts";
import { trackDraggedEdges } from "./drag-edge-heuristic.ts";

/**
 * Room around the window, in points, into which the page can lay out #root
 * before the window follows. Left and top drags use it: the page grows #root
 * towards the left or top first, and the view shifts once the window has moved.
 */
const MARGIN = 400;
/** Stop waiting for an ack after this long, e.g. when the renderer is hidden or hung. */
const ACK_TIMEOUT_MS = 500;

/**
 * Option C, "render before reveal". The page lives in a WebContentsView that
 * is larger than any window, so resizing the window never resizes the page's
 * surface. Each user resize is cancelled; the page first lays #root out at the
 * window's next content rectangle, and only once that layout has been
 * rendered does the window take its new bounds, revealing (or hiding) content
 * that is already there.
 */
export function createRevealWindow(
  options: BaseWindowConstructorOptions,
  webPreferences: WebPreferences,
) {
  const win = new BaseWindow(options);
  const view = new WebContentsView({ webPreferences });
  win.contentView.addChildView(view);
  const { webContents } = view;

  const largest = screen.getAllDisplays().reduce(
    (size, { bounds }) => ({
      width: Math.max(size.width, bounds.width),
      height: Math.max(size.height, bounds.height),
    }),
    { width: 0, height: 0 },
  );
  const viewSize = { width: largest.width + 2 * MARGIN, height: largest.height + 2 * MARGIN };
  /** The view's position in the window's content view. */
  let origin = { x: -MARGIN, y: -MARGIN };
  view.setBounds({ ...origin, ...viewSize });

  let lastId = 0;
  /** #root's rectangle in page coordinates that matches the window's content now. */
  const currentLayout = (): RevealLayout => {
    const content = win.getContentBounds();
    return {
      id: ++lastId,
      x: -origin.x,
      y: -origin.y,
      width: content.width,
      height: content.height,
    };
  };

  let dragging = false;
  let pending: Rectangle | undefined;
  let inFlight: { id: number; frame: Rectangle; shift: { x: number; y: number } } | undefined;
  let ackTimer: NodeJS.Timeout | undefined;

  const commitNext = () => {
    if (inFlight || !pending) return;
    const frame = pending;
    pending = undefined;
    const current = win.getBounds();
    const content = win.getContentBounds();
    const next = {
      x: frame.x + content.x - current.x,
      y: frame.y + content.y - current.y,
      width: frame.width - (current.width - content.width),
      height: frame.height - (current.height - content.height),
    };
    // Where #root has to be, with the view where it is now, to sit at `next` on screen.
    const layout: RevealLayout = {
      id: ++lastId,
      x: next.x - content.x - origin.x,
      y: next.y - content.y - origin.y,
      width: next.width,
      height: next.height,
    };
    if (layout.x < 0 || layout.y < 0) console.warn("reveal: #root left the view", layout);
    // Once the window has moved, the view shifts back so #root stays put on screen.
    inFlight = { id: layout.id, frame, shift: { x: content.x - next.x, y: content.y - next.y } };
    webContents.send(REVEAL_LAYOUT_CHANNEL, layout);
    ackTimer = setTimeout(reveal, ACK_TIMEOUT_MS);
  };

  const reveal = () => {
    clearTimeout(ackTimer);
    if (!inFlight) return;
    const { frame, shift } = inFlight;
    inFlight = undefined;
    origin = { x: origin.x + shift.x, y: origin.y + shift.y };
    // Both in one task, so they reach the screen in the same window frame.
    win.setBounds(frame);
    view.setBounds({ ...origin, ...viewSize });
    commitNext();
  };

  // Which edges are dragged is a guess; see trackDraggedEdges.
  const place = trackDraggedEdges(win);
  win.on("will-resize", (event, newBounds, { edge }) => {
    event.preventDefault();
    dragging = true;
    pending = place(win.getBounds(), newBounds, edge);
    commitNext();
  });
  win.on("resized", () => {
    dragging = false;
  });
  // Any other size change (the API, zoom, full screen) is laid out after the fact.
  win.on("resize", () => {
    if (dragging || inFlight || pending) return;
    webContents.send(REVEAL_LAYOUT_CHANNEL, currentLayout());
  });

  const onAck = (event: Electron.IpcMainEvent, id: unknown) => {
    if (event.sender === webContents && inFlight?.id === id) reveal();
  };
  const onRequest = (event: Electron.IpcMainEvent) => {
    if (event.sender === webContents) webContents.send(REVEAL_LAYOUT_CHANNEL, currentLayout());
  };
  ipcMain.on(REVEAL_ACK_CHANNEL, onAck);
  ipcMain.on(REVEAL_REQUEST_CHANNEL, onRequest);
  win.on("closed", () => {
    clearTimeout(ackTimer);
    ipcMain.off(REVEAL_ACK_CHANNEL, onAck);
    ipcMain.off(REVEAL_REQUEST_CHANNEL, onRequest);
    webContents.close();
  });

  return { win, view };
}
