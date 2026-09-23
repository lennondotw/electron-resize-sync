// Starts the renderer dev server, watches the main process build, and
// (re)launches Electron whenever the main bundle is rebuilt.
import { spawn, type ChildProcess } from "node:child_process";
import { build, createServer } from "vite";

// In Node, the `electron` package exports the path to the Electron binary.
const electronBin = (await import("electron")).default as unknown as string;

const server = await createServer({ configFile: "vite.config.ts" });
await server.listen();
server.printUrls();
const devServerUrl = server.resolvedUrls?.local[0];
if (!devServerUrl) throw new Error("Vite dev server did not report a local URL");

let electron: ChildProcess | undefined;

function restartElectron() {
  if (electron) {
    electron.removeAllListeners("exit");
    electron.kill();
  }
  electron = spawn(electronBin, ["."], {
    stdio: "inherit",
    env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
  });
  electron.on("exit", async (code) => {
    await server.close();
    process.exit(code ?? 0);
  });
}

const watcher = await build({ configFile: "vite.main.config.ts", build: { watch: {} } });
if (!("on" in watcher)) throw new Error("Expected a watcher from vite build --watch");
watcher.on("event", (event) => {
  if (event.code === "END") restartElectron();
  if (event.code === "ERROR") console.error(event.error);
});
