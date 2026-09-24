import { BrowserWindow, type BaseWindow } from "electron";
import { TITLEBAR_HEIGHT } from "../shared/titlebar.ts";

/** The label fills the overlay's height; its width fits the longest text. */
const SIZE = { width: 168, height: 22 };
/**
 * Centred in the title bar, like the window buttons, and as far from the
 * right edge as from the top.
 */
const INSET = (TITLEBAR_HEIGHT - SIZE.height) / 2;
/** How many recent size changes the rate is computed from. */
const WINDOW_SIZE = 8;
/** After this long without a size change, the rate is shown as idle. */
const IDLE_MS = 600;

const PAGE = `<!doctype html><html><head><style>
  html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
  body { display: flex; justify-content: flex-end; }
  span { box-sizing: border-box; height: 100%; display: flex; align-items: center;
    font: 11px/1 ui-monospace, Menlo, monospace; color: #fafafa; white-space: pre;
    background: rgb(0 0 0 / 0.72); border-radius: 6px; padding: 0 7px;
    font-variant-numeric: tabular-nums; }
</style></head><body><span id="t">resize idle</span></body></html>`;

/**
 * A click-through window over the top-right corner of `win` that shows how
 * often the window actually changes size. It is measured in the main process
 * from the window's own resize events, so it does not depend on the (busy)
 * renderer, and it is a separate window so it never takes mouse events.
 */
export function showResizeRateOverlay(win: BaseWindow) {
  const overlay = new BrowserWindow({
    ...SIZE,
    parent: win,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    webPreferences: { sandbox: true },
  });
  overlay.setIgnoreMouseEvents(true);
  void overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`);

  const place = () => {
    const bounds = win.getContentBounds();
    overlay.setPosition(
      Math.round(bounds.x + bounds.width - SIZE.width - INSET),
      Math.round(bounds.y + INSET),
    );
  };

  let text = "";
  const show = (next: string) => {
    if (next === text || overlay.isDestroyed()) return;
    text = next;
    void overlay.webContents.executeJavaScript(`t.textContent = ${JSON.stringify(next)}`);
  };

  const times: number[] = [];
  let idleTimer: NodeJS.Timeout | undefined;
  win.on("resize", () => {
    place();
    const now = performance.now();
    times.push(now);
    if (times.length > WINDOW_SIZE + 1) times.shift();
    if (times.length > 1) {
      const intervalMs = (now - times[0]!) / (times.length - 1);
      show(
        `resize ${(1000 / intervalMs).toFixed(1).padStart(5)} Hz ${intervalMs.toFixed(0).padStart(4)} ms`,
      );
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      times.length = 0;
      show("resize idle");
    }, IDLE_MS);
  });
  win.on("move", place);
  win.on("closed", () => clearTimeout(idleTimer));

  overlay.once("ready-to-show", () => {
    place();
    overlay.showInactive();
  });
}
