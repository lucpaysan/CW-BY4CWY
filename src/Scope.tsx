import { useRef } from "react";
import { Box } from "@mantine/core";
import { useSpectrogramRenderer } from "./hooks/useSpectrogramRenderer";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";
import { calculateBandPosition } from "./utils/frequencyUtils";

type ScopeProps = {
  stream: MediaStream;
  setFilterFreq: (freq: number | null) => void;
  filterFreq: number | null;
  filterWidth: number;
  gain: number;
  decodeWindowSeconds?: number;
};

export const Scope = ({
  stream,
  setFilterFreq,
  filterFreq,
  filterWidth,
  gain,
  decodeWindowSeconds = 12,
}: ScopeProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useSpectrogramRenderer({ stream, gain, canvasRef, decodeWindowSeconds });
  useCanvasInteraction({ canvasRef, filterFreq, setFilterFreq, filterWidth });

  const { topPercent, heightPercent } = calculateBandPosition(filterFreq, filterWidth);

  return (
    <Box style={{ position: "relative", width: "100%" }}>
      {/* Top border line */}
      <Box
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: "linear-gradient(90deg, var(--teal-dark), var(--teal-primary), var(--teal-dark))",
          borderRadius: "12px 12px 0 0",
          zIndex: 2,
        }}
      />

      {/* Canvas */}
      <Box
        component="canvas"
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: 200,
          borderRadius: 12,
          background: "linear-gradient(180deg, var(--bg-dark) 0%, var(--bg-sidebar) 100%)",
          boxShadow: "inset 0 0 20px rgba(0, 0, 0, 0.3)",
        }}
      />

      {/* Filter Band Indicator */}
      {filterFreq && (
        <Box
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${topPercent}%`,
            height: `${heightPercent}%`,
            borderTop: "2px solid var(--teal-primary)",
            borderBottom: "2px solid var(--teal-primary)",
            background: "rgba(7, 123, 156, 0.15)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Bottom border line */}
      <Box
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          background: "linear-gradient(90deg, var(--teal-dark), var(--teal-primary), var(--teal-dark))",
          borderRadius: "0 0 12px 12px",
          zIndex: 2,
        }}
      />
    </Box>
  );
};