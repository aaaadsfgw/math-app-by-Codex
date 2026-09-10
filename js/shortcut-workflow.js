import {
  createHistoryRecordPayload,
  solveWorkflow,
} from "./solve-workflow.js";
import { parseCombinedProblemText } from "./problem/problem-input.js";

const SHORTCUT_ACTIONS = new Set(["answer", "hint1", "hint2", "steps"]);

export class ShortcutWorkflowError extends Error {
  constructor(message, { code = "SHORTCUT_ERROR", cause = null, result = null } = {}) {
    super(message, { cause });
    this.name = "ShortcutWorkflowError";
    this.code = code;
    this.result = result;
  }
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeAction(value) {
  return SHORTCUT_ACTIONS.has(value) ? value : "answer";
}

function structuredSelectionInput(selection) {
  const problemInput = parseCombinedProblemText(selection, { source: "selection" });
  if (!problemInput.questionLabel && !problemInput.instructionText) return null;
  return problemInput;
}

function failureMessage(workflow) {
  return cleanText(workflow?.solverResult?.error)
    || (workflow?.resultKind === "invalid"
      ? "問題文を解析できませんでした。"
      : "この問題形式は、現在のオフライン数式エンジンではまだ解けません。");
}

export async function getShortcutInput({
  getSelectionText,
  readClipboardText,
} = {}) {
  if (typeof getSelectionText !== "function") {
    throw new TypeError("getSelectionTextは関数で指定してください。");
  }
  if (typeof readClipboardText !== "function") {
    throw new TypeError("readClipboardTextは関数で指定してください。");
  }

  const selection = cleanText(await getSelectionText());
  if (selection) {
    const problemInput = structuredSelectionInput(selection);
    return Object.freeze({
      question: selection,
      source: "selection",
      ...(problemInput ? { problemInput } : {}),
    });
  }

  const clipboard = cleanText(await readClipboardText());
  if (!clipboard) {
    throw new ShortcutWorkflowError(
      "選択中の問題もクリップボード上の問題も見つかりません。",
      { code: "EMPTY_INPUT" },
    );
  }
  return Object.freeze({ question: clipboard, source: "clipboard" });
}

export function shortcutClipboardOutput(workflow) {
  if (!workflow?.presentable || !workflow.presentation) return "";
  const output = workflow.outputMode === "answer"
    ? workflow.presentation.finalAnswer
    : workflow.presentation.content;
  return cleanText(output);
}

export async function runShortcutWorkflow({
  getSelectionText,
  readClipboardText,
  writeClipboardText,
  addHistory = null,
  settings = {},
  symbolicOperations,
  solve = solveWorkflow,
} = {}) {
  if (typeof writeClipboardText !== "function") {
    throw new TypeError("writeClipboardTextは関数で指定してください。");
  }
  if (typeof solve !== "function") throw new TypeError("solveは関数で指定してください。");

  const input = await getShortcutInput({ getSelectionText, readClipboardText });
  const action = normalizeAction(settings.shortcutAction);
  const workflow = await solve(input.problemInput ?? input.question, {
    mode: action,
    symbolicOperations,
  });

  if (!workflow?.presentable) {
    throw new ShortcutWorkflowError(failureMessage(workflow), {
      code: workflow?.resultKind === "invalid" ? "INVALID_INPUT" : "UNSUPPORTED_INPUT",
      result: workflow,
    });
  }

  const clipboardOutput = shortcutClipboardOutput(workflow);
  if (!clipboardOutput) {
    throw new ShortcutWorkflowError("検証済みの出力が空だったためコピーしませんでした。", {
      code: "EMPTY_OUTPUT",
      result: workflow,
    });
  }

  try {
    await writeClipboardText(clipboardOutput);
  } catch (error) {
    throw new ShortcutWorkflowError(
      cleanText(error?.message) || "クリップボードへ書き込めませんでした。",
      { code: String(error?.code || "CLIPBOARD_WRITE_FAILED"), cause: error, result: workflow },
    );
  }

  let historyRecord = null;
  let historyError = null;
  const shouldSave = settings.learningMode === "study"
    && settings.saveHistory !== false
    && typeof addHistory === "function";
  if (shouldSave) {
    try {
      historyRecord = await addHistory(createHistoryRecordPayload(workflow, {
        source: input.source,
        additionalFields: {
          learningMode: "study",
          entryPoint: "shortcut",
          usage: { viewedModes: [action] },
          ocrUsed: false,
          ocrConfirmed: false,
        },
      }));
    } catch (error) {
      historyError = error;
    }
  }

  return Object.freeze({
    input,
    action,
    workflow,
    clipboardOutput,
    historyRecord,
    historyError,
  });
}

export const SHORTCUT_OUTPUT_MODES = Object.freeze([...SHORTCUT_ACTIONS]);
