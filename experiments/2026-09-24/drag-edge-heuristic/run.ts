// Checks drag-edge-heuristic's guess of the dragged edges inside the demo's
// paced resizing: for a pointer on each edge and corner, emits will-resize the
// way macOS reports it and records which edges of the window moved. Also runs
// two cases the heuristic is documented to get wrong. See run.md.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { collectEnvironment, launchSession, runDirectory } from "../../tools/harness/session.ts";

const { values: args } = parseArgs({ options: { out: { type: "string" } } });
const runDir = runDirectory("drag-edge-heuristic");

// Paced resizing is the demo's user of the heuristic; it acts only when on.
const session = await launchSession({
  runDir,
  settings: { busyMs: 0, playing: false, dither: false, resizeSync: true },
});
try {
  const environment = await collectEnvironment(session);
  const cases = await session.main<unknown[]>(`(async () => {
    const { BaseWindow, screen } = require("electron");
    const win = BaseWindow.getAllWindows().find((w) => w.isFocusable());
    const rest = win.getBounds();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const left = rest.x + 1, right = rest.x + rest.width - 1;
    const top = rest.y + 1, bottom = rest.y + rest.height - 1;
    const midX = rest.x + rest.width / 2, midY = rest.y + rest.height / 2;
    // [name, pointer, width change, height change, edges expected to move, documented failure]
    const plan = [
      ["right", [right, midY], 40, 0, "right"],
      ["left", [left, midY], 40, 0, "left"],
      ["bottom", [midX, bottom], 0, 40, "bottom"],
      ["top", [midX, top], 0, 40, "top"],
      ["top-left", [left, top], 40, 40, "left+top"],
      ["top-right", [right, top], 40, 40, "right+top"],
      ["bottom-left", [left, bottom], 40, 40, "left+bottom"],
      ["bottom-right", [right, bottom], 40, 40, "right+bottom"],
      // A left-edge drag with the pointer just right of the centre line.
      ["left, pointer past the centre line", [midX + 1, midY], 40, 0, "left", true],
      // A left-edge resize without the pointer, which rests to the right.
      ["left, pointer elsewhere (keyboard)", [right + 200, midY], 40, 0, "left", true],
    ];
    const original = screen.getCursorScreenPoint;
    const results = [];
    try {
      for (const [name, [px, py], dw, dh, expected, documentedFailure = false] of plan) {
        win.setBounds(rest);
        await sleep(700); // longer than the heuristic's 500 ms drag gap
        screen.getCursorScreenPoint = () => ({ x: Math.round(px), y: Math.round(py) });
        // Two proposals of one drag, as macOS reports them: the bottom-left
        // corner kept, and edge "right" or "bottom" by the larger change.
        for (const k of [1, 2]) {
          const proposed = { ...rest, width: rest.width + dw * k, height: rest.height + dh * k };
          win.emit("will-resize", { preventDefault() {} }, proposed, {
            edge: dw >= dh ? "right" : "bottom",
          });
          await sleep(250);
        }
        const after = win.getBounds();
        const moved = [];
        if (after.x !== rest.x) moved.push("left");
        if (after.x + after.width !== rest.x + rest.width) moved.push("right");
        if (after.y !== rest.y) moved.push("top");
        if (after.y + after.height !== rest.y + rest.height) moved.push("bottom");
        const got = moved.join("+") || "none";
        results.push({ name, pointer: { x: Math.round(px), y: Math.round(py) }, expected, got,
          correct: got === expected, documentedFailure });
      }
    } finally {
      screen.getCursorScreenPoint = original;
      win.setBounds(rest);
    }
    return results;
  })()`);
  const outPath = args.out ?? path.join(runDir, "results.json");
  await writeFile(
    outPath,
    `${JSON.stringify({ experiment: "drag-edge-heuristic", environment, cases }, null, 2)}\n`,
  );
  console.log(JSON.stringify(cases, null, 1));
  console.log(`Wrote ${outPath}`);
} finally {
  await session.close();
}
