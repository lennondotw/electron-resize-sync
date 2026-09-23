import path from "node:path";
import { app, BrowserWindow, nativeTheme } from "electron";
import { TRAFFIC_LIGHTS_POSITION } from "../shared/titlebar.ts";

const devServerUrl = process.env["VITE_DEV_SERVER_URL"];

// Mirrors --canvas in src/renderer/index.css, so the native window and <html>
// leak the same colour, which differs slightly from #root's --surface.
function canvasColor() {
  return nativeTheme.shouldUseDarkColors ? "#18181b" : "#e4e4e7";
}

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 480,
    backgroundColor: canvasColor(),
    // On macOS the title bar is transparent and the renderer draws its own,
    // so web content spans the full window height.
    ...(process.platform === "darwin" && {
      titleBarStyle: "hidden",
      trafficLightPosition: TRAFFIC_LIGHTS_POSITION,
    }),
  });

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
