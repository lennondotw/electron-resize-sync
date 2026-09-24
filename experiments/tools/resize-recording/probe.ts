// Main-process timing for the staged app: how often the window changes size
// during a drag, and how long the main thread is blocked meanwhile.
// usage: probe.ts install   (before the drag)
//        probe.ts dump      (after the drag; prints JSON and resets)
import { evaluateInMain } from "../harness/inspect.ts";

const [command] = process.argv.slice(2);
if (command !== "install" && command !== "dump") throw new Error("Usage: probe.ts install|dump");

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

console.log(JSON.stringify(await evaluateInMain(command === "install" ? install : dump)));
