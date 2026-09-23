import path from "node:path";
import { app, BrowserWindow, nativeTheme } from "electron";

const devServerUrl = process.env["VITE_DEV_SERVER_URL"];

// Mirrors --canvas in src/renderer/index.css, so the native window and <html>
// leak the same colour, which differs slightly from #root's --surface.
function canvasColor() {
  return nativeTheme.shouldUseDarkColors ? "#18181b" : "#e4e4e7";
}

function createWindow() {
  const win = new BrowserWindow({ width: 960, height: 640, backgroundColor: canvasColor() });

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
