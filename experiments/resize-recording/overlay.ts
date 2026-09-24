// Measures, frame by frame, where the resize rate overlay's label sits relative
// to the window's top-right corner, to see whether the overlay window keeps up
// with the window it follows. Needs a recording staged with
// --env ELECTRON_RESIZE_SYNC_OVERLAY=1. See README.md.
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    geometry: { type: "string" },
    video: { type: "string" },
    out: { type: "string" },
  },
});
if (!args.geometry || !args.video || !args.out) {
  throw new Error("Usage: overlay.ts --geometry <file> --video <file> --out <file>");
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const {
  crop,
  window: rest,
  backdrop,
  display,
} = JSON.parse(await readFile(args.geometry, "utf8")) as {
  crop: Rect;
  window: Rect;
  backdrop: Rect;
  display: Rect & { scaleFactor: number };
};
const scale = display.scaleFactor;
const W = crop.width;
const H = crop.height;
const cx = Math.round((rest.x - backdrop.x + rest.width / 2) * scale);
const cy = Math.round((rest.y - backdrop.y + rest.height / 2) * scale);
/** The title bar's height in pixels, where the label lives. */
const TITLE_BAR = 44 * scale;
/** How far left of the right edge to look for the label. */
const SEARCH = 210 * scale;
/** A deviation of this many pixels or less counts as in step (edge detection noise). */
const TOLERANCE = 3;

interface Frame {
  t: number;
  right: number;
  top: number;
  /** Window right edge minus the label's right edge; null when the label is not found. */
  dx: number | null;
  /** The label's top edge minus the window's top edge. */
  dy: number | null;
}

function analyzeFrame(pixels: Buffer, t: number): Frame {
  const at = (x: number, y: number) => (y * W + x) * 3;
  const magenta = (x: number, y: number) => {
    const i = at(x, y);
    return pixels[i]! - pixels[i + 1]! > 40 && pixels[i + 2]! - pixels[i + 1]! > 40;
  };
  // The label is black at 72 % over the dark tiles: darker than anything else
  // in the title bar.
  const label = (x: number, y: number) => {
    const i = at(x, y);
    return pixels[i]! < 22 && pixels[i + 1]! < 22 && pixels[i + 2]! < 22;
  };
  let right = cx;
  while (right < W - 1 && !magenta(right + 1, cy)) right++;
  let top = cy;
  while (top > 0 && !magenta(cx, top - 1)) top--;

  let maxX = -Infinity;
  let minY = Infinity;
  for (let y = Math.max(0, top + 6); y < Math.min(H, top + TITLE_BAR - 4); y++) {
    for (let x = Math.max(0, right - SEARCH); x < right - 6; x++) {
      if (!label(x, y)) continue;
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
    }
  }
  const found = Number.isFinite(maxX);
  return { t, right, top, dx: found ? right - maxX : null, dy: found ? minY - top : null };
}

function frameTimes(video: string) {
  const ffprobe = spawn("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "frame=pts_time",
    "-of",
    "csv=p=0",
    video,
  ]);
  let output = "";
  ffprobe.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  return new Promise<number[]>((resolve) =>
    ffprobe.on("close", () => resolve(output.trim().split("\n").map(Number))),
  );
}

const times = await frameTimes(args.video);
// Passthrough keeps one output frame per captured frame (see analyze.ts).
const ffmpeg = spawn("ffmpeg", [
  "-v",
  "error",
  "-i",
  args.video,
  "-fps_mode",
  "passthrough",
  "-f",
  "rawvideo",
  "-pix_fmt",
  "rgb24",
  "-",
]);
const frames: Frame[] = [];
const buffer = Buffer.alloc(W * H * 3);
let filled = 0;
for await (const chunk of ffmpeg.stdout as AsyncIterable<Buffer>) {
  let offset = 0;
  while (offset < chunk.length) {
    const n = Math.min(chunk.length - offset, buffer.length - filled);
    chunk.copy(buffer, filled, offset, offset + n);
    filled += n;
    offset += n;
    if (filled === buffer.length) {
      frames.push(analyzeFrame(buffer, times[frames.length] ?? Number.NaN));
      filled = 0;
    }
  }
}

const median = (values: number[]) =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]!;
const restFrames = frames.slice(0, 15);
const base = {
  dx: median(restFrames.map((f) => f.dx ?? -1)),
  dy: median(restFrames.map((f) => f.dy ?? -1)),
};
const offBase = (f: Frame) =>
  f.dx === null ||
  f.dy === null ||
  Math.abs(f.dx - base.dx) > TOLERANCE ||
  Math.abs(f.dy - base.dy) > TOLERANCE;

// Each frame in which the window's right or top edge moved, with the label's
// offsets in that frame: a label that trails shows up here first.
const changes = frames.flatMap((f, i) => {
  const previous = frames[i - 1];
  if (!previous || (f.right === previous.right && f.top === previous.top)) return [];
  return [
    {
      frame: i,
      t: f.t,
      rightMovedPx: f.right - previous.right,
      topMovedPx: f.top - previous.top,
      dx: f.dx,
      dy: f.dy,
      inStep: !offBase(f),
    },
  ];
});
const near = new Set(
  changes.flatMap(({ frame }) => Array.from({ length: 11 }, (_, k) => frame + k)),
);
const nearFrames = [...near].map((i) => frames[i]).filter((f): f is Frame => f !== undefined);

const summary = {
  frames: frames.length,
  tolerancePx: TOLERANCE,
  pixelsPerPoint: scale,
  baseOffsetsPx: base,
  windowChanges: changes.length,
  windowChangesOutOfStep: changes.filter((c) => !c.inStep).length,
  framesNearChanges: nearFrames.length,
  framesNearChangesOutOfStep: nearFrames.filter(offBase).length,
};
await writeFile(
  args.out,
  `${JSON.stringify({ video: args.video, ...summary, changes }, null, 1)}\n`,
);
console.log(JSON.stringify(summary));
