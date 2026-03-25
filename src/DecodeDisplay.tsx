import { useRef, type CSSProperties } from "react";
import { Box } from "@mantine/core";
import {
  AUDIO_CHUNK_SAMPLES,
  SAMPLE_RATE,
  FFT_LENGTH,
  HOP_LENGTH,
  getBufferSamples,
} from "./const";
import type { TextSegment } from "./utils/textDecoder";

// Default animation duration: audio chunk interval = audio chunk / sample rate
const DEFAULT_SCROLL_DURATION_S = AUDIO_CHUNK_SAMPLES / SAMPLE_RATE;
const SCROLL_FRAME_COUNT = AUDIO_CHUNK_SAMPLES / HOP_LENGTH;
const SCROLL_STEP_CSS_VAR = "--decode-scroll-step-pct" as const;

type DecodeRowStyle = CSSProperties & {
  [SCROLL_STEP_CSS_VAR]: string;
};

const getDecodeCharCount = (decodeWindowSeconds: number) =>
  Math.floor(
    (getBufferSamples(decodeWindowSeconds) - FFT_LENGTH) / HOP_LENGTH,
  ) + 1;

type DecodeDisplayProps = {
  segments: TextSegment[];
  isDecoding: boolean;
  backgroundColor?: string;
  textColor?: string;
  decodeWindowSeconds: number;
};

export const DecodeDisplay = ({
  segments,
  isDecoding,
  backgroundColor = "var(--bg-dark)",
  textColor = "var(--gold-primary)",
  decodeWindowSeconds,
}: DecodeDisplayProps) => {
  const prevSegmentsRef = useRef(segments);
  const updateCount = useRef(0);
  const lastUpdateTime = useRef(0);
  const animDuration = useRef(DEFAULT_SCROLL_DURATION_S);
  const decodeCharCount = getDecodeCharCount(decodeWindowSeconds);
  const charWidthPct = `${100 / decodeCharCount}%`;
  const scrollStepPct = `${(100 * SCROLL_FRAME_COUNT) / decodeCharCount}%`;
  const textRowStyle: DecodeRowStyle = {
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
    animation: isDecoding
      ? `decode-scroll-left ${animDuration.current}s linear forwards`
      : undefined,
    [SCROLL_STEP_CSS_VAR]: scrollStepPct,
  };

  // Update only when segments reference actually changes
  if (segments !== prevSegmentsRef.current) {
    prevSegmentsRef.current = segments;
    const now = performance.now();
    if (lastUpdateTime.current > 0) {
      animDuration.current = (now - lastUpdateTime.current) / 1000;
    }
    lastUpdateTime.current = now;
    updateCount.current += 1;
  }

  return (
    <Box
      style={{
        position: "relative",
        width: "100%",
        height: 48,
        fontSize: 24,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        fontWeight: 500,
        borderTop: "1px solid var(--border-dark)",
        background: backgroundColor,
      }}
    >
      {/* Background layer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor,
        }}
      />

      {/* Subtle border effect */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderTop: "1px solid var(--border-dark)",
          borderBottom: "1px solid var(--border-dark)",
          pointerEvents: "none",
        }}
      />

      {/* Text layer */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          whiteSpace: "pre-wrap",
          color: textColor,
          maskImage:
            "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: segments.length === 0 ? "center" : "flex-start",
          padding: "0 8px",
        }}
      >
        {segments.length === 0 ? (
          <span style={{ color: "var(--text-muted)", fontSize: 14 }}>
            {isDecoding ? "Listening..." : "Ready to decode"}
          </span>
        ) : (
          <div
            key={updateCount.current}
            style={textRowStyle}
          >
            {segments.flatMap((segment, segmentIndex) =>
              segment.isAbbreviation
                ? [
                    <div
                      key={`${segmentIndex}-abbr`}
                      style={{
                        width: charWidthPct,
                        flexShrink: 0,
                        textAlign: "center",
                        whiteSpace: "nowrap",
                        overflow: "visible",
                        textDecorationLine: "overline",
                        textDecorationStyle: "wavy",
                        textDecorationColor: "var(--teal-primary)",
                        color: "var(--teal-primary)",
                      }}
                    >
                      {segment.text}
                    </div>,
                  ]
                : Array.from(segment.text).map((char, charIndex) => (
                    <div
                      key={`${segmentIndex}-${charIndex}`}
                      style={{
                        width: charWidthPct,
                        flexShrink: 0,
                        textAlign: "center",
                      }}
                    >
                      {char === " " ? "\u00A0" : char}
                    </div>
                  )),
            )}
          </div>
        )}
      </div>
    </Box>
  );
};