// Records the staged backdrop area of the staged display at 60 fps, without
// the pointer, for later frame-by-frame analysis. See README.md.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    geometry: { type: "string" },
    seconds: { type: "string", default: "10" },
    out: { type: "string" },
  },
});
if (!args.geometry || !args.out)
  throw new Error("Usage: record.ts --geometry <file> --out <video.mp4> [--seconds N]");

const { crop, captureScreen = 0 } = JSON.parse(await readFile(args.geometry, "utf8")) as {
  crop: { x: number; y: number; width: number; height: number };
  /** AVFoundation's "Capture screen N" for the staged display. */
  captureScreen?: number;
};
const ffmpeg = spawn(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "avfoundation",
    "-capture_cursor",
    "0",
    "-framerate",
    "60",
    // Capture in RGB so colour thresholds are not blurred by chroma subsampling.
    "-pixel_format",
    "bgr0",
    "-i",
    `Capture screen ${captureScreen}`,
    "-t",
    args.seconds,
    "-vf",
    `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`,
    // Near-lossless 4:4:4 so colour thresholds see the rendered pixels.
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "8",
    "-pix_fmt",
    "yuv444p",
    "-y",
    args.out,
  ],
  { stdio: "inherit" },
);
const code = await new Promise((resolve) => ffmpeg.on("close", resolve));
if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
console.log(`Recorded ${args.out}`);
