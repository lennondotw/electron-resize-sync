// Stages the app for a screen-recorded resize: an isolated session with edge
// markers, a flat magenta backdrop window behind it, and the window centred on
// the backdrop. Writes the geometry (and ready-made drag paths) to a JSON file
// and keeps the app running until interrupted. See README.md.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { collectEnvironment, launchSession, runDirectory } from "../harness/session.ts";

const { values: args } = parseArgs({
  options: {
    busy: { type: "string", default: "30" },
    sync: { type: "string", default: "off" },
    /** Skip the busy work while a resize is in progress. */
    yield: { type: "string", default: "off" },
    /** Whether the tiles animate; the frame loop and busy work run either way. */
    playing: { type: "string", default: "on" },
    /** Per-tile dithering (masked layers) on or off. */
    dither: { type: "string", default: "on" },
    env: { type: "string", multiple: true, default: [] },
    /** Passed to Electron as-is, e.g. --electron-arg=--disable-features=X. */
    "electron-arg": { type: "string", multiple: true, default: [] },
    /** Width of the computer-use coordinate frame, to express drag paths in it. */
    "frame-width": { type: "string" },
    /** Part of the display's name to stage on, e.g. "Built-in"; the primary display by default. */
    display: { type: "string" },
    out: { type: "string" },
  },
});

/** Window at rest, in points relative to the primary display. */
const WINDOW = { width: 800, height: 600 };
/** How far each drag moves the edge, and in how many steps. */
const DRAG = { distance: 120, steps: 12 };
/** Backdrop margin around the rest window: the drag distance plus room for the shadow. */
const MARGIN = DRAG.distance + 40;

const extraEnv = Object.fromEntries(args.env.map((pair) => pair.split("=", 2) as [string, string]));
const runDir = runDirectory("resize-recording");
const session = await launchSession({
  runDir,
  settings: {
    busyMs: Number(args.busy),
    playing: args.playing === "on",
    dither: args.dither === "on",
    resizeSync: args.sync === "on",
    yieldOnResize: args.yield === "on",
  },
  env: { ELECTRON_RESIZE_SYNC_MARKERS: "1", ELECTRON_RESIZE_SYNC_OVERLAY: "0", ...extraEnv },
  args: args["electron-arg"],
});

const geometry = await session.main<{
  display: {
    x: number;
    y: number;
    width: number;
    height: number;
    scaleFactor: number;
    label: string;
  };
  captureScreen: number;
  window: { x: number; y: number; width: number; height: number };
  backdrop: { x: number; y: number; width: number; height: number };
}>(`(async () => {
  const { BaseWindow, BrowserWindow, screen } = require("electron");
  // A BaseWindow in render-before-reveal mode, a BrowserWindow otherwise; the
  // resize rate overlay is the other, unfocusable window.
  const win = BaseWindow.getAllWindows().find((w) => w.isFocusable());
  const displays = screen.getAllDisplays();
  const display = ${JSON.stringify(args.display ?? null)} === null
    ? screen.getPrimaryDisplay()
    : displays.find((d) => d.label.includes(${JSON.stringify(args.display ?? "")}));
  if (!display) throw new Error("No display named " + ${JSON.stringify(args.display ?? "")});
  const window = {
    x: Math.round(display.bounds.x + (display.bounds.width - ${WINDOW.width}) / 2),
    y: Math.round(display.bounds.y + (display.bounds.height - ${WINDOW.height}) / 2),
    width: ${WINDOW.width},
    height: ${WINDOW.height},
  };
  const backdrop = {
    x: window.x - ${MARGIN}, y: window.y - ${MARGIN},
    width: window.width + 2 * ${MARGIN}, height: window.height + 2 * ${MARGIN},
  };
  // A flat colour behind the window makes its frame easy to find in each video frame.
  const back = new BrowserWindow({ ...backdrop, frame: false, hasShadow: false, focusable: false,
    backgroundColor: "#ff00ff", show: false, enableLargerThanScreen: true });
  await back.loadURL("data:text/html,<body style='margin:0;background:%23ff00ff'></body>");
  back.setAlwaysOnTop(true, "floating");
  back.showInactive();
  win.setAlwaysOnTop(true, "pop-up-menu");
  win.setBounds(window);
  win.showInactive();
  await new Promise((r) => setTimeout(r, 500));
  return {
    display: { ...display.bounds, scaleFactor: display.scaleFactor, label: display.label },
    // AVFoundation lists screens in the same order as Electron's displays.
    captureScreen: displays.findIndex((d) => d.id === display.id),
    window: win.getBounds(),
    backdrop: back.getBounds(),
  };
})()`);

