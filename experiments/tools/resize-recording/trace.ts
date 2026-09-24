// Chromium tracing of the staged app during a drag, and a summary of the
// longest events per thread.
// usage: trace.ts start               (before the drag)
//        trace.ts stop <trace.json>   (after the drag; writes the raw trace)
//        trace.ts summarize <trace.json> [--out <summary.json>] [--top N]
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs, promisify } from "node:util";

const { positionals, values: args } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string" }, top: { type: "string", default: "25" } },
});
const [command, file] = positionals;

/** Categories for compositing, surface synchronisation and IPC. */
const CATEGORIES = [
  "ui",
  "viz",
  "cc",
  "gpu",
  "benchmark",
  "blink",
  "toplevel",
  "ipc",
  "disabled-by-default-viz.surface_lifetime",
  "disabled-by-default-viz.surface_id_flow",
];
/** Events at least this long are summarised. */
const LONG_US = 20_000;

async function evaluateInMain(expression: string) {
  // The staged app is the Electron process started with --inspect by stage.ts.
  const { stdout } = await promisify(execFile)("ps", ["-Ao", "command"]);
  const port = /MacOS\/Electron --inspect=(\d+)/.exec(stdout)?.[1];
  if (!port) throw new Error("No staged Electron process with --inspect found");
  const [target] = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
    webSocketDebuggerUrl: string;
  }[];
  const socket = new WebSocket(target!.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  socket.send(
    JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression, includeCommandLineAPI: true, returnByValue: true, awaitPromise: true },
    }),
  );
  const reply = await new Promise<string>((resolve) =>
    socket.addEventListener("message", (message) => resolve(String(message.data)), { once: true }),
  );
  socket.close();
  return (JSON.parse(reply) as { result?: { result?: { value?: unknown } } }).result?.result?.value;
}

interface TraceEvent {
  ph: string;
  name: string;
  pid: number;
  tid: number;
  dur?: number;
  args?: { name?: string };
}

if (command === "start") {
  console.log(
    await evaluateInMain(
      `require("electron").contentTracing.startRecording(${JSON.stringify({
        included_categories: CATEGORIES,
        excluded_categories: ["*"],
      })}).then(() => "recording")`,
    ),
  );
} else if (command === "stop" && file) {
  const out = path.resolve(file);
  console.log(
    await evaluateInMain(
      `require("electron").contentTracing.stopRecording(${JSON.stringify(out)})`,
    ),
  );
} else if (command === "summarize" && file) {
  const trace = JSON.parse(await readFile(file, "utf8")) as
    | { traceEvents: TraceEvent[] }
    | TraceEvent[];
  const events = Array.isArray(trace) ? trace : trace.traceEvents;
  const threads = new Map<string, string>();
  const processes = new Map<number, string>();
  for (const e of events) {
    if (e.ph === "M" && e.name === "thread_name")
      threads.set(`${e.pid}:${e.tid}`, e.args?.name ?? "");
    if (e.ph === "M" && e.name === "process_name") processes.set(e.pid, e.args?.name ?? "");
  }
  // Long complete events, grouped by process type, thread and event name.
  const groups = new Map<
    string,
    { thread: string; name: string; count: number; totalMs: number; maxMs: number }
  >();
  for (const e of events) {
    if (e.ph !== "X" || !(e.dur !== undefined && e.dur >= LONG_US)) continue;
    const thread = `${processes.get(e.pid) ?? "process"}/${threads.get(`${e.pid}:${e.tid}`) ?? "thread"}`;
    const key = `${thread} :: ${e.name}`;
    const group = groups.get(key) ?? { thread, name: e.name, count: 0, totalMs: 0, maxMs: 0 };
    group.count++;
    group.totalMs += e.dur / 1000;
    group.maxMs = Math.max(group.maxMs, e.dur / 1000);
    groups.set(key, group);
  }
  const top = [...groups.values()]
    .toSorted((a, b) => b.totalMs - a.totalMs)
    .slice(0, Number(args.top))
    .map((g) => ({ ...g, totalMs: Math.round(g.totalMs), maxMs: Math.round(g.maxMs * 10) / 10 }));
  for (const g of top) {
    console.log(
      `${String(g.totalMs).padStart(6)} ms n=${String(g.count).padStart(3)} max=${g.maxMs} ms  ${g.thread} :: ${g.name}`,
    );
  }
  if (args.out) {
    await writeFile(
      args.out,
      `${JSON.stringify({ categories: CATEGORIES, longEventUs: LONG_US, top }, null, 1)}\n`,
    );
  }
} else {
  throw new Error("Usage: trace.ts start | stop <trace.json> | summarize <trace.json> [--out f]");
}
