// DOES NOT WORK as a fix (see this package's README); kept for comparison.
import type { ContentSize, ResizePacingBridge } from "./shared.ts";

export type { ContentSize, ResizePacingBridge } from "./shared.ts";

/** The viewport size, as a comparable key. */
const viewportKey = () => `${window.innerWidth}×${window.innerHeight}`;

/**
 * Acknowledges each new viewport size once its first frame has rendered, so
 * the main process can apply the next paced size. A message posted from a
 * rAF callback is handled right after that frame's rendering update, which is
 * when the frame is done and the main thread is idle.
 *
 * `onRendered` also receives each acknowledged size, for measurements.
 */
export function ackRenderedSizes(
  bridge: ResizePacingBridge,
  onRendered?: (size: ContentSize) => void,
) {
  let seen = viewportKey();
  const afterPaint = new MessageChannel();
  afterPaint.port1.addEventListener("message", ({ data }: MessageEvent<ContentSize>) => {
    bridge.ack(data);
    onRendered?.(data);
  });
  afterPaint.port1.start();

  const onFrame = () => {
    const size = viewportKey();
    if (size !== seen) {
      seen = size;
      afterPaint.port2.postMessage({ width: window.innerWidth, height: window.innerHeight });
    }
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);
  // rAF pauses while the page is hidden; a size first seen afterwards is stale.
  document.addEventListener("visibilitychange", () => {
    seen = viewportKey();
  });
}
