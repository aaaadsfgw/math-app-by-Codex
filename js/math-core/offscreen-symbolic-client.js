import { SymbolicWorkerError } from "./symbolic-client.js";

const OFFSCREEN_PATH = "offscreen.html";
let creatingDocument = null;

function requireApi(extensionApi) {
  if (
    !extensionApi?.runtime?.getURL
    || !extensionApi?.runtime?.sendMessage
    || !extensionApi?.offscreen?.createDocument
  ) {
    throw new SymbolicWorkerError("オフスクリーン記号計算を利用できません。", {
      code: "OFFSCREEN_UNAVAILABLE",
    });
  }
  return extensionApi;
}

async function existingOffscreenDocument(extensionApi, documentUrl) {
  if (typeof extensionApi.runtime.getContexts === "function") {
    const contexts = await extensionApi.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [documentUrl],
    });
    return contexts.length > 0;
  }
  if (typeof globalThis.clients?.matchAll === "function") {
    const clients = await globalThis.clients.matchAll();
    return clients.some((client) => client.url === documentUrl);
  }
  return false;
}

export async function ensureSymbolicOffscreenDocument(
  extensionApi = globalThis.chrome,
) {
  const api = requireApi(extensionApi);
  const documentUrl = api.runtime.getURL(OFFSCREEN_PATH);
  if (await existingOffscreenDocument(api, documentUrl)) return;

  if (!creatingDocument) {
    creatingDocument = api.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["WORKERS"],
      justification: "Run bounded offline symbolic calculations in a disposable worker.",
    });
  }
  try {
    await creatingDocument;
  } finally {
    creatingDocument = null;
  }
}

export async function runOffscreenSymbolicOperation(
  operation,
  args,
  {
    timeoutMs = 2_000,
    extensionApi = globalThis.chrome,
  } = {},
) {
  const api = requireApi(extensionApi);
  await ensureSymbolicOffscreenDocument(api);
  const response = await api.runtime.sendMessage({
    target: "symbolic-offscreen",
    type: "RUN_SYMBOLIC_OPERATION",
    operation,
    args,
    timeoutMs,
  });
  if (response?.ok) return response.result;
  throw new SymbolicWorkerError(
    String(response?.error?.message || "オフスクリーン記号計算に失敗しました。"),
    { code: String(response?.error?.code || "OFFSCREEN_FAILURE") },
  );
}

export const OFFSCREEN_SYMBOLIC_OPERATIONS = Object.freeze({
  differentiate: (expression, variable = "x") => (
    runOffscreenSymbolicOperation("differentiate", [expression, variable])
  ),
  equivalent: (left, right) => runOffscreenSymbolicOperation("equivalent", [left, right]),
  expand: (expression) => runOffscreenSymbolicOperation("expand", [expression]),
  factor: (expression) => runOffscreenSymbolicOperation("factor", [expression]),
  integrate: (expression, variable = "x") => (
    runOffscreenSymbolicOperation("integrate", [expression, variable])
  ),
  simplify: (expression) => runOffscreenSymbolicOperation("simplify", [expression]),
});
