import path from "node:path";
import {
  app,
  BaseWindow,
  BrowserWindow,
  nativeTheme,
  type BaseWindowConstructorOptions,
} from "electron";
import { createRevealWindow } from "@electron-resize-sync/render-before-reveal-not-working/main";
import { reportResizeActivity } from "@electron-resize-sync/resize-activity/main";
import {
  enableResizeDeadline,
  getResizeDeadlineStatus,
} from "@electron-resize-sync/resize-deadline/main";
import { paceResizes } from "@electron-resize-sync/resize-pacing-not-working/main";
import { showResizeRateOverlay } from "@electron-resize-sync/resize-rate-overlay/main";
import {
  DEADLINE_ARGUMENT,
  MARKERS_ARGUMENT,
  PACING_ARGUMENT,
  RESIZE_COMMIT_CHANNEL,
  type DeadlineState,
  type ResizeCommit,
} from "../shared/resize-bridge.ts";
import { TITLEBAR_HEIGHT, TRAFFIC_LIGHTS_POSITION } from "../shared/titlebar.ts";

const devServerUrl = process.env["VITE_DEV_SERVER_URL"];
// Render before reveal (does not work) needs a different window
// structure, so it is chosen at launch rather than with a HUD switch.
const revealMode = Boolean(process.env["ELECTRON_RESIZE_SYNC_REVEAL"]);

// Resize deadline's switches, set by the app. On a patched Electron they make resizes
// wait for the page (see experiments/tools/deadline-patch); enableResizeDeadline
// no-ops on an unpatched one unless forced. RESIZE_DEADLINE_FORCED bakes them
// into a package (for Windows/Linux, where there is no framework patch to
// detect); the env var sets the frame count for development.
declare const __RESIZE_DEADLINE_FORCED__: boolean;
const deadlineFrames = process.env["ELECTRON_RESIZE_SYNC_DEADLINE_FRAMES"];
if (__RESIZE_DEADLINE_FORCED__) {
  enableResizeDeadline({ frames: Number(deadlineFrames ?? 30), force: true });
} else if (deadlineFrames) {
  enableResizeDeadline({ frames: Number(deadlineFrames) });
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
      ...(process.env["ELECTRON_RESIZE_SYNC_PACING"] ? [PACING_ARGUMENT] : []),
      DEADLINE_ARGUMENT + encodeURIComponent(JSON.stringify(readDeadlineState())),
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
    // Resize pacing (does not work), off unless ELECTRON_RESIZE_SYNC_PACING
    // is set, in which case the page turns it on.
    // Simulated drags (experiments/2026-09-24/resize-pacing) emit will-resize with the
    // edge they drag; real drags on macOS do not report it.
    paceResizes(browserWindow, browserWindow.webContents, {
      ...(process.env["ELECTRON_RESIZE_SYNC_TRUST_REPORTED_EDGE"] && { trustReportedEdge: true }),
    });
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
  // Tells the renderer while a user resize is in progress, so it can skip
  // its busy work (the HUD's "yield on resize").
  reportResizeActivity(win, webContents);

  // On by default; experiments turn it off so it does not add main-thread work.
  if (process.env["ELECTRON_RESIZE_SYNC_OVERLAY"] !== "0")
    showResizeRateOverlay(win, { titleBarHeight: TITLEBAR_HEIGHT });

  const syncBackground = () => win.setBackgroundColor(canvasColor());
  nativeTheme.on("updated", syncBackground);
  win.on("closed", () => nativeTheme.off("updated", syncBackground));

  if (devServerUrl) {
    void webContents.loadURL(devServerUrl);
  } else {
    void webContents.loadFile(path.join(import.meta.dirname, "../dist/index.html"));
  }
}

/** Resize deadline as this process runs it: the framework patch and the switches actually set. */
function readDeadlineState(): DeadlineState {
  const status = getResizeDeadlineStatus();
  const { commandLine } = app;
  const name = "deadline-to-synchronize-surfaces";
  return {
    patched: status.patched,
    ...(status.reason !== undefined && { reason: status.reason }),
    ...(commandLine.hasSwitch(name) && { frames: commandLine.getSwitchValue(name) }),
    remoteCoreAnimationDisabled: commandLine
      .getSwitchValue("disable-features")
      .split(",")
      .includes("RemoteCoreAnimationAPI"),
  };
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
