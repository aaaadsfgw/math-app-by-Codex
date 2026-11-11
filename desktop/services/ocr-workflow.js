import { parseMathExpression } from "../../js/math-core/expression-parser.js";
import { normalizeMathNotation } from "../../js/math-core/notation.js";
import { compileProblemInput, parseCombinedProblemText } from "../../js/problem/problem-input.js";
import { inspectFormulaSafety } from "../../js/problem/structured-input.js";
import { parseDefiniteIntegralInput } from "../../js/solver/definite-integral-input.js";
import { parseFiniteLimitInput } from "../../js/solver/limit-input.js";
import { MAX_INPUT_LENGTH } from "./engine.js";

const UNSAFE_CHARACTERS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\p{Cf}]/u;
const INFORMATIONAL_WARNINGS = new Set([
  "数式行左端の独立領域を問題番号として分離しました。",
  "同一行左端の問題番号と数式を位置情報から分離しました。各欄を画像と照合してください。",
  "指示と数式を別々に認識しました。各欄を画像と照合してください。",
]);

function boundedText(value) {
  if (typeof value !== "string" || value.length > MAX_INPUT_LENGTH || UNSAFE_CHARACTERS.test(value)) {
    throw new Error("認識結果に使用できない文字や長すぎる項目が含まれています。");
  }
  return value.replace(/\r\n?/gu, "\n").trim();
}

function validateFormula(input) {
  const formula = input.formulaText;
  if (!formula || /\n/u.test(formula) || !inspectFormulaSafety(formula).safe || !compileProblemInput(input).ok) {
    throw new Error("数式や指示を確認し、構造が分かるように修正してください。");
  }
  const limit = parseFiniteLimitInput(formula);
  if (limit.ok) {
    parseMathExpression(limit.expression);
    return;
  }
  const definiteIntegral = parseDefiniteIntegralInput(formula);
  if (definiteIntegral.ok) return;

  const normalized = normalizeMathNotation(formula);
  const expression = normalized.match(/^∫\s*(.+?)\s*d\s*x$/u)?.[1]
    ?? normalized.replace(/^f\s*\(\s*x\s*\)\s*=\s*/u, "");
  const parts = expression.split(/<=|>=|[=<>≤≥]/u);
  if (parts.length > 2) throw new Error("等式や不等式は1つずつ入力してください。");
  for (const part of parts) parseMathExpression(part);
}

function validateClipboardText(value) {
  const text = boundedText(value);
  const input = parseCombinedProblemText(text, { source: "clipboard" });
  if (input.status !== "ready") throw new Error("問題番号、指示、数式の区切りを確認してください。");
  validateFormula(input);
  return { text, input };
}

function reviewCandidate(output) {
  const candidate = output?.structuredCandidate;
  if (!candidate) throw new Error("認識結果を読み取れませんでした。");
  const label = boundedText(candidate.questionLabel);
  const instruction = boundedText(candidate.instructionText);
  const formula = boundedText(candidate.formulaText);
  const rawText = boundedText([
    boundedText(candidate.rawInstructionText ?? ""),
    boundedText(candidate.rawFormulaText ?? ""),
  ].filter(Boolean).join("\n"));
  const original = boundedText([label, instruction, formula].filter(Boolean).join("\n"));
  if (!original) throw new Error("画像から問題文を読み取れませんでした。");
  try {
    // IBEM already normalized the model's Typst. Running its normalizer on
    // solver text could reinterpret implicit products as Typst function calls.
    const validated = validateClipboardText(original);
    const uncertain = !Array.isArray(output.warnings)
      || output.warnings.some((warning) => !INFORMATIONAL_WARNINGS.has(warning))
      || validated.input.questionLabel !== label
      || validated.input.formulaText !== formula
      || (instruction && !validated.input.instructionIntent)
      || (Array.isArray(candidate.conditions) && candidate.conditions.length > 0);
    return { text: validated.text, rawText, safe: !uncertain };
  } catch {
    return { text: original, rawText, safe: false };
  }
}

