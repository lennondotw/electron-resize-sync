// Launches the built app in an isolated Electron session for experiments:
// a fresh user data directory, its own debugging ports, and scripted access to
// both the page (Chrome DevTools Protocol) and the main process (Node inspector).
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");

export interface HudSettings {
  busyMs: number;
  playing: boolean;
  dither: boolean;
  resizeSync: boolean;
  yieldOnResize?: boolean;
}

export interface SessionOptions {
  /** Directory under tmp/ that holds this session's profile. */
  runDir: string;
  settings: HudSettings;
  colorScheme?: "light" | "dark";
  /** Extra environment variables for the Electron process. */
  env?: Record<string, string>;
  /** Extra command-line switches for Electron and Chromium, e.g. `--disable-features=X`. */
  args?: string[];
}

export interface Session {
  /** Evaluates an expression in the page and returns its JSON value. */
  page<T>(expression: string): Promise<T>;
  /** Evaluates an expression in the main process, where `require` is available. */
  main<T>(expression: string): Promise<T>;
  /** PNG of the page as rendered by the compositor. */
  screenshot(): Promise<Buffer>;
  close(): Promise<void>;
}

export async function launchSession({
  runDir,
  settings,
  colorScheme,
  env,
  args = [],
}: SessionOptions) {
  await mkdir(runDir, { recursive: true });
  const userDataDir = await mkdtemp(path.join(runDir, "profile-"));
  const [cdpPort, inspectPort] = [await freePort(), await freePort()];

  // In Node, the `electron` package exports the path to the Electron binary.
  const electronBin = (await import("electron")).default as unknown as string;
  const child = spawn(
    electronBin,
    [`--inspect=${inspectPort}`, ".", `--remote-debugging-port=${cdpPort}`, ...args],
    {
      cwd: repoRoot,
      env: { ...process.env, ...env, ELECTRON_RESIZE_SYNC_USER_DATA: userDataDir },
      stdio: "ignore",
    },
  );

  try {
    const main = await connect(await waitForTarget(`http://127.0.0.1:${inspectPort}/json/list`));
    const pageTarget = await waitForTarget(`http://127.0.0.1:${cdpPort}/json/list`, "page");
    const page = await connect(pageTarget);

    const evaluate = async <T>(client: Client, expression: string) => {
      const response = await client.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        includeCommandLineAPI: true,
      });
      const result = response as { result?: { value?: T }; exceptionDetails?: unknown };
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result?.value as T;
    };

    // Start from known settings: write them into the fresh profile and reload.
    await waitFor(() => evaluate<boolean>(page, `!!document.querySelector(".grid")`));
    await evaluate(
      page,
      `localStorage.setItem("hud-settings", ${JSON.stringify(JSON.stringify(settings))}); location.reload()`,
    );
    await waitFor(() => evaluate<boolean>(page, `!!document.querySelector(".grid")`));
    if (colorScheme) {
      await page.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: colorScheme }],
      });
    }
    // rAF stops while the window is covered, so keep it on top and visible.
    await evaluate(
      main,
      `(() => { const win = require("electron").BaseWindow.getAllWindows()[0];
        win.setAlwaysOnTop(true); win.showInactive(); })()`,
    );
    await sleep(1000);

    return {
      page: (expression) => evaluate(page, expression),
      main: (expression) => evaluate(main, expression),
      async screenshot() {
        const shot = (await page.send("Page.captureScreenshot", { format: "png" })) as {
          data: string;
        };
        return Buffer.from(shot.data, "base64");
      },
      async close() {
        page.close();
        main.close();
        await stop(child);
      },
    } satisfies Session;
  } catch (error) {
    await stop(child);
    throw error;
  }
}

/** Facts about the machine, display and build that a result depends on. */
export async function collectEnvironment(session: Session) {
  const [versions, display, git] = await Promise.all([
    session.main<Record<string, string>>(
      `(() => { const { screen } = require("electron"); const d = screen.getPrimaryDisplay();
        return { electron: process.versions.electron, chrome: process.versions.chrome,
          node: process.versions.node, arch: process.arch, platform: process.platform,
          displayScaleFactor: String(d.scaleFactor), displayRefreshRate: String(d.displayFrequency),
          displayColorDepth: String(d.colorDepth), displaySize: d.size.width + "x" + d.size.height }; })()`,
    ),
    session.page<Record<string, unknown>>(
      `({ devicePixelRatio, screenColorDepth: screen.colorDepth,
          colorGamutP3: matchMedia("(color-gamut: p3)").matches,
          dynamicRangeHigh: matchMedia("(dynamic-range: high)").matches })`,
    ),
    Promise.all([
      run("git", ["rev-parse", "HEAD"]),
      run("git", ["status", "--porcelain", "--", "src", "experiments", "package.json"]),
    ]),
  ]);
  const [productVersion, buildVersion, cpu, model] = await Promise.all([
    run("sw_vers", ["-productVersion"]),
    run("sw_vers", ["-buildVersion"]),
    run("sysctl", ["-n", "machdep.cpu.brand_string"]),
    run("sysctl", ["-n", "hw.model"]),
  ]);
  return {
    capturedAt: new Date().toISOString(),
    os: { productVersion, buildVersion },
    hardware: { model, cpu },
    runtime: versions,
    page: display,
    repository: { commit: git[0], dirtyPaths: git[1] ? git[1].split("\n") : [] },
  };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await sleep(100);
  }
  throw new Error("Timed out waiting for the page");
}

async function waitForTarget(url: string, type?: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const targets = (await (await fetch(url)).json()) as {
        type: string;
        webSocketDebuggerUrl: string;
      }[];
      const target = targets.find((candidate) => !type || candidate.type === type);
      if (target) return target.webSocketDebuggerUrl;
    } catch {
      // The debugger is not listening yet.
    }
    await sleep(100);
  }
  throw new Error(`No debugging target at ${url}`);
}

interface Client {
  send(method: string, params?: object): Promise<unknown>;
  close(): void;
}

async function connect(url: string): Promise<Client> {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map<number, (result: unknown) => void>();
  socket.addEventListener("message", (message) => {
    const data = JSON.parse(String(message.data)) as { id?: number; result?: unknown };
    if (data.id !== undefined) pending.get(data.id)?.(data.result);
  });
  return {
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close: () => socket.close(),
  };
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address ? resolve(address.port) : reject(),
      );
    });
  });
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, sleep(3000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function run(command: string, args: string[]) {
  return new Promise<string>((resolve) => {
    const child = spawn(command, args, { cwd: repoRoot });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("close", () => resolve(output.trim()));
    child.on("error", () => resolve("unavailable"));
  });
}

/** Timestamped directory for one run under tmp/experiments/<experiment>/. */
export function runDirectory(experiment: string) {
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\..+/, "Z");
  return path.join(repoRoot, "tmp", "experiments", experiment, stamp);
}
