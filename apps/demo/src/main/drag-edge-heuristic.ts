import { screen, type BaseWindow, type Rectangle } from "electron";

/** A drag with no `will-resize` for this long counts as over, in case `resized` is missed. */
const DRAG_GAP_MS = 500;

/**
 * GUESSES which edges of `win` the user is dragging, so that a cancelled
 * `will-resize` can be re-applied with the opposite edges kept in place.
 *
 * This is a heuristic, not a measurement, and it can be wrong. Neither AppKit
 * nor Electron reports the dragged edge on macOS:
 * - `windowWillResize:toSize:` gives only the new size.
 * - Electron's `will-resize` bounds keep the bottom-left corner fixed whatever
 *   is dragged, and its `details.edge` is only ever "right" or "bottom",
 *   picked by whichever of width and height changed more.
 *
 * The guess: the first time a drag changes the width, the pointer's side of
 * the window's vertical centre line is taken as the dragged side (left or
 * right); likewise for the height and top or bottom. Each side is then kept
 * until the drag ends (`resized`, or no proposal for 500 ms).
 *
 * Known ways it goes wrong:
 * - Resizing without the pointer (keyboard, accessibility, window tiling or
 *   zoom): the pointer is wherever it was left.
 * - A pointer exactly on, or very near, the centre line.
 * - A size change that the window server applies before the pointer moves
 *   onto the edge (the first proposal already decides the side).
 * - A pointer that the system moves or hides during the drag.
 *
 * Elsewhere (Windows) Electron reports the dragged edge from the system, and
 * with `trustReportedEdge` (the default there) that report is used instead.
 * Tests that emit `will-resize` themselves can set it too.
 *
 * Returns a function that places a proposed size against the current bounds.
 */
export function trackDraggedEdges(
  win: BaseWindow,
  { trustReportedEdge = process.platform !== "darwin" }: { trustReportedEdge?: boolean } = {},
) {
  let left: boolean | undefined;
  let top: boolean | undefined;
  let lastProposalAt = -Infinity;
  const endDrag = () => {
    left = undefined;
    top = undefined;
  };
  win.on("resized", endDrag);

  return (current: Rectangle, proposed: Rectangle, reportedEdge?: string): Rectangle => {
    const { width, height } = proposed;
    if (trustReportedEdge && reportedEdge !== undefined) {
      return {
        x: reportedEdge.includes("left") ? current.x + current.width - width : current.x,
        y: reportedEdge.includes("top") ? current.y + current.height - height : current.y,
        width,
        height,
      };
    }
    const now = performance.now();
    if (now - lastProposalAt > DRAG_GAP_MS) endDrag();
    lastProposalAt = now;

    const pointer = screen.getCursorScreenPoint();
    if (left === undefined && proposed.width !== current.width) {
      left = pointer.x < current.x + current.width / 2;
    }
    if (top === undefined && proposed.height !== current.height) {
      top = pointer.y < current.y + current.height / 2;
    }
    return {
      x: left ? current.x + current.width - width : current.x,
      y: top ? current.y + current.height - height : current.y,
      width,
      height,
    };
  };
}
