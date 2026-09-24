// In a render-before-reveal window (option C, src/main/reveal-window.ts) the
// page is larger than the window, and the main process says where #root goes.
// Each layout is acknowledged once a frame showing it has been rendered, so
// the window can take the matching bounds.
export function followRevealLayout(root: HTMLElement) {
  const bridge = window.resizeBridge;
  if (!bridge?.reveal) return;

  // A message posted from a rAF callback is handled right after that frame's
  // rendering update. Waiting for the second frame after the change means the
  // first one, which shows the new layout, has been committed to the
  // compositor, and React has re-rendered for the new #root size.
  const afterPaint = new MessageChannel();
  afterPaint.port1.addEventListener("message", ({ data }: MessageEvent<number>) =>
    bridge.ackLayout(data),
  );
  afterPaint.port1.start();

  bridge.onLayout(({ id, x, y, width, height }) => {
    Object.assign(root.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
    requestAnimationFrame(() => requestAnimationFrame(() => afterPaint.port2.postMessage(id)));
  });
  bridge.requestLayout();
}
