import { parseMathExpression } from "../../js/math-core/expression-parser.js";
import { normalizeMathNotation } from "../../js/math-core/notation.js";
import { compileProblemInput, parseCombinedProblemText } from "../../js/problem/problem-input.js";
import { inspectFormulaSafety } from "../../js/problem/structured-input.js";
import { parseDefiniteIntegralInput } from "../../js/solver/definite-integral-input.js";
import { parseFiniteLimitInput } from "../../js/solver/limit-input.js";
import { MAX_INPUT_LENGTH } from "./engine.js";

const UNSAFE_CHARACTERS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\p{Cf}]/u;
// These diagnostics describe separations corroborated by the layout and OCR.
// Unknown diagnostics and ambiguous same-row numeric labels require review.
const INFORMATIONAL_WARNINGS = new Set([
  "数式行左端の独立領域を問題番号として分離しました。",
  "指示と数式を別々に認識しました。各欄を画像と照合してください。",
  "同一行の明確な数式と対応済み日本語指示を分離しました。各欄を画像と照合してください。",
  "行内の問題番号を位置から分けました。元画像で区切りを確認してください。",
]);

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

function validateProblemText(value, source = "clipboard") {
  const text = boundedText(value);
  const input = parseCombinedProblemText(text, { source });
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
  let validated;
  try {
    const parsed = validateProblemText(text, "ocr");
    const { input } = parsed;
    if (input.questionLabel !== label || input.formulaText !== formula
      || (instruction && (!input.instructionIntent
        || (candidate.instructionIntent && candidate.instructionIntent !== input.instructionIntent)))
      || (Array.isArray(candidate.conditions) && candidate.conditions.length > 0)) {
      warnings.push("問題番号、指示、数式を画像と照合して入力欄を修正してください。");
    } else {
      validated = parsed;
    }
  } catch {
    warnings.push("数式や指示を修正してから再計算してください。");
  }
  if (output.layout?.fractionCount > 0 && !formula.includes("/")) {
    warnings.push("画像に分数の構造が見つかりましたが、認識結果に分数がありません。");
  }
  const eligible = validated && Array.isArray(output.warnings) && output.warnings.length <= 10
    && warnings.every((warning) => INFORMATIONAL_WARNINGS.has(warning));
  return {
    preview: { text, label, instruction, formula, rawInstruction, rawFormula, warnings,
      model: output.model === "pix2text" ? "pix2text" : "ibem" },
    automatic: eligible ? validated : null,
  };
}

function solverInput(input) {
  const { formulaText } = input;
  if (inspectFormulaSafety(formulaText).safe) return input;
  // The validator has checked the explicit bounds and complete integrand.
  // Parenthesize the integrand so the shared plain-text guard can distinguish
  // a parenthesized upper bound from a digit immediately after a group.
  const integral = parseDefiniteIntegralInput(formulaText);
  return { ...input, formulaText: `∫_(${integral.lowerSource})^(${integral.upperSource}) (${integral.expression}) dx` };
}

