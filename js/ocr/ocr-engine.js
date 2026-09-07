import { OCR_FOUNDATION_CONFIG } from "./ocr-config.js";
import {
  createOcrOutput,
  OcrOutputValidationError,
} from "./ocr-output.js";

export class OcrEngineError extends Error {
  constructor(
    message,
    {
      code = "OCR_ENGINE_ERROR",
      cause = null,
      provider = null,
      phase = null,
      attempts = [],
    } = {},
  ) {
    super(message, cause instanceof Error ? { cause } : undefined);
    this.name = "OcrEngineError";
    this.code = code;
    this.provider = provider;
    this.phase = phase;
    this.attempts = Object.freeze(attempts.map((attempt) => Object.freeze({ ...attempt })));
  }
}

class ProviderAttemptError extends Error {
  constructor(provider, phase, cause) {
    super(`OCR ${provider} ${phase} failed`, cause instanceof Error ? { cause } : undefined);
    this.name = "ProviderAttemptError";
    this.provider = provider;
    this.phase = phase;
    this.originalError = cause;
  }
}

function safeMessage(error) {
  try {
    if (error instanceof Error && typeof error.message === "string" && error.message.trim()) {
      return error.message.trim();
    }
    if (["string", "number", "boolean", "bigint"].includes(typeof error)) {
      return String(error).trim() || "詳細不明の例外";
    }
  } catch {
    // Hostile thrown values remain inside the OCR boundary.
  }
  return "詳細不明の例外";
}

function requestAbortError(signal) {
  if (signal?.reason instanceof OcrEngineError) return signal.reason;
  return new OcrEngineError("OCR処理はキャンセルされました。", {
    code: "OCR_CANCELLED",
    cause: signal?.reason instanceof Error ? signal.reason : null,
    phase: "request",
  });
}

