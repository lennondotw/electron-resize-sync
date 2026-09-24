// Locating an Electron.app's framework binary and reading whether it is a
// build this package can patch, and whether it is already patched.
import { closeSync, openSync, readSync } from "node:fs";
import path from "node:path";
import { findBuild, type Arch, type KnownBuild } from "./builds.ts";
import { readSlice } from "./macho.ts";

/** The framework binary inside an Electron.app bundle, from the bundle root. */
export const FRAMEWORK_IN_APP =
  "Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework";

/**
 * The running app's framework binary. `process.execPath` is
 * `MyApp.app/Contents/MacOS/MyApp`, so the framework is one level up in
 * `Contents/Frameworks/…`.
 */
export function runningAppFramework() {
  return path.join(
    path.dirname(process.execPath),
    "..",
    "Frameworks",
    "Electron Framework.framework",
    "Versions",
    "A",
    "Electron Framework",
  );
}

/** The architecture this Node/Electron process runs as, when the patch knows it. */
export function currentArch(): Arch | undefined {
  if (process.arch === "arm64") return "arm64";
  if (process.arch === "x64") return "x64";
  return undefined;
}

export interface FrameworkStatus {
  /** The build's Electron version, when it is one this package knows. */
  electron?: string;
  arch?: Arch;
  uuid?: string;
  /** True when the framework is a build this package has patch sites for. */
  supported: boolean;
  /** True when every site already holds its patched bytes. */
  patched: boolean;
  /** Why it is not supported or not patched, for a log line. */
  reason?: string;
}

function readWords(fd: number, position: number, count: number) {
  const buffer = Buffer.alloc(count * 4);
  if (readSync(fd, buffer, 0, buffer.length, position) !== buffer.length) {
    throw new Error(`Short read at ${position}`);
  }
  return Array.from({ length: count }, (_, i) => buffer.readUInt32LE(i * 4));
}

const equal = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Whether `build`'s sites in `framework` (at `sliceOffset`) are original or patched. */
function sitesState(framework: string, sliceOffset: number, build: KnownBuild) {
  const fd = openSync(framework, "r");
  try {
    let patched = true;
    let original = true;
    for (const site of build.sites) {
      const words = readWords(fd, sliceOffset + site.offset, site.original.length);
      if (!equal(words, site.patched)) patched = false;
      if (!equal(words, site.original)) original = false;
    }
    return { patched, original };
  } finally {
    closeSync(fd);
  }
}

/** Reads whether `framework` is a known build and whether it is patched. */
export function readFrameworkStatus(framework: string): FrameworkStatus {
  const arch = currentArch();
  if (!arch)
    return { supported: false, patched: false, reason: `unsupported arch ${process.arch}` };
  if (process.platform !== "darwin") {
    return { supported: false, patched: false, reason: `unsupported platform ${process.platform}` };
  }
  let slice;
  try {
    slice = readSlice(framework, arch);
  } catch (error) {
    return { supported: false, patched: false, arch, reason: `unreadable framework: ${error}` };
  }
  if (!slice) return { supported: false, patched: false, arch, reason: "no slice for this arch" };
  const build = findBuild(slice.uuid, arch);
  if (!build) {
    return { supported: false, patched: false, arch, uuid: slice.uuid, reason: "unknown build" };
  }
  const { patched, original } = sitesState(framework, slice.offset, build);
  return {
    electron: build.electron,
    arch,
    uuid: slice.uuid,
    supported: true,
    patched,
    reason: patched ? undefined : original ? "not patched" : "patch sites altered",
  };
}
