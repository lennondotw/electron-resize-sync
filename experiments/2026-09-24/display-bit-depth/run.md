# Display bit depth

Checks whether the path from Chromium to the screen is 8-bit or deeper, which
decides whether higher-precision rendering could reduce banding.

## Run

```bash
pnpm build
node experiments/2026-09-24/display-bit-depth/run.ts
```

Needs Xcode (the script compiles `screen.swift` with `xcrun --toolchain XcodeDefault swiftc`).

## Procedure

1. Compile and run [`screen.swift`](screen.swift): for each screen, macOS's
   `NSScreen.depth` bits per sample and pixel, colour space and EDR headroom.
2. In a fresh app session, read `screen.colorDepth`, the `color`, `color-gamut`
   and `dynamic-range` media queries, `float16` 2D canvas support and WebGPU
   availability.

## Output

`macos[]` per screen and `chromium` for the app's page, plus `environment`.

## Limits

- Results describe the screens connected at run time; rerun on each display.
- `NSScreen.depth` is what macOS reports for the framebuffer; the panel may use
  FRC or its own processing.
