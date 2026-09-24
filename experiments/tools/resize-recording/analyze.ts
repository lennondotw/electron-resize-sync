// Measures, frame by frame, where each window edge is and where the content's
// edge marker sits relative to it, then splits the recording into drags and
// reports how many frames showed the content out of step with the frame.
// See README.md.
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
  throw new Error("Usage: analyze.ts --geometry <file> --video <file> --out <file>");
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const geometry = JSON.parse(await readFile(args.geometry, "utf8")) as {
  display: Rect & { scaleFactor: number };
  window: Rect;
  backdrop: Rect;
  crop: Rect;
};
const { crop, window: rest, backdrop, display } = geometry;
const scale = display.scaleFactor;
const W = crop.width;
const H = crop.height;
/** A point inside the window for every drag (outward drags grow, inward ones stay far from it). */
const cx = Math.round((rest.x - backdrop.x + rest.width / 2) * scale);
const cy = Math.round((rest.y - backdrop.y + rest.height / 2) * scale);
/** Index of a pixel's first byte in an RGB frame. */
const at = (x: number, y: number) => (y * W + x) * 3;
/** Offsets of the three scanlines per edge from the window's centre lines, in pixels. */
const LANES = [-100 * scale, 0, 100 * scale];
const median3 = (values: number[]) => values.toSorted((a, b) => a - b)[1]!;
/** Steps from (x, y) in direction (dx, dy) to the last pixel before the backdrop. */
function edgeFrom(
  x: number,
  y: number,
  dx: number,
  dy: number,
  isBackdrop: (x: number, y: number) => boolean,
) {
  while (x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H && !isBackdrop(x + dx, y + dy)) {
    x += dx;
    y += dy;
  }
  return dx === 0 ? y : x;
}
/** How far inside an edge to look for its marker: covers a content lag of several drag steps. */
const BAND = 200;
/** A deviation of this many pixels or less counts as in step (encoding noise). */
const TOLERANCE = 1;

type Edge = "left" | "top" | "right" | "bottom";
const EDGES: Edge[] = ["left", "top", "right", "bottom"];

interface Frame {
  frame: number;
  edges: Record<Edge, number>;
  /** Marker offset from its window edge, inwards; null when the marker is not visible. */
  offsets: Record<Edge, number | null>;
}

function analyzeFrame(pixels: Buffer, frame: number): Frame {
  const magenta = (x: number, y: number) => {
    const i = at(x, y);
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    // A hue test, so the darkened magenta under the window shadow is still backdrop.
    return r - g > 40 && b - g > 40;
  };
  const green = (x: number, y: number) => {
    const i = at(x, y);
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    return g - r > 100 && g - b > 100;
  };

  // Each edge is the median of three scanlines, so a small overlay resting on
  // one of them (such as the pointer a drag tool draws) does not move it.
  const left = median3(LANES.map((d) => edgeFrom(cx, cy + d, -1, 0, magenta)));
  const right = median3(LANES.map((d) => edgeFrom(cx, cy + d, 1, 0, magenta)));
  const top = median3(LANES.map((d) => edgeFrom(cx + d, cy, 0, -1, magenta)));
  const bottom = median3(LANES.map((d) => edgeFrom(cx + d, cy, 0, 1, magenta)));

  // Extent of green pixels inside a band along one edge of the window.
  const scan = (x0: number, x1: number, y0: number, y1: number) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        if (!green(x, y)) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
  };
  const leftMarker = scan(left, left + BAND, top, bottom);
  const rightMarker = scan(right - BAND, right, top, bottom);
  const topMarker = scan(left, right, top, top + BAND);
  const bottomMarker = scan(left, right, bottom - BAND, bottom);

  return {
    frame,
    edges: { left, top, right, bottom },
    offsets: {
      left: leftMarker ? leftMarker.minX - left : null,
      top: topMarker ? topMarker.minY - top : null,
      right: rightMarker ? right - rightMarker.maxX : null,
      bottom: bottomMarker ? bottom - bottomMarker.maxY : null,
    },
  };
}

async function* decode(video: string) {
  // Passthrough keeps one output frame per captured frame: the capture is
  // variable-rate, and a constant-rate output would insert duplicates.
  const ffmpeg = spawn("ffmpeg", [
    "-v",
    "error",
    "-i",
    video,
    "-fps_mode",
    "passthrough",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-",
  ]);
  // One reusable frame buffer: frames are analysed as they arrive, not kept.
  const frame = Buffer.alloc(W * H * 3);
  let filled = 0;
  for await (const chunk of ffmpeg.stdout as AsyncIterable<Buffer>) {
    let offset = 0;
    while (offset < chunk.length) {
      const n = Math.min(chunk.length - offset, frame.length - filled);
      chunk.copy(frame, filled, offset, offset + n);
      filled += n;
      offset += n;
      if (filled === frame.length) {
        yield frame;
        filled = 0;
      }
    }
  }
}

