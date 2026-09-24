import { throttle } from "es-toolkit";

/**
 * How tiles hide 8-bit banding (see tile-wave.tsx). "spatial" mixes the two
 * nearest 8-bit colours across a tile's pixels with blue noise; "temporal"
 * alternates them over frames, an experiment only.
 */
export type DitherMode = "off" | "spatial" | "temporal";
export const DITHER_MODES: readonly DitherMode[] = ["off", "spatial", "temporal"];

export interface HudSettings {
  busyMs: number;
  playing: boolean;
  dither: DitherMode;
  yieldOnResize: boolean;
}

const DEFAULT_SETTINGS: HudSettings = {
  busyMs: 30,
  playing: true,
  dither: "spatial",
  yieldOnResize: false,
};
const STORAGE_KEY = "hud-settings";

/** Reads saved settings, falling back to defaults for anything missing or malformed. */
export function loadHudSettings(): HudSettings {
  let saved: unknown;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (typeof saved !== "object" || saved === null) return DEFAULT_SETTINGS;

  const { busyMs, playing, dither, yieldOnResize } = saved as Record<string, unknown>;
  return {
    busyMs:
      typeof busyMs === "number" && Number.isFinite(busyMs) ? busyMs : DEFAULT_SETTINGS.busyMs,
    playing: typeof playing === "boolean" ? playing : DEFAULT_SETTINGS.playing,
    dither: parseDitherMode(dither),
    yieldOnResize:
      typeof yieldOnResize === "boolean" ? yieldOnResize : DEFAULT_SETTINGS.yieldOnResize,
  };
}

function parseDitherMode(saved: unknown): DitherMode {
  // Earlier versions saved a boolean, where true meant spatial dithering.
  if (typeof saved === "boolean") return saved ? "spatial" : "off";
  return DITHER_MODES.find((mode) => mode === saved) ?? DEFAULT_SETTINGS.dither;
}

/** Writes at most every 200ms, including the first and the last change of a burst. */
export const saveHudSettings = throttle(
  (settings: HudSettings) => localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)),
  200,
  { edges: ["leading", "trailing"] },
);

// Do not lose a pending trailing write when the window closes or reloads.
window.addEventListener("pagehide", () => saveHudSettings.flush());
