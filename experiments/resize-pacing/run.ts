// Measures how long a window size change stays unpainted, with and without
// paced resizing, across busy-work budgets. See README.md in this directory.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { collectEnvironment, launchSession, runDirectory, sleep } from "../harness/session.ts";

const { values: args } = parseArgs({
  options: {
    busy: { type: "string", default: "0,30,65" },
    repetitions: { type: "string", default: "3" },
    out: { type: "string" },
  },
});

const busyBudgets = args.busy.split(",").map(Number);
const repetitions = Number(args.repetitions);
/** Simulated drag: widen from 760 to 1000 px in 4 px steps, one proposal per 16 ms. */
const DRAG = { from: 760, to: 1000, step: 4, intervalMs: 16, height: 480 };

// Runs in the main process. Records every size the window takes on and every
// renderer ack, then replays the drag the way AppKit would: will-resize first,
// and the system resize only when nothing prevented it.
const dragScript = `(async () => {
  const { BrowserWindow, ipcMain } = require("electron");
  const win = BrowserWindow.getAllWindows()[0];
  const drag = ${JSON.stringify(DRAG)};
  win.setSize(drag.from, drag.height);
  await new Promise((r) => setTimeout(r, 800));

  const resizes = [], acks = [];
  const onResize = () => {
    const [width, height] = win.getContentSize();
    resizes.push({ t: performance.now(), width, height });
  };
  const onAck = (_event, size) => acks.push({ t: performance.now(), ...size });
  win.on("resize", onResize);
  ipcMain.on("resize:ack", onAck);

  let proposals = 0;
  for (let width = drag.from + drag.step; width <= drag.to; width += drag.step) {
    const bounds = { ...win.getBounds(), width };
    let prevented = false;
    win.emit("will-resize", { preventDefault: () => (prevented = true) }, bounds, { edge: "right" });
    if (!prevented) win.setBounds(bounds);
    proposals++;
    await new Promise((r) => setTimeout(r, drag.intervalMs));
  }
  await new Promise((r) => setTimeout(r, 1000));
  win.off("resize", onResize);
  ipcMain.off("resize:ack", onAck);
  return { proposals, resizes, acks, finalWidth: win.getContentSize()[0] };
})()`;

interface Event {
  t: number;
  width: number;
  height: number;
}

interface DragResult {
  proposals: number;
  resizes: Event[];
  acks: Event[];
  finalWidth: number;
}

/** For each ack, time since the window last took on that size: how long it showed unpainted. */
function unpaintedDurations({ resizes, acks }: DragResult) {
  const durations: number[] = [];
  for (const ack of acks) {
    const committed = resizes.findLast(
      (resize) => resize.width === ack.width && resize.height === ack.height && resize.t <= ack.t,
    );
    if (committed) durations.push(ack.t - committed.t);
  }
  return durations;
}

function round(value: number | undefined) {
  return value === undefined ? null : Math.round(value * 10) / 10;
}

function summarize(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    count: sorted.length,
    median: round(at(0.5)),
    p90: round(at(0.9)),
    max: round(sorted.at(-1)),
  };
}

const runDir = runDirectory("resize-pacing");
const scenarios = [];
let environment;

for (const busyMs of busyBudgets) {
  for (const resizeSync of [false, true]) {
    const session = await launchSession({
      runDir,
      settings: { busyMs, playing: true, dither: true, resizeSync },
    });
    try {
      environment ??= await collectEnvironment(session);
      const fps = await session.page<number>(`new Promise((resolve) => {
        let frames = 0; const start = performance.now();
        const count = () => performance.now() - start < 2000
          ? (frames++, requestAnimationFrame(count))
          : resolve(frames / ((performance.now() - start) / 1000));
        requestAnimationFrame(count);
      })`);

      const drags = [];
      for (let repetition = 0; repetition < repetitions; repetition++) {
        const result = await session.main<DragResult>(dragScript);
        const durations = unpaintedDurations(result);
        drags.push({
          proposals: result.proposals,
          applied: result.resizes.length,
          acks: result.acks.length,
          finalWidth: result.finalWidth,
          unpaintedMs: summarize(durations),
          samples: durations.map(round),
        });
        await sleep(500);
      }
      scenarios.push({ busyMs, resizeSync, fps: round(fps), drags });
      console.log(
        `busy ${busyMs}ms sync ${resizeSync ? "on " : "off"} fps ${fps.toFixed(1)}`,
        drags.map((d) => `applied ${d.applied}/${d.proposals} ${JSON.stringify(d.unpaintedMs)}`),
      );
    } finally {
      await session.close();
    }
  }
}

const output = {
  experiment: "resize-pacing",
  drag: DRAG,
  repetitions,
  environment,
  scenarios,
};
const outPath = args.out ?? path.join(runDir, "results.json");
await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
