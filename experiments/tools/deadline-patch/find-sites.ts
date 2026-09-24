// Maintainer tool: locates the three functions the resize deadline patch
// rewrites, in an Electron build's framework, from that release's breakpad
// symbols, and disassembles each. Use its output to hand-author a KNOWN_BUILDS
// entry in packages/resize-deadline/src/builds.ts (the replacement bytes are
// per architecture; see the existing entries and the disassembly).
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

const FUNCTIONS = [
  "content::BrowserCompositorMac::GetResizeDeadlinePolicy() const",
  "content::RenderWidgetHostViewMac::ShouldUseDefaultDeadlineOnResize() const",
  "non-virtual thunk to content::RenderWidgetHostViewMac::ShouldUseDefaultDeadlineOnResize() const",
];

const framework = path.join(appPath, FRAMEWORK_IN_APP);
const slice = readSlice(framework, arch);
if (!slice) throw new Error(`No ${arch} slice in ${framework}`);
const plist = await open(
  path.join(appPath, "Contents/Frameworks/Electron Framework.framework/Resources/Info.plist"),
).then(
  (handle) => handle.readFile("utf8").finally(() => handle.close()),
  () => "",
);
const electron =
  /<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1] ?? "UNKNOWN";

// The symbol file is named by the slice UUID without dashes, plus a trailing 0.
const symId = slice.uuid.replaceAll("-", "") + "0";
const symPath = `breakpad_symbols/Electron Framework/${symId}/Electron Framework.sym`;
const { stdout } = await exec(
  "sh",
  [
    "-c",
    `unzip -p "${symbolsZip}" "${symPath}" | grep -F -e "${FUNCTIONS.join('" -e "')}" | grep "^FUNC "`,
  ],
  { maxBuffer: 1 << 24 },
);
const found = new Map<string, { offset: number; size: number }>();
for (const line of stdout.split("\n")) {
  // FUNC <address> <size> <parameter size> <name>
  const match = /^FUNC ([0-9a-f]+) ([0-9a-f]+) [0-9a-f]+ (.+)$/.exec(line);
  if (match && FUNCTIONS.includes(match[3]!)) {
    found.set(match[3]!, {
      // __TEXT starts at file offset 0 for the slice, so a symbol address is the offset.
      offset: slice.offset + Number.parseInt(match[1]!, 16),
      size: Number.parseInt(match[2]!, 16),
    });
  }
}

console.log(`Electron ${electron}, ${arch}, UUID ${slice.uuid}\n`);
for (const symbol of FUNCTIONS) {
  const site = found.get(symbol);
  if (!site) {
    console.log(`  NOT FOUND: ${symbol}\n`);
    continue;
  }
  console.log(`  ${symbol}\n  offset 0x${site.offset.toString(16)}, ${site.size} bytes`);
  const stop = `0x${(site.offset + site.size).toString(16)}`;
  const disasm = await exec("llvm-objdump", [
    "-d",
    `--start-address=0x${site.offset.toString(16)}`,
    `--stop-address=${stop}`,
    framework,
  ]).then(
    ({ stdout: out }) =>
      out
        .split("\n")
        .filter((l) => /^\s*[0-9a-f]+:/.test(l))
        .join("\n"),
    () => "  (llvm-objdump not available)",
  );
  console.log(`${disasm}\n`);
}
