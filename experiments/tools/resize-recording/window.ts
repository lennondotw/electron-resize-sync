// Puts the staged app window back at its rest bounds from a geometry file,
// between drags that do not return it exactly.
// usage: window.ts reset --geometry <geometry.json>
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { evaluateInMain } from "../harness/inspect.ts";

const { positionals, values: args } = parseArgs({
  allowPositionals: true,
  options: { geometry: { type: "string" } },
});
if (positionals[0] !== "reset" || !args.geometry) {
  throw new Error("Usage: window.ts reset --geometry <geometry.json>");
}

const { window: rest } = JSON.parse(await readFile(args.geometry, "utf8")) as {
  window: { x: number; y: number; width: number; height: number };
};
const bounds = await evaluateInMain(`(() => {
  const { BaseWindow } = require("electron");
  // The app window; the backdrop and the rate overlay are not focusable.
  const win = BaseWindow.getAllWindows().find((w) => w.isFocusable());
  win.setBounds(${JSON.stringify(rest)});
  return win.getBounds();
})()`);
console.log(JSON.stringify(bounds));
