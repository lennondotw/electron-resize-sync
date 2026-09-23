import { TITLEBAR_HEIGHT, TRAFFIC_LIGHTS_INSET } from "../shared/titlebar.ts";

// The main process hides the native title bar only on macOS.
const hasHiddenTitleBar = navigator.userAgent.includes("Macintosh");

/**
 * Stands in for the transparent native title bar: reserves its height in the
 * layout, leaves room for the window buttons, and lets the window be dragged.
 */
export function TitleBar({ title }: { title: string }) {
  if (!hasHiddenTitleBar) return null;

  return (
    <header
      className="relative flex shrink-0 items-center select-none [-webkit-app-region:drag]"
      style={{ height: TITLEBAR_HEIGHT }}
    >
      <div className="shrink-0" style={{ width: TRAFFIC_LIGHTS_INSET }} />
      <h1 className="truncate text-xs font-medium text-zinc-500">{title}</h1>
    </header>
  );
}
