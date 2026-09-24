// Builds a copy of the installed Electron whose web contents wait for the
// renderer's new-size frame on resize, with the patch from
// @electron-resize-sync/resize-deadline. The copy lives under tmp/;
// node_modules is never modified. See README.md.
import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { patchElectronFramework } from "@electron-resize-sync/resize-deadline/patch";

const exec = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../..");
const workDir = path.join(repoRoot, "tmp", "deadline-patch");
const distDir = path.join(workDir, "dist");
const appPath = path.join(distDir, "Electron.app");

const version = JSON.parse(
  await readFile(path.join(repoRoot, "node_modules/electron/package.json"), "utf8"),
).version as string;
const symbolsZip = path.join(workDir, `electron-v${version}-darwin-arm64-symbols.zip`);

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
await exec("ditto", [path.join(repoRoot, "node_modules/electron/dist/Electron.app"), appPath]);

await patchElectronFramework({ appPath, symbolsZip });

// Experiment only: its own identity, so the system and automation tools that
// find apps by bundle identifier do not mistake it for (or launch) the stock
// Electron.
const plist = path.join(appPath, "Contents/Info.plist");
const identity = {
  CFBundleIdentifier: "com.github.Electron.deadline-patch",
  CFBundleName: "Electron Deadline Patch",
  CFBundleDisplayName: "Electron Deadline Patch",
};
for (const [key, value] of Object.entries(identity)) {
  await exec("plutil", ["-replace", key, "-string", value, plist]);
}

// Patching invalidates the signature; re-sign the copy ad hoc so it launches.
await exec("codesign", ["--force", "--deep", "--sign", "-", appPath]);
console.log(`Patched Electron ${version} at ${distDir}`);
console.log(`Launch it with ELECTRON_OVERRIDE_DIST_PATH=${distDir}`);
