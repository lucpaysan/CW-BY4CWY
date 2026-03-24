import { useRef, useCallback } from "react";
import { Box } from "@mantine/core";
import { useSpectrogramRenderer } from "./hooks/useSpectrogramRenderer";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";
import { useAutoFilter } from "./hooks/useAutoFilter";
import { calculateBandPosition } from "./utils/frequencyUtils";
import type { DetectionResult } from "./utils/morseSignalDetector";

type ScopeProps = {
  stream: MediaStream;
  setFilterFreq: (freq: number | null) => void;
  filterFreq: number | null;
  filterWidth: number;
  gain: number;
  /** Called when auto-filter detects a Morse signal frequency */
  onAutoDetected?: (result: DetectionResult | null) => void;
  autoFilterEnabled?: boolean;
};

export const Scope = ({
  stream,
  setFilterFreq,
  filterFreq,
  filterWidth,
  gain,
  onAutoDetected,
  autoFilterEnabled = false,
}: ScopeProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const handleAnalyserReady = useCallback((analyser: AnalyserNode) => {
    analyserRef.current = analyser;
    if (onAutoDetected) {
      onAutoDetected(null); // signal that analyser is ready
    }
  }, [onAutoDetected]);

  useSpectrogramRenderer({ stream, gain, canvasRef, onAnalyserReady: handleAnalyserReady });

  useAutoFilter({
    analyserRef,
    enabled: autoFilterEnabled,
    onDetected: onAutoDetected ?? (() => {}),
  });

  useCanvasInteraction({ canvasRef, filterFreq, setFilterFreq, filterWidth });

  const { topPercent, heightPercent } = calculateBandPosition(
    filterFreq,
    filterWidth
  );

  return (
    <Box style={{ position: "relative", width: "100%" }}>
      {/* Mint green top accent line */}
      <Box
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: "linear-gradient(90deg, #10b981, #0ea5e9)",
          borderRadius: "12px 12px 0 0",
          zIndex: 2,
        }}
      />
      <Box
        component="canvas"
        ref={canvasRef}
        style={{
          display: "block",
          background: "var(--mantine-color-dark-9)",
          width: "100%",
          height: "256px",
          borderRadius: 12,
          boxShadow: "0 4px 12px rgba(16, 185, 129, 0.15)",
        }}
      />
      <Box
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${topPercent}%`,
          height: `${heightPercent}%`,
          borderTop: "2px solid #10b981",
          borderBottom: "2px solid #10b981",
          pointerEvents: "none",
          opacity: 0.8,
        }}
      />
    </Box>
  );
};
