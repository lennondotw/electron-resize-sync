import type { ResizeActivityBridge } from "./shared.ts";

export type { ResizeActivityBridge } from "./shared.ts";

/**
 * Returns a function that tells whether a user resize is in progress. It is a
 * plain read, cheap enough to call from a frame loop.
 */
export function trackResizeActivity(bridge: ResizeActivityBridge) {
  let resizing = false;
  bridge.onResizeActive((active) => {
    resizing = active;
  });
  return () => resizing;
}
