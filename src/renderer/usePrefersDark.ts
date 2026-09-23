import { useSyncExternalStore } from "react";

const query = matchMedia("(prefers-color-scheme: dark)");

function subscribe(onChange: () => void) {
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function usePrefersDark() {
  return useSyncExternalStore(subscribe, () => query.matches);
}
