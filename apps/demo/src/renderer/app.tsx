import { Slider } from "@base-ui/react/slider";
import { Switch } from "@base-ui/react/switch";
import { useEffect, useRef, useState } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import {
  DITHER_MODES,
  loadHudSettings,
  saveHudSettings,
  type DitherMode,
  type HudSettings,
} from "./hud-settings.ts";
import { useResizeLatency } from "./resize-probe.ts";
import { fitTiles, TileWave } from "./tile-wave.tsx";
import type { DeadlineState } from "../shared/resize-bridge.ts";
import { TitleBar } from "./title-bar.tsx";
import { useElementSize } from "./use-element-size.ts";
import { isResizing } from "./resize-activity.ts";
import { useJankyFrameLoop } from "./use-janky-frame-loop.ts";

export function App() {
  const [settings, setSettings] = useState(loadHudSettings);
  const { busyMs, playing, dither, yieldOnResize } = settings;
  const updateSettings = (patch: Partial<HudSettings>) =>
    setSettings((current) => ({ ...current, ...patch }));
  useEffect(() => saveHudSettings(settings), [settings]);

  const stats = useJankyFrameLoop(busyMs, yieldOnResize ? isResizing : undefined);
  const resizeLatency = useResizeLatency();
  // While paused the loop and its busy work keep running; only the tiles hold
  // still, at the time they were paused (or the start, after a paused reload).
  const [pausedAt, setPausedAt] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const rootSize = useElementSize(rootRef);

  // For the HUD; the tiles work out their own grid from the canvas size.
  const columns = fitTiles(rootSize.width);
  const rows = fitTiles(rootSize.height);

  return (
    <div ref={rootRef} className="relative flex h-full w-full flex-col overflow-hidden">
      {/* The animated background fills #root, including the title bar area. */}
      <div className="absolute inset-0">
        <TileWave time={playing ? stats.time : pausedAt} frame={stats.frame} dither={dither} />
      </div>

      <TitleBar title="Electron Resize Sync" />

      <main className="relative min-h-0 flex-1">
        <section className="absolute top-0 left-4 flex w-72 flex-col gap-3 rounded-xl bg-white/85 p-4 font-mono text-xs text-zinc-800 shadow-lg ring-1 ring-black/5 dark:bg-zinc-950/85 dark:text-zinc-200 dark:ring-white/10">
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
            <dt className="text-zinc-500">resize latency</dt>
            <dd>{formatLatency(resizeLatency.last)}</dd>
            <dt className="text-zinc-500">max this drag</dt>
            <dd>{formatLatency(resizeLatency.max)}</dd>
            <dt className="text-zinc-500">tiles</dt>
            <dd>{columns * rows}</dd>
            <dt className="text-zinc-500">resize deadline</dt>
            <dd title={window.resizeBridge?.deadline?.reason}>
              {formatDeadline(window.resizeBridge?.deadline)}
            </dd>
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
            label="yield on resize"
            checked={yieldOnResize}
            onCheckedChange={(next) => updateSettings({ yieldOnResize: next })}
          />
          <div className="flex items-center justify-between">
            <span id="dither-label" className="text-zinc-500">
              dithering
            </span>
            <RadioGroup
              aria-labelledby="dither-label"
              value={dither}
              onValueChange={(next) => updateSettings({ dither: next as DitherMode })}
              className="flex rounded-md bg-zinc-200 p-0.5 dark:bg-zinc-800"
            >
              {DITHER_MODES.map((mode) => (
                <Radio.Root
                  key={mode}
                  value={mode}
                  className="rounded px-1.5 py-0.5 text-zinc-500 focus-visible:outline-2 focus-visible:outline-zinc-900 data-checked:bg-white data-checked:text-zinc-900 data-checked:shadow-sm dark:focus-visible:outline-zinc-100 dark:data-checked:bg-zinc-600 dark:data-checked:text-zinc-50"
                >
                  {mode}
                </Radio.Root>
              ))}
            </RadioGroup>
          </div>
        </section>
      </main>

      <span className="absolute right-3 bottom-3 rounded bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900">
        #root ↘
      </span>

      {window.resizeBridge?.markers && <EdgeMarkers />}
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

/**
 * Pure green squares at the middle of each edge of #root, for screen-recording
 * experiments that measure where the content sits relative to the window frame.
 * Edge midpoints stay clear of the window's rounded corners.
 */
function EdgeMarkers() {
  const edges = [
    "top-0.5 left-1/2 -translate-x-1/2",
    "bottom-0.5 left-1/2 -translate-x-1/2",
    "top-1/2 left-0.5 -translate-y-1/2",
    "top-1/2 right-0.5 -translate-y-1/2",
  ];
  return edges.map((position) => (
    <span
      key={position}
      aria-hidden
      className={`pointer-events-none absolute size-2.5 bg-[#00ff00] ${position}`}
    />
  ));
}

/**
 * Resize deadline is in effect only with both the framework patch and the deadline
 * switch. "switch only" is a forced build whose framework is not patched (the
 * Windows and Linux packages): the switch is set, but a resize there does not
 * use it (docs/research/2026-09-24/aura-resize-deadline.md).
 */
function formatDeadline(deadline: DeadlineState | undefined) {
  if (!deadline) return "–";
  const { patched, frames, remoteCoreAnimationDisabled } = deadline;
  if (patched && frames) {
    const race = navigator.platform.startsWith("Mac") && !remoteCoreAnimationDisabled;
    return `on, ${frames} frames${race ? ", RCA on" : ""}`;
  }
  if (frames) return `switch only, ${frames} frames`;
  return patched ? "patched, switch off" : "off";
}

function formatLatency(ms: number | null) {
  return ms === null ? "–" : `${ms.toFixed(1)} ms`;
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
