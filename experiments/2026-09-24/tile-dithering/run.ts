// Samples rendered tile pixels with and without per-tile dithering to check
// that dithered tiles average to fractional 8-bit values. See README.md.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { PNG } from "pngjs";
import { collectEnvironment, launchSession, runDirectory } from "../../tools/harness/session.ts";

const { values: args } = parseArgs({ options: { out: { type: "string" } } });

/** Pixels kept clear of each tile's rounded corners and anti-aliased edge, in CSS px. */
const TILE_INSET = 4;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Tiles in the bottom row that the #root corner label does not cover. The
// tiles are one WebGL canvas, so their rects are worked out from its size with
// the grid constants in apps/demo/src/renderer/tile-wave.tsx (keep in sync).
const tileRectsScript = `(() => {
  const TILE_TARGET = 44, TILE_GAP = 6, GRID_PADDING = 8;
  const fit = (length) =>
    Math.max(1, Math.round((length - 2 * GRID_PADDING + TILE_GAP) / (TILE_TARGET + TILE_GAP)));
  const canvas = document.querySelector("canvas").getBoundingClientRect();
  const columns = fit(canvas.width);
  const rows = fit(canvas.height);
  const tileWidth = (canvas.width - 2 * GRID_PADDING - (columns - 1) * TILE_GAP) / columns;
  const tileHeight = (canvas.height - 2 * GRID_PADDING - (rows - 1) * TILE_GAP) / rows;
  const label = [...document.querySelectorAll("span")].find((e) => e.textContent.includes("#root"))
    .getBoundingClientRect();
  const top = canvas.top + GRID_PADDING + (rows - 1) * (tileHeight + TILE_GAP);
  const rects = Array.from({ length: columns }, (_, column) => {
    const left = canvas.left + GRID_PADDING + column * (tileWidth + TILE_GAP);
    return { left, top, right: left + tileWidth, bottom: top + tileHeight };
  });
  return rects.filter((r) => r.right < label.left || r.bottom < label.top);
})()`;

function sampleTiles(png: PNG, rects: Rect[], pixelRatio: number) {
  return rects.map((rect) => {
    const values: number[] = [];
    const x0 = Math.ceil((rect.left + TILE_INSET) * pixelRatio);
    const x1 = Math.floor((rect.right - TILE_INSET) * pixelRatio);
    const y0 = Math.ceil((rect.top + TILE_INSET) * pixelRatio);
    const y1 = Math.floor((rect.bottom - TILE_INSET) * pixelRatio);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) values.push(png.data[(y * png.width + x) * 4 + 1] ?? 0);
    }
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { mean: Math.round(mean * 100) / 100, distinct: new Set(values).size };
  });
}

const runDir = runDirectory("tile-dithering");
const cases = [];
let environment;

for (const colorScheme of ["light", "dark"] as const) {
  for (const dither of ["off", "spatial"] as const) {
    // Paused at time 0 after launch, so every run renders the same wave phase.
    const session = await launchSession({
      runDir,
      colorScheme,
      settings: { busyMs: 0, playing: false, dither, resizeSync: false },
    });
    try {
      environment ??= await collectEnvironment(session);
      const pixelRatio = await session.page<number>("devicePixelRatio");
      const rects = await session.page<Rect[]>(tileRectsScript);
      const png = PNG.sync.read(await session.screenshot());
      const tiles = sampleTiles(png, rects, pixelRatio);
      const steps = tiles
        .slice(1)
        .map((tile, i) => Math.round((tile.mean - tiles[i]!.mean) * 100) / 100);
      const flatSteps = steps.filter((step) => Math.abs(step) < 0.05).length;
      cases.push({ colorScheme, dither, channel: "green", tiles, steps, flatSteps });
      console.log(
        `${colorScheme} dither ${dither.padEnd(7)} distinct/tile`,
        tiles.map((t) => t.distinct).join(","),
        `flat steps ${flatSteps}/${steps.length}`,
      );
    } finally {
      await session.close();
    }
  }
}

const outPath = args.out ?? path.join(runDir, "results.json");
await writeFile(
  outPath,
  `${JSON.stringify({ experiment: "tile-dithering", tileInsetPx: TILE_INSET, environment, cases }, null, 2)}\n`,
);
console.log(`Wrote ${outPath}`);
