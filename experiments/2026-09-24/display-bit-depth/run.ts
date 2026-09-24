// Checks whether the display path is 8-bit or deeper, from macOS and from
// Chromium inside the app. See README.md.
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs, promisify } from "node:util";
import { collectEnvironment, launchSession, runDirectory } from "../../tools/harness/session.ts";

const { values: args } = parseArgs({ options: { out: { type: "string" } } });
const exec = promisify(execFile);
const runDir = runDirectory("display-bit-depth");

// Compile with Xcode's default toolchain; a custom TOOLCHAINS selection may not ship AppKit.
const binary = path.join(runDir, "screen");
const env = { ...process.env };
delete env["TOOLCHAINS"];
await exec("mkdir", ["-p", runDir]);
await exec(
  "xcrun",
  [
    "--toolchain",
    "XcodeDefault",
    "swiftc",
    "-o",
    binary,
    path.join(import.meta.dirname, "screen.swift"),
  ],
  { env },
);
const macos = JSON.parse((await exec(binary)).stdout) as unknown;

const session = await launchSession({
  runDir,
  settings: { busyMs: 0, playing: false, dither: false, resizeSync: false },
});
try {
  const environment = await collectEnvironment(session);
  const chromium = await session.page<Record<string, unknown>>(`(() => {
    const matches = (query) => matchMedia(query).matches;
    let canvasFloat16 = false;
    try {
      const context = document.createElement("canvas").getContext("2d", { colorType: "float16" });
      canvasFloat16 = context?.getContextAttributes?.().colorType === "float16";
    } catch {}
    return {
      screenColorDepth: screen.colorDepth,
      minColor10: matches("(min-color: 10)"),
      colorGamutP3: matches("(color-gamut: p3)"),
      colorGamutRec2020: matches("(color-gamut: rec2020)"),
      dynamicRangeHigh: matches("(dynamic-range: high)"),
      canvasFloat16,
      webgpu: "gpu" in navigator,
    };
  })()`);
  const outPath = args.out ?? path.join(runDir, "results.json");
  await writeFile(
    outPath,
    `${JSON.stringify({ experiment: "display-bit-depth", environment, macos, chromium }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ macos, chromium }, null, 2));
  console.log(`Wrote ${outPath}`);
} finally {
  await session.close();
}
