// The Electron builds the patch knows, and exactly what it changes in each.
// A build is identified by the UUID of its Electron Framework binary for one
// architecture; nothing is written unless the UUID and the original bytes
// match. To add a build, find its patch sites from the release's symbols with
// experiments/tools/deadline-patch/find-sites.ts.

export type Arch = "arm64" | "x64";

export interface PatchSite {
  /** The function, as named in the release's breakpad symbols. */
  symbol: string;
  /** File offset within the framework's slice for this architecture. */
  offset: number;
  /** Little-endian instruction words before patching. */
  original: number[];
  /** The words written in their place. */
  patched: number[];
  why: string;
}

export interface KnownBuild {
  electron: string;
  arch: Arch;
  /** LC_UUID of the Electron Framework slice. */
  uuid: string;
  sites: PatchSite[];
}

const MOV_W0_1 = 0x52800020;
const RET = 0xd65f03c0;

export const KNOWN_BUILDS: KnownBuild[] = [
  {
    electron: "44.4.5",
    arch: "arm64",
    uuid: "4C4C44ED-5555-3144-A1CB-427AA45E6F33",
    sites: [
      {
        symbol: "content::BrowserCompositorMac::GetResizeDeadlinePolicy() const",
        offset: 0x4eb17bc,
        // ldr x9, [x0, #0x28] — then the inlined ShouldUseDefaultDeadlineOnResize() test.
        original: [0xf9401409],
        // b +0x14: straight to the branch that returns cc::DeadlinePolicy::UseDefaultDeadline().
        patched: [0x14000005],
        why: "resize embeds the renderer surface with the default deadline instead of 0",
      },
      {
        symbol: "content::RenderWidgetHostViewMac::ShouldUseDefaultDeadlineOnResize() const",
        offset: 0x4eb3708,
        original: [0x3955c008, 0x36000068],
        patched: [MOV_W0_1, RET],
        why: "other callers see the same answer",
      },
      {
        symbol:
          "non-virtual thunk to content::RenderWidgetHostViewMac::ShouldUseDefaultDeadlineOnResize() const",
        offset: 0x4eb3728,
        original: [0x394f4008, 0x36000068],
        patched: [MOV_W0_1, RET],
        why: "the same, through the DelegatedFrameHostClient interface",
      },
    ],
  },
];

/** The known build for `uuid` and `arch`, if any. */
export function findBuild(uuid: string, arch: Arch) {
  return KNOWN_BUILDS.find((build) => build.uuid === uuid && build.arch === arch);
}
