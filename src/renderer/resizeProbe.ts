import { useSyncExternalStore } from "react";
import type { ResizeBridge } from "../shared/resizeBridge.ts";

declare global {
  interface Window {
    /** Set by the preload script; absent when the page runs in a plain browser. */
    resizeBridge?: ResizeBridge;
  }
}

export interface ResizeLatency {
  /** Milliseconds from a size change to the end of the first frame painted at that size. */
  last: number | null;
  /** Largest `last` during the current resize gesture. */
  max: number | null;
}

/** A pause this long between size changes starts a new gesture and resets `max`. */
const GESTURE_GAP_MS = 1000;

let latency: ResizeLatency = { last: null, max: null };
const listeners = new Set<() => void>();

/** Latest commit time for each size in the current gesture, keyed by "width×height". */
const commitTimes = new Map<string, number>();
let lastCommitAt = -Infinity;

window.resizeBridge?.onCommit(({ width, height, at }) => {
  if (at - lastCommitAt > GESTURE_GAP_MS) {
    commitTimes.clear();
    latency = { last: latency.last, max: null };
    notify();
  }
  lastCommitAt = at;
  commitTimes.set(sizeKey(width, height), at);
});

// Runs independently of the app's frame loop. Registered first, it fires at
// the start of each frame, so it sees the previous frame as finished.
let seenSize = sizeKey(window.innerWidth, window.innerHeight);
let paintedCommitAt: number | undefined;

function onFrame() {
  const now = performance.timeOrigin + performance.now();
  if (paintedCommitAt !== undefined) {
    const last = now - paintedCommitAt;
    latency = { last, max: Math.max(latency.max ?? 0, last) };
    paintedCommitAt = undefined;
    notify();
  }

  const size = sizeKey(window.innerWidth, window.innerHeight);
  if (size !== seenSize) {
    seenSize = size;
    // This frame is the first at the new size; measure when the next one starts.
    paintedCommitAt = commitTimes.get(size);
  }
  requestAnimationFrame(onFrame);
}
requestAnimationFrame(onFrame);

function sizeKey(width: number, height: number) {
  return `${width}×${height}`;
}

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useResizeLatency() {
  return useSyncExternalStore(subscribe, () => latency);
}
