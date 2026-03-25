/// <reference lib="webworker" />
import * as ort from "onnxruntime-web";
import { audioToSpectrogramTensor } from "../utils/spectrogramUtils";
import { decodePredictions, type TextSegment } from "../utils/textDecoder";
import { ENGLISH_CONFIG } from "../const";

// Dynamic model URL using Vite's import.meta.url
const MODEL_URL = new URL(`../${ENGLISH_CONFIG.MODEL_FILE}`, import.meta.url).href;

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
  | { id: number; type: "inferenceResult"; segments: TextSegment[] }
  | { id: number; type: "error"; error: string };

let session: ort.InferenceSession | null = null;

async function ensureSession(): Promise<ort.InferenceSession> {
  if (session) return session;
  // Fetch ORT assets from the CDN to avoid module fetch failures in the worker.
  ort.env.wasm.wasmPaths =
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/";
  session = await ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ["wasm"],
  });
  return session;
}

async function handleRunInference(
  audioBuffer: Float32Array,
  filterFreq: number | null,
  filterWidth: number,
): Promise<TextSegment[]> {
  const sess = await ensureSession();

  const spectrogramInput = audioToSpectrogramTensor(
    audioBuffer,
    filterFreq,
    filterWidth,
  );
  if (!spectrogramInput) {
    return [];
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

  const decodedSegmentsList = decodePredictions(outputTensor.data, outputTensor.dims);
  return decodedSegmentsList.length > 0 ? decodedSegmentsList[0] : [];
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
      const segments = await handleRunInference(
        message.audioBuffer,
        message.filterFreq,
        message.filterWidth,
      );
      respond({ id: message.id, type: "inferenceResult", segments });
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
