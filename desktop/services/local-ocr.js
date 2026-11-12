import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OCR_IMAGE_LIMITS } from "../../js/ocr/ocr-config.js";
import { convertMfrLatex } from "./mfr-latex.js";

const SCHEME = "math-study-ocr";
const HOST = "local";
const BASE = `${SCHEME}://${HOST}`;
const HOST_PAGE = `${BASE}/desktop/ocr-host/index.html`;
const PRELOAD = fileURLToPath(new URL("../ocr-host/preload.cjs", import.meta.url));
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RESULT_CHANNEL = "desktop:ocr-host:result";
const FORMULA_CHANNEL = "desktop:ocr-host:formula";
const DEFAULT_DEADLINE_MS = 90_000;
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const POLICY = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");
const MIME = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".onnx": "application/octet-stream",
  ".wasm": "application/wasm",
  ".traineddata": "application/octet-stream",
});
const APP_ASSETS = new Set([
  "desktop/ocr-host/index.html", "desktop/ocr-host/host.js",
  "desktop/ocr-host/windows-layout.js", "desktop/ocr-host/windows-mixed-ocr.js",
]);
const SHARED_MODULE = /^js\/(?:ocr|problem|math-core)\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.js$/u;
const MODEL_ASSET = /^vendor\/(?:ocr\/(?:ibem-im2typst|tesseract-japanese)|onnxruntime-web)\/(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.(?:js|mjs|json|onnx|wasm|traineddata)$/u;

export function registerOcrScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  }]);
}

export function ocrAssetPath(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const path = url.pathname.slice(1);
  if (
    url.protocol !== `${SCHEME}:` || url.host !== HOST || url.username || url.password
    || (!APP_ASSETS.has(path) && !SHARED_MODULE.test(path) && !MODEL_ASSET.test(path))
  ) return null;
  return path;
}

