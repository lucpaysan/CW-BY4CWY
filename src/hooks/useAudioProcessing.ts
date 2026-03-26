import { useEffect, useRef } from "react";
import { AUDIO_CHUNK_SAMPLES, SAMPLE_RATE, getBufferSamples } from "../const";

export type AudioBufferState = {
  samples: Float32Array;
  version: number;
};

function audioCallback(
  event: AudioProcessingEvent,
  audioBufferState: AudioBufferState
) {
  try {
    const chunk = event.inputBuffer.getChannelData(0);
    const chunkLen = chunk.length;
    const { samples } = audioBufferState;

    // Guard against pathological cases
    if (chunkLen === 0 || samples.length === 0) return;

    // Calculate how many "old" samples remain at the tail after shifting left
    const tailCount = samples.length - chunkLen;
    if (tailCount > 0) {
      // Shift existing samples left by chunkLen using non-overlapping subarray copies
      // This is safe regardless of overlap between source and destination ranges
      const tailSlice = samples.subarray(chunkLen);
      samples.set(tailSlice);
    }
    // Write new chunk at the end (overwrites the last chunkLen positions)
    samples.set(chunk, samples.length - chunkLen);
    audioBufferState.version += 1;
  } catch (e) {
    // Swallow callback errors to keep the audio pipeline alive
    console.warn("[useAudioProcessing] audioCallback error:", e);
  }
}

export function useAudioProcessing(
  stream: MediaStream | null,
  gain: number,
  bufferDurationSeconds: number
): React.MutableRefObject<AudioBufferState> {
  const audioBufferRef = useRef<AudioBufferState>({
    samples: new Float32Array(getBufferSamples(bufferDurationSeconds)),
    version: 0,
  });
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  useEffect(() => {
    audioBufferRef.current = {
      samples: new Float32Array(getBufferSamples(bufferDurationSeconds)),
      version: audioBufferRef.current.version + 1,
    };
  }, [bufferDurationSeconds]);

  useEffect(() => {
    if (!stream) return;

    const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(stream);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = Math.pow(10, gain / 20);

    const scriptProcessor = audioContext.createScriptProcessor(
      AUDIO_CHUNK_SAMPLES,
      1,
      1,
    );
    scriptProcessor.onaudioprocess = (event) =>
      audioCallback(event, audioBufferRef.current);

    source.connect(gainNode);
    gainNode.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    audioContextRef.current = audioContext;
    scriptProcessorRef.current = scriptProcessor;

    return () => {
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stream, gain]);

  return audioBufferRef;
}
