import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@xyflow/react/dist/style.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Root element #root not found");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
