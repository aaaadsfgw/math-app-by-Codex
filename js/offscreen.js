import { readFromClipboard, writeToClipboard } from "./clipboard.js";
import { runSymbolicOperation } from "./math-core/symbolic-client.js";
import { OFFSCREEN_MESSAGE_TARGET } from "./offscreen-client.js";
import { GET_OCR_CAPTURE_PREVIEW } from "./ocr/capture-contract.js";
import {
  CANCEL_OCR_RECOGNITION,
  CREATE_OCR_CAPTURE_PREVIEW,
  DISCARD_OCR_CAPTURE_PREVIEW,
  RECOGNIZE_OCR_CAPTURE_PREVIEW,
} from "./ocr/capture-preview-operations.js";
import { createOcrCapturePreviewStore } from "./ocr/capture-preview-store.js";
import { createOcrEngine } from "./ocr/ocr-engine.js";
import { createIbemOcrBackendSession } from "./ocr/ocr-worker-client.js";
import { createJapaneseOcrRecognizer } from "./ocr/japanese-ocr.js";
import { createMixedOcrEngine } from "./ocr/mixed-ocr-engine.js";

const ocrCapturePreviews = createOcrCapturePreviewStore();
const localFormulaOcrEngine = createOcrEngine({ backendFactory: createIbemOcrBackendSession });
const localJapaneseOcr = createJapaneseOcrRecognizer();
const localOcrEngine = createMixedOcrEngine({
  formulaEngine: localFormulaOcrEngine,
  japaneseRecognizer: localJapaneseOcr,
});

export function createOffscreenMessageDispatcher({
  symbolicOperation = runSymbolicOperation,
  readClipboard = readFromClipboard,
  writeClipboard = writeToClipboard,
  capturePreviews = ocrCapturePreviews,
  ocrEngine = localOcrEngine,
} = {}) {
  return async function dispatch(message) {
    switch (message?.type) {
      case "RUN_SYMBOLIC_OPERATION":
        return symbolicOperation(message.operation, message.args, {
          timeoutMs: message.timeoutMs,
        });
      case "READ_CLIPBOARD_TEXT":
        return readClipboard();
      case "WRITE_CLIPBOARD_TEXT":
        await writeClipboard(message.text);
        return true;
      case CREATE_OCR_CAPTURE_PREVIEW:
        return capturePreviews.create({
          previewId: message.previewId,
          screenshotDataUrl: message.screenshotDataUrl,
          selection: message.selection,
          viewport: message.viewport,
        });
      case GET_OCR_CAPTURE_PREVIEW:
        return capturePreviews.get(message.previewId);
      case DISCARD_OCR_CAPTURE_PREVIEW:
        return capturePreviews.discard(message.previewId);
      case RECOGNIZE_OCR_CAPTURE_PREVIEW:
        return ocrEngine.recognize(await capturePreviews.getBlob(message.previewId), {
          timeoutMs: message.timeoutMs,
        });
      case CANCEL_OCR_RECOGNITION:
        return Object.freeze({ cancelled: ocrEngine.cancel() > 0 });
      default: {
        const error = new Error("未対応のオフスクリーン処理です。");
        error.code = "OFFSCREEN_UNSUPPORTED_OPERATION";
        throw error;
      }
    }
  };
}

globalThis.addEventListener?.("pagehide", () => {
  void localOcrEngine.dispose();
});

export const dispatchOffscreenMessage = createOffscreenMessageDispatcher();

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      message?.target !== OFFSCREEN_MESSAGE_TARGET
      || sender.id !== chrome.runtime.id
    ) {
      return false;
    }

    void dispatchOffscreenMessage(message).then(
      (result) => sendResponse({ ok: true, result }),
      (error) => sendResponse({
        ok: false,
        error: {
          code: String(error?.code || "OFFSCREEN_OPERATION_ERROR"),
          message: String(error?.message || "オフスクリーン処理に失敗しました。"),
        },
      }),
    );
    return true;
  });
}
