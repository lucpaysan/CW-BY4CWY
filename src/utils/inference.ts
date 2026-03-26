import type { TextSegment } from "./textDecoder";
import type { SignalQualityMetrics } from "./signalQuality";

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

let inferenceWorker: Worker | null = null;
let nextRequestId = 1;
let modelLoadPromise: Promise<void> | null = null;
let workerCrashCount = 0; // Incremented each time the worker crashes; UI can display warning
const pendingRequests = new Map<
  number,
  {
    resolve: (response: WorkerResponse) => void;
    reject: (error: Error) => void;
  }
>();

function getWorker(): Worker {
  if (inferenceWorker) return inferenceWorker;

  inferenceWorker = new Worker(
    new URL("../workers/inferenceWorker.ts", import.meta.url),
    { type: "module" },
  );

  inferenceWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const pending = pendingRequests.get(message.id);
    if (!pending) return;

    pendingRequests.delete(message.id);

    if (message.type === "error") {
      pending.reject(new Error(message.error));
      return;
    }

    pending.resolve(message);
  };

  // Don't reject ALL pending requests on worker error — just log and let
  // subsequent requests recreate the worker lazily. This prevents a single
  // crash from cancelling unrelated in-flight inferences.
  inferenceWorker.onerror = (event: ErrorEvent) => {
    console.error("[inference] Worker error:", event.message, event.filename, event.lineno);
    workerCrashCount++;
    // Clear references so next call creates a fresh worker
    inferenceWorker = null;
  };

  return inferenceWorker;
}

function sendMessage(
  request: Omit<WorkerRequest, "id">,
  transfer?: Transferable[],
): Promise<WorkerResponse> {
  const worker = getWorker();
  const requestId = nextRequestId++;
  const message = { ...request, id: requestId } as WorkerRequest;

  return new Promise<WorkerResponse>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
    worker.postMessage(message, transfer ?? []);
  });
}

export async function loadModel(): Promise<void> {
  if (modelLoadPromise) return modelLoadPromise;

  const promise = sendMessage({ type: "loadModel" })
    .then((response) => {
      if (response.type === "modelLoaded") return;
      if (response.type === "error") throw new Error(response.error);
      throw new Error("Unexpected worker response while loading model.");
    })
    .catch((error) => {
      modelLoadPromise = null;
      throw error;
    });

  modelLoadPromise = promise;

  return promise;
}

export async function runInference(
  audioBuffer: Float32Array,
  filterFreq: number | null,
  filterWidth: number,
): Promise<{ segments: TextSegment[]; signalQuality: SignalQualityMetrics }> {
  try {
    await loadModel();
  } catch (error) {
    console.error("Failed to load inference model", error);
    return { segments: [], signalQuality: { snrDb: 0, signalPower: 0, noisePower: 0, confidence: 0 } };
  }

  const audioCopy = audioBuffer.slice();

  try {
    const response = await sendMessage(
      {
        type: "runInference",
        audioBuffer: audioCopy,
        filterFreq,
        filterWidth,
      } as Omit<WorkerRequest, "id">,
      [audioCopy.buffer],
    );

    if (response.type === "inferenceResult") {
      // Reset crash count on successful inference
      workerCrashCount = 0;
      return { segments: response.segments, signalQuality: response.signalQuality };
    }

    return { segments: [], signalQuality: { snrDb: 0, signalPower: 0, noisePower: 0, confidence: 0 } };
  } catch (error) {
    console.error("Inference worker error", error);
    return { segments: [], signalQuality: { snrDb: 0, signalPower: 0, noisePower: 0, confidence: 0 } };
  }
}

/** Returns the number of times the worker has crashed since last successful inference.
 *  The count resets to 0 on each successful inferenceResult.
 */
export function getWorkerCrashCount(): number {
  return workerCrashCount;
}
