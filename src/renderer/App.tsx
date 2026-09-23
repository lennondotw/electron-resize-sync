import { Slider } from "@base-ui/react/slider";
import { Switch } from "@base-ui/react/switch";
import { useEffect, useRef, useState } from "react";
import { loadHudSettings, saveHudSettings, type HudSettings } from "./hudSettings.ts";
import { fitTiles, TileWave } from "./TileWave.tsx";
import { TitleBar } from "./TitleBar.tsx";
import { useElementSize } from "./useElementSize.ts";
import { useJankyFrameLoop } from "./useJankyFrameLoop.ts";

export function App() {
  const [settings, setSettings] = useState(loadHudSettings);
  const { busyMs, playing, dither } = settings;
  const updateSettings = (patch: Partial<HudSettings>) =>
    setSettings((current) => ({ ...current, ...patch }));
  useEffect(() => saveHudSettings(settings), [settings]);

  const stats = useJankyFrameLoop(busyMs);
  // While paused the loop and its busy work keep running; only the tiles hold
  // still, at the time they were paused (or the start, after a paused reload).
  const [pausedAt, setPausedAt] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const rootSize = useElementSize(rootRef);

  const columns = fitTiles(rootSize.width);
  const rows = fitTiles(rootSize.height);

  return (
    <div ref={rootRef} className="relative flex h-full w-full flex-col overflow-hidden">
      {/* The animated background fills #root, including the title bar area. */}
      <div className="absolute inset-0">
        <TileWave
          width={rootSize.width}
          height={rootSize.height}
          columns={columns}
          rows={rows}
          time={playing ? stats.time : pausedAt}
          dither={dither}
        />
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
            onValueChange={(value) => updateSettings({ busyMs: value })}
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
          <HudSwitch
            label="playing"
            checked={playing}
            onCheckedChange={(next) => {
              if (!next) setPausedAt(stats.time);
              updateSettings({ playing: next });
            }}
          />
          <HudSwitch
            label="dithering"
            checked={dither}
            onCheckedChange={(next) => updateSettings({ dither: next })}
          />
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

interface HudSwitchProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function HudSwitch({ label, checked, onCheckedChange }: HudSwitchProps) {
  return (
    <label className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="flex h-4 w-7 shrink-0 rounded-full bg-zinc-300 p-0.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 data-checked:bg-zinc-900 dark:bg-zinc-700 dark:focus-visible:outline-zinc-100 dark:data-checked:bg-zinc-100"
      >
        <Switch.Thumb className="size-3 rounded-full bg-white shadow transition-transform duration-150 data-checked:translate-x-3 dark:data-checked:bg-zinc-900" />
      </Switch.Root>
    </label>
  );
}
