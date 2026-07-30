import { runSymbolicOperation } from "./math-core/symbolic-client.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message?.target !== "symbolic-offscreen"
    || message?.type !== "RUN_SYMBOLIC_OPERATION"
    || sender.id !== chrome.runtime.id
  ) {
    return false;
  }

  void runSymbolicOperation(message.operation, message.args, {
    timeoutMs: message.timeoutMs,
  }).then(
    (result) => sendResponse({ ok: true, result }),
    (error) => sendResponse({
      ok: false,
      error: {
        code: String(error?.code || "SYMBOLIC_WORKER_ERROR"),
        message: String(error?.message || "記号計算に失敗しました。"),
      },
    }),
  );
  return true;
});
