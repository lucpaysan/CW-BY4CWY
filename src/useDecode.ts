import { useEffect, useState, useRef, type MutableRefObject } from "react";
import { loadModel, runInference, getWorkerCrashCount } from "./utils/inference";
import { useAudioProcessing } from "./hooks/useAudioProcessing";
import type { TextSegment } from "./utils/textDecoder";
import type { SignalQualityMetrics } from "./utils/signalQuality";
import { GGMorse } from "./ggmorse";
import { SAMPLE_RATE } from "./const";

const waitForNextAudioChunk = (
  audioBufferRef: MutableRefObject<{ version: number }>,
  currentVersion: number,
  isCancelled: () => boolean,
): Promise<void> =>
  new Promise((resolve) => {
    const pollForAudio = () => {
      if (isCancelled() || audioBufferRef.current.version !== currentVersion) {
        resolve();
        return;
      }
      window.setTimeout(pollForAudio, 10);
    };

    pollForAudio();
  });

type DecoderMode = "dl" | "ggmorse";

type UseDecodeParams = {
  filterFreq: number | null;
  filterWidth: number;
  gain: number;
  stream: MediaStream | null;
  decodeWindowSeconds: number;
  decoderMode?: DecoderMode;
};

export const useDecode = ({
  filterFreq,
  filterWidth,
  gain,
  stream,
  decodeWindowSeconds,
  decoderMode = "dl",
}: UseDecodeParams) => {
  const [loaded, setLoaded] = useState(false);
  const [currentSegments, setCurrentSegments] = useState<TextSegment[]>([]);
  const [isDecoding, setIsDecoding] = useState(false);
  const [signalQuality, setSignalQuality] = useState<SignalQualityMetrics | null>(null);
  const [workerCrashed, setWorkerCrashed] = useState(false);
  const [ggMorseText, setGgMorseText] = useState<string>("");

  const filterParamsRef = useRef({ filterFreq, filterWidth });
  const audioBufferRef = useAudioProcessing(stream, gain, decodeWindowSeconds);
  const ggmorseRef = useRef<GGMorse | null>(null);
  const isGgMorseMode = decoderMode === "ggmorse";

  useEffect(() => {
    if (!isGgMorseMode) {
      (async () => {
        await loadModel();
        setLoaded(true);
      })();
    } else {
      setLoaded(true);
    }
  }, [isGgMorseMode]);

  useEffect(() => {
    filterParamsRef.current = { filterFreq, filterWidth };
  }, [filterFreq, filterWidth]);

  useEffect(() => {
    setCurrentSegments([]);
    setGgMorseText("");
  }, [decodeWindowSeconds, decoderMode]);

  useEffect(() => {
    if (!stream || !loaded) {
      return;
    }

    let cancelled = false;
    let lastAudioVersion = -1;
    let isRunning = true;

    const decodeContinuously = async () => {
      while (!cancelled && isRunning) {
        const audioVersion = audioBufferRef.current.version;
        if (audioVersion === lastAudioVersion) {
          await waitForNextAudioChunk(
            audioBufferRef,
            audioVersion,
            () => cancelled || !isRunning,
          );
          if (cancelled || !isRunning) {
            return;
          }
          continue;
        }

        lastAudioVersion = audioVersion;
        const { filterFreq, filterWidth } = filterParamsRef.current;

        if (isGgMorseMode) {
          if (!ggmorseRef.current) {
            ggmorseRef.current = new GGMorse({ sampleRate: SAMPLE_RATE });
            ggmorseRef.current.onText((text) => {
              if (!cancelled) {
                setGgMorseText(text);
              }
            });
          }

          ggmorseRef.current.processSamples(audioBufferRef.current.samples);
        } else {
          // Capture both version and samples reference atomically before the
          // async call — the audioBufferRef.current object can be replaced
          // when decodeWindowSeconds changes.
          const capturedVersion = audioVersion;
          const capturedSamples = audioBufferRef.current.samples;

          try {
            const { segments, signalQuality: sq } = await runInference(
              capturedSamples,
              filterFreq,
              filterWidth,
            );
            // Discard stale result if buffer was replaced during inference
            if (cancelled || !isRunning || audioBufferRef.current.version !== capturedVersion) {
              return;
            }
            setCurrentSegments(segments);
            setSignalQuality(sq);
            setWorkerCrashed(false); // Clear crash flag on success
          } catch (error) {
            console.error("[useDecode] Inference error:", error);
            setWorkerCrashed(getWorkerCrashCount() > 0);
          }
        }
      }
    };

    setIsDecoding(true);
    decodeContinuously().catch((error) => {
      console.error("[useDecode] Decode loop error:", error);
    });

    return () => {
      cancelled = true;
      isRunning = false;
      if (ggmorseRef.current) {
        ggmorseRef.current.reset();
        ggmorseRef.current = null;
      }
      setIsDecoding(false);
    };
  }, [stream, loaded, audioBufferRef, isGgMorseMode]);

  return {
    loaded,
    currentSegments,
    isDecoding,
    signalQuality,
    ggMorseText,
    isGgMorseMode,
    workerCrashed,
  };
};
