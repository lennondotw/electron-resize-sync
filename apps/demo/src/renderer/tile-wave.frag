#version 300 es
precision highp float;

uniform vec2 uCanvasSize;   // device px
uniform float uPixelRatio;
uniform vec2 uGrid;         // columns, rows
uniform vec2 uTileSize;     // CSS px
uniform float uGap;
uniform float uPadding;
uniform float uRadius;
uniform float uPhase;       // wave phase at tile (0, 0), radians
uniform float uWaveStep;
uniform vec3 uLow;          // OKLCH
uniform vec3 uHigh;
uniform int uDither;        // 0 off, 1 spatial, 2 temporal
uniform float uFrame;
uniform sampler2D uNoise;   // blue-noise thresholds in (0, 1)

out vec4 outColor;

// OKLCH to sRGB in 0..1 (Ottosson's OKLab matrices, sRGB transfer curve).
vec3 oklchToSrgb(vec3 lch) {
  float hue = radians(lch.z);
  float a = lch.y * cos(hue);
  float b = lch.y * sin(hue);
  float l = pow(lch.x + 0.3963377774 * a + 0.2158037573 * b, 3.0);
  float m = pow(lch.x - 0.1055613458 * a - 0.0638541728 * b, 3.0);
  float s = pow(lch.x - 0.0894841775 * a - 1.291485548 * b, 3.0);
  vec3 linear = vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  vec3 encoded = mix(
    12.92 * linear,
    1.055 * pow(max(linear, 0.0), vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, linear));
  return clamp(encoded, 0.0, 1.0);
}

// Signed distance to a rounded rectangle centred on the origin.
float roundedRect(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

// Interleaved gradient noise (Jimenez 2014): a cheap, well-spread hash of a cell.
float ign(vec2 cell) {
  return fract(52.9829189 * fract(dot(cell, vec2(0.06711056, 0.00583715))));
}

void main() {
  // CSS px from the top-left, as in the page.
  vec2 device = vec2(gl_FragCoord.x, uCanvasSize.y - gl_FragCoord.y);
  vec2 css = device / uPixelRatio;

  vec2 pitch = uTileSize + uGap;
  vec2 local = css - uPadding;
  vec2 tile = floor(local / pitch);
  if (any(lessThan(tile, vec2(0.0))) || any(greaterThanEqual(tile, uGrid))) discard;

  // Coverage of the rounded tile, anti-aliased over one device pixel.
  vec2 centre = tile * pitch + uTileSize * 0.5;
  float distance = roundedRect(local - centre, uTileSize * 0.5, uRadius) * uPixelRatio;
  float coverage = clamp(0.5 - distance, 0.0, 1.0);
  if (coverage <= 0.0) discard;

  float phase = uPhase - (tile.x + tile.y) * uWaveStep;
  vec3 exact = oklchToSrgb(mix(uLow, uHigh, 0.5 + 0.5 * sin(phase))) * 255.0;

  float threshold = 0.5;
  if (uDither == 1) {
    threshold = texelFetch(uNoise, ivec2(gl_FragCoord.xy) % textureSize(uNoise, 0), 0).r;
  } else if (uDither == 2) {
    // Golden-ratio sequence over frames, offset per tile so tiles do not switch in unison.
    threshold = fract(uFrame * 0.6180339887 + ign(tile));
  }
  vec3 quantized = min(floor(exact + threshold), 255.0) / 255.0;

  // Premultiplied alpha; the page behind shows through the anti-aliased edge.
  outColor = vec4(quantized * coverage, coverage);
}
