/// <reference lib="webworker" />
/**
 * DeepCW 推理 Worker
 *
 * 与现有 inferenceWorker.ts 并存，通过 engine 参数区分。
 * 两者共享同一套消息协议，上层 useDecode 可以无缝切换。
 */
import * as ort from "onnxruntime-web";
import { audioToDeepCWSpectrogram } from "../deepcw/spectrogram";
import { greedyCTCDecode } from "../deepcw/ctcDecoder";
import { extractQSOElements } from "../deepcw/abbrevExpander";
import {
  DEEPCW_MODEL_FILE,
  DEEPCW_INPUT_NAME,
  DEEPCW_OUTPUT_NAME,
  DEEPCW_SAMPLE_RATE,
} from "../deepcw/config";
import { estimateSNR } from "../utils/signalQuality";

/** 模型 URL 推导：Worker 可能位于 /assets/ 或开发时的 node_modules 路径 */
function resolveModelUrl(fileName: string): string {
  const workerPath = self.location.pathname;
  const assetsIndex = workerPath.lastIndexOf("/assets/");
  if (assetsIndex !== -1) {
    const basePath = workerPath.substring(0, assetsIndex);
    return `${self.location.origin}${basePath}/${fileName}`;
  }
  return `${self.location.origin}/${fileName}`;
}

type WorkerRequest =
  | { id: number; type: "loadModel" }
  | { id: number; type: "runInference"; audioBuffer: Float32Array }
  | { id: number; type: "unloadModel" };

export interface DeepCWSegment {
  text: string;
  raw: string;
  confidence: number;
  callsigns: string[];
  reports: string[];
  qcodes: string[];
}

type WorkerResponse =
  | { id: number; type: "modelLoaded" }
  | {
      id: number;
      type: "inferenceResult";
      segments: DeepCWSegment[];
      signalQuality: { snrDb: number; confidence: number };
    }
  | { id: number; type: "modelUnloaded" }
  | { id: number; type: "error"; error: string };

let session: ort.InferenceSession | null = null;
let loadPromise: Promise<ort.InferenceSession> | null = null;

async function ensureSession(): Promise<ort.InferenceSession> {
  if (session) return session;
  if (loadPromise) return loadPromise;

  const promise = (async () => {
    // WASM 走本地 public/，避免依赖 CDN（离线场景必需）
    ort.env.wasm.wasmPaths = `${self.location.origin}/`;
    const created = await ort.InferenceSession.create(
      resolveModelUrl(DEEPCW_MODEL_FILE),
      {
        executionProviders: ["wasm", "webgl", "cpu"],
        graphOptimizationLevel: "all",
      },
    );
    session = created;
    return created;
  })();

  loadPromise = promise;
  try {
    return await promise;
  } catch (error) {
    loadPromise = null;
    throw error;
  }
}

async function handleRunInference(
  audioBuffer: Float32Array,
): Promise<{
  segments: DeepCWSegment[];
  signalQuality: { snrDb: number; confidence: number };
}> {
  const sess = await ensureSession();

  // SNR 估算基于 400-1200Hz 频带（DeepCW 的有效范围）
  const signalQuality = estimateSNR(
    audioBuffer,
    (400 + 1200) / 2,
    1200 - 400,
  );

  const spectrogram = audioToDeepCWSpectrogram(audioBuffer);
  if (!spectrogram) {
    return { segments: [], signalQuality: { snrDb: signalQuality.snrDb, confidence: 0 } };
  }

  const inputTensor = new ort.Tensor(
    "float32",
    spectrogram.data,
    spectrogram.dims,
  );

  const results = await sess.run({ [DEEPCW_INPUT_NAME]: inputTensor });
  const output = results[DEEPCW_OUTPUT_NAME];
  if (!output) {
    throw new Error(`Model output '${DEEPCW_OUTPUT_NAME}' not found.`);
  }

  const outputData =
    output.data instanceof Float32Array
      ? output.data
      : new Float32Array(output.data as ArrayBufferLike);

  const decoded = greedyCTCDecode(outputData, output.dims as readonly number[]);

  if (!decoded.text.trim()) {
    return {
      segments: [],
      signalQuality: { snrDb: signalQuality.snrDb, confidence: decoded.confidence },
    };
  }

  const elements = extractQSOElements(decoded.text);

  return {
    segments: [
      {
        text: decoded.text,
        raw: decoded.raw,
        confidence: decoded.confidence,
        callsigns: elements.callsigns,
        reports: elements.reports,
        qcodes: elements.qcodes,
      },
    ],
    signalQuality: {
      snrDb: signalQuality.snrDb,
      confidence: decoded.confidence,
    },
  };
}

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  const respond = (response: WorkerResponse) => ctx.postMessage(response);

  try {
    switch (message.type) {
      case "loadModel": {
        await ensureSession();
        respond({ id: message.id, type: "modelLoaded" });
        return;
      }
      case "runInference": {
        const { segments, signalQuality } = await handleRunInference(
          message.audioBuffer,
        );
        respond({ id: message.id, type: "inferenceResult", segments, signalQuality });
        return;
      }
      case "unloadModel": {
        session = null;
        loadPromise = null;
        respond({ id: message.id, type: "modelUnloaded" });
        return;
      }
      default: {
        respond({
          id: (message as { id: number }).id,
          type: "error",
          error: "Unsupported worker message type.",
        });
      }
    }
  } catch (error) {
    respond({
      id: (message as { id: number }).id,
      type: "error",
      error: error instanceof Error ? error.message : "Unknown DeepCW worker error",
    });
  }
};

/** 采样率常量，供上层校验 */
export { DEEPCW_SAMPLE_RATE };
export {};
