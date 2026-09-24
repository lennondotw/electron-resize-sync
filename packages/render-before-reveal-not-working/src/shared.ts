// IPC contract of @electron-resize-sync/render-before-reveal-not-working.

/** Renderer argument that marks a render-before-reveal window's page. */
export const REVEAL_ARGUMENT = "--electron-resize-sync-reveal";

export const REVEAL_LAYOUT_CHANNEL = "electron-resize-sync:reveal-layout";
export const REVEAL_REQUEST_CHANNEL = "electron-resize-sync:reveal-request";
export const REVEAL_ACK_CHANNEL = "electron-resize-sync:reveal-ack";

/** The root element's rectangle in page coordinates (CSS pixels). */
export interface RevealLayout {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the host's preload exposes to the page, from `createRevealBridge`. */
export interface RevealBridge {
  /** Whether the page runs in a render-before-reveal window. */
  readonly reveal: boolean;
  /** Called with where to lay out the root element. */
  onLayout(listener: (layout: RevealLayout) => void): () => void;
  /** Asks for the current layout, once the page listens for it. */
  requestLayout(): void;
  /** Reports that a frame with layout `id` has been rendered. */
  ackLayout(id: number): void;
}