function localAssetServer(root) {
  const canonicalRoot = realpath(root);
  return async (request) => {
    if (request.method !== "GET") return new Response(null, { status: 405 });
    try {
      const asset = ocrAssetPath(request.url);
      if (!asset) return new Response(null, { status: 404 });
      const directory = await canonicalRoot;
      const path = resolve(directory, asset);
      const file = await realpath(path);
      if (path !== file) return new Response(null, { status: 404 });
      return new Response(await readFile(file), {
        headers: {
          "Content-Type": MIME[extname(file)],
          "Content-Security-Policy": POLICY,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  };
}

function ocrError(code, message) {
  return Object.assign(new Error(message), { code });
}

function validPng(png) {
  if (!(png instanceof Uint8Array) || png.byteLength < 33 || png.byteLength > OCR_IMAGE_LIMITS.maxBytes) return false;
  const header = Buffer.from(png.buffer, png.byteOffset, 24);
  if (!header.subarray(0, 8).equals(PNG_SIGNATURE)
    || header.readUInt32BE(8) !== 13 || header.toString("ascii", 12, 16) !== "IHDR") return false;
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  return width > 0 && width <= OCR_IMAGE_LIMITS.maxDimension
    && height > 0 && height <= OCR_IMAGE_LIMITS.maxDimension
    && width * height <= OCR_IMAGE_LIMITS.maxPixels;
}

export function createLocalOcr({ BrowserWindow, ipcMain, session, pix2text }) {
  const partition = session.fromPartition("math-study-log-local-ocr", { cache: false });
  partition.protocol.handle(SCHEME, localAssetServer(ROOT));
  partition.setPermissionCheckHandler(() => false);
  partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  partition.on("will-download", (event) => event.preventDefault());
  partition.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith(`${BASE}/`) && !details.url.startsWith(`blob:${BASE}/`) });
  });

  let cancelActive = null;
  let closed = false;
  let formulaRequest = null;
  ipcMain.handle(FORMULA_CHANNEL, async (event, id, png) => {
    try {
      if (!formulaRequest) throw ocrError("OCR_CANCELLED", "画像の認識を中止しました。");
      return await formulaRequest(event, id, png);
    } catch (error) {
      const known = typeof error?.code === "string" && /^OCR_[A-Z_]+$/u.test(error.code);
      return { error: known
        ? { code: error.code, message: error.message.slice(0, 500) }
        : { code: "OCR_FAILED", message: "数式の認識に失敗しました。" } };
    }
  });

  return {
    async recognize(png, { signal, model = "ibem", timeoutMs = DEFAULT_DEADLINE_MS } = {}) {
      if (closed || signal?.aborted) throw ocrError("OCR_CANCELLED", "画像の認識を中止しました。");
      if (cancelActive) throw ocrError("OCR_BUSY", "画像を認識中です。");
      if (!validPng(png)) {
        throw ocrError("OCR_IMAGE_INVALID", "認識できる形式または寸法のPNG画像がありません。");
      }
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new TypeError("timeoutMsは正の有限値で指定してください。");
      }
      if (!["pix2text", "ibem"].includes(model)) throw new TypeError("未対応のOCRモデルです。");
      if (model === "pix2text" && !pix2text?.isAvailable()) {
        throw ocrError("OCR_MODEL_MISSING", "Pix2Textが見つかりません。セットアップを実行するか、OCR設定でIBEMを選んでください。");
      }

      const window = new BrowserWindow({
        show: false,
        skipTaskbar: true,
        webPreferences: {
          session: partition,
          preload: PRELOAD,
          nodeIntegration: false,
          sandbox: true,
          contextIsolation: true,
          backgroundThrottling: false,
        },
      });
      const contents = window.webContents;
      contents.setWindowOpenHandler(() => ({ action: "deny" }));
      contents.on("will-navigate", (event) => event.preventDefault());
      contents.on("will-frame-navigate", (event) => event.preventDefault());
      contents.on("will-attach-webview", (event) => event.preventDefault());
      const id = randomUUID();
      const controller = new AbortController();
      const fromHost = (event, requestId) => event.sender === contents
        && event.senderFrame === contents.mainFrame && event.senderFrame?.url === HOST_PAGE
        && requestId === id;
      let formulaCalls = 0;
      let formulaBusy = false;

      return new Promise((resolveResult, rejectResult) => {
        let completed = false;
        const finish = (error, result) => {
          if (completed) return;
          completed = true;
          cancelActive = null;
          formulaRequest = null;
          controller.abort();
          clearTimeout(deadline);
          signal?.removeEventListener("abort", abort);
          ipcMain.removeListener(RESULT_CHANNEL, reply);
          if (!window.isDestroyed()) window.destroy();
          if (error) rejectResult(error);
          else resolveResult(result);
        };
        const abort = () => finish(ocrError("OCR_CANCELLED", "画像の認識を中止しました。"));
        const failed = () => finish(ocrError("OCR_HOST_FAILED", "ローカルOCRを開始または継続できませんでした。"));
        const reply = (event, requestId, response) => {
          if (!fromHost(event, requestId)) return;
          if (response?.ok === true && response.result?.structuredCandidate) {
            finish(null, { ...response.result, model });
          } else {
            finish(ocrError(
              typeof response?.code === "string" ? response.code.slice(0, 100) : "OCR_FAILED",
              typeof response?.message === "string" ? response.message.slice(0, 500) : "画像の認識に失敗しました。",
            ));
          }
        };
        const deadline = setTimeout(() => {
          finish(ocrError("OCR_TIMEOUT", "画像の認識が制限時間内に終わりませんでした。"));
        }, timeoutMs);
        cancelActive = abort;
        if (model === "pix2text") formulaRequest = async (event, requestId, crop) => {
          if (!fromHost(event, requestId) || formulaBusy || formulaCalls >= 3 || !validPng(crop)) {
            throw ocrError("OCR_IMAGE_INVALID", "数式領域の指定が正しくありません。");
          }
          formulaCalls++;
          formulaBusy = true;
          try {
            const { latex, metrics } = await pix2text.recognize(crop, { signal: controller.signal });
            const started = performance.now();
            let text = "";
            const warnings = [];
            try {
              text = convertMfrLatex(latex);
            } catch (error) {
              if (error?.code !== "OCR_LATEX_UNSUPPORTED") throw error;
              warnings.push("認識したLaTeXに変換できない構文があります。画像を確認して数式を入力してください。");
            }
            return { text, rawText: latex, warnings, metrics: { ...metrics, conversionMs: performance.now() - started } };
          } finally {
            formulaBusy = false;
          }
        };
        signal?.addEventListener("abort", abort, { once: true });
        ipcMain.on(RESULT_CHANNEL, reply);
        contents.once("render-process-gone", failed);
        window.once("closed", failed);
        void window.loadURL(HOST_PAGE).then(() => {
          if (!completed) contents.send("desktop:ocr-host:recognize", { id, png, timeoutMs, model });
        }).catch(failed);
      });
    },
    close() {
      if (closed) return;
      closed = true;
      cancelActive?.();
      ipcMain.removeHandler(FORMULA_CHANNEL);
      partition.protocol.unhandle(SCHEME);
    },
  };
}