export function createOcrWorkflow({ capture, recognize, clipboard, isCalculationBusy, onChange, notify }) {
  let state = { phase: "idle", message: "", preview: null };
  let image = null;
  let active = null;
  let nextId = 0;

  function publish(phase, message, preview = null) {
    state = { phase, message, preview };
    onChange();
  }

  function canStart() {
    return !active && !isCalculationBusy();
  }

  async function clipboardSnapshot() {
    try {
      return await clipboard.readText();
    } catch {
      return undefined;
    }
  }

  async function run(action) {
    if (!canStart()) return;
    const operation = { controller: new AbortController(), committing: false };
    active = operation;
    try {
      await action(operation);
    } catch (error) {
      if (!operation.controller.signal.aborted) {
        const message = error instanceof Error ? error.message : "画像認識に失敗しました。";
        publish("error", message, state.preview);
        notify(message);
      }
    } finally {
      active = null;
      onChange();
    }
  }

  async function recognizeImage(operation, originalClipboard) {
    const { signal } = operation.controller;
    const preview = {
      id: ++nextId,
      imageUrl: `data:image/png;base64,${Buffer.from(image).toString("base64")}`,
      text: "",
      rawText: "",
    };
    publish("recognizing", "画像を認識しています。", preview);
    const output = await recognize(image, { signal });
    signal.throwIfAborted();
    const result = reviewCandidate(output);
    const candidate = { ...preview, text: result.text, rawText: result.rawText };
    const message = "認識候補を画像と照合し、必要に応じて修正してコピーしてください。";
    if (originalClipboard === undefined || !result.safe) {
      publish("review", message, candidate);
      notify(message);
      return;
    }
    const currentClipboard = await clipboardSnapshot();
    signal.throwIfAborted();
    if (currentClipboard !== originalClipboard) {
      const changed = currentClipboard === undefined
        ? "クリップボードの状態を確認できません。認識候補は画面で確認できます。"
        : "画像認識中にクリップボードのテキストが変わりました。認識候補は画面で確認できます。";
      publish("review", changed, candidate);
      notify(changed);
      return;
    }
    operation.committing = true;
    try {
      await clipboard.writeText(result.text);
    } catch {
      publish("review", "自動コピーに失敗しました。認識候補を画面で確認してください。", candidate);
      notify(state.message);
      return;
    }
    publish("copied", "画像認識完了。認識候補をコピーしました。Math Study Log で確認・修正できます。", candidate);
    notify(state.message);
  }

  return {
    getState: () => state,
    get busy() { return active !== null; },
    start: () => run(async (operation) => {
      image = null;
      publish("selecting", "画面上で数式を囲んでください。Esc で中止できます。");
      const { signal } = operation.controller;
      const originalClipboard = await clipboardSnapshot();
      signal.throwIfAborted();
      const selected = await capture.select({ signal });
      signal.throwIfAborted();
      if (!selected) {
        publish("idle", "範囲選択を中止しました。");
        return;
      }
      image = selected;
      await recognizeImage(operation, originalClipboard);
    }),
    retry(id) {
      if (!image || state.preview?.id !== id) return;
      return run((operation) => recognizeImage(operation));
    },
    copy(id, text) {
      const preview = state.preview;
      if (!preview || preview.id !== id) return;
      return run(async (operation) => {
        let validated;
        try {
          validated = validateClipboardText(text);
        } catch {
          publish("review", "問題文をコピーできません。画像と照合し、問題番号・指示・数式を修正してください。", preview);
          return;
        }
        operation.committing = true;
        await clipboard.writeText(validated.text);
        publish("copied", "認識候補をコピーしました。", { ...preview, text: validated.text });
      });
    },
    cancel() {
      if (active?.committing) return;
      const cancelled = state.phase === "selecting" || state.phase === "recognizing";
      active?.controller.abort();
      image = null;
      publish("idle", cancelled ? "画像認識を中止しました。" : "");
    },
  };
}
