import { useEffect, useRef, useState } from "react";

export interface FrameStats {
  /** Animation clock in milliseconds; it only advances while the loop runs. */
  time: number;
  /** Exponential moving average of frames per second. */
  fps: number;
  /** Time between the last two rAF callbacks. */
  frameMs: number;
}

/**
 * Runs a requestAnimationFrame loop that blocks the renderer main thread for
 * `busyMs` on every frame, then commits a React update. With ~65ms of busy
 * work the loop settles around 15fps. While `running` is false there is no
 * loop at all: no busy work and no re-renders.
 */
export function useJankyFrameLoop(busyMs: number, running: boolean): FrameStats {
  const [stats, setStats] = useState<FrameStats>({ time: 0, fps: 0, frameMs: 0 });
  // Survives pauses and loop restarts, so the animation resumes where it stopped.
  const clockRef = useRef(0);

  useEffect(() => {
    if (!running) return;

    let handle = 0;
    let fps = 0;
    // rAF timestamps mark the start of the frame and can precede
    // performance.now() taken here, so measure only between two callbacks.
    let last: number | undefined;

    const tick = (now: number) => {
      const frameMs = last === undefined ? 0 : now - last;
      last = now;
      if (frameMs > 0) fps = fps === 0 ? 1000 / frameMs : fps * 0.9 + (1000 / frameMs) * 0.1;
      clockRef.current += frameMs;

      // The long task: spin until the budget is used up.
      const until = performance.now() + busyMs;
      let sink = 0;
      while (performance.now() < until) sink += Math.sqrt(sink + 1);

      setStats({ time: clockRef.current, fps, frameMs });
      handle = requestAnimationFrame(tick);
    };

    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [busyMs, running]);

  return stats;
}
