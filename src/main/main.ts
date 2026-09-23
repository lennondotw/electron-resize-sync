import path from "node:path";
import { app, BrowserWindow } from "electron";

const devServerUrl = process.env["VITE_DEV_SERVER_URL"];

function createWindow() {
  const win = new BrowserWindow({ width: 960, height: 640 });

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
