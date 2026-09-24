// Patches an Electron.app so that resizing a web contents view waits for the
// renderer's frame at the new size (surface synchronisation with the default
// deadline), instead of Chromium's hard-coded deadline of 0. See README.md.
import { execFile } from "node:child_process";
import { open } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** The framework binary inside an Electron.app bundle. */
export const FRAMEWORK_PATH =
  "Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework";

interface Patch {
  symbol: string;
  /** Offset from the start of the function. */
  offset: number;
  /** Little-endian instruction words expected before patching. */
  expected: number[];
  replacement: number[];
  why: string;
}

const MOV_W0_1 = 0x52800020;
const RET = 0xd65f03c0;
/**
 * The bytes are those of Electron 44.4.5 on arm64 (Chromium 152.0.7977.130).
 * Any other build fails the check instead of being patched. The workspace
 * pins Electron to this build (the catalog in pnpm-workspace.yaml), and this
 * package's peer dependency is the same exact version.
 */
const PATCHES: Patch[] = [
  {
    symbol: "content::BrowserCompositorMac::GetResizeDeadlinePolicy() const",
    offset: 0,
    // ldr x9, [x0, #0x28] — then the inlined ShouldUseDefaultDeadlineOnResize() test.
    expected: [0xf9401409],
    // b +0x14: straight to the branch that returns cc::DeadlinePolicy::UseDefaultDeadline().
    replacement: [0x14000005],
    why: "resize embeds the renderer surface with the default deadline instead of 0",
  },
  {
    symbol: "content::RenderWidgetHostViewMac::ShouldUseDefaultDeadlineOnResize() const",
    offset: 0,
    expected: [0x3955c008, 0x36000068],
    replacement: [MOV_W0_1, RET],
    why: "other callers see the same answer",
  },
  {
    symbol:
      "non-virtual thunk to content::RenderWidgetHostViewMac::ShouldUseDefaultDeadlineOnResize() const",
    offset: 0,
    expected: [0x394f4008, 0x36000068],
    replacement: [MOV_W0_1, RET],
    why: "the same, through the DelegatedFrameHostClient interface",
  },
];

/**
 * Patches the framework of the Electron.app at `appPath` in place, using the
 * official breakpad symbols of that exact build (`symbolsZip`, the release's
 * `electron-v<version>-darwin-arm64-symbols.zip`) to find the functions.
 *
 * Checks, before writing anything, that the symbols match the binary's UUID,
 * that symbol addresses are file offsets, and that each function starts with
 * the expected instructions. The signature is invalid afterwards: sign the
 * app again (ad hoc for local use, or with the app's identity).
 *
 * Needs Xcode command-line tools (`dwarfdump`, `otool`) and `unzip`.
 */
export async function patchElectronFramework({
  appPath,
  symbolsZip,
  log = console.log,
}: {
  appPath: string;
  symbolsZip: string;
  log?: (message: string) => void;
}) {
  const framework = path.join(appPath, FRAMEWORK_PATH);

  // The symbols must describe exactly this binary.
  const { stdout: uuidOut } = await exec("dwarfdump", ["--uuid", framework]);
  const uuid = /UUID: ([0-9A-F-]+) \(arm64\)/.exec(uuidOut)?.[1]?.replaceAll("-", "");
  if (!uuid) throw new Error(`No arm64 UUID in ${uuidOut}`);
  const symPath = `breakpad_symbols/Electron Framework/${uuid}0/Electron Framework.sym`;
  const { stdout: listing } = await exec("unzip", ["-l", symbolsZip, symPath], {
    maxBuffer: 1 << 20,
  });
  if (!listing.includes(symPath)) throw new Error(`Symbols for UUID ${uuid} not in ${symbolsZip}`);

  // Stream the ~700 MB symbol file and keep only the FUNC records needed.
  const wanted = new Set(PATCHES.map((p) => p.symbol));
  const addresses = new Map<string, number>();
  const { stdout: funcs } = await exec(
    "sh",
    [
      "-c",
      `unzip -p "${symbolsZip}" "${symPath}" | grep -F -e "${[...wanted].join('" -e "')}" | grep "^FUNC "`,
    ],
    { maxBuffer: 1 << 24 },
  );
  for (const line of funcs.split("\n")) {
    // FUNC <address> <size> <parameter size> <name>
    const match = /^FUNC ([0-9a-f]+) [0-9a-f]+ [0-9a-f]+ (.+)$/.exec(line);
    if (match && wanted.has(match[2]!)) addresses.set(match[2]!, Number.parseInt(match[1]!, 16));
  }

  // __TEXT starts at file offset 0 and vmaddr 0 in this thin arm64 dylib, so a
  // symbol address is also its file offset. Checked before writing anything.
  const { stdout: loadCommands } = await exec("otool", ["-l", framework], { maxBuffer: 1 << 26 });
  if (!/segname __TEXT\n\s+vmaddr 0x0+\n\s+vmsize 0x[0-9a-f]+\n\s+fileoff 0\n/.test(loadCommands)) {
    throw new Error("Unexpected __TEXT layout; symbol addresses are not file offsets");
  }

  // Check every patch site before changing any of them.
  const file = await open(framework, "r+");
  try {
    const sites = [];
    for (const patch of PATCHES) {
      const address = addresses.get(patch.symbol);
      if (address === undefined) throw new Error(`Symbol not found: ${patch.symbol}`);
      const at = address + patch.offset;
      const current = Buffer.alloc(patch.expected.length * 4);
      await file.read(current, 0, current.length, at);
      patch.expected.forEach((word, i) => {
        const found = current.readUInt32LE(i * 4);
        if (found !== word) {
          throw new Error(
            `${patch.symbol} at 0x${at.toString(16)}: expected 0x${word.toString(16)}, found 0x${found.toString(16)}`,
          );
        }
      });
      sites.push({ patch, at });
    }
    for (const { patch, at } of sites) {
      const bytes = Buffer.alloc(patch.replacement.length * 4);
      patch.replacement.forEach((word, i) => bytes.writeUInt32LE(word, i * 4));
      await file.write(bytes, 0, bytes.length, at);
      log(`Patched 0x${at.toString(16)} ${patch.symbol}: ${patch.why}`);
    }
  } finally {
    await file.close();
  }
}
