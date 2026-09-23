import { formatRgb, mixOklch, oklchToSrgb, type Oklch, type Rgb } from "./color.ts";
import { DITHER_LEVELS, DITHER_MASK_SIZE, ditherMaskUrls } from "./ditherMasks.ts";
import { usePixelRatio } from "./usePixelRatio.ts";
import { usePrefersDark } from "./usePrefersDark.ts";

/** Preferred tile edge; tiles stretch so the grid fills #root exactly. */
const TILE_TARGET = 44;
/** Same gap on both axes. */
const TILE_GAP = 6;
const GRID_PADDING = 8;

/** Radians per second; the wave speed does not depend on the frame rate. */
const WAVE_SPEED = 1.5;

/** Wave endpoints, interpolated in OKLCH so steps look perceptually even. */
const TILE_COLORS: Record<"light" | "dark", { low: Oklch; high: Oklch }> = {
  light: { low: [0.955, 0.002, 286], high: [0.9, 0.005, 286] },
  dark: { low: [0.29, 0.005, 286], high: [0.34, 0.008, 286] },
};

/** Number of whole tiles along an axis of `length`, closest to TILE_TARGET. */
export function fitTiles(length: number) {
  const available = length - 2 * GRID_PADDING + TILE_GAP;
  return Math.max(1, Math.round(available / (TILE_TARGET + TILE_GAP)));
}

interface TileWaveProps {
  /** Size of the area the grid fills, in CSS pixels. */
  width: number;
  height: number;
  columns: number;
  rows: number;
  /** Milliseconds, e.g. a rAF timestamp. */
  time: number;
  dither: boolean;
}

/** A grid of tiles whose colour moves as a wave, sampled at `time`. */
export function TileWave({ width, height, columns, rows, time, dither }: TileWaveProps) {
  const pixelRatio = usePixelRatio();
  const { low, high } = TILE_COLORS[usePrefersDark() ? "dark" : "light"];

  // Mirrors the grid track sizes so each tile's device-pixel phase is known.
  const tileWidth = (width - 2 * GRID_PADDING - (columns - 1) * TILE_GAP) / columns;
  const tileHeight = (height - 2 * GRID_PADDING - (rows - 1) * TILE_GAP) / rows;

  const tiles = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const phase = (time / 1000) * WAVE_SPEED - (column + row) * 0.12;
      const exact = oklchToSrgb(mixOklch(low, high, 0.5 + 0.5 * Math.sin(phase)));
      const key = `${row}:${column}`;

      if (!dither) {
        tiles.push(
          <div
            key={key}
            className="rounded-md"
            style={{ backgroundColor: formatRgb(mapRgb(exact, Math.round)) }}
          />,
        );
        continue;
      }

      const { base, top, level } = splitForDither(exact);
      const left = GRID_PADDING + column * (tileWidth + TILE_GAP);
      const topEdge = GRID_PADDING + row * (tileHeight + TILE_GAP);
      tiles.push(
        <div key={key} className="relative rounded-md" style={{ backgroundColor: formatRgb(base) }}>
          <div
            className="absolute inset-0 rounded-[inherit] [image-rendering:pixelated]"
            style={{
              backgroundColor: formatRgb(top),
              maskImage: `url(${ditherMaskUrls[level]})`,
              maskRepeat: "repeat",
              maskSize: `${DITHER_MASK_SIZE / pixelRatio}px`,
              // Pull the mask back onto the device pixel grid so its pixels are not resampled.
              maskPosition: `${-subpixel(left, pixelRatio)}px ${-subpixel(topEdge, pixelRatio)}px`,
            }}
          />
        </div>,
      );
    }
  }

  return (
    <div
      className="grid h-full"
      style={{
        padding: GRID_PADDING,
        gap: TILE_GAP,
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {tiles}
    </div>
  );
}

/**
 * Splits an exact colour into two 8-bit colours one level apart plus the
 * share of pixels that should show the upper one, so a tile averages to the
 * exact value. The step follows the channel mean; the slight tint between
 * channels is rounded once and stays fixed.
 */
function splitForDither(exact: Rgb) {
  const mean = (exact[0] + exact[1] + exact[2]) / 3;
  const fraction = mean - Math.floor(mean);
  const base = mapRgb(exact, (channel) => Math.max(0, Math.round(channel - fraction)));
  const top = mapRgb(base, (channel) => Math.min(255, channel + 1));
  return { base, top, level: Math.round(fraction * DITHER_LEVELS) };
}

function mapRgb(rgb: Rgb, map: (channel: number) => number): Rgb {
  return [map(rgb[0]), map(rgb[1]), map(rgb[2])];
}

/** How far `offset` (CSS px) sits past the previous device pixel boundary, in CSS px. */
function subpixel(offset: number, pixelRatio: number) {
  const device = offset * pixelRatio;
  return (device - Math.floor(device)) / pixelRatio;
}
