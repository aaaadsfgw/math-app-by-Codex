import { parseMathExpression } from "../../js/math-core/expression-parser.js";
import { normalizeMathNotation } from "../../js/math-core/notation.js";
import { compileProblemInput, parseCombinedProblemText } from "../../js/problem/problem-input.js";
import { inspectFormulaSafety } from "../../js/problem/structured-input.js";
import { parseDefiniteIntegralInput } from "../../js/solver/definite-integral-input.js";
import { parseFiniteLimitInput } from "../../js/solver/limit-input.js";
import { MAX_INPUT_LENGTH } from "./engine.js";

const UNSAFE_CHARACTERS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\p{Cf}]/u;
function boundedText(value) {
  if (typeof value !== "string" || value.length > MAX_INPUT_LENGTH || UNSAFE_CHARACTERS.test(value)) {
    throw new Error("認識結果に使用できない文字や長すぎる項目が含まれています。");
  }
  return value.replace(/\r\n?/gu, "\n").trim();
}

function validateFormula(input) {
  const formula = input.formulaText;
  if (!formula || /\n/u.test(formula) || !compileProblemInput(input).ok) {
    throw new Error("数式や指示を確認し、構造が分かるように修正してください。");
  }
  // The explicit bounds have already been parsed as exact numbers. Check
  // for lost structure in the integrand without treating bounds as powers.
  const definiteIntegral = parseDefiniteIntegralInput(formula);
  if (!inspectFormulaSafety(definiteIntegral.ok ? definiteIntegral.expression : formula).safe) {
    throw new Error("数式や指示を確認し、構造が分かるように修正してください。");
  }
  if (definiteIntegral.ok) {
    parseMathExpression(definiteIntegral.expression);
    return;
  }
  const limit = parseFiniteLimitInput(formula);
  if (limit.ok) {
    parseMathExpression(limit.expression);
    return;
  }

  const normalized = normalizeMathNotation(formula);
  const expression = normalized.match(/^∫\s*(.+?)\s*d\s*x$/u)?.[1]
    ?? normalized.replace(/^f\s*\(\s*x\s*\)\s*=\s*/u, "");
  const parts = expression.split(/<=|>=|[=<>≤≥]/u);
  if (parts.length > 2) throw new Error("等式や不等式は1つずつ入力してください。");
  // The shared logarithmic equation solver accepts explicit integer bases.
  // Validate the operand with the generic parser and retain the original base.
  for (const part of parts) parseMathExpression(part.replace(/\blog_\d+(?=\()/gu, "log"));
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
  const rawInstruction = boundedText(candidate.rawInstructionText ?? "");
  const rawFormula = boundedText(candidate.rawFormulaText ?? "");
  const text = boundedText([label, instruction, formula].filter(Boolean).join("\n"));
  const warnings = Array.isArray(output.warnings)
    ? output.warnings.slice(0, 10).map(boundedText).filter(Boolean) : [];
  if (!text && !rawFormula && !rawInstruction && !warnings.length) {
    throw new Error("画像から問題文を読み取れませんでした。");
  }
  try {
    const { input } = validateClipboardText(text);
    if (input.questionLabel !== label || input.formulaText !== formula
      || (instruction && !input.instructionIntent)
      || (Array.isArray(candidate.conditions) && candidate.conditions.length > 0)) {
      warnings.push("問題番号、指示、数式を画像と照合して入力欄を修正してください。");
    }
  } catch {
    warnings.push("数式や指示を修正してからコピーしてください。");
  }
  return { text, label, instruction, formula, rawInstruction, rawFormula, warnings,
    model: output.model === "pix2text" ? "pix2text" : "ibem" };
}

export function createOcrWorkflow({ capture, recognize, clipboard, isCalculationBusy, onChange, notify,
  onReview = () => {} }) {
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
        if (state.preview) onReview();
      }
    } finally {
      active = null;
      onChange();
    }
  }

  async function recognizeImage(operation, captureMetrics = {}) {
    const { signal } = operation.controller;
    const started = performance.now();
    const preview = {
      id: ++nextId,
      imageUrl: `data:image/png;base64,${Buffer.from(image).toString("base64")}`,
      text: "",
    };
    publish("recognizing", "画像を認識しています。", preview);
    const output = await recognize(image, { signal });
    signal.throwIfAborted();
    const recognized = performance.now();
    const result = reviewCandidate(output);
    const ready = performance.now();
    const metrics = { ...output.metrics, ...captureMetrics, recognitionMs: recognized - started,
      validationMs: ready - recognized };
    publish("review", "認識候補を画像と照合し、必要に応じて修正してコピーしてください。",
      { ...preview, ...result, metrics });
    onReview();
  }

  return {
    getState: () => state,
    get busy() { return active !== null; },
    start: () => run(async (operation) => {
      const started = performance.now();
      image = null;
      publish("selecting", "画面上で数式を囲んでください。Esc で中止できます。");
      const { signal } = operation.controller;
      const metrics = {};
      const selected = await capture.select({ signal,
        onOverlayReady: () => { metrics.overlayMs = performance.now() - started; },
        onSelection: () => { metrics.selectionAt = performance.now(); },
      });
      signal.throwIfAborted();
      if (!selected) {
        publish("idle", "範囲選択を中止しました。");
        return;
      }
      image = selected;
      const { selectionAt, overlayMs } = metrics;
      await recognizeImage(operation, {
        overlayMs,
        captureMs: selectionAt === undefined ? undefined : performance.now() - selectionAt,
      });
    }),
    retry(id) {
      if (!image || state.preview?.id !== id) return;
      return run((operation) => recognizeImage(operation));
    },
    copy(id, text) {
      const preview = state.preview;
      if (!preview || preview.id !== id) return;
      return run(async (operation) => {
        const started = performance.now();
        let validated;
        try {
          validated = validateClipboardText(text);
        } catch {
          publish("review", "問題文をコピーできません。画像と照合し、問題番号・指示・数式を修正してください。", preview);
          return;
        }
        operation.committing = true;
        await clipboard.writeText(validated.text);
        const copyMs = performance.now() - started;
        const { overlayMs = 0, captureMs = 0, recognitionMs = 0, validationMs = 0 } = preview.metrics ?? {};
        publish("copied", "認識候補をコピーしました。", { ...preview, text: validated.text,
          metrics: { ...preview.metrics, copyMs, processingMs: overlayMs + captureMs + recognitionMs + validationMs + copyMs } });
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
