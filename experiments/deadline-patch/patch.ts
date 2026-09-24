// Builds a copy of the installed Electron whose web contents wait for the
// renderer's new-size frame on resize, instead of Chromium's deadline of 0.
// The copy lives under tmp/; node_modules is never modified. See README.md.
import { execFile } from "node:child_process";
import { access, mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../..");
const workDir = path.join(repoRoot, "tmp", "deadline-patch");
const distDir = path.join(workDir, "dist");

const version = JSON.parse(
  await readFile(path.join(repoRoot, "node_modules/electron/package.json"), "utf8"),
).version as string;
const symbolsZip = path.join(workDir, `electron-v${version}-darwin-arm64-symbols.zip`);
const frameworkRelative =
  "Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework";

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

await mkdir(workDir, { recursive: true });
try {
  await access(symbolsZip);
} catch {
  console.log(`Downloading ${path.basename(symbolsZip)} from the Electron release…`);
  await exec(
    "gh",
    [
      "release",
      "download",
      `v${version}`,
      "-R",
      "electron/electron",
      "-p",
      path.basename(symbolsZip),
      "-D",
      workDir,
    ],
    { maxBuffer: 1 << 20 },
  );
}

// Fresh copy of the installed Electron.app; ditto keeps the framework symlinks.
await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await exec("ditto", [
  path.join(repoRoot, "node_modules/electron/dist/Electron.app"),
  path.join(distDir, "Electron.app"),
]);
const framework = path.join(distDir, frameworkRelative);

// The symbols must describe exactly this binary.
const { stdout: uuidOut } = await exec("dwarfdump", ["--uuid", framework]);
const uuid = /UUID: ([0-9A-F-]+) \(arm64\)/.exec(uuidOut)?.[1]?.replaceAll("-", "");
if (!uuid) throw new Error(`No arm64 UUID in ${uuidOut}`);
const symPath = `breakpad_symbols/Electron Framework/${uuid}0/Electron Framework.sym`;
const { stdout: listing } = await exec("unzip", ["-l", symbolsZip, symPath], {
  maxBuffer: 1 << 20,
});
if (!listing.includes(symPath)) throw new Error(`Symbols for UUID ${uuid} not in ${symbolsZip}`);

// Stream the ~700 MB symbol file and keep only the FUNC records we need.
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

const file = await open(framework, "r+");
try {
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
    const bytes = Buffer.alloc(patch.replacement.length * 4);
    patch.replacement.forEach((word, i) => bytes.writeUInt32LE(word, i * 4));
    await file.write(bytes, 0, bytes.length, at);
    console.log(`Patched 0x${at.toString(16)} ${patch.symbol}: ${patch.why}`);
  }
} finally {
  await file.close();
}

// Its own identity, so the system and automation tools that find apps by
// bundle identifier do not mistake it for (or launch) the stock Electron.
const plist = path.join(distDir, "Electron.app/Contents/Info.plist");
const identity = {
  CFBundleIdentifier: "com.github.Electron.deadline-patch",
  CFBundleName: "Electron Deadline Patch",
  CFBundleDisplayName: "Electron Deadline Patch",
};
for (const [key, value] of Object.entries(identity)) {
  await exec("plutil", ["-replace", key, "-string", value, plist]);
}

// Patching invalidates the signature; re-sign the copy ad hoc so it launches.
await exec("codesign", ["--force", "--deep", "--sign", "-", path.join(distDir, "Electron.app")]);
console.log(`Patched Electron ${version} at ${distDir}`);
console.log(`Launch it with ELECTRON_OVERRIDE_DIST_PATH=${distDir}`);