const { display, captureScreen, window, backdrop } = geometry;
const environment = await collectEnvironment(session);
const scale = display.scaleFactor;
/** Recording crop in pixels of the staged display's capture. */
const crop = {
  x: Math.round((backdrop.x - display.x) * scale),
  y: Math.round((backdrop.y - display.y) * scale),
  width: Math.round(backdrop.width * scale),
  height: Math.round(backdrop.height * scale),
};

// Drag paths: press 1 pt inside an edge or corner, move out by DRAG.distance in
// DRAG.steps, then back to the start; "inward" drags move in and back out.
const toFrame = args["frame-width"] ? Number(args["frame-width"]) / display.width : 1;
const point = (x: number, y: number) => [
  Math.round((x - display.x) * toFrame),
  Math.round((y - display.y) * toFrame),
];
const right = window.x + window.width;
const bottom = window.y + window.height;
const midX = window.x + window.width / 2;
const midY = window.y + window.height / 2;
const handles = {
  right: { at: [right - 1, midY], dir: [1, 0] },
  left: { at: [window.x + 1, midY], dir: [-1, 0] },
  bottom: { at: [midX, bottom - 1], dir: [0, 1] },
  top: { at: [midX, window.y + 1], dir: [0, -1] },
  "top-left": { at: [window.x + 1, window.y + 1], dir: [-1, -1] },
  "top-right": { at: [right - 1, window.y + 1], dir: [1, -1] },
  "bottom-left": { at: [window.x + 1, bottom - 1], dir: [-1, 1] },
  "bottom-right": { at: [right - 1, bottom - 1], dir: [1, 1] },
} as const;
/** One frame unit across the drag direction, so the nudge does not change the size. */
const nudge = ([x = 0, y = 0]: number[], dir: readonly number[]) =>
  dir[1] === 0 ? [x, y + 1] : [x + 1, y];
const drags: Record<string, unknown[]> = {};
for (const [edge, { at, dir }] of Object.entries(handles)) {
  for (const way of ["outward", "inward"] as const) {
    const sign = way === "outward" ? 1 : -1;
    const offsets = [
      ...Array.from({ length: DRAG.steps }, (_, i) => i + 1),
      ...Array.from({ length: DRAG.steps }, (_, i) => DRAG.steps - 1 - i),
    ];
    // The pauses let AppKit take the press before the first move. AppKit's
    // live resize applies a move only once another event follows it, so the
    // drag ends with a one-pixel sideways nudge and a return to the last point.
    drags[`${edge} ${way}`] = [
      { action: "mouse_move", coordinate: point(at[0], at[1]) },
      { action: "wait", duration: 0.25 },
      { action: "left_mouse_down" },
      ...offsets.map((k) => {
        const d = (sign * k * DRAG.distance) / DRAG.steps;
        return { action: "mouse_move", coordinate: point(at[0] + dir[0] * d, at[1] + dir[1] * d) };
      }),
      { action: "wait", duration: 0.25 },
      { action: "mouse_move", coordinate: nudge(point(at[0], at[1]), dir) },
      { action: "mouse_move", coordinate: point(at[0], at[1]) },
      { action: "wait", duration: 0.25 },
      { action: "left_mouse_up" },
    ];
  }
}

// The same drags as paths for a background drag tool (computer-use app_drag),
// in points of the backdrop window, which does not move while the app window
// resizes. Such a tool delivers a whole path at once, so AppKit coalesces it
// into a few size changes; the path ends with the same nudge.
const APP_DRAG_STEPS = 6;
const appDrags: Record<string, number[][]> = {};
for (const [edge, { at, dir }] of Object.entries(handles)) {
  for (const way of ["outward", "inward"] as const) {
    const sign = way === "outward" ? 1 : -1;
    const local = (k: number) => {
      const d = (sign * k * DRAG.distance) / APP_DRAG_STEPS;
      return [
        Math.round(at[0] + dir[0] * d - backdrop.x),
        Math.round(at[1] + dir[1] * d - backdrop.y),
      ];
    };
    const offsets = [
      ...Array.from({ length: APP_DRAG_STEPS + 1 }, (_, k) => k),
      ...Array.from({ length: APP_DRAG_STEPS }, (_, k) => APP_DRAG_STEPS - 1 - k),
    ];
    const start = local(0);
    appDrags[`${edge} ${way}`] = [...offsets.map(local), nudge(start, dir), start];
  }
}

const outPath = args.out ?? path.join(runDir, "geometry.json");
await writeFile(
  outPath,
  `${JSON.stringify({ args, environment, display, captureScreen, window, backdrop, crop, drag: DRAG, drags, appDrags }, null, 2)}\n`,
);
console.log(`Staged. Geometry in ${outPath}. Interrupt to stop.`);

const stop = async () => {
  await session.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
