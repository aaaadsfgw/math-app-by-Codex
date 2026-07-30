const DEFAULT_TIMEOUT_MS = 2_000;
const MIN_TIMEOUT_MS = 50;
const MAX_TIMEOUT_MS = 10_000;
const ALLOWED_OPERATIONS = new Set([
  "differentiate",
  "equivalent",
  "integrate",
  "roots",
  "simplify",
]);
let requestSequence = 0;

export class SymbolicWorkerError extends Error {
  constructor(message, { code = "SYMBOLIC_WORKER_ERROR", cause } = {}) {
    super(message, { cause });
    this.name = "SymbolicWorkerError";
    this.code = code;
  }
}

function normalizedTimeout(value) {
  const timeout = Number(value);
  if (!Number.isFinite(timeout)) return DEFAULT_TIMEOUT_MS;
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.trunc(timeout)));
}

function defaultWorkerFactory() {
  if (typeof Worker !== "function") {
    throw new SymbolicWorkerError("この画面では隔離記号計算を利用できません。", {
      code: "WORKER_UNAVAILABLE",
    });
  }
  return new Worker(new URL("./symbolic-worker.js", import.meta.url), { type: "module" });
}

export function runSymbolicOperation(
  operation,
  args,
  { timeoutMs = DEFAULT_TIMEOUT_MS, workerFactory = defaultWorkerFactory } = {},
) {
  if (!ALLOWED_OPERATIONS.has(operation)) {
    return Promise.reject(new SymbolicWorkerError("許可されていない記号計算操作です。", {
      code: "UNSUPPORTED_OPERATION",
    }));
  }
  if (!Array.isArray(args)) {
    return Promise.reject(new SymbolicWorkerError("記号計算の引数は配列で指定してください。", {
      code: "INVALID_ARGUMENTS",
    }));
  }

  let worker;
  try {
    worker = workerFactory();
  } catch (error) {
    return Promise.reject(
      error instanceof SymbolicWorkerError
        ? error
        : new SymbolicWorkerError("隔離記号計算を開始できません。", {
            code: "WORKER_START_FAILED",
            cause: error,
          }),
    );
  }

  const id = `symbolic-${Date.now()}-${requestSequence += 1}`;
  const deadline = normalizedTimeout(timeoutMs);
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      worker.removeEventListener?.("message", onMessage);
      worker.removeEventListener?.("error", onError);
      worker.terminate?.();
    };
    const finish = (operationToRun) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      operationToRun();
    };
    const onMessage = (event) => {
      const response = event.data ?? {};
      if (response.id !== id) return;
      if (response.ok) {
        finish(() => resolve(response.result));
        return;
      }
      finish(() => reject(new SymbolicWorkerError(
        String(response.error?.message || "記号計算に失敗しました。"),
        { code: String(response.error?.code || "SYMBOLIC_ENGINE_ERROR") },
      )));
    };
    const onError = (event) => {
      finish(() => reject(new SymbolicWorkerError(
        String(event?.message || "隔離記号計算ワーカーでエラーが発生しました。"),
        { code: "WORKER_FAILURE" },
      )));
    };
    const timer = setTimeout(() => {
      finish(() => reject(new SymbolicWorkerError(
        `記号計算が${deadline}ミリ秒以内に完了しませんでした。`,
        { code: "SYMBOLIC_TIMEOUT" },
      )));
    }, deadline);

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    try {
      worker.postMessage({ id, operation, args });
    } catch (error) {
      finish(() => reject(new SymbolicWorkerError("記号計算要求を送信できません。", {
        code: "WORKER_POST_FAILED",
        cause: error,
      })));
    }
  });
}

export function simplifyInWorker(expression, options) {
  return runSymbolicOperation("simplify", [expression], options);
}

export function differentiateInWorker(expression, variable = "x", options) {
  return runSymbolicOperation("differentiate", [expression, variable], options);
}

export function integrateInWorker(expression, variable = "x", options) {
  return runSymbolicOperation("integrate", [expression, variable], options);
}

export function rootsInWorker(expression, variable = "x", options) {
  return runSymbolicOperation("roots", [expression, variable], options);
}

export function equivalentInWorker(left, right, options) {
  return runSymbolicOperation("equivalent", [left, right], options);
}
