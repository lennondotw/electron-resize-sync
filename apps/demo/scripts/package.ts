// Packages the demo as a portable zip for a platform, in a baseline and a
// "patched" (resize deadline switches baked in) variant, to see whether the
// resize problem exists on Windows and Linux.
//
// On Windows and Linux there is no framework binary patch (that is macOS
// only); the patched variant only sets --deadline-to-synchronize-surfaces.
// A resize there embeds the page with a deadline of 0 and never uses that
// switch, so the variant is expected to resize like baseline (see
// docs/research/2026-09-24/aura-resize-deadline.md).
//
// usage: package.ts --platform win32|linux|darwin --arch x64|arm64
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { packager, type Options } from "@electron/packager";

const { values } = parseArgs({
  options: {
    platform: { type: "string" },
    arch: { type: "string", default: "x64" },
  },
});
if (!values.platform) throw new Error("Usage: package.ts --platform <win32|linux|darwin> [--arch]");
const platform = values.platform as Options["platform"];
const arch = values.arch as Options["arch"];

const demoDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(demoDir, "../..");
const electronVersion = JSON.parse(
  await readFile(path.join(repoRoot, "node_modules/electron/package.json"), "utf8"),
).version as string;
const outDir = path.join(repoRoot, "tmp", "packages");

function run(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: repoRoot,
      env: env ?? process.env,
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${code}`))));
  });
}

for (const variant of ["baseline", "patched"] as const) {
  // Build the demo with the switches baked in for the patched variant.
  await run("pnpm", ["--filter", "@electron-resize-sync/demo", "build"], {
    ...process.env,
    ...(variant === "patched" ? { RESIZE_DEADLINE_FORCED: "1" } : {}),
  });

  // A minimal app: the built main/preload/renderer, and a package.json with no
  // dependencies (Vite bundled them), so nothing needs pruning.
  const stage = path.join(outDir, `stage-${variant}`);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  await cp(path.join(demoDir, "dist"), path.join(stage, "dist"), { recursive: true });
  await cp(path.join(demoDir, "dist-electron"), path.join(stage, "dist-electron"), {
    recursive: true,
  });
  const name = `electron-resize-sync-demo-${variant}`;
  await writeFile(
    path.join(stage, "package.json"),
    `${JSON.stringify(
      { name, productName: name, version: "0.0.0", main: "dist-electron/main.js" },
      null,
      2,
    )}\n`,
  );

  const [appPath] = await packager({
    dir: stage,
    out: outDir,
    platform,
    arch,
    electronVersion,
    overwrite: true,
    prune: false,
  });
  if (!appPath) throw new Error("packager returned no path");

  // Zip the packaged directory for distribution.
  const zip = path.join(outDir, `${name}-${platform}-${arch}.zip`);
  await rm(zip, { force: true });
  await run("sh", [
    "-c",
    `cd "${path.dirname(appPath)}" && zip -qry "${zip}" "${path.basename(appPath)}"`,
  ]);
  await rm(stage, { recursive: true, force: true });
  console.log(`\n${variant}: ${zip}`);
}
