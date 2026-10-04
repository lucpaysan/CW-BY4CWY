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
import { WpmEstimator } from "../deepcw/wpmEstimator";
import {
  DEEPCW_MODEL_FILE,
  DEEPCW_INPUT_NAME,
  DEEPCW_OUTPUT_NAME,
  DEEPCW_SAMPLE_RATE,
} from "../deepcw/config";
import { estimateSNR } from "../utils/signalQuality";

/**
 * 解析部署根路径（base path）。
 *
 * Worker 在生产构建中位于 `<base>/assets/xxx.js`，
 * 而模型与 WASM 位于 `<base>/`。
 * GitHub Pages 部署在子目录（如 `/CW-BY4CWY/`），
 * 因此不能用 `origin/`，必须从 Worker 路径反推base。
 *
 * 与 utils/inference.ts 中 legacy Worker 的处理保持一致。
 */
function resolveBasePath(): string {
  const workerPath = self.location.pathname;
  const assetsIndex = workerPath.lastIndexOf("/assets/");
  if (assetsIndex !== -1) {
    return workerPath.substring(0, assetsIndex);
  }
  // 开发模式或非标准路径：退回到域名根目录
  return "";
}

/** 部署根路径下的资源 URL 推导（模型与 WASM 都位于 <base>/ 下） */
function resolveAssetUrl(fileName: string): string {
  return `${self.location.origin}${resolveBasePath()}/${fileName}`;
}

type WorkerRequest =
  | { id: number; type: "loadModel" }
  | { id: number; type: "runInference"; audioBuffer: Float32Array }
  | { id: number; type: "unloadModel" }
  | { id: number; type: "resetWpm" };

export interface DeepCWSegment {
  text: string;
  raw: string;
  confidence: number;
  callsigns: string[];
  reports: string[];
  qcodes: string[];
  /** 是否经过连读重切分 */
  resegmented: boolean;
  /** 实测发报速度估计 */
  wpm: number | null;
  /** 速度是否超出安全区间 */
  wpmOutOfRange: boolean;
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
  | { id: number; type: "wpmReset" }
  | { id: number; type: "error"; error: string };

let session: ort.InferenceSession | null = null;
let loadPromise: Promise<ort.InferenceSession> | null = null;

/** WPM 估计器在 Worker 内维护（跨多次推理平滑） */
let wpmEstimator: WpmEstimator | null = null;

async function ensureSession(): Promise<ort.InferenceSession> {
  if (session) return session;
  if (loadPromise) return loadPromise;

  const promise = (async () => {
    // WASM 走本地 public/，避免依赖 CDN（离线场景必需）。
    //
    // ⚠️ 这里必须用 resolveAssetUrl 而非 `${origin}/`：
    // GitHub Pages 部署在子目录（如 /CW-BY4CWY/），
    // 硬编码 origin 会导致 WASM 404，模型加载随之失败。
    // 这个 bug 在推送前审计中被发现（见 docs/AUDIT_REPORT.md P0-1）。
    ort.env.wasm.wasmPaths = resolveAssetUrl("");

    const created = await ort.InferenceSession.create(
      resolveAssetUrl(DEEPCW_MODEL_FILE),
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

  // WPM 估计：**瞬时估计 + EMA**（observeWindow）。
  //
  // ⚠️ 不能跨推理累计差值：音频缓冲是固定长度的滚动窗口，
  //    audioSeconds 恒定，且窗口内容的差值在稳态下趋零。
  //    交叉审计曾用生产调用模式复现出「70 次推理累计码元为 0」
  //    的完全失效（见 docs/AUDIT_REPORT_2.md X-1）。
  //    瞬时估计每次独立成立，EMA 平滑误识抖动。
  const audioSeconds = audioBuffer.length / DEEPCW_SAMPLE_RATE;
  if (!wpmEstimator) {
    wpmEstimator = new WpmEstimator({ windowSeconds: Math.round(audioSeconds) });
  }
  const wpmResult = wpmEstimator.observeWindow(decoded.text, audioSeconds);

  return {
    segments: [
      {
        text: decoded.text,
        raw: decoded.raw,
        confidence: decoded.confidence,
        callsigns: elements.callsigns,
        reports: elements.reports,
        qcodes: elements.qcodes,
        resegmented: decoded.resegmented,
        wpm: wpmResult.wpm,
        wpmOutOfRange: wpmResult.outOfRange,
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
        wpmEstimator = null;
        respond({ id: message.id, type: "modelUnloaded" });
        return;
      }
      case "resetWpm": {
        wpmEstimator?.reset();
        respond({ id: message.id, type: "wpmReset" });
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
