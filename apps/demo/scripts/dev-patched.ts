// `pnpm dev` with resize deadline. On macOS: the demo on the patched Electron
// copy, with the switches the patch needs; the copy is built first when it is
// missing or was made from another Electron version (see
// experiments/tools/deadline-patch). Elsewhere there is no framework patch, so
// this runs stock Electron with the switch forced on, like the "patched"
// Windows and Linux packages; a resize there does not use it (see
// docs/research/2026-09-24/aura-resize-deadline.md).
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const distDir = path.join(repoRoot, "tmp", "deadline-patch", "dist");
const patchScript = path.join(repoRoot, "experiments", "tools", "deadline-patch", "patch.ts");

const readJson = async (file: string) =>
  JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
const electronVersion = (
  await readJson(path.join(repoRoot, "node_modules", "electron", "package.json"))
)["version"];
const patchedVersion = await readJson(path.join(distDir, "patched.json")).then(
  (stamp) => stamp["electron"],
  () => undefined,
);

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

const frames = process.env["ELECTRON_RESIZE_SYNC_DEADLINE_FRAMES"] ?? "30";

if (process.platform !== "darwin") {
  await run(process.execPath, [path.join(import.meta.dirname, "dev.ts")], {
    ...process.env,
    RESIZE_DEADLINE_FORCED: "1",
    ELECTRON_RESIZE_SYNC_DEADLINE_FRAMES: frames,
  });
  process.exit(0);
}

if (patchedVersion !== electronVersion) {
  console.log(
    patchedVersion === undefined
      ? "No patched Electron copy yet; building it (the first run downloads the release's symbols)…"
      : `The patched copy is of Electron ${String(patchedVersion)}, not ${String(electronVersion)}; rebuilding it…`,
  );
  // The development condition loads the resize-deadline package from its
  // sources, so the package does not need a build first.
  await run(process.execPath, ["--conditions=development", patchScript]);
}

await run(process.execPath, [path.join(import.meta.dirname, "dev.ts")], {
  ...process.env,
  ELECTRON_OVERRIDE_DIST_PATH: distDir,
  ELECTRON_RESIZE_SYNC_DEADLINE_FRAMES: frames,
});
