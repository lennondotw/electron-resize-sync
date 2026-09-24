// Starts the renderer dev server, watches the main process and preload builds,
// and (re)launches Electron whenever either bundle is rebuilt.
import { spawn, type ChildProcess } from "node:child_process";
import { build, createServer, defaultServerConditions } from "vite";

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

// The main build empties dist-electron, so it must finish before the preload
// build starts. Electron launches once both have built at least once.
const built = new Set<string>();
for (const configFile of ["vite.main.config.ts", "vite.preload.config.ts"]) {
  const watcher = await build({
    configFile,
    build: { watch: {} },
    // Workspace packages export their TypeScript sources under the
    // "development" condition; a build resolves as production otherwise.
    ssr: { resolve: { conditions: ["development", ...defaultServerConditions] } },
  });
  if (!("on" in watcher)) throw new Error("Expected a watcher from vite build --watch");
  await new Promise<void>((resolve) => {
    watcher.on("event", (event) => {
      if (event.code === "ERROR") console.error(event.error);
      if (event.code !== "END") return;
      built.add(configFile);
      resolve();
      if (built.size === 2) restartElectron();
    });
  });
}
