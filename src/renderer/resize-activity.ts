// Whether a user resize is in progress, as reported by the main process.
// Read synchronously from the frame loop, so it is a plain variable rather
// than React state.
let resizing = false;

window.resizeBridge?.onResizeActive((active) => {
  resizing = active;
});

export function isResizing() {
  return resizing;
}
