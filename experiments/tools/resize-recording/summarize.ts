// Combines analysed recordings into one publishable file: the run settings,
// per-drag statistics, and the per-frame measurements inside each drag.
// usage: summarize.ts --out <file> <label>=<analysis.json>:<geometry.json> ...
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values: args, positionals } = parseArgs({
  options: { out: { type: "string" } },
  allowPositionals: true,
});
if (!args.out || positionals.length === 0) {
  throw new Error("Usage: summarize.ts --out <file> <label>=<analysis.json>:<geometry.json> ...");
}

interface Drag {
  firstFrame: number;
  lastFrame: number;
  frames: number;
  direction: string;
  outOfStepFrames: number;
  perEdge: Record<string, unknown>;
}

const runs = [];
for (const entry of positionals) {
  const [label, files] = entry.split("=", 2) as [string, string];
  const [analysisPath, geometryPath] = files.split(":") as [string, string];
  const analysis = JSON.parse(await readFile(analysisPath, "utf8")) as {
    tolerancePx: number;
    pixelsPerPoint: number;
    baseline: Record<string, number>;
    drags: Drag[];
    frames: unknown[];
  };
  const geometry = JSON.parse(await readFile(geometryPath, "utf8")) as Record<string, unknown>;
  runs.push({
    label,
    settings: geometry["args"],
    display: geometry["display"],
    environment: geometry["environment"] ?? null,
    window: geometry["window"],
    tolerancePx: analysis.tolerancePx,
    pixelsPerPoint: analysis.pixelsPerPoint,
    baselineOffsetsPx: analysis.baseline,
    drags: analysis.drags.map((drag) => ({
      ...drag,
      outOfStepShare: Math.round((drag.outOfStepFrames / drag.frames) * 1000) / 1000,
      frameData: analysis.frames.slice(drag.firstFrame, drag.lastFrame + 1),
    })),
  });
}

await writeFile(args.out, `${JSON.stringify({ experiment: "resize-recording", runs }, null, 1)}\n`);
for (const run of runs) {
  for (const drag of run.drags) {
    console.log(
      `${run.label.padEnd(14)} ${drag.direction.padEnd(16)} ${String(drag.outOfStepFrames).padStart(3)}/${String(drag.frames).padEnd(3)} out of step`,
    );
  }
}
console.log(`Wrote ${args.out}`);
