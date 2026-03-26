/// <reference lib="webworker" />
import * as ort from "onnxruntime-web";
import { audioToSpectrogramTensor } from "../utils/spectrogramUtils";
import { decodePredictions, type TextSegment } from "../utils/textDecoder";
import {
  estimateSNR,
  calculateModelConfidence,
  type SignalQualityMetrics,
} from "../utils/signalQuality";
import { ENGLISH_CONFIG } from "../const";

// Derive model URL from the worker's browser URL (self.location.pathname).
// In dev: worker at /node_modules/.vite/deps/.../inferenceWorker.js or /src/workers/...
// In prod: worker at /assets/inferenceWorker-xxx.js
// We need the web-accessible base path, not the Vite-processed module URL.
let MODEL_URL: string;
const WORKER_PATH = self.location.pathname;
const ASSETS_MARKER = "/assets/";
const assetsIndex = WORKER_PATH.lastIndexOf(ASSETS_MARKER);
if (assetsIndex !== -1) {
  // Worker is at /<base>/assets/inferenceWorker-xxx.js — go up one level
  const basePath = WORKER_PATH.substring(0, assetsIndex);
  MODEL_URL = `${self.location.origin}${basePath}/${ENGLISH_CONFIG.MODEL_FILE}`;
} else {
  // Worker is NOT under /assets/ (e.g. dev mode node_modules path).
  // Use origin + public path as fallback — in both dev and prod,
  // Vite serves public/ files at the origin root.
  MODEL_URL = `${self.location.origin}/${ENGLISH_CONFIG.MODEL_FILE}`;
}

type WorkerRequest =
  | { id: number; type: "loadModel" }
  | {
      id: number;
      type: "runInference";
      audioBuffer: Float32Array;
      filterFreq: number | null;
      filterWidth: number;
    };

type WorkerResponse =
  | { id: number; type: "modelLoaded" }
  | {
      id: number;
      type: "inferenceResult";
      segments: TextSegment[];
      signalQuality: SignalQualityMetrics;
    }
  | { id: number; type: "error"; error: string };

let session: ort.InferenceSession | null = null;

async function ensureSession(): Promise<ort.InferenceSession> {
  if (session) return session;
  // Serve WASM files locally from public/ (avoids CDN dependency)
  // In dev: http://localhost:PORT/ort-wasm-simd-threaded.wasm
  // In prod: served from same origin as the app
  ort.env.wasm.wasmPaths = `${self.location.origin}/`;
  session = await ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ["wasm", "webgl", "cpu"],
  });
  return session;
}

async function handleRunInference(
  audioBuffer: Float32Array,
  filterFreq: number | null,
  filterWidth: number,
): Promise<{ segments: TextSegment[]; signalQuality: SignalQualityMetrics }> {
  const sess = await ensureSession();

  // Estimate SNR from audio before processing
  const signalQuality = estimateSNR(audioBuffer, filterFreq, filterWidth);

  const spectrogramInput = audioToSpectrogramTensor(
    audioBuffer,
    filterFreq,
    filterWidth,
  );
  if (!spectrogramInput) {
    return { segments: [], signalQuality };
  }

  const inputTensor = new ort.Tensor(
    "float32",
    spectrogramInput.data,
    spectrogramInput.dims,
  );

  const inputName = sess.inputNames[0];
  const feeds = { [inputName]: inputTensor };
  const results = await sess.run(feeds);
  const outputTensor = results[sess.outputNames[0]];

  // Calculate model confidence from output probabilities
  const [, timeSteps, numClasses] = outputTensor.dims as [
    number,
    number,
    number,
  ];
  const predArray =
    outputTensor.data instanceof Float32Array
      ? outputTensor.data
      : new Float32Array(outputTensor.data as unknown as ArrayBuffer);
  const confidence = calculateModelConfidence(predArray, timeSteps, numClasses);

  const decodedSegmentsList = decodePredictions(
    outputTensor.data,
    outputTensor.dims,
  );

  return {
    segments: decodedSegmentsList.length > 0 ? decodedSegmentsList[0] : [],
    signalQuality: { ...signalQuality, confidence },
  };
}

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  const respond = (response: WorkerResponse) => ctx.postMessage(response);

  try {
    if (message.type === "loadModel") {
      await ensureSession();
      respond({ id: message.id, type: "modelLoaded" });
      return;
    }

    if (message.type === "runInference") {
      const { segments, signalQuality } = await handleRunInference(
        message.audioBuffer,
        message.filterFreq,
        message.filterWidth,
      );
      respond({ id: message.id, type: "inferenceResult", segments, signalQuality });
      return;
    }

    respond({
      id: (message as WorkerRequest).id,
      type: "error",
      error: "Unsupported worker message type.",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown worker error";
    respond({ id: message.id, type: "error", error: errorMessage });
  }
};

export {};
