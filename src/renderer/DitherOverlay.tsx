import { useSyncExternalStore } from "react";

/** Edge of the noise texture in device pixels; it repeats across the overlay. */
const NOISE_SIZE = 128;
/** Peak deviation from mid-grey, in 8-bit levels, before blending. */
const NOISE_AMPLITUDE = 8;

// Every pixel is independent, so the texture tiles seamlessly. It is generated
// once per page load and reused on every resize.
const noiseUrl = createNoiseUrl();

function createNoiseUrl() {
  const canvas = document.createElement("canvas");
  canvas.width = NOISE_SIZE;
  canvas.height = NOISE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is unavailable");

  const image = context.createImageData(NOISE_SIZE, NOISE_SIZE);
  for (let i = 0; i < image.data.length; i += 4) {
    // Triangular (TPDF) noise centred on mid-grey, which `overlay` leaves unchanged.
    const value = 128 + (Math.random() + Math.random() - 1) * NOISE_AMPLITUDE;
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function subscribeToPixelRatio(onChange: () => void) {
  let query: MediaQueryList;
  const listen = () => {
    query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener("change", handleChange, { once: true });
  };
  const handleChange = () => {
    onChange();
    listen();
  };
  listen();
  return () => query.removeEventListener("change", handleChange);
}

/** Breaks up 8-bit banding with a repeating, device-pixel-aligned noise layer. */
export function DitherOverlay() {
  const pixelRatio = useSyncExternalStore(subscribeToPixelRatio, () => window.devicePixelRatio);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-(--dither-opacity) mix-blend-overlay [image-rendering:pixelated]"
      style={{
        backgroundImage: `url(${noiseUrl})`,
        backgroundSize: `${NOISE_SIZE / pixelRatio}px`,
      }}
    />
  );
}
