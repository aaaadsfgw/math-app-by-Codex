import { parentPort, workerData } from "node:worker_threads";
import {
  areSymbolicallyEquivalent,
  differentiateSymbolic,
  expandSymbolic,
  factorSymbolic,
  integrateSymbolic,
  rootsSymbolic,
  simplifySymbolic,
} from "../../js/math-core/symbolic-adapter.js";
import { runShortcutWorkflow, shortcutClipboardOutput } from "../../js/shortcut-workflow.js";
import { solveWorkflow } from "../../js/solve-workflow.js";

// The whole workflow already runs in a disposable worker. The shared
// Algebrite adapter can run here without Chrome's offscreen transport.
const symbolicOperations = Object.freeze({
  differentiate: differentiateSymbolic,
  equivalent: areSymbolicallyEquivalent,
  expand: expandSymbolic,
  factor: factorSymbolic,
  integrate: integrateSymbolic,
  roots: rootsSymbolic,
  simplify: simplifySymbolic,
});

function failure(message) {
  return { ok: false, error: message.replace(/ページから取得またはOCRも利用できます。$/u, "") };
}

async function calculate({ mode, input }) {
  if (mode === "initialize") {
    if (simplifySymbolic("1+1") !== "2") throw new Error("計算エンジンを初期化できませんでした。");
    return { ok: true };
  }

  let workflow;
  let answer;
  if (mode === "shortcut") {
    ({ workflow, clipboardOutput: answer } = await runShortcutWorkflow({
      getSelectionText: () => "",
      readClipboardText: () => input,
      // A verified candidate is returned to main, which owns the system clipboard.
      writeClipboardText: () => {},
      symbolicOperations,
    }));
  } else if (mode === "manual" || mode === "ocr") {
    // Only the Windows main process can select the OCR route. It has already
    // checked the layout and input, or accepted an explicit user correction.
    workflow = await solveWorkflow(input, { symbolicOperations, ocrConfirmed: mode === "ocr" });
    answer = shortcutClipboardOutput(workflow);
  } else {
    throw new Error("計算モードが正しくありません。");
  }

  if (!answer) {
    return failure(workflow.solverResult?.error || "検証済みの解答を得られませんでした。");
  }
  return {
    ok: true,
    answer,
    kind: workflow.resultKind,
    conditions: workflow.solverResult.conditions ?? [],
  };
}

try {
  parentPort.postMessage(await calculate(workerData));
} catch (error) {
  parentPort.postMessage(failure(error.message || "計算中にエラーが発生しました。"));
}
