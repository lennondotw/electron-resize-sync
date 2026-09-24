import { createBlueNoise } from "./blue-noise.ts";

/** Coverage steps between two adjacent 8-bit colours. */
export const DITHER_LEVELS = 16;

/**
 * Edge of each mask in device pixels; masks repeat across a tile.
 * Void-and-cluster is quadratic, so 64 (~30ms) rather than 128 (~600ms).
 */
export const DITHER_MASK_SIZE = 64;

/**
 * One tileable mask per coverage level, generated once per page load. Mask
 * `level` is opaque on the `level / DITHER_LEVELS` share of pixels with the
 * lowest blue-noise rank. Levels 0 and DITHER_LEVELS need no mask.
 */
export const ditherMaskUrls: readonly string[] = createDitherMaskUrls();

function createDitherMaskUrls() {
  const ranks = createBlueNoise(DITHER_MASK_SIZE);
  const canvas = document.createElement("canvas");
  canvas.width = DITHER_MASK_SIZE;
  canvas.height = DITHER_MASK_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is unavailable");

  const urls: string[] = [];
  for (let level = 0; level <= DITHER_LEVELS; level += 1) {
    const threshold = (level / DITHER_LEVELS) * ranks.length;
    const image = context.createImageData(DITHER_MASK_SIZE, DITHER_MASK_SIZE);
    ranks.forEach((rank, pixel) => {
      image.data[pixel * 4 + 3] = rank < threshold ? 255 : 0;
    });
    context.putImageData(image, 0, 0);
    urls.push(toObjectUrl(canvas.toDataURL("image/png")));
  }
  return urls;
}

/** Short blob: URLs keep the per-frame inline styles cheap to diff and parse. */
function toObjectUrl(dataUrl: string) {
  const [header = "", base64 = ""] = dataUrl.split(",");
  const type = header.slice("data:".length, header.indexOf(";"));
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type }));
}
