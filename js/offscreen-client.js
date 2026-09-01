const OFFSCREEN_PATH = "offscreen.html";
const OFFSCREEN_TARGET = "math-study-log-offscreen";
const OFFSCREEN_REASONS = Object.freeze(["WORKERS", "CLIPBOARD"]);
const OFFSCREEN_JUSTIFICATION =
  "Run bounded offline symbolic, clipboard, image, and OCR operations.";

let creatingDocument = null;

export class OffscreenHostError extends Error {
  constructor(message, { code = "OFFSCREEN_ERROR", cause = null } = {}) {
    super(message, { cause });
    this.name = "OffscreenHostError";
    this.code = code;
  }
}

function requireApi(extensionApi) {
  if (
    !extensionApi?.runtime?.getURL
    || !extensionApi?.runtime?.sendMessage
    || !extensionApi?.offscreen?.createDocument
  ) {
    throw new OffscreenHostError("オフスクリーン処理を利用できません。", {
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

export async function ensureOffscreenDocument(extensionApi = globalThis.chrome) {
  const api = requireApi(extensionApi);
  const documentUrl = api.runtime.getURL(OFFSCREEN_PATH);
  if (await existingOffscreenDocument(api, documentUrl)) return;

  if (!creatingDocument) {
    creatingDocument = api.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: [...OFFSCREEN_REASONS],
      justification: OFFSCREEN_JUSTIFICATION,
    });
  }

  try {
    await creatingDocument;
  } finally {
    creatingDocument = null;
  }
}

function requestWithTimeout(request, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return request;
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new OffscreenHostError("オフスクリーン処理が時間内に完了しませんでした。", {
        code: "OFFSCREEN_TIMEOUT",
      }));
    }, timeoutMs);
    Promise.resolve(request).then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function runOffscreenRequest(
  type,
  payload = {},
  {
    timeoutMs = 10_000,
    extensionApi = globalThis.chrome,
  } = {},
) {
  const api = requireApi(extensionApi);
  await ensureOffscreenDocument(api);

  let response;
  try {
    response = await requestWithTimeout(
      api.runtime.sendMessage({
        target: OFFSCREEN_TARGET,
        type: String(type || ""),
        ...payload,
      }),
      timeoutMs,
    );
  } catch (error) {
    if (error instanceof OffscreenHostError) throw error;
    throw new OffscreenHostError("オフスクリーン処理へ接続できませんでした。", {
      code: "OFFSCREEN_REQUEST_FAILED",
      cause: error,
    });
  }

  if (response?.ok) return response.result;
  throw new OffscreenHostError(
    String(response?.error?.message || "オフスクリーン処理に失敗しました。"),
    { code: String(response?.error?.code || "OFFSCREEN_FAILURE") },
  );
}

export const OFFSCREEN_MESSAGE_TARGET = OFFSCREEN_TARGET;
export const OFFSCREEN_DOCUMENT_REASONS = OFFSCREEN_REASONS;
