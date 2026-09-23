import { useEffect, useState } from "react";

export interface FrameStats {
  /** rAF timestamp of the latest frame, for time-based animation. */
  time: number;
  /** Exponential moving average of frames per second. */
  fps: number;
  /** Time between the last two rAF callbacks. */
  frameMs: number;
}

/**
 * Runs a requestAnimationFrame loop that blocks the renderer main thread for
 * `busyMs` on every frame, then commits a React update. With ~65ms of busy
 * work the loop settles around 15fps.
 */
export function useJankyFrameLoop(busyMs: number): FrameStats {
  const [stats, setStats] = useState<FrameStats>({ time: 0, fps: 0, frameMs: 0 });

  useEffect(() => {
    let handle = 0;
    let fps = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const frameMs = now - last;
      last = now;
      fps = fps === 0 ? 1000 / frameMs : fps * 0.9 + (1000 / frameMs) * 0.1;

      // The long task: spin until the budget is used up.
      const until = performance.now() + busyMs;
      let sink = 0;
      while (performance.now() < until) sink += Math.sqrt(sink + 1);

      setStats({ time: now, fps, frameMs });
      handle = requestAnimationFrame(tick);
    };

    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [busyMs]);

  return stats;
}
