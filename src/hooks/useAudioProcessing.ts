import { useEffect, useRef, useCallback } from "react";
import { SAMPLE_RATE, BUFFER_SAMPLES } from "../const";

export type AudioBufferState = {
  samples: Float32Array;
  version: number;
};

/**
 * Hook that captures audio from a MediaStream using AudioWorkletNode.
 * Maintains a rolling audio buffer that can be queried for decoding.
 *
 * Falls back to ScriptProcessorNode if AudioWorkletNode is not supported.
 */
export function useAudioProcessing(
  stream: MediaStream | null,
  gain: number
): React.MutableRefObject<AudioBufferState> {
  const audioBufferRef = useRef<AudioBufferState>({
    samples: new Float32Array(BUFFER_SAMPLES),
    version: 0,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  // Track if we're using worklet (for cleanup logic)
  const usingWorkletRef = useRef(false);

  // Periodic sync from worklet to main thread buffer
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Abort flag to prevent race conditions during async init
  const abortedRef = useRef(false);

  const syncBufferFromWorklet = useCallback(() => {
    if (workletNodeRef.current && !abortedRef.current) {
      workletNodeRef.current.port.postMessage({ type: "getBuffer" });
    }
  }, []);

  useEffect(() => {
    if (!stream) return;

    // Mark as not aborted when starting new setup
    abortedRef.current = false;

    const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(stream);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = Math.pow(10, gain / 20);

    audioContextRef.current = audioContext;
    sourceRef.current = source;

    const tryWorklet = async () => {
      // Check if we were aborted while waiting for async
      if (abortedRef.current) {
        // Cleanup already ran, abandon this initialization
        source.disconnect();
        gainNode.disconnect();
        await audioContext.close();
        return;
      }

      try {
        await audioContext.audioWorklet.addModule("/audioProcessor.js");

        // Check again after async - cleanup might have run
        if (abortedRef.current) {
          source.disconnect();
          gainNode.disconnect();
          await audioContext.close();
          return;
        }

        const workletNode = new AudioWorkletNode(audioContext, "audio-processor", {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          outputChannelCount: [0],
        });

        // Double-check after node creation
        if (abortedRef.current) {
          workletNode.disconnect();
          source.disconnect();
          gainNode.disconnect();
          await audioContext.close();
          return;
        }

        // Handle messages from worklet (buffer updates)
        workletNode.port.onmessage = (event) => {
          if (abortedRef.current) return;
          if (event.data.type === "buffer") {
            const workletSamples = event.data.samples;
            const localSamples = audioBufferRef.current.samples;
            const latestVersion = event.data.version;
            localSamples.set(workletSamples);
            audioBufferRef.current.version = latestVersion;
          }
        };

        source.connect(gainNode);
        gainNode.connect(workletNode);

        workletNodeRef.current = workletNode;
        usingWorkletRef.current = true;

        // Periodically request buffer sync from worklet
        syncIntervalRef.current = setInterval(syncBufferFromWorklet, 50);
      } catch (workletError) {
        // AudioWorkletNode not available, fall back to ScriptProcessorNode
        console.warn("[useAudioProcessing] AudioWorkletNode not available, falling back:", workletError);
        if (abortedRef.current) {
          source.disconnect();
          gainNode.disconnect();
          await audioContext.close();
          return;
        }
        useFallbackScriptProcessor(audioContext, source, gainNode);
      }
    };

    const useFallbackScriptProcessor = (
      ctx: AudioContext,
      src: MediaStreamAudioSourceNode,
      gn: GainNode
    ) => {
      const scriptProcessor = ctx.createScriptProcessor(2048, 1, 1);
      scriptProcessor.onaudioprocess = (event) => {
        if (abortedRef.current) return;
        const chunk = event.inputBuffer.getChannelData(0);
        const chunkLen = chunk.length;
        const samples = audioBufferRef.current.samples;
        samples.copyWithin(0, chunkLen);
        samples.set(chunk, BUFFER_SAMPLES - chunkLen);
        audioBufferRef.current.version += 1;
      };

      src.connect(gn);
      gn.connect(scriptProcessor);
      scriptProcessor.connect(ctx.destination);

      scriptNodeRef.current = scriptProcessor;
      usingWorkletRef.current = false;
    };

    void tryWorklet();

    return () => {
      // Signal abort to any pending async operations
      abortedRef.current = true;

      // Clear sync interval
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }

      // Cleanup based on which node type we're using
      if (workletNodeRef.current) {
        workletNodeRef.current.port.onmessage = null;
        workletNodeRef.current.disconnect();
        workletNodeRef.current = null;
      }

      if (scriptNodeRef.current) {
        scriptNodeRef.current.disconnect();
        scriptNodeRef.current = null;
      }

      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stream, gain, syncBufferFromWorklet]);

  return audioBufferRef;
}