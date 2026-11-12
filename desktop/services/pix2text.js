import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OCR_IMAGE_LIMITS, OCR_MAX_OUTPUT_CHARACTERS } from "../../js/ocr/ocr-config.js";
import { logStartupFailure } from "../startup-log.js";

const WORKER = fileURLToPath(new URL("../pix2text/worker.py", import.meta.url));
const LOCK = JSON.parse(readFileSync(new URL("../../bench/ocr/models.lock.json", import.meta.url), "utf8"))["Pix2Text-MFR-1.5"];
const RUNTIME_VERSION = "cpython-3.12.12-x64";
const SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const MAX_RESPONSE_BYTES = 32 * 1024;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_IDLE_MS = 5 * 60_000;

export function pix2textPaths(localAppData = process.env.LOCALAPPDATA) {
  if (!localAppData) return {};
  const directory = join(localAppData, "Math Study Log", "pix2text");
  const venv = join(directory, RUNTIME_VERSION, "venv");
  return {
    directory,
    venv,
    venvPythonPath: join(venv, "Scripts", "python.exe"),
    // The venv launcher on Windows starts a second interpreter process.
    // Launch the managed interpreter directly so cancellation kills inference.
    pythonPath: join(directory, "python", "cpython-3.12.12-windows-x86_64-none", "python.exe"),
    sitePackages: join(venv, "Lib", "site-packages"),
    modelDirectory: join(directory, "models", LOCK.revision),
  };
}

function ocrError(code, message) {
  return Object.assign(new Error(message), { code });
}

function workerFailed() {
  return ocrError("OCR_WORKER_FAILED", "Pix2Textの認識プロセスを継続できませんでした。もう一度お試しください。");
}

function cancelled() {
  return ocrError("OCR_CANCELLED", "画像の認識を中止しました。");
}

function validResult(payload) {
  const metrics = payload?.metrics;
  return typeof payload?.latex === "string" && payload.latex.trim().length > 0
    && payload.latex.length <= OCR_MAX_OUTPUT_CHARACTERS && !/[\u0000-\u001f\u007f]/u.test(payload.latex)
    && metrics?.modelRevision === LOCK.revision
    && ["loadMs", "inferenceMs", "workingSetBytes", "peakWorkingSetBytes"]
      .every((field) => Number.isFinite(metrics[field]) && metrics[field] >= 0);
}

export function createPix2TextService({
  pythonPath = pix2textPaths().pythonPath,
  modelDirectory = pix2textPaths().modelDirectory,
  sitePackages = pythonPath === pix2textPaths().pythonPath ? pix2textPaths().sitePackages : undefined,
  spawnProcess = spawn,
  idleMs = DEFAULT_IDLE_MS,
} = {}) {
  let worker = null;
  let pending = null;
  let idleTimer = null;
  let nextId = 0;
  let closed = false;

  function isAvailable() {
    return Boolean(pythonPath && modelDirectory && existsSync(pythonPath) && (!sitePackages || existsSync(sitePackages))
      && Object.keys(LOCK.files).every((name) => existsSync(join(modelDirectory, name))));
  }

  function clearIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  function stop() {
    clearIdleTimer();
    if (!worker) return;
    const child = worker;
    worker = null;
    child.stdin.destroy();
    child.kill();
  }

  function finish(error, value) {
    if (!pending) return;
    const { resolve, reject, signal, abort, timer } = pending;
    pending = null;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    if (error) reject(error);
    else resolve(value);
    if (worker) {
      idleTimer = setTimeout(stop, idleMs);
      idleTimer.unref?.();
    }
  }

  function fail(error) {
    stop();
    finish(error);
  }

  function onReply(line) {
    let reply;
    try {
      reply = JSON.parse(line);
    } catch {
      fail(workerFailed());
      return;
    }
    if (!pending || reply?.id !== pending.id) {
      fail(workerFailed());
    } else if (reply.code === "OCR_MODEL_LOAD_FAILED") {
      if (typeof reply.detail === "string") logStartupFailure("Pix2Text model initialization failed", reply.detail.slice(0, 500));
      fail(ocrError(reply.code, "Pix2Textを初期化できませんでした。セットアップを再実行してください。"));
    } else if (reply.code === "OCR_RECOGNITION_FAILED") {
      finish(ocrError(reply.code, "Pix2Textで数式を読み取れませんでした。"));
    } else if (reply.code || !validResult(reply)) {
      fail(workerFailed());
    } else {
      finish(null, { latex: reply.latex, metrics: reply.metrics });
    }
  }

  function start() {
    const args = ["-I", "-B", "-u"];
    if (sitePackages) args.push("-S");
    args.push(WORKER, modelDirectory);
    if (sitePackages) args.push(sitePackages);
    const child = spawnProcess(pythonPath, args, {
      cwd: dirname(WORKER),
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"],
    });
    worker = child;
    let output = "";
    const gone = () => {
      if (worker === child) fail(workerFailed());
    };
    child.on("error", gone);
    child.once("close", gone);
    child.stdin.on("error", gone);
    child.stdout.on("error", gone);
    child.stdout.on("data", (chunk) => {
      if (worker !== child) return;
      output += chunk.toString("ascii");
      if (output.length > MAX_RESPONSE_BYTES) {
        gone();
        return;
      }
      const end = output.indexOf("\n");
      if (end === -1) return;
      if (end !== output.length - 1) {
        gone();
        return;
      }
      const line = output.slice(0, end);
      output = "";
      onReply(line);
    });
    return child;
  }

  return {
    isAvailable,
    async recognize(png, { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
      if (closed || signal?.aborted) throw cancelled();
      if (pending) throw ocrError("OCR_BUSY", "画像を認識中です。");
      if (!(png instanceof Uint8Array) || png.byteLength < 33 || png.byteLength > OCR_IMAGE_LIMITS.maxBytes
        || !Buffer.from(png.buffer, png.byteOffset, 8).equals(SIGNATURE)) {
        throw ocrError("OCR_IMAGE_INVALID", "認識できる形式または寸法のPNG画像がありません。");
      }
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) {
        throw new TypeError("timeoutMs must be a positive integer at most 120000.");
      }
      if (!worker && !isAvailable()) {
        throw ocrError("OCR_MODEL_NOT_INSTALLED", "Pix2Textを使用するには、Math Study Logのセットアップを実行してください。");
      }

      clearIdleTimer();
      const child = worker ?? start();
      const id = String(++nextId);
      const image = Buffer.from(png.buffer, png.byteOffset, png.byteLength).toString("base64");
      return new Promise((resolve, reject) => {
        const abort = () => fail(cancelled());
        const timer = setTimeout(() => {
          fail(ocrError("OCR_TIMEOUT", "Pix2Textの認識が制限時間内に終わりませんでした。"));
        }, timeoutMs);
        pending = { id, resolve, reject, signal, abort, timer };
        signal?.addEventListener("abort", abort, { once: true });
        child.stdin.write(JSON.stringify({ id, image }) + "\n");
      });
    },
    close() {
      closed = true;
      fail(cancelled());
    },
  };
}
