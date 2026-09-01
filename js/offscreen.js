import { readFromClipboard, writeToClipboard } from "./clipboard.js";
import { runSymbolicOperation } from "./math-core/symbolic-client.js";
import { OFFSCREEN_MESSAGE_TARGET } from "./offscreen-client.js";

export async function dispatchOffscreenMessage(message) {
  switch (message?.type) {
    case "RUN_SYMBOLIC_OPERATION":
      return runSymbolicOperation(message.operation, message.args, {
        timeoutMs: message.timeoutMs,
      });
    case "READ_CLIPBOARD_TEXT":
      return readFromClipboard();
    case "WRITE_CLIPBOARD_TEXT":
      await writeToClipboard(message.text);
      return true;
    default: {
      const error = new Error("未対応のオフスクリーン処理です。");
      error.code = "OFFSCREEN_UNSUPPORTED_OPERATION";
      throw error;
    }
  }
}

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
