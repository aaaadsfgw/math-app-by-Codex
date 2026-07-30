import {
  areSymbolicallyEquivalent,
  differentiateSymbolic,
  integrateSymbolic,
  rootsSymbolic,
  simplifySymbolic,
} from "./symbolic-adapter.js";

const operations = Object.freeze({
  differentiate: differentiateSymbolic,
  equivalent: areSymbolicallyEquivalent,
  integrate: integrateSymbolic,
  roots: rootsSymbolic,
  simplify: simplifySymbolic,
});

self.addEventListener("message", (event) => {
  const { id, operation, args = [] } = event.data ?? {};
  const handler = operations[operation];
  if (!handler || !Array.isArray(args)) {
    self.postMessage({
      id,
      ok: false,
      error: {
        name: "SymbolicEngineError",
        code: "UNSUPPORTED_OPERATION",
        message: "許可されていない記号計算操作です。",
      },
    });
    return;
  }

  try {
    const result = handler(...args);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: {
        name: String(error?.name || "SymbolicEngineError"),
        code: String(error?.code || "SYMBOLIC_ENGINE_ERROR"),
        message: String(error?.message || "記号計算に失敗しました。"),
      },
    });
  }
});
