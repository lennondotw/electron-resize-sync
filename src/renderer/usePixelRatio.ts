import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
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

/** `devicePixelRatio`, updated when the window moves to a screen with another scale. */
export function usePixelRatio() {
  return useSyncExternalStore(subscribe, () => window.devicePixelRatio);
}
