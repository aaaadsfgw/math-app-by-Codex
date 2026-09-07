import { createIbemRuntimeSession } from "./ibem-ocr-runtime.js";

let runtimeSession = null;

function errorPayload(error) {
  return Object.freeze({
    code: String(error?.code || "OCR_WORKER_ERROR").slice(0, 100),
    message: String(error?.message || "OCR Worker処理に失敗しました。").slice(0, 500),
  });
}

globalThis.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;
  if (message.type === "INIT") {
    void createIbemRuntimeSession(message.provider).then(
      (session) => {
        runtimeSession = session;
        globalThis.postMessage({ type: "READY", provider: session.provider });
      },
      (error) => globalThis.postMessage({ type: "INIT_ERROR", error: errorPayload(error) }),
    );
    return;
  }
  if (message.type === "RECOGNIZE") {
    if (!runtimeSession) {
      globalThis.postMessage({
        type: "RESULT_ERROR",
        requestId: message.requestId,
        error: { code: "OCR_WORKER_NOT_READY", message: "OCR Workerは準備中です。" },
      });
      return;
    }
    void runtimeSession.recognize(message.blob, (progress) => {
      globalThis.postMessage({ type: "PROGRESS", requestId: message.requestId, progress });
    }).then(
      (result) => globalThis.postMessage({ type: "RESULT", requestId: message.requestId, result }),
      (error) => globalThis.postMessage({
        type: "RESULT_ERROR",
        requestId: message.requestId,
        error: errorPayload(error),
      }),
    );
  }
});
