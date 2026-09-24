// Main-process timing for the staged app: how often the window changes size
// during a drag, and how long the main thread is blocked meanwhile.
// usage: probe.ts install   (before the drag)
//        probe.ts dump      (after the drag; prints JSON and resets)
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const [command] = process.argv.slice(2);
if (command !== "install" && command !== "dump") throw new Error("Usage: probe.ts install|dump");

// The staged app is the Electron process started with --inspect by stage.ts.
const { stdout } = await exec("ps", ["-Ao", "command"]);
const port = /MacOS\/Electron --inspect=(\d+)/.exec(stdout)?.[1];
if (!port) throw new Error("No staged Electron process with --inspect found");

const [target] = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
  webSocketDebuggerUrl: string;
}[];
const socket = new WebSocket(target!.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));

const install = `(() => {
  const { BaseWindow } = require("electron");
  const win = BaseWindow.getAllWindows().find((w) => w.isFocusable());
  const probe = (globalThis.__resizeProbe = { resizes: [], lags: [] });
  win.on("resize", () => probe.resizes.push(performance.now()));
  // A 1 ms timer: any extra delay is time the main thread could not run JS.
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    probe.lags.push(now - last - 1);
    last = now;
  }, 1);
  return "installed";
})()`;

const dump = `(() => {
  const probe = globalThis.__resizeProbe;
  const quantile = (values, q) => {
    const sorted = values.toSorted((a, b) => a - b);
    return sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] * 10) / 10 : null;
  };
  const gaps = probe.resizes.slice(1).map((t, i) => t - probe.resizes[i]).filter((gap) => gap < 400);
  const lags = probe.lags.filter((lag) => lag > 0);
  const result = {
    resizes: probe.resizes.length,
    resizeIntervalMs: { median: quantile(gaps, 0.5), p90: quantile(gaps, 0.9), max: quantile(gaps, 1) },
    mainThreadBlockMs: { max: quantile(lags, 1), over16: lags.filter((lag) => lag > 16).length },
  };
  probe.resizes = [];
  probe.lags = [];
  return result;
})()`;

socket.send(
  JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: {
      expression: command === "install" ? install : dump,
      includeCommandLineAPI: true,
      returnByValue: true,
    },
  }),
);
const reply = await new Promise<string>((resolve) =>
  socket.addEventListener("message", (message) => resolve(String(message.data)), { once: true }),
);
socket.close();
const value = (JSON.parse(reply) as { result?: { result?: { value?: unknown } } }).result?.result
  ?.value;
console.log(JSON.stringify(value));
