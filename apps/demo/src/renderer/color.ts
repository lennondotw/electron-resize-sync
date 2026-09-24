export type Oklch = readonly [lightness: number, chroma: number, hue: number];
export type Rgb = readonly [red: number, green: number, blue: number];

export function mixOklch(from: Oklch, to: Oklch, amount: number): Oklch {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

/**
 * Converts OKLCH to sRGB on a 0–255 scale without rounding, so callers can
 * see the fractional part that 8-bit output would throw away.
 */
export function oklchToSrgb([lightness, chroma, hue]: Oklch): Rgb {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ] as const;

  return linear.map((channel) => {
    const encoded = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
    return Math.min(255, Math.max(0, encoded * 255));
  }) as unknown as Rgb;
}

export function formatRgb([red, green, blue]: Rgb) {
  return `rgb(${red} ${green} ${blue})`;
}
