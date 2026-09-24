import { ackRenderedSizes } from "@electron-resize-sync/resize-pacing-not-working/renderer";
import { useSyncExternalStore } from "react";
import type { ResizeBridge } from "../shared/resize-bridge.ts";

declare global {
  interface Window {
    /** Set by the preload script; absent when the page runs in a plain browser. */
    resizeBridge?: ResizeBridge;
  }
}

export interface ResizeLatency {
  /** Milliseconds from a size change to the end of the first frame rendered at that size. */
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

// Every first frame at a new size is acknowledged for paced resizing, which
// lets the main process apply the next paced size, and timed here.
if (window.resizeBridge) {
  ackRenderedSizes(window.resizeBridge, ({ width, height }) => {
    const commitAt = commitTimes.get(sizeKey(width, height));
    if (commitAt === undefined) return;
    const last = performance.timeOrigin + performance.now() - commitAt;
    latency = { last, max: Math.max(latency.max ?? 0, last) };
    notify();
  });
}

// rAF pauses while the page is hidden, so a size first seen after it becomes
// visible again says nothing about paint latency.
document.addEventListener("visibilitychange", () => commitTimes.clear());

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
