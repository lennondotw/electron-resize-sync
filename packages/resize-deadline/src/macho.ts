// Just enough Mach-O reading to locate an architecture's slice in a (possibly
// universal) binary and read its LC_UUID load command. Synchronous, so the
// main process can check its own framework at startup without Xcode tools.
import { closeSync, openSync, readSync } from "node:fs";
import type { Arch } from "./builds.ts";

const FAT_MAGIC = 0xcafebabe;
const FAT_MAGIC_64 = 0xcafebabf;
const MH_MAGIC_64 = 0xfeedfacf;
const LC_UUID = 0x1b;
/** Mach-O cpu type per architecture (the low bits; the 64-bit flag is set). */
const CPU_TYPE: Record<Arch, number> = { x64: 0x01000007, arm64: 0x0100000c };

export interface Slice {
  /** Where the architecture's Mach-O image starts in the file. */
  offset: number;
  /** Its LC_UUID, upper-case with dashes, like `dwarfdump --uuid`. */
  uuid: string;
}

function readAt(fd: number, position: number, length: number) {
  const buffer = Buffer.alloc(length);
  if (readSync(fd, buffer, 0, length, position) !== length) {
    throw new Error(`Short read of ${length} at ${position}`);
  }
  return buffer;
}

/** Offset of the slice for `arch`, from a fat header or a thin file. */
function sliceOffset(fd: number, arch: Arch): number | undefined {
  const head = readAt(fd, 0, 4);
  // A thin Mach-O stores its magic little-endian; a fat header big-endian.
  if (head.readUInt32LE(0) === MH_MAGIC_64) {
    return readAt(fd, 4, 4).readUInt32LE(0) === CPU_TYPE[arch] ? 0 : undefined;
  }
  const magic = head.readUInt32BE(0);
  if (magic !== FAT_MAGIC && magic !== FAT_MAGIC_64) return undefined;
  const wide = magic === FAT_MAGIC_64;
  const count = readAt(fd, 4, 4).readUInt32BE(0);
  const entrySize = wide ? 32 : 20;
  const entries = readAt(fd, 8, count * entrySize);
  for (let i = 0; i < count; i++) {
    const at = i * entrySize;
    if (entries.readUInt32BE(at) !== CPU_TYPE[arch]) continue;
    return wide ? Number(entries.readBigUInt64BE(at + 8)) : entries.readUInt32BE(at + 8);
  }
  return undefined;
}

/** Reads the LC_UUID out of a 64-bit Mach-O image starting at `base`. */
function readUuid(fd: number, base: number): string {
  const header = readAt(fd, base, 32);
  if (header.readUInt32LE(0) !== MH_MAGIC_64) throw new Error("Not a 64-bit Mach-O slice");
  const commandCount = header.readUInt32LE(16);
  let position = base + 32;
  for (let i = 0; i < commandCount; i++) {
    const command = readAt(fd, position, 8);
    const kind = command.readUInt32LE(0);
    const size = command.readUInt32LE(4);
    if (kind === LC_UUID) {
      const bytes = readAt(fd, position + 8, 16)
        .toString("hex")
        .toUpperCase();
      return [
        bytes.slice(0, 8),
        bytes.slice(8, 12),
        bytes.slice(12, 16),
        bytes.slice(16, 20),
        bytes.slice(20),
      ].join("-");
    }
    position += size;
  }
  throw new Error("No LC_UUID in Mach-O slice");
}

/** The slice for `arch`, or undefined when the binary has none. */
export function readSlice(file: string, arch: Arch): Slice | undefined {
  const fd = openSync(file, "r");
  try {
    const offset = sliceOffset(fd, arch);
    return offset === undefined ? undefined : { offset, uuid: readUuid(fd, offset) };
  } finally {
    closeSync(fd);
  }
}