/** Presentation time of each captured frame, in seconds. */
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
const frames: (Frame & { t: number })[] = [];
for await (const pixels of decode(args.video)) {
  frames.push({ ...analyzeFrame(pixels, frames.length), t: times[frames.length] ?? Number.NaN });
}

const median = (values: number[]) =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]!;
const restFrames = frames.slice(0, 15);
const restEdges = Object.fromEntries(
  EDGES.map((edge) => [edge, median(restFrames.map((f) => f.edges[edge]))]),
) as Record<Edge, number>;
const baseline = Object.fromEntries(
  EDGES.map((edge) => [edge, median(restFrames.map((f) => f.offsets[edge] ?? -1))]),
) as Record<Edge, number>;

// A drag is a run of frames in which the window edges keep changing, allowing
// pauses shorter than the gap the drag scripts leave between drags.
const MAX_PAUSE_S = 0.6;
const changed = frames.map(
  (f, i) => i > 0 && EDGES.some((edge) => Math.abs(f.edges[edge] - frames[i - 1]!.edges[edge]) > 1),
);
const segments: { start: number; end: number }[] = [];
for (let i = 0; i < frames.length; i++) {
  if (!changed[i]) continue;
  const last = segments.at(-1);
  if (last && frames[i]!.t - frames[last.end]!.t <= MAX_PAUSE_S) last.end = i;
  else segments.push({ start: Math.max(0, i - 1), end: i });
}
// Include the frames right after the last change, while the content catches up.
for (const segment of segments) segment.end = Math.min(frames.length - 1, segment.end + 10);

function deviation(f: Frame, edge: Edge) {
  const offset = f.offsets[edge];
  return offset === null ? null : offset - baseline[edge];
}

const drags = segments.map(({ start, end }) => {
  const span = frames.slice(start, end + 1);
  const origin = span[0]!.edges;
  const moved = EDGES.filter((edge) =>
    span.some((f) => Math.abs(f.edges[edge] - origin[edge]) > 4),
  );
  // Every edge counts: when a left or top edge moves, stale content stays
  // anchored to the new origin and the opposite side is where it shows.
  const outOfStep = span.filter((f) =>
    EDGES.some((edge) => {
      const d = deviation(f, edge);
      return d === null || Math.abs(d) > TOLERANCE;
    }),
  );
  const perEdge = Object.fromEntries(
    EDGES.map((edge) => {
      const values = span.map((f) => deviation(f, edge));
      const seen = values.filter((d): d is number => d !== null);
      return [
        edge,
        {
          hiddenFrames: values.length - seen.length,
          maxBehindPx: Math.max(0, ...seen),
          maxAheadPx: Math.max(0, ...seen.map((d) => -d)),
        },
      ];
    }),
  );
  // Outward is + for every edge: right and bottom grow with x and y, left and top against them.
  const direction = moved
    .map((edge) => {
      const sign = edge === "left" || edge === "top" ? -1 : 1;
      const extreme = span.reduce(
        (best, f) =>
          Math.abs(f.edges[edge] - origin[edge]) > Math.abs(best - origin[edge])
            ? f.edges[edge]
            : best,
        origin[edge],
      );
      return `${edge}${sign * (extreme - origin[edge]) > 0 ? "+" : "-"}`;
    })
    .join(" ");
  // How often the window itself changed size: the resize rate the user sees.
  let sizeUpdates = 0;
  for (let i = 1; i < span.length; i++) {
    if (EDGES.some((edge) => span[i]!.edges[edge] !== span[i - 1]!.edges[edge])) sizeUpdates++;
  }
  const seconds = span.at(-1)!.t - span[0]!.t;
  return {
    firstFrame: start,
    lastFrame: end,
    frames: span.length,
    seconds: Math.round(seconds * 1000) / 1000,
    sizeUpdates,
    movedEdges: moved,
    direction,
    outOfStepFrames: outOfStep.length,
    perEdge,
  };
});

await writeFile(
  args.out,
  `${JSON.stringify({ video: args.video, frameRate: 60, tolerancePx: TOLERANCE, pixelsPerPoint: scale, restEdges, baseline, drags, frames }, null, 1)}\n`,
);
for (const drag of drags) {
  console.log(
    `${drag.direction.padEnd(24)} frames ${String(drag.frames).padStart(3)} out of step ${String(drag.outOfStepFrames).padStart(3)}`,
    Object.entries(drag.perEdge)
      .map(
        ([edge, s]) =>
          `${edge}: behind ${s.maxBehindPx} ahead ${s.maxAheadPx} hidden ${s.hiddenFrames}`,
      )
      .join("; "),
  );
}
console.log(`baseline offsets ${JSON.stringify(baseline)}; wrote ${args.out}`);
