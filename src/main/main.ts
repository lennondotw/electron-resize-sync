import path from "node:path";
import {
  app,
  BaseWindow,
  BrowserWindow,
  nativeTheme,
  type BaseWindowConstructorOptions,
} from "electron";
import {
  MARKERS_ARGUMENT,
  RESIZE_ACTIVE_CHANNEL,
  RESIZE_COMMIT_CHANNEL,
  REVEAL_ARGUMENT,
  type ResizeCommit,
} from "../shared/resizeBridge.ts";
import { TRAFFIC_LIGHTS_POSITION } from "../shared/titlebar.ts";
import { paceResizes } from "./resizePacer.ts";
import { showResizeRateOverlay } from "./resizeRateOverlay.ts";
import { createRevealWindow } from "./revealWindow.ts";

const devServerUrl = process.env["VITE_DEV_SERVER_URL"];
// Option C (render before reveal) needs a different window structure, so it is
// chosen at launch rather than with a HUD switch.
const revealMode = Boolean(process.env["ELECTRON_RESIZE_SYNC_REVEAL"]);

// Option D's switches, set by the app instead of on the command line. They take
// effect only with an Electron that waits for the page on resize (see
// experiments/deadline-patch): a long enough surface deadline, and the browser
// process presenting GPU output itself, which removes a race between the two
// processes' Core Animation commits.
const deadlineFrames = process.env["ELECTRON_RESIZE_SYNC_DEADLINE_FRAMES"];
if (deadlineFrames) {
  app.commandLine.appendSwitch("deadline-to-synchronize-surfaces", deadlineFrames);
  app.commandLine.appendSwitch("disable-features", "RemoteCoreAnimationAPI");
}

// Lets experiments run against a fresh profile without touching the user's settings.
const userDataDir = process.env["ELECTRON_RESIZE_SYNC_USER_DATA"];
if (userDataDir) app.setPath("userData", userDataDir);

// Mirrors --canvas in src/renderer/index.css, so the native window and <html>
// leak the same colour, which differs slightly from #root's --surface.
function canvasColor() {
  return nativeTheme.shouldUseDarkColors ? "#18181b" : "#e4e4e7";
}

function createWindow() {
  const options: BaseWindowConstructorOptions = {
    width: 760,
    height: 480,
    minWidth: 480,
    minHeight: 420,
    backgroundColor: canvasColor(),
    // On macOS the title bar is transparent and the renderer draws its own,
    // so web content spans the full window height.
    ...(process.platform === "darwin" && {
      titleBarStyle: "hidden",
      trafficLightPosition: TRAFFIC_LIGHTS_POSITION,
    }),
  };
  const webPreferences = {
    preload: path.join(import.meta.dirname, "preload.cjs"),
    additionalArguments: [
      ...(process.env["ELECTRON_RESIZE_SYNC_MARKERS"] ? [MARKERS_ARGUMENT] : []),
      ...(revealMode ? [REVEAL_ARGUMENT] : []),
    ],
  };
  let win: BaseWindow;
  let webContents: Electron.WebContents;
  if (revealMode) {
    const reveal = createRevealWindow(options, webPreferences);
    reveal.view.setBackgroundColor(canvasColor());
    ({ win } = reveal);
    ({ webContents } = reveal.view);
  } else {
    const browserWindow = new BrowserWindow({ ...options, webPreferences });
    paceResizes(browserWindow);
    win = browserWindow;
    ({ webContents } = browserWindow);
  }

  // Tell the renderer when each new size lands, so it can measure how long it
  // takes to paint a frame at that size.
  win.on("resize", () => {
    const [width = 0, height = 0] = win.getContentSize();
    const commit: ResizeCommit = { width, height, at: performance.timeOrigin + performance.now() };
    webContents.send(RESIZE_COMMIT_CHANNEL, commit);
  });
  // Tell the renderer while a user resize is in progress, so it can defer
  // expensive work (will-resize fires for each step, resized once at the end).
  let resizing = false;
  win.on("will-resize", () => {
    if (resizing) return;
    resizing = true;
    webContents.send(RESIZE_ACTIVE_CHANNEL, true);
  });
  win.on("resized", () => {
    resizing = false;
    webContents.send(RESIZE_ACTIVE_CHANNEL, false);
  });

  // On by default; experiments turn it off so it does not add main-thread work.
  if (process.env["ELECTRON_RESIZE_SYNC_OVERLAY"] !== "0") showResizeRateOverlay(win);

  const syncBackground = () => win.setBackgroundColor(canvasColor());
  nativeTheme.on("updated", syncBackground);
  win.on("closed", () => nativeTheme.off("updated", syncBackground));

  if (devServerUrl) {
    void webContents.loadURL(devServerUrl);
  } else {
    void webContents.loadFile(path.join(import.meta.dirname, "../dist/index.html"));
  }
}

void app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BaseWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