function waitForSignal(operation, signal) {
  if (signal.aborted) return Promise.reject(requestAbortError(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(requestAbortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(operation).then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function normalizedTimeout(value, fallback) {
  const timeoutMs = value === undefined ? fallback : value;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMsは正の有限値で指定してください。");
  }
  return timeoutMs;
}

function normalizedMaxCharacters(value, fallback) {
  const maxCharacters = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters <= 0) {
    throw new TypeError("maxOutputCharactersは正の整数で指定してください。");
  }
  return maxCharacters;
}

function validateExternalSignal(signal) {
  if (
    signal !== undefined
    && (
      !signal
      || typeof signal.aborted !== "boolean"
      || typeof signal.addEventListener !== "function"
      || typeof signal.removeEventListener !== "function"
    )
  ) {
    throw new TypeError("signalにはAbortSignalを指定してください。");
  }
}

function validateConfig(config) {
  if (!config || typeof config !== "object") throw new TypeError("OCR configが不正です。");
  if (!config.backend || !config.model || !config.licenseGate || !config.availability) {
    throw new TypeError("OCR config metadataが不足しています。");
  }
  return config;
}

function providerAttemptRecord(error) {
  return Object.freeze({
    provider: error.provider,
    phase: error.phase,
    message: safeMessage(error.originalError),
  });
}

function providerIndependentInputError(error) {
  const code = String(error?.originalError?.code || "");
  if (!code.startsWith("OCR_IMAGE_")) return null;
  return new OcrEngineError(safeMessage(error.originalError), {
    code,
    cause: error.originalError,
    provider: error.provider,
    phase: "input",
    attempts: [providerAttemptRecord(error)],
  });
}

export class OcrEngine {
  constructor({
    backendFactory = null,
    config = OCR_FOUNDATION_CONFIG,
    timeoutMs,
    maxOutputCharacters,
  } = {}) {
    if (backendFactory !== null && typeof backendFactory !== "function") {
      throw new TypeError("backendFactoryは関数またはnullで指定してください。");
    }
    this._config = validateConfig(config);
    this._backendFactory = backendFactory;
    this._timeoutMs = normalizedTimeout(timeoutMs, config.defaultTimeoutMs);
    this._maxOutputCharacters = normalizedMaxCharacters(
      maxOutputCharacters,
      config.maxOutputCharacters,
    );
    this._sessionRecord = null;
    this._activeControllers = new Set();
    this._disposedSessions = new WeakSet();
    this._queueTail = Promise.resolve();
    this._disposed = false;
  }

  get status() {
    const injected = typeof this._backendFactory === "function";
    let state = "idle";
    if (this._disposed) state = "disposed";
    else if (this._activeControllers.size > 0) state = "working";
    else if (this._sessionRecord) state = "ready";

    return Object.freeze({
      state,
      available: injected && !this._disposed,
      availability: injected ? "local-backend" : "unavailable",
      unavailableReason: injected ? null : "backend-not-configured",
      unavailableCode: injected ? null : "OCR_BACKEND_NOT_CONFIGURED",
      licenseGate: this._config.licenseGate,
      redistributionAllowed: this._config.licenseGate.redistributionAllowed === true,
      backend: this._config.backend,
      model: this._config.model,
      warm: Boolean(this._sessionRecord) && !this._disposed,
      provider: this._sessionRecord?.provider || null,
    });
  }

  get metadata() {
    return Object.freeze({
      backend: this._config.backend,
      model: this._config.model,
      licenseGate: this._config.licenseGate,
      availability: this._config.availability,
    });
  }

  _assertAvailable() {
    if (this._disposed) {
      throw new OcrEngineError("OCRエンジンは破棄されています。", {
        code: "OCR_DISPOSED",
        phase: "availability",
      });
    }
    if (typeof this._backendFactory !== "function") {
      throw new OcrEngineError("OCRバックエンドが設定されていません。", {
        code: "OCR_UNAVAILABLE",
        phase: "availability",
        attempts: [{
          provider: null,
          phase: "backend-configuration",
          message: "OCRバックエンドが設定されていません。",
        }],
      });
    }
  }

  _createRequestScope(externalSignal, timeoutMs) {
    validateExternalSignal(externalSignal);
    const controller = new AbortController();
    let externalAbort = null;

    if (externalSignal) {
      externalAbort = () => {
        if (!controller.signal.aborted) {
          controller.abort(new OcrEngineError("OCR処理はキャンセルされました。", {
            code: "OCR_CANCELLED",
            cause: externalSignal.reason instanceof Error ? externalSignal.reason : null,
            phase: "request",
          }));
        }
      };
      if (externalSignal.aborted) externalAbort();
      else externalSignal.addEventListener("abort", externalAbort, { once: true });
    }

    const timer = globalThis.setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort(new OcrEngineError("OCR処理が時間内に完了しませんでした。", {
          code: "OCR_TIMEOUT",
          phase: "request",
        }));
      }
    }, timeoutMs);

    this._activeControllers.add(controller);
    return Object.freeze({
      controller,
      signal: controller.signal,
      cleanup: () => {
        globalThis.clearTimeout(timer);
        this._activeControllers.delete(controller);
        if (externalSignal && externalAbort) {
          externalSignal.removeEventListener("abort", externalAbort);
        }
      },
    });
  }

  async _withRequestLock(signal, action) {
    const previous = this._queueTail;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    this._queueTail = previous.then(() => gate, () => gate);
    try {
      await waitForSignal(previous, signal);
      return await action();
    } finally {
      release();
    }
  }

  async _disposeSession(session) {
    if (!session || (typeof session !== "object" && typeof session !== "function")) return;
    if (this._disposedSessions.has(session)) return;
    this._disposedSessions.add(session);
    try {
      const dispose = session.dispose;
      if (typeof dispose === "function") await dispose.call(session);
    } catch {
      // Disposal is best effort; the original OCR outcome remains authoritative.
    }
  }

  async _clearSession(record) {
    if (this._sessionRecord === record) this._sessionRecord = null;
    await this._disposeSession(record?.session);
  }

  async _createSession(provider, signal) {
    const context = Object.freeze({
      provider,
      backend: this._config.backend,
      model: this._config.model,
      signal,
    });
    const creation = Promise.resolve().then(() => this._backendFactory(context));

    creation.then(
      (lateSession) => {
        if (signal.aborted || this._disposed) void this._disposeSession(lateSession);
      },
      () => {},
    );

    let session;
    try {
      session = await waitForSignal(creation, signal);
      if (signal.aborted) throw requestAbortError(signal);
      if (this._disposed) {
        throw new OcrEngineError("OCRエンジンは破棄されています。", {
          code: "OCR_DISPOSED",
          phase: "load",
          provider,
        });
      }
      if (!session || typeof session !== "object" || typeof session.recognize !== "function") {
        throw new TypeError("backend sessionにrecognize関数がありません。");
      }
      return session;
    } catch (error) {
      if (error instanceof OcrEngineError) throw error;
      throw new ProviderAttemptError(provider, "load", error);
    }
  }

  async _invokeSession(record, input, signal) {
    const operation = Promise.resolve().then(() => record.session.recognize(input, Object.freeze({
      signal,
      provider: record.provider,
      backend: this._config.backend,
      model: this._config.model,
    })));
    try {
      return await waitForSignal(operation, signal);
    } catch (error) {
      await this._clearSession(record);
      if (error instanceof OcrEngineError) throw error;
      throw new ProviderAttemptError(record.provider, "inference", error);
    }
  }

  _validatedOutput(raw, provider) {
    try {
      return createOcrOutput(raw, {
        provider,
        backend: this._config.backend,
        model: this._config.model,
        maxCharacters: this._maxOutputCharacters,
      });
    } catch (error) {
      if (error instanceof OcrOutputValidationError) {
        throw new OcrEngineError(error.message, {
          code: "OCR_INVALID_OUTPUT",
          cause: error,
          provider,
          phase: "output-validation",
          attempts: [{ provider, phase: "output-validation", message: error.message }],
        });
      }
      throw error;
    }
  }

  async _runNewProvider(provider, input, signal) {
    const session = await this._createSession(provider, signal);
    const record = { provider, session };
    const raw = await this._invokeSession(record, input, signal);
    if (signal.aborted) {
      await this._clearSession(record);
      throw requestAbortError(signal);
    }
    if (this._disposed) {
      await this._clearSession(record);
      throw new OcrEngineError("OCRエンジンは破棄されています。", {
        code: "OCR_DISPOSED",
        provider,
        phase: "inference",
      });
    }
    try {
      const output = this._validatedOutput(raw, provider);
      this._sessionRecord = record;
      return output;
    } catch (error) {
      await this._clearSession(record);
      throw error;
    }
  }

  async _runWarmSession(input, signal) {
    const record = this._sessionRecord;
    const raw = await this._invokeSession(record, input, signal);
    try {
      return this._validatedOutput(raw, record.provider);
    } catch (error) {
      await this._clearSession(record);
      throw error;
    }
  }

  _finalProviderError(attempts, cause) {
    const hasInferenceFailure = attempts.some((attempt) => attempt.phase === "inference");
    return new OcrEngineError(
      hasInferenceFailure
        ? "ローカルOCR推論を完了できませんでした。"
        : "ローカルOCRモデルを読み込めませんでした。",
      {
        code: hasInferenceFailure ? "OCR_INFERENCE_FAILED" : "OCR_LOAD_FAILED",
        cause: cause instanceof Error ? cause : null,
        provider: cause?.provider || null,
        phase: cause?.phase || null,
        attempts,
      },
    );
  }

  async _recognizeWithFallback(input, signal) {
    const attempts = [];

    if (this._sessionRecord) {
      const warmProvider = this._sessionRecord.provider;
      try {
        return await this._runWarmSession(input, signal);
      } catch (error) {
        if (error instanceof OcrEngineError) throw error;
        if (!(error instanceof ProviderAttemptError)) throw error;
        const inputError = providerIndependentInputError(error);
        if (inputError) throw inputError;
        attempts.push(providerAttemptRecord(error));
        if (warmProvider !== "webgpu") throw this._finalProviderError(attempts, error);
      }
    }

    const configuredProviders = Array.isArray(this._config.providers)
      ? [...this._config.providers]
      : [];
    const providers = attempts.length > 0
      ? configuredProviders.filter((provider) => provider !== "webgpu")
      : configuredProviders;
    let lastFailure = null;
    for (const provider of providers) {
      try {
        return await this._runNewProvider(provider, input, signal);
      } catch (error) {
        if (error instanceof OcrEngineError) throw error;
        if (!(error instanceof ProviderAttemptError)) throw error;
        const inputError = providerIndependentInputError(error);
        if (inputError) throw inputError;
        lastFailure = error;
        attempts.push(providerAttemptRecord(error));
      }
    }
    throw this._finalProviderError(attempts, lastFailure);
  }

  async recognize(input, { signal, timeoutMs } = {}) {
    if (input === null || input === undefined) {
      throw new OcrEngineError("OCR入力画像がありません。", {
        code: "OCR_INPUT_EMPTY",
        phase: "input",
      });
    }
    this._assertAvailable();
    const deadline = normalizedTimeout(timeoutMs, this._timeoutMs);
    const scope = this._createRequestScope(signal, deadline);
    try {
      return await this._withRequestLock(scope.signal, async () => {
        this._assertAvailable();
        return this._recognizeWithFallback(input, scope.signal);
      });
    } finally {
      scope.cleanup();
    }
  }

  cancel(message = "OCR処理はキャンセルされました。") {
    const cancellation = new OcrEngineError(
      typeof message === "string" && message.trim()
        ? message.trim()
        : "OCR処理はキャンセルされました。",
      { code: "OCR_CANCELLED", phase: "request" },
    );
    let cancelled = 0;
    for (const controller of this._activeControllers) {
      if (!controller.signal.aborted) {
        controller.abort(cancellation);
        cancelled += 1;
      }
    }
    return cancelled;
  }

  async dispose() {
    if (this._disposed) return;
    this._disposed = true;
    const disposedError = new OcrEngineError("OCRエンジンは破棄されました。", {
      code: "OCR_DISPOSED",
      phase: "request",
    });
    for (const controller of this._activeControllers) {
      if (!controller.signal.aborted) controller.abort(disposedError);
    }
    const record = this._sessionRecord;
    this._sessionRecord = null;
    await this._disposeSession(record?.session);
  }
}

export function createOcrEngine(options) {
  return new OcrEngine(options);
}

export const createMathOcrEngine = createOcrEngine;
