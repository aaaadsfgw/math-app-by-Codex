import {
  JAPANESE_OCR_LIMITS,
  JAPANESE_OCR_MODEL,
  JAPANESE_OCR_RUNTIME,
} from "./japanese-ocr-config.js";

const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const INVISIBLE_CHARACTER = /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/u;

export class JapaneseOcrError extends Error {
  constructor(message, { code = "JAPANESE_OCR_FAILED", cause = null } = {}) {
    super(message, cause instanceof Error ? { cause } : undefined);
    this.name = "JapaneseOcrError";
    this.code = code;
  }
}

function ocrError(message, code, cause = null) {
  return new JapaneseOcrError(message, { code, cause });
}

function extensionUrl(path, runtime = globalThis.chrome?.runtime) {
  if (typeof runtime?.getURL !== "function") {
    throw ocrError("拡張機能内の日本語OCR資産を参照できません。", "JAPANESE_OCR_ASSET_URL_UNAVAILABLE");
  }
  const value = runtime.getURL(path);
  let parsed;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw ocrError("日本語OCR資産URLが不正です。", "JAPANESE_OCR_ASSET_URL_INVALID", cause);
  }
  if (parsed.protocol !== "chrome-extension:") {
    throw ocrError("日本語OCRは同梱資産だけを使用できます。", "JAPANESE_OCR_REMOTE_ASSET_FORBIDDEN");
  }
  return parsed.href.replace(/\/$/u, "");
}

async function defaultLoadTesseract() {
  return import("../../vendor/ocr/tesseract-japanese/tesseract.esm.min.js");
}

function tesseractApi(namespace) {
  const candidate = namespace?.default && typeof namespace.default === "object"
    ? namespace.default
    : namespace;
  if (typeof candidate?.createWorker !== "function") {
    throw ocrError("Tesseract.js APIが不正です。", "JAPANESE_OCR_RUNTIME_INVALID");
  }
  return candidate;
}

function validImage(blob) {
  return blob instanceof Blob
    && blob.size > 0
    && blob.size <= 8 * 1024 * 1024
    && new Set(["image/png", "image/jpeg", "image/webp"]).has(blob.type.toLowerCase());
}

function normalizeText(value) {
  const rawText = typeof value === "string" ? value.replace(/\r\n?/gu, "\n").trim() : "";
  if (
    !rawText
    || rawText.length > JAPANESE_OCR_LIMITS.maxCharacters
    || CONTROL_CHARACTER.test(rawText)
    || INVISIBLE_CHARACTER.test(rawText)
  ) {
    throw ocrError("日本語OCR出力が空か、安全に扱える範囲を超えています。", "JAPANESE_OCR_OUTPUT_INVALID");
  }
  return Object.freeze({
    rawText,
    text: rawText.split("\n").map((line) => line.trim()).filter(Boolean).join("\n"),
  });
}

function finiteConfidence(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : null;
}

function abortFailure(signal) {
  return signal?.reason instanceof JapaneseOcrError
    ? signal.reason
    : ocrError("日本語OCRをキャンセルしました。", "JAPANESE_OCR_CANCELLED", signal?.reason);
}

