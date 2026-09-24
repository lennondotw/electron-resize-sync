import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";
import { followRevealLayout } from "./revealLayout.ts";

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");
followRevealLayout(container);

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
