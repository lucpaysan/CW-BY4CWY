import { useEffect, useState, useRef, type MutableRefObject } from "react";
import { loadModel, runInference, getWorkerCrashCount } from "./utils/inference";
import { useAudioProcessing } from "./hooks/useAudioProcessing";
import type { TextSegment } from "./utils/textDecoder";
import type { SignalQualityMetrics } from "./utils/signalQuality";
import { GGMorse } from "./ggmorse";
import { SAMPLE_RATE, AUDIO_CHUNK_SAMPLES } from "./const";

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
    // DSP 模式：已喂入到哪个音频版本（用于只喂新增量）
    let fedVersion = -1;

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
            // DSP 解码器有连续时序状态（Goertzel 滤波器 + 点划分类），
            // 不能喂历史数据：从当前版本开始，只喂「新增」的音频。
            fedVersion = audioVersion;
          }

          // ⚠️ 只喂新增音频，不要重喂整个滚动窗口。
          //
          // 早先每次都 processSamples(整个窗口)：同一段键音被反复
          // 喂入，点划时序全乱（这就是报告一里的第 5 个 DSP bug）。
          // 滚动缓冲每前进一个 chunk（AUDIO_CHUNK_SAMPLES）version +1，
          // 因此新增量 = (version 差) × chunk，从缓冲尾部取。
          const newChunks = audioVersion - fedVersion;
          if (newChunks > 0) {
            const samples = audioBufferRef.current.samples;
            const newCount = Math.min(samples.length, newChunks * AUDIO_CHUNK_SAMPLES);
            ggmorseRef.current.processSamples(
              samples.subarray(samples.length - newCount),
            );
            fedVersion = audioVersion;
          }
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
