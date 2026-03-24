/// <reference lib="webworker" />
import * as ort from "onnxruntime-web";
import { audioToSpectrogramTensor } from "../utils/spectrogramUtils";
import { decodePredictions, type TextSegment } from "../utils/textDecoder";

type Lang = "en" | "ja";

// Model URLs from public folder (Vite copies public/ files to root of dist)
const MODEL_URLS: Record<Lang, string> = {
  en: "/model_en.onnx",
  ja: "/model_ja.onnx",
};

type WorkerRequest =
  | { id: number; type: "loadModel"; lang: Lang }
  | {
      id: number;
      type: "runInference";
      lang: Lang;
      audioBuffer: Float32Array;
      filterFreq: number | null;
      filterWidth: number;
    };

type WorkerResponse =
  | { id: number; type: "modelLoaded" }
  | { id: number; type: "inferenceResult"; segments: TextSegment[] }
  | { id: number; type: "error"; error: string };

const sessions: Record<Lang, ort.InferenceSession | null> = {
  en: null,
  ja: null,
};

async function ensureSession(lang: Lang): Promise<ort.InferenceSession> {
  if (sessions[lang]) return sessions[lang]!;
  // Set WASM path prefix - ONNX Runtime appends filename to this path.
  ort.env.wasm.wasmPaths = "/ort-wasm/";
  console.log("[Worker] Creating session, wasmPaths:", ort.env.wasm.wasmPaths);
  console.log("[Worker] Model URL:", MODEL_URLS[lang]);
  sessions[lang] = await ort.InferenceSession.create(MODEL_URLS[lang], {
    executionProviders: ["wasm"],
  });
  console.log("[Worker] Session created successfully");
  return sessions[lang]!;
}

async function handleRunInference(
  audioBuffer: Float32Array,
  filterFreq: number | null,
  filterWidth: number,
  lang: Lang
): Promise<TextSegment[]> {
  const session = await ensureSession(lang);

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

  const inputName = session.inputNames[0];
  const feeds = { [inputName]: inputTensor };
  const results = await session.run(feeds);
  const outputTensor = results[session.outputNames[0]];

  const decodedSegmentsList = decodePredictions(
    outputTensor.data,
    outputTensor.dims,
    lang
  );

  return decodedSegmentsList.length > 0 ? decodedSegmentsList[0] : [];
}

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  const respond = (response: WorkerResponse) => ctx.postMessage(response);

  try {
    if (message.type === "loadModel") {
      await ensureSession(message.lang);
      respond({ id: message.id, type: "modelLoaded" });
      return;
    }

    if (message.type === "runInference") {
      const segments = await handleRunInference(
        message.audioBuffer,
        message.filterFreq,
        message.filterWidth,
        message.lang
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