export function createOcrWorkflow({ capture, recognize, calculator, clipboard, isCalculationBusy, onChange, notify,
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

  async function captureStamp(signal) {
    if (!calculator) return null;
    try {
      const stamp = await clipboard.captureStamp({ signal });
      signal.throwIfAborted();
      return stamp;
    } catch {
      signal.throwIfAborted();
      return null;
    }
  }

  function report(phase, message, preview, needsReview = false) {
    publish(phase, message, preview);
    notify(message);
    if (needsReview) onReview();
  }

  async function solveImage(operation, preview, validated, stamp, selectionAt) {
    const { signal } = operation.controller;
    const input = solverInput(validated.input);
    const submittedText = [input.questionLabel, input.instructionText, input.formulaText].filter(Boolean).join("\n");
    const pending = { ...preview, submittedText, result: null };
    publish("calculating", "認識した問題を計算しています。", pending);
    const started = performance.now();
    let result;
    try {
      result = await calculator.calculateOcr(input, { signal });
    } catch (error) {
      signal.throwIfAborted();
      report("calculation-error", `計算できませんでした。 ${error.message}`, pending, true);
      return;
    }
    signal.throwIfAborted();
    const solved = { ...pending, result, metrics: { ...pending.metrics, calculationMs: performance.now() - started } };
    if (stamp == null) {
      report("solved", "解答を検証しました。クリップボードの状態を確認できなかったため、解答は画面に表示しました。", solved);
      return;
    }
    const copyStarted = performance.now();
    operation.committing = true;
    let copied;
    try {
      copied = await clipboard.writeIfUnchanged(stamp, result.answer);
    } catch {
      report("solved", "解答を検証しました。クリップボードに書き込めなかったため、解答は画面に表示しました。", solved);
      return;
    }
    if (!copied) {
      report("solved", "処理中にクリップボードが変わりました。検証済みの解答は画面に表示しました。", solved);
      return;
    }
    const completed = performance.now();
    report("copied", "計算完了。検証済みの解答をクリップボードにコピーしました。", {
      ...solved, metrics: { ...solved.metrics, copyMs: completed - copyStarted,
        selectionToCopyMs: selectionAt === undefined ? undefined : completed - selectionAt },
    });
  }

  async function recognizeImage(operation, stamp, captureMetrics = {}, selectionAt) {
    const { signal } = operation.controller;
    signal.throwIfAborted();
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
    const { preview: recognizedPreview, automatic } = reviewCandidate(output);
    const ready = performance.now();
    const metrics = { ...output.metrics, ...captureMetrics, recognitionMs: recognized - started,
      validationMs: ready - recognized };
    const candidate = { ...preview, ...recognizedPreview, metrics };
    if (calculator && automatic) {
      await solveImage(operation, candidate, automatic, stamp, selectionAt);
    } else {
      report("review", "認識候補を元画像と照合してください。必要に応じて修正し、再計算できます。", candidate, true);
    }
  }

  return {
    getState: () => state,
    get busy() { return active !== null; },
    start: () => run(async (operation) => {
      const started = performance.now();
      image = null;
      publish("selecting", "画面上で数式を囲んでください。Esc で中止できます。");
      const { signal } = operation.controller;
      const stamp = await captureStamp(signal);
      signal.throwIfAborted();
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
      await recognizeImage(operation, stamp, {
        overlayMs,
        captureMs: selectionAt === undefined ? undefined : performance.now() - selectionAt,
      }, selectionAt);
    }),
    retry(id) {
      if (!image || state.preview?.id !== id) return;
      return run(async (operation) => recognizeImage(operation, await captureStamp(operation.controller.signal)));
    },
    recalculate(id, text) {
      const preview = state.preview;
      if (!calculator || !preview || preview.id !== id) return;
      return run(async (operation) => {
        let validated;
        try {
          validated = validateProblemText(text, "ocr");
        } catch {
          publish("review", "問題番号、指示、数式を確認し、修正してから再計算してください。",
            { ...preview, result: null, submittedText: "" });
          return;
        }
        const { signal } = operation.controller;
        const stamp = await captureStamp(signal);
        signal.throwIfAborted();
        await solveImage(operation, { ...preview, id: ++nextId, text: validated.text, metrics: {} }, validated, stamp);
      });
    },
    copyAnswer(id) {
      const preview = state.preview;
      if (!preview?.result || preview.id !== id) return;
      return run(async (operation) => {
        operation.committing = true;
        try {
          await clipboard.writeText(preview.result.answer);
          publish("copied", "検証済みの解答をクリップボードにコピーしました。", preview);
        } catch {
          publish("solved", "解答をクリップボードに書き込めませんでした。", preview);
        }
      });
    },
    copy(id, text) {
      const preview = state.preview;
      if (!preview || preview.id !== id) return;
      return run(async (operation) => {
        const started = performance.now();
        let validated;
        try {
          validated = validateProblemText(text);
        } catch {
          publish("review", "問題文をコピーできません。画像と照合し、問題番号・指示・数式を修正してください。", preview);
          return;
        }
        operation.committing = true;
        await clipboard.writeText(validated.text);
        const copyMs = performance.now() - started;
        const { overlayMs = 0, captureMs = 0, recognitionMs = 0, validationMs = 0 } = preview.metrics ?? {};
        const updated = calculator ? preview : { ...preview, metrics: { ...preview.metrics, copyMs,
          processingMs: overlayMs + captureMs + recognitionMs + validationMs + copyMs } };
        publish(state.phase, "問題文をクリップボードにコピーしました。", updated);
      });
    },
    cancel() {
      if (active?.committing) return;
      const cancelled = active !== null;
      active?.controller.abort();
      image = null;
      publish("idle", cancelled ? "画像からの計算を中止しました。" : "");
    },
  };
}
