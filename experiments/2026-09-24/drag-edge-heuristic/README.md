# Does the drag-edge heuristic guess the dragged edges?

Date: 2026-09-24\
Status: executed; simulated drags with a stubbed pointer; 8 of 8 edges and corners guessed right, and both documented failure cases fail as documented\
Data: [`data.json`](data.json)\
Script: [`run.ts`](run.ts) ([how it works](run.md))

## Question and acceptance criteria

On macOS Electron's `will-resize` reports only "right" or "bottom" as the
dragged edge, so paced resizing and the render-before-reveal window guess the
edges from the pointer
([`drag-edge-heuristic`](../../../packages/drag-edge-heuristic/README.md),
`29fdf7a`). Before that, every drag kept the top-left corner fixed.

Pass: with the pointer on an edge or corner, the window's edges under it move
and the opposite ones stay, for all four edges and four corners. The two
documented failure cases are expected to guess wrong.

## Environment

From the data file's `environment`:

| Field      | Value                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| OS         | macOS 27.0 (26A428)                                                              |
| Hardware   | Mac15,8, Apple M3 Max                                                            |
| Display    | LG ULTRAGEAR+, 144 Hz (the pointer is simulated, so the display does not matter) |
| Runtime    | Electron 44.4.5 (stock), Chromium 152.0.7977.130, arm64                          |
| App        | Busy 0, paused, dithering off, `resize sync` on                                  |
| Repository | `0c37f31`, with this experiment and the tool changes uncommitted                 |

## Procedure

See [run.md](run.md): for each case the window is restored, the pointer is
fixed with a stubbed `screen.getCursorScreenPoint`, and two `will-resize`
proposals are emitted as macOS reports them.

## Results

| Case                               | Edges expected to move | Edges that moved | Outcome              |
| ---------------------------------- | ---------------------- | ---------------- | -------------------- |
| right                              | right                  | right            | Correct              |
| left                               | left                   | left             | Correct              |
| bottom                             | bottom                 | bottom           | Correct              |
| top                                | top                    | top              | Correct              |
| top-left                           | left+top               | left+top         | Correct              |
| top-right                          | right+top              | right+top        | Correct              |
| bottom-left                        | left+bottom            | left+bottom      | Correct              |
| bottom-right                       | right+bottom           | right+bottom     | Correct              |
| left, pointer just past the centre | left                   | right            | Wrong, as documented |
| left, pointer elsewhere (keyboard) | left                   | right            | Wrong, as documented |

## Conclusion and limits

- **Pass:** the guess is right whenever the pointer is on the dragged edge,
  and wrong in the two ways the package documents.
- **Simulated, not dragged:** the pointer is stubbed and `will-resize` is
  emitted from the main process. A real drag, where the first proposal may
  arrive before the pointer reaches the edge, was not measured.
- Only the demo's paced resizing was exercised; the render-before-reveal
  window uses the same function.

## Next step

- A real drag of each edge with `resize sync` on, recorded with
  [`resize-recording`](../../tools/resize-recording/README.md).
