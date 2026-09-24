import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import "./index.css";
import { followRevealLayout } from "./reveal-layout.ts";

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");
followRevealLayout(container);

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
