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
import { resolveAssetUrl } from "../utils/assetBase";

// Derive model URL from the worker's browser URL (see utils/assetBase.ts).
// In dev: worker at /node_modules/.vite/deps/... or /src/workers/... → origin root
// In prod: worker at /<base>/assets/inferenceWorker-xxx.js → <base>/
const MODEL_URL = resolveAssetUrl(ENGLISH_CONFIG.MODEL_FILE);

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
  // Serve WASM files locally from public/ (avoids CDN dependency).
  //
  // ⚠️ 不能硬编码 `${origin}/`：GitHub Pages 部署在子目录
  // （如 /CW-BY4CWY/）时该路径 404，模型加载随之失败。
  // 必须从 Worker 自身路径反推 base（与 deepcwWorker 一致，
  // 见 docs/AUDIT_REPORT_3.md 对 legacy Worker 的同款缺陷修复）。
  ort.env.wasm.wasmPaths = resolveAssetUrl("");
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
