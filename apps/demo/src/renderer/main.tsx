import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import "./index.css";
import { followRevealLayout } from "@electron-resize-sync/render-before-reveal-not-working/renderer";

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");
if (window.resizeBridge) followRevealLayout(container, window.resizeBridge);

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
