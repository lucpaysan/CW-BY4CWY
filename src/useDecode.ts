import { useEffect, useState, useRef, type MutableRefObject } from "react";
import { loadModel, runInference } from "./utils/inference";
import { useAudioProcessing } from "./hooks/useAudioProcessing";
import { defaultBayesianDecoder } from "./core/bayesianDecoder";
import { SAMPLE_RATE } from "./const";
import type { TextSegment } from "./utils/textDecoder";

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

type DecoderMode = "DL" | "BAYESIAN";

type UseDecodeParams = {
  filterFreq: number | null;
  filterWidth: number;
  gain: number;
  stream: MediaStream | null;
  language: "EN" | "EN/JA";
  decoderMode: DecoderMode;
  enabled?: boolean;
};

/**
 * Convert Bayesian decoder result to TextSegment format
 */
function bayesianToTextSegment(text: string): TextSegment[] {
  if (!text) return [];
  return [{ text, isAbbreviation: false }];
}

export const useDecode = ({
  filterFreq,
  filterWidth,
  gain,
  stream,
  language,
  decoderMode,
  enabled = true,
}: UseDecodeParams) => {
  const [loaded, setLoaded] = useState(false);
  const [loadedJa, setLoadedJa] = useState(false);
  const [currentSegments, setCurrentSegments] = useState<TextSegment[]>([]);
  const [currentSegmentsJa, setCurrentSegmentsJa] = useState<TextSegment[]>([]);
  const [isDecoding, setIsDecoding] = useState(false);

  const filterParamsRef = useRef({ filterFreq, filterWidth });
  const audioBufferRef = useAudioProcessing(stream, gain);
  const bayesianDecoderRef = useRef(defaultBayesianDecoder);

  useEffect(() => {
    (async () => {
      console.log("[useDecode] Loading English model...");
      try {
        await loadModel("en");
        console.log("[useDecode] English model loaded successfully");
        setLoaded(true);
      } catch (error) {
        console.error("[useDecode] Failed to load English model:", error);
      }
    })();
  }, []);

  useEffect(() => {
    if (language === "EN/JA" && !loadedJa) {
      (async () => {
        console.log("[useDecode] Loading Japanese model...");
        try {
          await loadModel("ja");
          console.log("[useDecode] Japanese model loaded successfully");
          setLoadedJa(true);
        } catch (error) {
          console.error("[useDecode] Failed to load Japanese model:", error);
        }
      })();
    }
  }, [language, loadedJa]);

  useEffect(() => {
    filterParamsRef.current = { filterFreq, filterWidth };
  }, [filterFreq, filterWidth]);

  // Reset Bayesian decoder when stream changes
  useEffect(() => {
    bayesianDecoderRef.current.reset();
  }, [stream]);

  useEffect(() => {
    if (!stream || !loaded || !enabled) {
      return;
    }

    let cancelled = false;
    let lastAudioVersion = -1;

    const decodeContinuously = async () => {
      while (!cancelled) {
        const audioVersion = audioBufferRef.current.version;
        if (audioVersion === lastAudioVersion) {
          await waitForNextAudioChunk(
            audioBufferRef,
            audioVersion,
            () => cancelled,
          );
          if (cancelled) {
            return;
          }
          continue;
        }

        lastAudioVersion = audioVersion;
        const { filterFreq, filterWidth } = filterParamsRef.current;

        if (decoderMode === "BAYESIAN") {
          // Use Bayesian decoder
          const result = bayesianDecoderRef.current.processAudio(
            audioBufferRef.current.samples,
            SAMPLE_RATE
          );
          if (cancelled) {
            return;
          }
          setCurrentSegments(bayesianToTextSegment(result.text));
        } else {
          // Use Deep Learning decoder
          const segmentsEn = await runInference(
            audioBufferRef.current.samples,
            filterFreq,
            filterWidth,
            "en"
          );
          if (cancelled) {
            return;
          }
          setCurrentSegments(segmentsEn);

          if (language === "EN/JA" && loadedJa) {
            const segmentsJa = await runInference(
              audioBufferRef.current.samples,
              filterFreq,
              filterWidth,
              "ja"
            );
            if (cancelled) {
              return;
            }
            setCurrentSegmentsJa(segmentsJa);
          }
        }
      }
    };

    setIsDecoding(true);
    void decodeContinuously();

    return () => {
      cancelled = true;
      setIsDecoding(false);
    };
  }, [stream, loaded, loadedJa, language, decoderMode, enabled, audioBufferRef]);

  return { loaded, loadedJa, currentSegments, currentSegmentsJa, isDecoding };
};
