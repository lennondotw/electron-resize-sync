import { throttle } from "es-toolkit";

export interface HudSettings {
  busyMs: number;
  playing: boolean;
  dither: boolean;
  resizeSync: boolean;
}

const DEFAULT_SETTINGS: HudSettings = {
  busyMs: 30,
  playing: true,
  dither: true,
  resizeSync: false,
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

  const { busyMs, playing, dither, resizeSync } = saved as Record<string, unknown>;
  return {
    busyMs:
      typeof busyMs === "number" && Number.isFinite(busyMs) ? busyMs : DEFAULT_SETTINGS.busyMs,
    playing: typeof playing === "boolean" ? playing : DEFAULT_SETTINGS.playing,
    dither: typeof dither === "boolean" ? dither : DEFAULT_SETTINGS.dither,
    resizeSync: typeof resizeSync === "boolean" ? resizeSync : DEFAULT_SETTINGS.resizeSync,
  };
}

/** Writes at most every 200ms, including the first and the last change of a burst. */
export const saveHudSettings = throttle(
  (settings: HudSettings) => localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)),
  200,
  { edges: ["leading", "trailing"] },
);

// Do not lose a pending trailing write when the window closes or reloads.
window.addEventListener("pagehide", () => saveHudSettings.flush());
