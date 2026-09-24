// Maintainer tool: finds the patch sites for an Electron build and prints a
// KNOWN_BUILDS entry for packages/resize-deadline/src/builds.ts. Run it once
// per Electron version and architecture to add support; the package then
// patches that build from the table, without symbols.
//
// usage: find-sites.ts <Electron.app> <symbols.zip> [--arch arm64|x64]
import { execFile } from "node:child_process";
import { open } from "node:fs/promises";
import path from "node:path";
import { parseArgs, promisify } from "node:util";
import { FRAMEWORK_IN_APP } from "@electron-resize-sync/resize-deadline/patch";
import { readSlice } from "../../../packages/resize-deadline/src/macho.ts";

const exec = promisify(execFile);
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { arch: { type: "string", default: "arm64" } },
});
const [appPath, symbolsZip] = positionals;
const arch = values.arch as "arm64" | "x64";
if (!appPath || !symbolsZip) {
  throw new Error("Usage: find-sites.ts <Electron.app> <symbols.zip> [--arch arm64|x64]");
}

// The three functions to rewrite, and how (see docs/research/…/shipping-option-d.md).
const MOV_W0_1 = 0x52800020;
const RET = 0xd65f03c0;
const SITES = [
  {
    symbol: "content::BrowserCompositorMac::GetResizeDeadlinePolicy() const",
    original: [0xf9401409],
    patched: [0x14000005],
    why: "resize embeds the renderer surface with the default deadline instead of 0",
  },
  {
    symbol: "content::RenderWidgetHostViewMac::ShouldUseDefaultDeadlineOnResize() const",
    original: [0x3955c008, 0x36000068],
    patched: [MOV_W0_1, RET],
    why: "other callers see the same answer",
  },
  {
    symbol:
      "non-virtual thunk to content::RenderWidgetHostViewMac::ShouldUseDefaultDeadlineOnResize() const",
    original: [0x394f4008, 0x36000068],
    patched: [MOV_W0_1, RET],
    why: "the same, through the DelegatedFrameHostClient interface",
  },
];

const framework = path.join(appPath, FRAMEWORK_IN_APP);
const slice = readSlice(framework, arch);
if (!slice) throw new Error(`No ${arch} slice in ${framework}`);
const version = JSON.parse(
  await (
    await open(
      path.join(appPath, "Contents/Frameworks/Electron Framework.framework/Resources/Info.plist"),
    )
  )
    .readFile("utf8")
    .catch(() => "{}"),
) as { CFBundleVersion?: string };

// Symbols are named by UUID with no dashes and a trailing 0.
const symId = slice.uuid.replaceAll("-", "") + "0";
const symPath = `breakpad_symbols/Electron Framework/${symId}/Electron Framework.sym`;
const wanted = new Set(SITES.map((s) => s.symbol));
const { stdout } = await exec(
  "sh",
  [
    "-c",
    `unzip -p "${symbolsZip}" "${symPath}" | grep -F -e "${[...wanted].join('" -e "')}" | grep "^FUNC "`,
  ],
  { maxBuffer: 1 << 24 },
);
const address = new Map<string, number>();
for (const line of stdout.split("\n")) {
  const match = /^FUNC ([0-9a-f]+) [0-9a-f]+ [0-9a-f]+ (.+)$/.exec(line);
  if (match && wanted.has(match[2]!)) address.set(match[2]!, Number.parseInt(match[1]!, 16));
}

// Verify the original bytes at each site before printing, so a wrong build is caught.
const file = await open(framework, "r");
const sites = [];
try {
  for (const site of SITES) {
    const found = address.get(site.symbol);
    if (found === undefined) throw new Error(`Symbol not found: ${site.symbol}`);
    // __TEXT starts at file offset 0 for the slice, so a symbol address is the offset.
    const at = slice.offset + found;
    const current = Buffer.alloc(site.original.length * 4);
    await file.read(current, 0, current.length, at);
    const words = Array.from({ length: site.original.length }, (_, i) =>
      current.readUInt32LE(i * 4),
    );
    if (words.join() !== site.original.join()) {
      throw new Error(
        `${site.symbol} at 0x${found.toString(16)}: bytes are not the expected original`,
      );
    }
    sites.push({ ...site, offset: found });
  }
} finally {
  await file.close();
}

const hex = (words: number[]) => `[${words.map((w) => `0x${w.toString(16)}`).join(", ")}]`;
console.log(`  {
    electron: ${JSON.stringify(version.CFBundleVersion ?? "UNKNOWN")},
    arch: ${JSON.stringify(arch)},
    uuid: ${JSON.stringify(slice.uuid)},
    sites: [`);
for (const site of sites) {
  console.log(`      {
        symbol: ${JSON.stringify(site.symbol)},
        offset: 0x${site.offset.toString(16)},
        original: ${hex(site.original)},
        patched: ${hex(site.patched)},
        why: ${JSON.stringify(site.why)},
      },`);
}
console.log("    ],\n  },");
