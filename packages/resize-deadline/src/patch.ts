// Patches an Electron.app so that resizing a web contents view waits for the
// renderer's frame at the new size (surface synchronisation with the default
// deadline) instead of Chromium's hard-coded deadline of 0. It rewrites a few
// instruction words at known offsets in a known build, identified by the
// framework's UUID, so no symbols are needed. See README.md.
import { open } from "node:fs/promises";
import path from "node:path";
import { findBuild, KNOWN_BUILDS, type Arch } from "./builds.ts";
import { FRAMEWORK_IN_APP } from "./framework.ts";
import { readSlice } from "./macho.ts";

export { FRAMEWORK_IN_APP } from "./framework.ts";
export { KNOWN_BUILDS, type Arch } from "./builds.ts";

/** The Electron builds this package can patch, for a caller to check first. */
export function knownBuilds() {
  return KNOWN_BUILDS.map(({ electron, arch, uuid }) => ({ electron, arch, uuid }));
}

const equal = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Patches the framework of the Electron.app at `appPath`, in place. The
 * architectures default to the slices the binary has among the known builds;
 * on a universal build pass `arches` to choose. A slice whose UUID is not a
 * known build, or whose bytes are neither the expected original nor already
 * patched, throws before anything is written.
 *
 * The signature is invalid afterwards: sign the app again (ad hoc for local
 * use, or with the app's identity, e.g. in an electron-builder afterPack hook).
 */
export async function patchElectronFramework({
  appPath,
  arches,
  log = () => {},
}: {
  appPath: string;
  arches?: Arch[];
  log?: (message: string) => void;
}) {
  const framework = path.join(appPath, FRAMEWORK_IN_APP);
  const targets = [];
  for (const arch of arches ?? (["arm64", "x64"] as Arch[])) {
    const slice = readSlice(framework, arch);
    if (!slice) {
      if (arches) throw new Error(`No ${arch} slice in ${framework}`);
      continue;
    }
    const build = findBuild(slice.uuid, arch);
    if (!build) throw new Error(`Unknown ${arch} build ${slice.uuid}; not one of knownBuilds()`);
    targets.push({ arch, sliceOffset: slice.offset, build });
  }
  if (targets.length === 0) throw new Error(`No known Electron slice in ${framework}`);

  const file = await open(framework, "r+");
  try {
    // Check every site of every target before writing any of them.
    for (const { arch, sliceOffset, build } of targets) {
      for (const site of build.sites) {
        const at = sliceOffset + site.offset;
        const current = Buffer.alloc(site.original.length * 4);
        await file.read(current, 0, current.length, at);
        const words = Array.from({ length: site.original.length }, (_, i) =>
          current.readUInt32LE(i * 4),
        );
        if (equal(words, site.patched)) continue;
        if (!equal(words, site.original)) {
          throw new Error(
            `${arch} ${site.symbol} at 0x${at.toString(16)}: unexpected bytes ${words.map((w) => w.toString(16))}`,
          );
        }
      }
    }
    for (const { arch, sliceOffset, build } of targets) {
      for (const site of build.sites) {
        const at = sliceOffset + site.offset;
        const bytes = Buffer.alloc(site.patched.length * 4);
        site.patched.forEach((word: number, i: number) => bytes.writeUInt32LE(word, i * 4));
        await file.write(bytes, 0, bytes.length, at);
        log(`Patched ${arch} 0x${at.toString(16)} ${site.symbol}: ${site.why}`);
      }
    }
  } finally {
    await file.close();
  }
  return { arches: targets.map((t) => t.arch), electron: targets[0]!.build.electron };
}
