import { cropScreenshotPng } from "./capture-image.js";

export const OCR_CAPTURE_PREVIEW_TTL_MS = 2 * 60 * 1_000;
export const OCR_CAPTURE_MAX_PREVIEWS = 2;

const PREVIEW_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export class OcrCapturePreviewStoreError extends Error {
  constructor(message, { code = "OCR_CAPTURE_PREVIEW_STORE_ERROR", cause = null } = {}) {
    super(message, cause instanceof Error ? { cause } : undefined);
    this.name = "OcrCapturePreviewStoreError";
    this.code = code;
  }
}

function previewError(message, code, cause = null) {
  return new OcrCapturePreviewStoreError(message, { code, cause });
}

function normalizePreviewId(value) {
  if (typeof value !== "string" || !PREVIEW_ID_PATTERN.test(value)) {
    throw previewError("OCR preview IDの形式が不正です。", "OCR_CAPTURE_PREVIEW_ID_INVALID");
  }
  return value;
}

function safeNow(now) {
  const value = now();
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("nowは有限のUNIX時刻を返す必要があります。");
  }
  return value;
}

function publicMetadata(entry) {
  return Object.freeze({
    previewId: entry.previewId,
    previewUrl: entry.previewUrl,
    source: entry.source,
    crop: entry.crop,
    expiresAt: new Date(entry.expiresAt).toISOString(),
  });
}

function imageSize(value, label) {
  const width = value?.width;
  const height = value?.height;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
  ) {
    throw previewError(`${label}の寸法が不正です。`, "OCR_CAPTURE_PREVIEW_RESULT_INVALID");
  }
  return Object.freeze({ width, height });
}

export function createOcrCapturePreviewStore({
  cropImage = cropScreenshotPng,
  now = Date.now,
  setTimer = globalThis.setTimeout?.bind(globalThis),
  clearTimer = globalThis.clearTimeout?.bind(globalThis),
  ttlMs = OCR_CAPTURE_PREVIEW_TTL_MS,
  maxEntries = OCR_CAPTURE_MAX_PREVIEWS,
} = {}) {
  if (typeof cropImage !== "function") throw new TypeError("cropImageは関数で指定してください。");
  if (typeof now !== "function") throw new TypeError("nowは関数で指定してください。");
  if (typeof setTimer !== "function" || typeof clearTimer !== "function") {
    throw new TypeError("preview期限管理用timer APIが必要です。");
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 10_000 || ttlMs > 10 * 60_000) {
    throw new TypeError("ttlMsは10秒以上10分以下の整数で指定してください。");
  }
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 4) {
    throw new TypeError("maxEntriesは1以上4以下の整数で指定してください。");
  }

  const entries = new Map();
  let queue = Promise.resolve();
  const withLock = (operation) => {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  };

  function revokeEntry(entry) {
    if (entry.timer !== null) clearTimer(entry.timer);
    try {
      entry.revoke();
    } catch (cause) {
      throw previewError(
        "OCR previewのBlob URLを破棄できませんでした。",
        "OCR_CAPTURE_PREVIEW_REVOKE_FAILED",
        cause,
      );
    }
  }

  function discardUnlocked(previewId) {
    const entry = entries.get(previewId);
    if (!entry) return false;
    entries.delete(previewId);
    revokeEntry(entry);
    return true;
  }

  function scheduleExpiry(entry) {
    const delay = Math.max(0, entry.expiresAt - safeNow(now));
    entry.timer = setTimer(() => {
      void withLock(() => discardUnlocked(entry.previewId)).catch((error) => {
        console.warn("Could not expire OCR capture preview", error);
      });
    }, delay);
    entry.timer?.unref?.();
  }

  return Object.freeze({
    create({ previewId: rawPreviewId, screenshotDataUrl, selection, viewport } = {}) {
      return withLock(async () => {
        const previewId = normalizePreviewId(rawPreviewId);
        if (entries.has(previewId)) discardUnlocked(previewId);
        while (entries.size >= maxEntries) {
          discardUnlocked(entries.keys().next().value);
        }

        let result;
        try {
          result = await cropImage({
            screenshotDataUrl,
            selection,
            viewport,
            output: "blob-url",
          });
        } catch (cause) {
          throw previewError(
            "OCR preview画像を切り出せませんでした。",
            String(cause?.code || "OCR_CAPTURE_PREVIEW_CROP_FAILED"),
            cause,
          );
        }

        if (
          typeof result?.blobUrl !== "string"
          || !result.blobUrl.startsWith("blob:")
          || typeof result?.revoke !== "function"
        ) {
          try {
            result?.revoke?.();
          } catch {
            // Invalid providers are rejected below; cleanup is best-effort.
          }
          throw previewError(
            "OCR preview画像の戻り値が不正です。",
            "OCR_CAPTURE_PREVIEW_RESULT_INVALID",
          );
        }

        let source;
        let crop;
        try {
          source = imageSize(result.source, "OCR source");
          crop = imageSize(result.crop, "OCR crop");
        } catch (error) {
          try {
            result.revoke();
          } catch {
            // Preserve the validation failure as the primary error.
          }
          throw error;
        }

        const entry = {
          previewId,
          previewUrl: result.blobUrl,
          source,
          crop,
          expiresAt: safeNow(now) + ttlMs,
          revoke: result.revoke,
          timer: null,
        };
        entries.set(previewId, entry);
        scheduleExpiry(entry);
        return publicMetadata(entry);
      });
    },

    get(rawPreviewId) {
      return withLock(() => {
        const previewId = normalizePreviewId(rawPreviewId);
        const entry = entries.get(previewId);
        if (!entry) {
          throw previewError("OCR previewが見つかりません。", "OCR_CAPTURE_PREVIEW_NOT_FOUND");
        }
        if (entry.expiresAt <= safeNow(now)) {
          discardUnlocked(previewId);
          throw previewError("OCR previewの期限が切れました。", "OCR_CAPTURE_PREVIEW_EXPIRED");
        }
        return publicMetadata(entry);
      });
    },

    discard(rawPreviewId) {
      return withLock(() => discardUnlocked(normalizePreviewId(rawPreviewId)));
    },

    discardAll() {
      return withLock(() => {
        const failures = [];
        for (const previewId of [...entries.keys()]) {
          try {
            discardUnlocked(previewId);
          } catch (error) {
            failures.push(error);
          }
        }
        if (failures.length > 0) throw failures[0];
        return true;
      });
    },
  });
}
