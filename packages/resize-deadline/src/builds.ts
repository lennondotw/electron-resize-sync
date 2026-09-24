// The Electron builds the resize deadline patch knows, and where to patch each.
// A build is identified by its framework binary's UUID, so a copy of a known
// version that differs in any byte is not patched. Offsets and bytes are per
// architecture; find them for a new build with
// experiments/tools/deadline-patch/find-sites.ts.

export type Arch = "arm64" | "x64";

export interface PatchSite {
  /** The function the site is in, for messages. */
  symbol: string;
  /** Byte offset within the architecture's slice of the framework binary. */
  offset: number;
  /** The bytes expected before patching. */
  original: number[];
  /** The bytes written to patch. */
  patched: number[];
  why: string;
}

export interface KnownBuild {
  electron: string;
  arch: Arch;
  /** LC_UUID of the framework binary's slice for `arch`. */
  uuid: string;
  sites: PatchSite[];
}

export const KNOWN_BUILDS: KnownBuild[] = [
  {
    electron: "44.4.5",
    arch: "arm64",
    uuid: "4C4C44ED-5555-3144-A1CB-427AA45E6F33",
    sites: [
      {
        symbol: "content::BrowserCompositorMac::GetResizeDeadlinePolicy() const",
        offset: 0x4eb17bc,
        // ldr x9, [x0, #0x28] — first instruction, before the inlined
        // ShouldUseDefaultDeadlineOnResize() test.
        original: [0x09, 0x14, 0x40, 0xf9],
        // b +0x14: straight to the branch that returns UseDefaultDeadline().
        patched: [0x05, 0x00, 0x00, 0x14],
        why: "resize embeds the renderer surface with the default deadline instead of 0",
      },
      {
        symbol: "content::RenderWidgetHostViewMac::ShouldUseDefaultDeadlineOnResize() const",
        offset: 0x4eb3708,
        // ldrb w8, [x0, #0x570] … — replaced with mov w0, #1; ret.
        original: [0x08, 0xc0, 0x55, 0x39, 0x68, 0x00, 0x00, 0x36],
        patched: [0x20, 0x00, 0x80, 0x52, 0xc0, 0x03, 0x5f, 0xd6],
        why: "other callers see the same answer",
      },
      {
        symbol:
          "non-virtual thunk to content::RenderWidgetHostViewMac::ShouldUseDefaultDeadlineOnResize() const",
        offset: 0x4eb3728,
        original: [0x08, 0x40, 0x4f, 0x39, 0x68, 0x00, 0x00, 0x36],
        patched: [0x20, 0x00, 0x80, 0x52, 0xc0, 0x03, 0x5f, 0xd6],
        why: "the same, through the DelegatedFrameHostClient interface",
      },
    ],
  },
  {
    electron: "44.4.5",
    arch: "x64",
    uuid: "4C4C4491-5555-3144-A17D-F5CE8CEC77BE",
    sites: [
      {
        symbol: "content::BrowserCompositorMac::GetResizeDeadlinePolicy() const",
        offset: 0x596f1c4,
        // jne <use-default path>, after the inlined ShouldUseDefaultDeadlineOnResize()
        // test — flipped to jmp so the default-deadline path is always taken.
        original: [0x75, 0x0a],
        patched: [0xeb, 0x0a],
        why: "resize embeds the renderer surface with the default deadline instead of 0",
      },
      {
        symbol: "content::RenderWidgetHostViewMac::ShouldUseDefaultDeadlineOnResize() const",
        offset: 0x5971070,
        // push rbp; mov rbp, rsp … — replaced with mov al, 1; ret.
        original: [0x55, 0x48, 0x89],
        patched: [0xb0, 0x01, 0xc3],
        why: "other callers see the same answer",
      },
      {
        symbol:
          "non-virtual thunk to content::RenderWidgetHostViewMac::ShouldUseDefaultDeadlineOnResize() const",
        offset: 0x5971090,
        original: [0x55, 0x48, 0x89],
        patched: [0xb0, 0x01, 0xc3],
        why: "the same, through the DelegatedFrameHostClient interface",
      },
    ],
  },
];

/** The known build for `uuid` and `arch`, if any. */
export function findBuild(uuid: string, arch: Arch) {
  return KNOWN_BUILDS.find((build) => build.uuid === uuid && build.arch === arch);
}
