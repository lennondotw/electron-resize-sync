import path from "node:path";
import { app, BrowserWindow, nativeTheme } from "electron";
import { RESIZE_COMMIT_CHANNEL, type ResizeCommit } from "../shared/resizeBridge.ts";
import { TRAFFIC_LIGHTS_POSITION } from "../shared/titlebar.ts";
import { paceResizes } from "./resizePacer.ts";

const devServerUrl = process.env["VITE_DEV_SERVER_URL"];

// Mirrors --canvas in src/renderer/index.css, so the native window and <html>
// leak the same colour, which differs slightly from #root's --surface.
function canvasColor() {
  return nativeTheme.shouldUseDarkColors ? "#18181b" : "#e4e4e7";
}

function createWindow() {
  const win = new BrowserWindow({
    width: 760,
    height: 480,
    minWidth: 480,
    minHeight: 360,
    backgroundColor: canvasColor(),
    // On macOS the title bar is transparent and the renderer draws its own,
    // so web content spans the full window height.
    ...(process.platform === "darwin" && {
      titleBarStyle: "hidden",
      trafficLightPosition: TRAFFIC_LIGHTS_POSITION,
    }),
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.cjs"),
    },
  });

  // Tell the renderer when each new size lands, so it can measure how long it
  // takes to paint a frame at that size.
  win.on("resize", () => {
    const [width = 0, height = 0] = win.getContentSize();
    const commit: ResizeCommit = { width, height, at: performance.timeOrigin + performance.now() };
    win.webContents.send(RESIZE_COMMIT_CHANNEL, commit);
  });
  paceResizes(win);

  const syncBackground = () => win.setBackgroundColor(canvasColor());
  nativeTheme.on("updated", syncBackground);
  win.on("closed", () => nativeTheme.off("updated", syncBackground));

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(path.join(import.meta.dirname, "../dist/index.html"));
  }
}

void app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
