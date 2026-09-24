import { useEffect, useLayoutEffect, useRef } from "react";
import { createBlueNoise } from "./blue-noise.ts";
import type { DitherMode } from "./hud-settings.ts";
import fragmentShader from "./tile-wave.frag?raw";
import vertexShader from "./tile-wave.vert?raw";
import { usePrefersDark } from "./use-prefers-dark.ts";

/** Preferred tile edge; tiles stretch so the grid fills #root exactly. */
const TILE_TARGET = 44;
/** Same gap on both axes. */
const TILE_GAP = 6;
const GRID_PADDING = 8;
/** Matches Tailwind's rounded-md. */
const TILE_RADIUS = 6;

/** Radians per second; the wave speed does not depend on the frame rate. */
const WAVE_SPEED = 1.5;
/** Phase lag between neighbouring tiles, in radians. */
const WAVE_STEP = 0.12;

type Oklch = readonly [lightness: number, chroma: number, hue: number];

/** Wave endpoints, interpolated in OKLCH so steps look perceptually even. */
const TILE_COLORS: Record<"light" | "dark", { low: Oklch; high: Oklch }> = {
  light: { low: [0.955, 0.002, 286], high: [0.9, 0.005, 286] },
  dark: { low: [0.29, 0.005, 286], high: [0.34, 0.008, 286] },
};

/** Edge of the blue-noise threshold map in device pixels; it repeats across the canvas. */
const NOISE_SIZE = 64;

const DITHER_MODE_INDEX: Record<DitherMode, number> = { off: 0, spatial: 1, temporal: 2 };

/** Number of whole tiles along an axis of `length`, closest to TILE_TARGET. */
export function fitTiles(length: number) {
  const available = length - 2 * GRID_PADDING + TILE_GAP;
  return Math.max(1, Math.round(available / (TILE_TARGET + TILE_GAP)));
}

interface TileWaveProps {
  /** Milliseconds, e.g. a rAF timestamp. */
  time: number;
  /** Increments every rendered frame; drives temporal dithering. */
  frame: number;
  dither: DitherMode;
}

/**
 * A grid of tiles whose colour moves as a wave, sampled at `time`, drawn in
 * one WebGL pass that fills its parent. Each pixel works out its tile, the
 * tile's colour and the rounded corner in the fragment shader, then dithers
 * the exact colour to 8 bits:
 *
 * - off: rounds, so neighbouring tiles can share a value (banding).
 * - spatial: adds a blue-noise threshold per device pixel, so each tile's
 *   pixels mix the two nearest 8-bit values and average to the exact one.
 * - temporal: one threshold per tile per frame, so a whole tile alternates
 *   between the two values over frames. An experiment: at the demo's
 *   15–33 fps the alternation can show as flicker.
 *
 * The canvas is resized and redrawn from a ResizeObserver, which runs before
 * paint, so a resize never shows a stretched previous frame.
 */
export function TileWave({ time, frame, dither }: TileWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = TILE_COLORS[usePrefersDark() ? "dark" : "light"];
  // The latest props, for draws the ResizeObserver triggers between renders.
  const latest = useRef<DrawParams>({ time, frame, dither, colors });
  const rendererRef = useRef<TileRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createTileRenderer(canvas);
    rendererRef.current = renderer;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      // Exact device pixels where available, so the noise maps 1:1 to the screen.
      const device = entry.devicePixelContentBoxSize?.[0];
      canvas.width = device ? device.inlineSize : Math.round(canvas.clientWidth * devicePixelRatio);
      canvas.height = device
        ? device.blockSize
        : Math.round(canvas.clientHeight * devicePixelRatio);
      renderer.draw(latest.current);
    });
    observer.observe(canvas, { box: "device-pixel-content-box" });
    return () => {
      observer.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    latest.current = { time, frame, dither, colors };
    rendererRef.current?.draw(latest.current);
  }, [time, frame, dither, colors]);

  return <canvas ref={canvasRef} className="block size-full" />;
}

interface DrawParams {
  time: number;
  frame: number;
  dither: DitherMode;
  colors: { low: Oklch; high: Oklch };
}

interface TileRenderer {
  draw(params: DrawParams): void;
  dispose(): void;
}

function createTileRenderer(canvas: HTMLCanvasElement): TileRenderer {
  const gl = canvas.getContext("webgl2", { antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error("WebGL 2 is unavailable");

  const program = linkProgram(gl, vertexShader, fragmentShader);
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const u = {
    canvasSize: uniform("uCanvasSize"),
    pixelRatio: uniform("uPixelRatio"),
    grid: uniform("uGrid"),
    tileSize: uniform("uTileSize"),
    gap: uniform("uGap"),
    padding: uniform("uPadding"),
    radius: uniform("uRadius"),
    phase: uniform("uPhase"),
    waveStep: uniform("uWaveStep"),
    low: uniform("uLow"),
    high: uniform("uHigh"),
    dither: uniform("uDither"),
    frame: uniform("uFrame"),
    noise: uniform("uNoise"),
  };

  // Blue-noise ranks as thresholds centred in each of the rank's buckets.
  const ranks = createBlueNoise(NOISE_SIZE);
  const thresholds = Float32Array.from(ranks, (rank) => (rank + 0.5) / ranks.length);
  const noise = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, noise);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, NOISE_SIZE, NOISE_SIZE, 0, gl.RED, gl.FLOAT, thresholds);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // The vertex shader needs no attributes, but WebGL 2 still wants a vertex array bound.
  const vertexArray = gl.createVertexArray();

  return {
    draw({ time, frame, dither, colors }) {
      const { width, height } = canvas;
      if (width === 0 || height === 0) return;
      const pixelRatio = devicePixelRatio;
      const cssWidth = width / pixelRatio;
      const cssHeight = height / pixelRatio;
      const columns = fitTiles(cssWidth);
      const rows = fitTiles(cssHeight);

      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vertexArray);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, noise);

      gl.uniform2f(u.canvasSize, width, height);
      gl.uniform1f(u.pixelRatio, pixelRatio);
      gl.uniform2f(u.grid, columns, rows);
      gl.uniform2f(
        u.tileSize,
        (cssWidth - 2 * GRID_PADDING - (columns - 1) * TILE_GAP) / columns,
        (cssHeight - 2 * GRID_PADDING - (rows - 1) * TILE_GAP) / rows,
      );
      gl.uniform1f(u.gap, TILE_GAP);
      gl.uniform1f(u.padding, GRID_PADDING);
      gl.uniform1f(u.radius, TILE_RADIUS);
      // Wrapped on the CPU so the shader's float precision holds over long runs.
      gl.uniform1f(u.phase, ((time / 1000) * WAVE_SPEED) % (2 * Math.PI));
      gl.uniform1f(u.waveStep, WAVE_STEP);
      gl.uniform3f(u.low, ...colors.low);
      gl.uniform3f(u.high, ...colors.high);
      gl.uniform1i(u.dither, DITHER_MODE_INDEX[dither]);
      // Only the fractional part of frame × golden ratio matters; keep it small.
      gl.uniform1f(u.frame, frame % 10_000);
      gl.uniform1i(u.noise, 0);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteTexture(noise);
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);
    },
  };
}

function linkProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertexSource],
    [gl.FRAGMENT_SHADER, fragmentSource],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Could not create a shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? "Shader did not compile");
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? "Program did not link");
  return program;
}
