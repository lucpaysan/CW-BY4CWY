import { useEffect, useRef } from "react";
import { detectMorseFrequency } from "../utils/morseSignalDetector";
import type { DetectionResult } from "../utils/morseSignalDetector";

const DETECT_INTERVAL_MS = 500;

/**
 * Hook that runs Morse signal auto-detection on a fixed interval.
 * Uses the AnalyserNode's frequency data to detect where the Morse signal is.
 */
export function useAutoFilter({
  analyserRef,
  enabled,
  onDetected,
  minConfidence = 0.3,
}: {
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  enabled: boolean;
  onDetected: (result: DetectionResult | null) => void;
  minConfidence?: number;
}) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFreqRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Clean up interval when disabled
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      lastFreqRef.current = null;
      return;
    }

    const runDetection = () => {
      const analyser = analyserRef.current;
      if (!analyser) return;

      // Get frequency data from the analyser
      const freqBinCount = analyser.frequencyBinCount; // fftSize / 2 = 2048
      const frequencyData = new Uint8Array(freqBinCount);
      analyser.getByteFrequencyData(frequencyData);

      const result = detectMorseFrequency(frequencyData);

      // Only report if confidence is high enough and frequency changed significantly
      if (
        result &&
        result.confidence >= minConfidence &&
        (lastFreqRef.current === null ||
          Math.abs(result.frequency - lastFreqRef.current) > 20)
      ) {
        lastFreqRef.current = result.frequency;
        onDetected(result);
      } else if (!result && lastFreqRef.current !== null) {
        // Signal lost - notify parent to clear filter
        lastFreqRef.current = null;
        onDetected(null);
      }
    };

    // Run detection on interval
    intervalRef.current = setInterval(runDetection, DETECT_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, analyserRef, minConfidence, onDetected]);
}
