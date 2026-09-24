import { app } from "electron";
import { readFrameworkStatus, runningAppFramework, type FrameworkStatus } from "./framework.ts";

/** Whether the running Electron waits for the page on resize, and why. */
export function getResizeDeadlineStatus(): FrameworkStatus {
  try {
    return readFrameworkStatus(runningAppFramework());
  } catch (error) {
    return { supported: false, patched: false, reason: `could not read framework: ${error}` };
  }
}

/**
 * Turns on option D when the running Electron can do it: a resize waits for
 * the page's frame at the new size, so the window and its content change
 * together.
 *
 * It sets two switches:
 * - `--deadline-to-synchronize-surfaces=<frames>`: how many display frames a
 *   resize may wait for the page's frame (must cover the page's slowest
 *   frame; 30 is 250 ms at 120 Hz).
 * - `--disable-features=RemoteCoreAnimationAPI`: the browser process presents
 *   GPU output itself, removing a race between the two processes' Core
 *   Animation commits.
 *
 * The switches only do something on an Electron whose framework has been
 * patched to use a deadline on resize (see `./patch` and this package's
 * README). On any other build this does nothing — no switches, so no power
 * cost from disabling RemoteCoreAnimationAPI — and returns why. Passing
 * `force: true` sets the switches anyway (for a source-patched Electron this
 * package cannot recognise by UUID).
 *
 * Must run before the app is ready.
 */
export function enableResizeDeadline({
  frames = 30,
  force = false,
  log = (message: string) => console.warn(`[resize-deadline] ${message}`),
}: {
  frames?: number;
  force?: boolean;
  log?: (message: string) => void;
} = {}): FrameworkStatus {
  if (app.isReady()) throw new Error("enableResizeDeadline must run before the app is ready");
  const status = getResizeDeadlineStatus();
  if (!status.patched && !force) {
    log(`not enabled: ${status.reason ?? "framework not patched"}. See the package README.`);
    return status;
  }
  app.commandLine.appendSwitch("deadline-to-synchronize-surfaces", String(frames));
  // RemoteCoreAnimationAPI is a macOS-only feature; disabling it elsewhere does
  // nothing, so only touch it there.
  if (process.platform === "darwin") {
    app.commandLine.appendSwitch("disable-features", "RemoteCoreAnimationAPI");
  }
  return status;
}

export type { FrameworkStatus } from "./framework.ts";