export function createJapaneseOcrRecognizer({
  loadTesseract = defaultLoadTesseract,
  runtime = globalThis.chrome?.runtime,
  setTimer = globalThis.setTimeout?.bind(globalThis),
  clearTimer = globalThis.clearTimeout?.bind(globalThis),
  now = () => globalThis.performance?.now?.() ?? Date.now(),
} = {}) {
  if (typeof loadTesseract !== "function") throw new TypeError("loadTesseractは関数で指定してください。");
  let worker = null;
  let workerPromise = null;
  let initializingWorker = null;
  let workerGeneration = 0;
  let outstanding = 0;
  let revision = 0;
  let idleTimer = null;
  let disposed = false;
  let queue = Promise.resolve();
  const terminationPromises = new WeakMap();

  const clearIdle = () => {
    if (idleTimer !== null && typeof clearTimer === "function") clearTimer(idleTimer);
    idleTimer = null;
  };

  const terminateCreatedWorker = async (candidate) => {
    if (
      (!candidate || (typeof candidate !== "object" && typeof candidate !== "function"))
      || typeof candidate.terminate !== "function"
    ) {
      return;
    }
    let termination = terminationPromises.get(candidate);
    if (!termination) {
      termination = Promise.resolve()
        .then(() => candidate.terminate())
        .catch(() => undefined);
      terminationPromises.set(candidate, termination);
    }
    await termination;
  };

  const terminateWorker = async () => {
    clearIdle();
    workerGeneration += 1;
    const current = worker;
    const initializing = initializingWorker;
    worker = null;
    initializingWorker = null;
    workerPromise = null;
    await Promise.all([
      terminateCreatedWorker(current),
      terminateCreatedWorker(initializing),
    ]);
  };

  const scheduleIdle = () => {
    clearIdle();
    if (typeof setTimer !== "function" || disposed || !worker) return;
    idleTimer = setTimer(() => { void terminateWorker(); }, JAPANESE_OCR_LIMITS.idleDisposeMs);
    idleTimer?.unref?.();
  };

  const createWorker = async () => {
    if (disposed) throw ocrError("日本語OCRは破棄されています。", "JAPANESE_OCR_DISPOSED");
    if (worker) return worker;
    if (!workerPromise) {
      const creationGeneration = workerGeneration;
      const pending = Promise.resolve().then(async () => {
        let created = null;
        try {
          const module = tesseractApi(await loadTesseract());
          created = await module.createWorker(
            "jpn",
            module.OEM?.LSTM_ONLY ?? 1,
            {
              workerPath: extensionUrl(JAPANESE_OCR_RUNTIME.workerPath, runtime),
              corePath: extensionUrl(JAPANESE_OCR_RUNTIME.corePath, runtime),
              langPath: extensionUrl(JAPANESE_OCR_RUNTIME.languagePath, runtime),
              workerBlobURL: false,
              cacheMethod: "none",
              gzip: false,
              legacyCore: false,
              legacyLang: false,
              logger: () => {},
            },
          );
          if (!created || typeof created.recognize !== "function" || typeof created.terminate !== "function") {
            throw ocrError("Tesseract.js workerが不正です。", "JAPANESE_OCR_WORKER_INVALID");
          }
          if (disposed || creationGeneration !== workerGeneration) {
            await terminateCreatedWorker(created);
            throw disposed
              ? ocrError("日本語OCRは破棄されています。", "JAPANESE_OCR_DISPOSED")
              : ocrError("日本語OCRをキャンセルしました。", "JAPANESE_OCR_CANCELLED");
          }
          initializingWorker = created;
          if (typeof created.setParameters === "function") {
            await created.setParameters({
              tessedit_pageseg_mode: module.PSM?.SINGLE_BLOCK ?? "6",
              preserve_interword_spaces: "1",
            });
          }
          if (disposed || creationGeneration !== workerGeneration) {
            await terminateCreatedWorker(created);
            throw disposed
              ? ocrError("日本語OCRは破棄されています。", "JAPANESE_OCR_DISPOSED")
              : ocrError("日本語OCRをキャンセルしました。", "JAPANESE_OCR_CANCELLED");
          }
          initializingWorker = null;
          worker = created;
          return created;
        } catch (error) {
          if (created && worker !== created) await terminateCreatedWorker(created);
          if (disposed) {
            throw ocrError("日本語OCRは破棄されています。", "JAPANESE_OCR_DISPOSED", error);
          }
          if (creationGeneration !== workerGeneration) {
            throw ocrError("日本語OCRをキャンセルしました。", "JAPANESE_OCR_CANCELLED", error);
          }
          if (error instanceof JapaneseOcrError) throw error;
          throw ocrError("日本語OCRランタイムを読み込めませんでした。", "JAPANESE_OCR_LOAD_FAILED", error);
        } finally {
          if (initializingWorker === created) initializingWorker = null;
          if (workerPromise === pending && worker !== created) workerPromise = null;
        }
      });
      workerPromise = pending;
    }
    return workerPromise;
  };

  const recognizeUnlocked = async (blob, signal, requestRevision) => {
    if (!validImage(blob)) {
      throw ocrError("日本語OCR画像が不正です。", "JAPANESE_OCR_IMAGE_INVALID");
    }
    if (signal?.aborted) throw abortFailure(signal);
    if (requestRevision !== revision) throw abortFailure(signal);
    clearIdle();
    const startedAt = now();
    let abortListener = null;
    try {
      const current = await createWorker();
      if (signal?.aborted || requestRevision !== revision) throw abortFailure(signal);
      const operation = current.recognize(blob);
      const result = signal
        ? await Promise.race([
            operation,
            new Promise((resolve, reject) => {
              abortListener = () => reject(abortFailure(signal));
              signal.addEventListener("abort", abortListener, { once: true });
            }),
          ])
        : await operation;
      if (requestRevision !== revision) throw abortFailure(signal);
      const normalized = normalizeText(result?.data?.text);
      return Object.freeze({
        ...normalized,
        confidence: finiteConfidence(result?.data?.confidence),
        timings: Object.freeze({ totalMilliseconds: Math.max(0, now() - startedAt) }),
        provider: "wasm",
        backend: JAPANESE_OCR_RUNTIME,
        model: JAPANESE_OCR_MODEL,
        confirmationRequired: true,
        verified: false,
      });
    } catch (error) {
      if (error instanceof JapaneseOcrError) throw error;
      await terminateWorker();
      throw ocrError("日本語の文字認識を完了できませんでした。", "JAPANESE_OCR_INFERENCE_FAILED", error);
    } finally {
      if (abortListener && signal) signal.removeEventListener("abort", abortListener);
      scheduleIdle();
    }
  };

  return Object.freeze({
    recognize(blob, { signal } = {}) {
      if (signal !== undefined && (!signal || typeof signal.aborted !== "boolean")) {
        return Promise.reject(new TypeError("signalにはAbortSignalを指定してください。"));
      }
      const requestRevision = revision;
      outstanding += 1;
      const result = queue.then(
        () => recognizeUnlocked(blob, signal, requestRevision),
        () => recognizeUnlocked(blob, signal, requestRevision),
      );
      const settled = result.finally(() => {
        outstanding = Math.max(0, outstanding - 1);
      });
      queue = settled.catch(() => undefined);
      return settled;
    },
    cancel() {
      const cancelled = outstanding;
      revision += 1;
      void terminateWorker();
      return cancelled;
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      revision += 1;
      await terminateWorker();
    },
    get status() {
      return Object.freeze({
        available: !disposed,
        state: disposed ? "disposed" : outstanding ? "working" : worker ? "ready" : "idle",
        warm: Boolean(worker),
        backend: JAPANESE_OCR_RUNTIME,
        model: JAPANESE_OCR_MODEL,
      });
    },
  });
}
