import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@mantine/core/styles.css";
import "./global.css";
import { MantineProvider, createTheme } from "@mantine/core";

const theme = createTheme({
  primaryColor: "emerald",
  fontFamily: "system-ui, -apple-system, sans-serif",
  defaultRadius: "md",
  components: {
    Button: {
      defaultProps: {
        radius: "md",
      },
    },
    Paper: {
      defaultProps: {
        radius: "md",
        shadow: "sm",
      },
    },
    Modal: {
      defaultProps: {
        centered: true,
        zIndex: 2000,
        radius: "lg",
      },
    },
    Tooltip: {
      defaultProps: {
        zIndex: 2000,
        radius: "md",
      },
    },
    Popover: {
      defaultProps: {
        zIndex: 2000,
        radius: "md",
      },
    },
    Menu: {
      defaultProps: {
        zIndex: 2000,
        radius: "md",
      },
    },
  },
  colors: {
    emerald: [
      "#ecfdf5",
      "#d1fae5",
      "#a7f3d0",
      "#6ee7b7",
      "#34d399",
      "#10b981",
      "#059669",
      "#047857",
      "#065f46",
      "#064e3b",
    ],
    sky: [
      "#f0f9ff",
      "#e0f2fe",
      "#bae6fd",
      "#7dd3fc",
      "#38bdf8",
      "#0ea5e9",
      "#0284c7",
      "#0369a1",
      "#075985",
      "#0c4a6e",
    ],
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <App />
    </MantineProvider>
  </StrictMode>
);
