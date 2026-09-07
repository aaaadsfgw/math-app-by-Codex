export class OcrWorkerClientError extends Error {
  constructor(message, { code = "OCR_WORKER_CLIENT_ERROR", cause = null } = {}) {
    super(message, cause instanceof Error ? { cause } : undefined);
    this.name = "OcrWorkerClientError";
    this.code = code;
  }
}

function clientError(message, code, cause = null) {
  return new OcrWorkerClientError(message, { code, cause });
}

function defaultWorkerFactory() {
  return new Worker(new URL("./ocr-worker.js", import.meta.url), {
    type: "module",
    name: "math-study-log-ocr",
  });
}

export async function createIbemOcrBackendSession({
  provider,
  signal,
  workerFactory = defaultWorkerFactory,
} = {}) {
  if (!new Set(["webgpu", "wasm"]).has(provider)) {
    throw new TypeError("OCR providerが不正です。");
  }
  if (typeof workerFactory !== "function") throw new TypeError("workerFactoryが必要です。");
  if (signal?.aborted) throw clientError("OCR処理はキャンセルされました。", "OCR_CANCELLED");

  const worker = workerFactory();
  let disposed = false;
  let nextRequestId = 1;
  const pending = new Map();

  const terminate = (reason = clientError("OCR Workerは停止しました。", "OCR_WORKER_TERMINATED")) => {
    if (disposed) return;
    disposed = true;
    worker.terminate();
    for (const request of pending.values()) {
      request.reject(reason);
    }
    pending.clear();
  };

  const ready = new Promise((resolve, reject) => {
    const abort = () => {
      const error = clientError("OCR処理はキャンセルされました。", "OCR_CANCELLED");
      terminate(error);
      reject(error);
    };
    signal?.addEventListener("abort", abort, { once: true });

    worker.addEventListener("error", (event) => {
      const error = clientError("OCR Workerを起動できません。", "OCR_WORKER_START_FAILED", event.error);
      terminate(error);
      reject(error);
    }, { once: true });
    worker.addEventListener("message", (event) => {
      const message = event.data;
      if (message?.type === "READY") {
        signal?.removeEventListener("abort", abort);
        resolve();
      } else if (message?.type === "INIT_ERROR") {
        signal?.removeEventListener("abort", abort);
        const error = clientError(
          String(message.error?.message || "OCR Workerの初期化に失敗しました。"),
          String(message.error?.code || "OCR_WORKER_INIT_FAILED"),
        );
        terminate(error);
        reject(error);
      }
    });
    worker.postMessage({ type: "INIT", provider });
  });
  await ready;

  worker.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || !Number.isSafeInteger(message.requestId)) return;
    const request = pending.get(message.requestId);
    if (!request) return;
    if (message.type === "PROGRESS") {
      request.onProgress(message.progress);
      return;
    }
    pending.delete(message.requestId);
    request.signal?.removeEventListener("abort", request.abort);
    if (message.type === "RESULT") request.resolve(message.result);
    else if (message.type === "RESULT_ERROR") {
      request.reject(clientError(
        String(message.error?.message || "OCR推論に失敗しました。"),
        String(message.error?.code || "OCR_WORKER_INFERENCE_FAILED"),
      ));
    }
  });

  return Object.freeze({
    recognize(blob, { signal: requestSignal, onProgress = () => {} } = {}) {
      if (disposed) return Promise.reject(clientError("OCR Workerは停止済みです。", "OCR_WORKER_TERMINATED"));
      if (requestSignal?.aborted) {
        terminate();
        return Promise.reject(clientError("OCR処理はキャンセルされました。", "OCR_CANCELLED"));
      }
      const requestId = nextRequestId;
      nextRequestId += 1;
      return new Promise((resolve, reject) => {
        const abort = () => {
          const error = clientError("OCR処理はキャンセルされました。", "OCR_CANCELLED");
          terminate(error);
          reject(error);
        };
        requestSignal?.addEventListener("abort", abort, { once: true });
        pending.set(requestId, { resolve, reject, signal: requestSignal, abort, onProgress });
        worker.postMessage({ type: "RECOGNIZE", requestId, blob });
      });
    },
    dispose() {
      terminate();
    },
  });
}
