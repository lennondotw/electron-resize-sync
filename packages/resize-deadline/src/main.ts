import { app } from "electron";

/**
 * Sets the two switches option D needs, from the app. They take effect only
 * with an Electron that waits for the page on resize: patched with
 * `patchElectronFramework` (./patch) or built with
 * electron-v44.4.5-resize-deadline.patch.
 *
 * - `--deadline-to-synchronize-surfaces=<frames>`: how many display frames a
 *   resize may wait for the page's frame at the new size. It must cover the
 *   page's slowest frame; 30 frames is 250 ms at 120 Hz.
 * - `--disable-features=RemoteCoreAnimationAPI`: the browser process presents
 *   GPU output itself, which removes a race between the GPU and browser
 *   processes' Core Animation commits.
 *
 * Must run before the app is ready. On an unpatched Electron the switches do
 * nothing for resizing, and disabling RemoteCoreAnimationAPI costs power.
 */
export function enableResizeDeadline({ frames = 30 }: { frames?: number } = {}) {
  if (app.isReady()) throw new Error("enableResizeDeadline must run before the app is ready");
  app.commandLine.appendSwitch("deadline-to-synchronize-surfaces", String(frames));
  app.commandLine.appendSwitch("disable-features", "RemoteCoreAnimationAPI");
}
