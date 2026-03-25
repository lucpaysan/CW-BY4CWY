import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@mantine/core/styles.css";
import "./global.css";
import { MantineProvider, createTheme } from "@mantine/core";

const theme = createTheme({
  primaryColor: "orange",
  colors: {
    orange: [
      "#FAF8F5",
      "#F5EFE6",
      "#E8DFC8",
      "#D4C4A0",
      "#C9B485",
      "#B69E64",
      "#9A8654",
      "#8A7650",
      "#7A6646",
      "#6B563C",
    ],
    cyan: [
      "#FAFCFD",
      "#E8F4F7",
      "#C5E6EC",
      "#9DD5DE",
      "#7EC4D0",
      "#5FB3C2",
      "#3A9FB8",
      "#077B9C",
      "#056A87",
      "#045972",
    ],
  },
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  fontFamilyMonospace: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <App />
    </MantineProvider>
  </StrictMode>
);