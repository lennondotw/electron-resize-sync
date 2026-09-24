// Geometry of the hidden macOS title bar, shared by the main process (which
// positions the window buttons) and the renderer (which reserves space for them).

/** Height of the draggable title bar area the renderer reserves. */
export const TITLEBAR_HEIGHT = 44;

/** Top-left corner of the macOS window buttons, passed to `trafficLightPosition`. */
export const TRAFFIC_LIGHTS_POSITION = { x: 16, y: 15 };

/** Approximate width of the three macOS window buttons. */
const TRAFFIC_LIGHTS_WIDTH = 52;

/** Leading space the window buttons occupy, mirroring their left inset on the right. */
export const TRAFFIC_LIGHTS_INSET = TRAFFIC_LIGHTS_POSITION.x * 2 + TRAFFIC_LIGHTS_WIDTH;
