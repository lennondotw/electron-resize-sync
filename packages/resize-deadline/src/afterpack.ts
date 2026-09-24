// An electron-builder afterPack hook that patches the packaged app's Electron
// framework. electron-builder signs the app after afterPack on macOS, so the
// patch does not need to re-sign; without electron-builder, sign the app
// yourself afterwards.
import path from "node:path";
import { patchElectronFramework } from "./patch.ts";
import type { Arch } from "./builds.ts";

/** The subset of electron-builder's AfterPackContext this hook uses. */
interface AfterPackContext {
  appOutDir: string;
  packager: { appInfo: { productFilename: string } };
  electronPlatformName: string;
  arch?: number;
}

// electron-builder's Arch enum: ia32=0, x64=1, armv7l=2, arm64=3, universal=4.
const ARCH: Record<number, Arch | "universal"> = { 1: "x64", 3: "arm64", 4: "universal" };

/**
 * Patches the app electron-builder just packed, when it is a macOS build this
 * package knows. Returns the architectures patched (empty when it skipped, so
 * the build still succeeds on an unsupported platform or Electron version).
 *
 * ```js
 * // electron-builder.config.js
 * import { afterPack } from "@electron-resize-sync/resize-deadline/afterpack";
 * export default { mac: { /* … *\/ }, afterPack };
 * ```
 *
 * Also call `enableResizeDeadline()` at runtime to set the switches.
 */
export async function afterPack(context: AfterPackContext) {
  if (context.electronPlatformName !== "darwin") return { arches: [] as Arch[] };
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const arch = context.arch === undefined ? undefined : ARCH[context.arch];
  try {
    const result = await patchElectronFramework({
      appPath: app,
      arches: arch && arch !== "universal" ? [arch] : undefined,
      log: (message) => console.log(`[resize-deadline] ${message}`),
    });
    return result;
  } catch (error) {
    // A build electron-builder produced that this package does not know is not
    // a reason to fail packaging; the app just runs without option D.
    console.warn(`[resize-deadline] not patched: ${error}. See the package README.`);
    return { arches: [] as Arch[] };
  }
}
