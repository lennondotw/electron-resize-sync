import { useRef, useState } from "react";
import { useElementSize } from "./useElementSize.ts";
import { useJankyFrameLoop } from "./useJankyFrameLoop.ts";

const TILE = 48;

export function App() {
  const [busyMs, setBusyMs] = useState(65);
  const stats = useJankyFrameLoop(busyMs);
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(containerRef);

  const columns = Math.ceil(size.width / TILE);
  const rows = Math.ceil(size.height / TILE);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <TileWave columns={columns} rows={rows} time={stats.time} />

      {/* Marks the edges of #root so a lagging layout is visible against the canvas. */}
      <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-zinc-400 dark:border-zinc-500" />
      <span className="absolute right-3 bottom-3 rounded bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900">
        #root ↘
      </span>

      <section className="absolute top-4 left-4 flex w-72 flex-col gap-3 rounded-xl bg-white/85 p-4 font-mono text-xs text-zinc-800 shadow-lg ring-1 ring-black/5 dark:bg-zinc-950/85 dark:text-zinc-200 dark:ring-white/10">
        <h1 className="font-sans text-sm font-semibold">Resize Leak Lab</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
          <dt className="text-zinc-500">fps</dt>
          <dd>{stats.fps.toFixed(1)}</dd>
          <dt className="text-zinc-500">frame</dt>
          <dd>{stats.frameMs.toFixed(1)} ms</dd>
          <dt className="text-zinc-500">#root</dt>
          <dd>
            {Math.round(size.width)} × {Math.round(size.height)}
          </dd>
          <dt className="text-zinc-500">tiles</dt>
          <dd>{columns * rows}</dd>
        </dl>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between">
            <span className="text-zinc-500">busy work per frame</span>
            <span className="tabular-nums">{busyMs} ms</span>
          </span>
          <input
            type="range"
            min={0}
            max={150}
            step={5}
            value={busyMs}
            onChange={(event) => setBusyMs(Number(event.target.value))}
          />
        </label>
      </section>
    </div>
  );
}

interface TileWaveProps {
  columns: number;
  rows: number;
  /** Milliseconds, e.g. a rAF timestamp. */
  time: number;
}

/** Radians per second; the wave speed does not depend on the frame rate. */
const WAVE_SPEED = 5;

/** A grid of tiles whose opacity moves as a wave, sampled at `time`. */
function TileWave({ columns, rows, time }: TileWaveProps) {
  const tiles = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const phase = (time / 1000) * WAVE_SPEED - column * 0.45 - row * 0.3;
      tiles.push(
        <div
          key={`${row}:${column}`}
          className="rounded-md bg-zinc-500"
          style={{ opacity: 0.06 + 0.22 * (0.5 + 0.5 * Math.sin(phase)) }}
        />,
      );
    }
  }

  return (
    <div
      className="grid gap-1 p-1"
      style={{
        gridTemplateColumns: `repeat(${columns}, ${TILE - 4}px)`,
        gridAutoRows: `${TILE - 4}px`,
      }}
    >
      {tiles}
    </div>
  );
}
