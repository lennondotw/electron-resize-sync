import { Slider } from "@base-ui/react/slider";
import { useRef, useState } from "react";
import { TitleBar } from "./TitleBar.tsx";
import { useElementSize } from "./useElementSize.ts";
import { useJankyFrameLoop } from "./useJankyFrameLoop.ts";

/** Preferred tile edge; tiles stretch so the grid fills #root exactly. */
const TILE_TARGET = 44;
/** Same gap on both axes. */
const TILE_GAP = 6;
const GRID_PADDING = 8;

/** Number of whole tiles along an axis of `length`, closest to TILE_TARGET. */
function fitTiles(length: number) {
  const available = length - 2 * GRID_PADDING + TILE_GAP;
  return Math.max(1, Math.round(available / (TILE_TARGET + TILE_GAP)));
}

export function App() {
  const [busyMs, setBusyMs] = useState(65);
  const stats = useJankyFrameLoop(busyMs);
  const rootRef = useRef<HTMLDivElement>(null);
  const rootSize = useElementSize(rootRef);

  const columns = fitTiles(rootSize.width);
  const rows = fitTiles(rootSize.height);

  return (
    <div ref={rootRef} className="relative flex h-full w-full flex-col overflow-hidden">
      {/* The animated background fills #root, including the title bar area. */}
      <div className="absolute inset-0">
        <TileWave columns={columns} rows={rows} time={stats.time} />
      </div>

      <TitleBar title="Electron Resize Sync" />

      <main className="relative min-h-0 flex-1">
        <section className="absolute top-4 left-4 flex w-72 flex-col gap-3 rounded-xl bg-white/85 p-4 font-mono text-xs text-zinc-800 shadow-lg ring-1 ring-black/5 dark:bg-zinc-950/85 dark:text-zinc-200 dark:ring-white/10">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
            <dt className="text-zinc-500">fps</dt>
            <dd>{stats.fps.toFixed(1)}</dd>
            <dt className="text-zinc-500">estimated max fps</dt>
            <dd>{formatMaxFps(busyMs)}</dd>
            <dt className="text-zinc-500">frame</dt>
            <dd>{stats.frameMs.toFixed(1)} ms</dd>
            <dt className="text-zinc-500">#root</dt>
            <dd>
              {Math.round(rootSize.width)} × {Math.round(rootSize.height)}
            </dd>
            <dt className="text-zinc-500">tiles</dt>
            <dd>{columns * rows}</dd>
          </dl>
          <Slider.Root
            className="grid grid-cols-[1fr_auto] gap-y-1"
            min={0}
            max={150}
            step={5}
            value={busyMs}
            onValueChange={(value) => setBusyMs(value)}
          >
            <Slider.Label className="text-zinc-500">busy work per frame</Slider.Label>
            <Slider.Value className="tabular-nums">{(_, [value]) => `${value} ms`}</Slider.Value>
            <Slider.Control className="col-span-2 flex touch-none items-center py-2 select-none">
              <Slider.Track className="h-1 w-full rounded-full bg-zinc-300 dark:bg-zinc-700">
                <Slider.Indicator className="rounded-full bg-zinc-900 dark:bg-zinc-100" />
                <Slider.Thumb className="size-3.5 rounded-full bg-white shadow ring-1 ring-black/20 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-zinc-900 dark:bg-zinc-100 dark:ring-white/20 dark:has-[:focus-visible]:outline-zinc-100" />
              </Slider.Track>
            </Slider.Control>
          </Slider.Root>
        </section>
      </main>

      <span className="absolute right-3 bottom-3 rounded bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900">
        #root ↘
      </span>
    </div>
  );
}

/**
 * Upper bound on the frame rate when every frame spends `busyMs` blocked,
 * ignoring React and paint cost and the display's refresh rate.
 */
function formatMaxFps(busyMs: number) {
  const maxFps = 1000 / busyMs;
  return maxFps > 1000 ? "> 1000" : maxFps.toFixed(1);
}

interface TileWaveProps {
  columns: number;
  rows: number;
  /** Milliseconds, e.g. a rAF timestamp. */
  time: number;
}

/** Radians per second; the wave speed does not depend on the frame rate. */
const WAVE_SPEED = 1.5;

/** A grid of tiles whose opacity moves as a wave, sampled at `time`. */
function TileWave({ columns, rows, time }: TileWaveProps) {
  const tiles = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const phase = (time / 1000) * WAVE_SPEED - (column + row) * 0.12;
      const mix = 50 + 50 * Math.sin(phase);
      tiles.push(
        <div
          key={`${row}:${column}`}
          className="rounded-md"
          style={{
            backgroundColor: `color-mix(in oklch, var(--tile-high) ${mix.toFixed(1)}%, var(--tile-low))`,
          }}
        />,
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
