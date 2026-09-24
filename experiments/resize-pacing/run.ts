// Measures how long a window size change stays unpainted, with and without
// paced resizing, across busy-work budgets and every edge and corner in both
// directions. See README.md in this directory.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { collectEnvironment, launchSession, runDirectory, sleep } from "../harness/session.ts";

const ALL_EDGES = [
  "right",
  "left",
  "bottom",
  "top",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;
type Edge = (typeof ALL_EDGES)[number];
type Direction = "grow" | "shrink";

const { values: args } = parseArgs({
  options: {
    busy: { type: "string", default: "0,30,65" },
    edges: { type: "string", default: ALL_EDGES.join(",") },
    directions: { type: "string", default: "grow,shrink" },
    repetitions: { type: "string", default: "2" },
    out: { type: "string" },
  },
});

const busyBudgets = args.busy.split(",").map(Number);
const edges = args.edges.split(",") as Edge[];
const directions = args.directions.split(",") as Direction[];
const repetitions = Number(args.repetitions);

/**
 * Simulated drag: the dragged edges move `distance` px in `step` px increments,
 * one proposal per `intervalMs`, between a 760×480 window and one grown by
 * `distance` on those edges. The window starts centred in the work area.
 */
const DRAG = { width: 760, height: 480, distance: 240, step: 4, intervalMs: 16 };

// Runs in the main process. Records every size the window takes on and every
// renderer ack, then replays the drag the way AppKit would: will-resize first,
// and the system resize only when nothing prevented it.
const dragScript = (edge: Edge, direction: Direction) => `(async () => {
  const { BrowserWindow, ipcMain, screen } = require("electron");
  const win = BrowserWindow.getAllWindows()[0];
  const drag = ${JSON.stringify(DRAG)};
  const edge = ${JSON.stringify(edge)};
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  const base = {
    x: Math.round(area.x + (area.width - drag.width) / 2),
    y: Math.round(area.y + (area.height - drag.height) / 2),
    width: drag.width,
    height: drag.height,
  };
  // Bounds with the dragged edges pushed out by d px.
  const at = (d) => {
    const b = { ...base };
    if (edge.includes("left")) { b.x -= d; b.width += d; }
    if (edge.includes("right")) b.width += d;
    if (edge.includes("top")) { b.y -= d; b.height += d; }
    if (edge.includes("bottom")) b.height += d;
    return b;
  };
  const offsets = [];
  for (let d = drag.step; d <= drag.distance; d += drag.step) offsets.push(d);
  const path = ${JSON.stringify(direction)} === "grow"
    ? offsets
    : offsets.map((d) => drag.distance - d);

  win.setBounds(at(${JSON.stringify(direction)} === "grow" ? 0 : drag.distance));
  await new Promise((r) => setTimeout(r, 800));

  const resizes = [], acks = [];
  const onResize = () => {
    const [width, height] = win.getContentSize();
    resizes.push({ t: performance.now(), width, height });
  };
  const onAck = (_event, size) => acks.push({ t: performance.now(), ...size });
  win.on("resize", onResize);
  ipcMain.on("resize:ack", onAck);

  for (const d of path) {
    const bounds = at(d);
    let prevented = false;
    win.emit("will-resize", { preventDefault: () => (prevented = true) }, bounds, { edge });
    if (!prevented) win.setBounds(bounds);
    await new Promise((r) => setTimeout(r, drag.intervalMs));
  }
  await new Promise((r) => setTimeout(r, 1000));
  win.off("resize", onResize);
  ipcMain.off("resize:ack", onAck);
  const expected = at(path.at(-1));
  return { proposals: path.length, resizes, acks, reachedTarget:
    JSON.stringify(win.getBounds()) === JSON.stringify(expected) };
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
  reachedTarget: boolean;
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
      // The simulated drags report their edge in will-resize; without this
      // the pacer would guess it from the pointer, which is not on the edge.
      env: { ELECTRON_RESIZE_SYNC_TRUST_REPORTED_EDGE: "1" },
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
      for (const edge of edges) {
        for (const direction of directions) {
          for (let repetition = 0; repetition < repetitions; repetition++) {
            const result = await session.main<DragResult>(dragScript(edge, direction));
            const durations = unpaintedDurations(result);
            drags.push({
              edge,
              direction,
              repetition,
              proposals: result.proposals,
              applied: result.resizes.length,
              acks: result.acks.length,
              reachedTarget: result.reachedTarget,
              unpaintedMs: summarize(durations),
              samples: durations.map(round),
            });
            await sleep(300);
          }
        }
      }
      scenarios.push({ busyMs, resizeSync, fps: round(fps), drags });

      console.log(`busy ${busyMs}ms sync ${resizeSync ? "on" : "off"} fps ${fps.toFixed(1)}`);
      for (const drag of drags) {
        const { median, max } = drag.unpaintedMs;
        console.log(
          `  ${drag.edge.padEnd(12)} ${drag.direction.padEnd(6)} #${drag.repetition}`,
          `applied ${drag.applied}/${drag.proposals} median ${median} max ${max}`,
          drag.reachedTarget ? "" : "(did not reach target)",
        );
      }
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
