import { useEffect, useState, useRef, type MutableRefObject } from "react";
import { loadModel, runInference } from "./utils/inference";
import { useAudioProcessing } from "./hooks/useAudioProcessing";
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

type UseDecodeParams = {
  filterFreq: number | null;
  filterWidth: number;
  gain: number;
  stream: MediaStream | null;
  decodeWindowSeconds: number;
};

export const useDecode = ({
  filterFreq,
  filterWidth,
  gain,
  stream,
  decodeWindowSeconds,
}: UseDecodeParams) => {
  const [loaded, setLoaded] = useState(false);
  const [currentSegments, setCurrentSegments] = useState<TextSegment[]>([]);
  const [isDecoding, setIsDecoding] = useState(false);

  const filterParamsRef = useRef({ filterFreq, filterWidth });
  const audioBufferRef = useAudioProcessing(stream, gain, decodeWindowSeconds);

  useEffect(() => {
    (async () => {
      await loadModel();
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    filterParamsRef.current = { filterFreq, filterWidth };
  }, [filterFreq, filterWidth]);

  useEffect(() => {
    setCurrentSegments([]);
  }, [decodeWindowSeconds]);

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

        try {
          const segments = await runInference(
            audioBufferRef.current.samples,
            filterFreq,
            filterWidth,
          );
          if (cancelled || !isRunning) {
            return;
          }
          setCurrentSegments(segments);
        } catch (error) {
          console.error("[useDecode] Inference error:", error);
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
      setIsDecoding(false);
    };
  }, [stream, loaded, audioBufferRef]);

  return { loaded, currentSegments, isDecoding };
};
