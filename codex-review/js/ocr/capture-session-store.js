import {
  isOcrCaptureExpired,
  normalizeOcrCaptureSession,
  OCR_CAPTURE_SESSION_STORAGE_KEY,
} from "./capture-contract.js";

export class OcrCaptureSessionStoreError extends Error {
  constructor(message, { code = "OCR_CAPTURE_SESSION_STORE_ERROR", cause = null } = {}) {
    super(message, cause instanceof Error ? { cause } : undefined);
    this.name = "OcrCaptureSessionStoreError";
    this.code = code;
  }
}

function storeError(message, code, cause = null) {
  return new OcrCaptureSessionStoreError(message, { code, cause });
}

function requireStorageArea(storageArea) {
  if (
    !storageArea
    || typeof storageArea.get !== "function"
    || typeof storageArea.set !== "function"
    || typeof storageArea.remove !== "function"
  ) {
    throw storeError(
      "OCR capture用のsession storageを利用できません。",
      "OCR_CAPTURE_SESSION_STORAGE_UNAVAILABLE",
    );
  }
  return storageArea;
}

function requireNow(now) {
  const value = now();
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("nowは有限のUNIX時刻を返す必要があります。");
  }
  return value;
}

function expectedPhases(value) {
  const phases = Array.isArray(value) ? value : [value];
  if (phases.length < 1 || phases.some((phase) => typeof phase !== "string" || !phase)) {
    throw new TypeError("fromには1つ以上のphaseを指定してください。");
  }
  return new Set(phases);
}

/**
 * Provides a serialized, metadata-only storage.session boundary. The queue is
 * intentionally local to one service-worker instance; Chrome never keeps two
 * active instances of the same extension service worker at once.
 */
export function createOcrCaptureSessionStore({
  storageArea = globalThis.chrome?.storage?.session,
  now = Date.now,
  storageKey = OCR_CAPTURE_SESSION_STORAGE_KEY,
} = {}) {
  const area = requireStorageArea(storageArea);
  if (typeof now !== "function") throw new TypeError("nowは関数で指定してください。");
  if (typeof storageKey !== "string" || !storageKey) {
    throw new TypeError("storageKeyは空でない文字列で指定してください。");
  }

  let queue = Promise.resolve();
  const withLock = (operation) => {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  };

  async function removeUnlocked() {
    try {
      await area.remove(storageKey);
    } catch (cause) {
      throw storeError(
        "OCR capture sessionを削除できませんでした。",
        "OCR_CAPTURE_SESSION_REMOVE_FAILED",
        cause,
      );
    }
  }

  async function readUnlocked({ clearExpired = true } = {}) {
    let container;
    try {
      container = await area.get(storageKey);
    } catch (cause) {
      throw storeError(
        "OCR capture sessionを読み取れませんでした。",
        "OCR_CAPTURE_SESSION_READ_FAILED",
        cause,
      );
    }
    const raw = container?.[storageKey];
    if (raw === undefined) return null;

    let session;
    try {
      session = normalizeOcrCaptureSession(raw);
    } catch (cause) {
      await removeUnlocked();
      throw storeError(
        "保存済みOCR capture sessionが破損していたため破棄しました。",
        "OCR_CAPTURE_SESSION_CORRUPT",
        cause,
      );
    }

    if (clearExpired && isOcrCaptureExpired(session, requireNow(now))) {
      await removeUnlocked();
      return null;
    }
    return session;
  }

  async function writeUnlocked(value) {
    let session;
    try {
      session = normalizeOcrCaptureSession(value);
    } catch (cause) {
      throw storeError(
        "OCR capture sessionの形式が不正です。",
        "OCR_CAPTURE_SESSION_INVALID",
        cause,
      );
    }
    if (isOcrCaptureExpired(session, requireNow(now))) {
      throw storeError(
        "期限切れのOCR capture sessionは保存できません。",
        "OCR_CAPTURE_SESSION_EXPIRED",
      );
    }
    try {
      await area.set({ [storageKey]: session });
    } catch (cause) {
      throw storeError(
        "OCR capture sessionを保存できませんでした。",
        "OCR_CAPTURE_SESSION_WRITE_FAILED",
        cause,
      );
    }
    return session;
  }

  return Object.freeze({
    get({ clearExpired = true } = {}) {
      return withLock(() => readUnlocked({ clearExpired }));
    },

    replace(value) {
      return withLock(() => writeUnlocked(value));
    },

    transition({ captureId, from, to, patch = {} } = {}) {
      const allowedFrom = expectedPhases(from);
      return withLock(async () => {
        const current = await readUnlocked({ clearExpired: false });
        if (!current) {
          throw storeError(
            "OCR capture sessionが見つかりません。",
            "OCR_CAPTURE_SESSION_NOT_FOUND",
          );
        }
        if (isOcrCaptureExpired(current, requireNow(now))) {
          await removeUnlocked();
          throw storeError(
            "OCR capture sessionの期限が切れました。",
            "OCR_CAPTURE_SESSION_EXPIRED",
          );
        }
        if (current.captureId !== captureId) {
          throw storeError(
            "OCR capture IDが現在のsessionと一致しません。",
            "OCR_CAPTURE_SESSION_ID_MISMATCH",
          );
        }
        if (!allowedFrom.has(current.phase)) {
          throw storeError(
            "OCR capture sessionの処理段階が一致しません。",
            "OCR_CAPTURE_SESSION_PHASE_MISMATCH",
          );
        }
        return writeUnlocked({ ...current, ...patch, phase: to });
      });
    },

    clear({ captureId = null } = {}) {
      return withLock(async () => {
        if (captureId !== null) {
          const current = await readUnlocked({ clearExpired: false });
          if (!current || current.captureId !== captureId) return false;
        }
        await removeUnlocked();
        return true;
      });
    },
  });
}
