/**
 * DeepCW 推理主线程封装
 *
 * 与 utils/inference.ts 保持相同的设计：Worker 池 + 请求 ID 匹配 + 崩溃懒恢复。
 * 这样上层 useDecode 切换引擎时不需要改动调用方式。
 */
import type { DeepCWSegment } from "../workers/deepcwWorker";

type WorkerRequest =
  | { id: number; type: "loadModel" }
  | { id: number; type: "runInference"; audioBuffer: Float32Array }
  | { id: number; type: "unloadModel" };

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

export interface DeepCWInferenceResult {
  segments: DeepCWSegment[];
  snrDb: number;
  confidence: number;
}

let worker: Worker | null = null;
let nextRequestId = 1;
let loadPromise: Promise<void> | null = null;
let crashCount = 0;

const pending = new Map<
  number,
  {
    resolve: (r: WorkerResponse) => void;
    reject: (e: Error) => void;
  }
>();

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL("../workers/deepcwWorker.ts", import.meta.url), {
    type: "module",
  });

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);

    if (message.type === "error") {
      entry.reject(new Error(message.error));
      return;
    }
    entry.resolve(message);
  };

  // 单个 Worker 崩溃不清空全部在途请求，只标记并让下次调用重建
  worker.onerror = (event: ErrorEvent) => {
    console.error(
      "[deepcw] Worker error:",
      event.message,
      event.filename,
      event.lineno,
    );
    crashCount++;
    worker = null;
    loadPromise = null;
  };

  return worker;
}

/**
 * 发送消息。
 *
 * 不用 Omit<WorkerRequest, "id">：它对联合类型不做 distribute，
 * 结果会丢掉 runInference 的 audioBuffer 字段。这里显式声明参数类型。
 */
function send(
  request: WorkerRequest extends infer T ? T extends WorkerRequest ? Omit<T, "id"> : never : never,
  transfer?: Transferable[],
): Promise<WorkerResponse> {
  const activeWorker = getWorker();
  const id = nextRequestId++;
  const message = { ...request, id } as WorkerRequest;

  return new Promise<WorkerResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    activeWorker.postMessage(message, transfer ?? []);
  });
}

/** 加载 DeepCW 模型（幂等，重复调用共享同一个 Promise）*/
export async function loadDeepCWModel(): Promise<void> {
  if (loadPromise) return loadPromise;

  const promise = send({ type: "loadModel" })
    .then(() => {
      // send 内部已把 error 类型转成 reject，这里无需再判断
    })
    .catch((error) => {
      loadPromise = null;
      throw error;
    });

  loadPromise = promise;
  return promise;
}

/** 释放模型显存，供引擎切换时使用 */
export async function unloadDeepCWModel(): Promise<void> {
  try {
    await send({ type: "unloadModel" });
  } catch {
    // Worker 可能已崩溃，忽略
  }
  loadPromise = null;
}

/** 执行一次推理 */
export async function runDeepCWInference(
  audioBuffer: Float32Array,
): Promise<DeepCWInferenceResult> {
  try {
    await loadDeepCWModel();
  } catch (error) {
    console.error("[deepcw] Model load failed:", error);
    return { segments: [], snrDb: 0, confidence: 0 };
  }

  const audioCopy = audioBuffer.slice();

  try {
    const response = await send(
      { type: "runInference", audioBuffer: audioCopy },
      [audioCopy.buffer],
    );

    if (response.type === "inferenceResult") {
      crashCount = 0;
      return {
        segments: response.segments,
        snrDb: response.signalQuality.snrDb,
        confidence: response.signalQuality.confidence,
      };
    }

    return { segments: [], snrDb: 0, confidence: 0 };
  } catch (error) {
    console.error("[deepcw] Inference failed:", error);
    return { segments: [], snrDb: 0, confidence: 0 };
  }
}

/** Worker 崩溃次数（成功推理后归零），供 UI 提示 */
export function getDeepCWCrashCount(): number {
  return crashCount;
}
