import { OCR_IMAGE_LIMITS } from "../../js/ocr/ocr-config.js";
import { looksLikeInstructionText, normalizeInstruction } from "../../js/problem/instruction-normalizer.js";
import { isQuestionLabel, separateQuestionLabel } from "../../js/problem/question-label.js";
import { analyzeWindowsOcrLayout } from "./windows-layout.js";

const CJK = "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}]";
const JAPANESE_CHARACTER = new RegExp(CJK, "gu");
const CJK_SPACING = new RegExp(`(${CJK})\\s+(?=${CJK})`, "gu");
const BINARY_CONTINUATION = /^(?:[*/^=<>≠≤≥×÷,;)\]}]|\\(?:times|cdot|div|leq?|geq?|neq?)(?![a-z]))/u;
const MAX_JAPANESE_PIXELS = 2 * 1024 * 1024;

function normalizedText(value) {
  return typeof value === "string" ? value.replace(/\r\n?/gu, "\n").trim() : "";
}

function contextText(value) {
  const text = normalizedText(value).replace(CJK_SPACING, "$1");
  // OCR can put spaces between the digits and surrounding punctuation of a
  // label. Removing whitespace preserves the glyphs, including circled digits.
  const compact = text.replace(/\s+/gu, "");
  return isQuestionLabel(compact) ? compact : text;
}

function japaneseInstruction(value) {
  return (value.match(JAPANESE_CHARACTER)?.length ?? 0) >= 3
    && !/[*^=<>+]/u.test(value)
    && looksLikeInstructionText(value);
}

function readContext(text) {
  const normalized = contextText(text);
  if (isQuestionLabel(normalized)) return { label: normalized, instruction: "" };
  const split = separateQuestionLabel(normalized);
  if (japaneseInstruction(split.remainingText)) {
    return { label: split.questionLabel, instruction: split.remainingText };
  }
  return null;
}

function sameLabel(left, right) {
  return left.normalize("NFKC").replace(/\s+/gu, "") === right.normalize("NFKC").replace(/\s+/gu, "");
}

function labelEvidence(label, candidate) {
  if (!label || !candidate.label) return false;
  const weak = /^\((\d{1,3})\)$/u.exec(label.normalize("NFKC"));
  if (weak) {
    // A displayed coefficient uses the same glyphs as a label. Only propose
    // a split for a distinct gap and visible parentheses, and require review.
    return candidate.columns >= weak[1].length + 2 && candidate.separation >= 0.48;
  }
  return /^(?:[①-⑳]|問(?:題)?\s*[0-9０-９]{1,3})$/u.test(label);
}

function numericLabelFromLatex(latex, columns) {
  const compact = normalizedText(latex)
    .replace(/\s+|\\[,;:!]|\\left(?=\s*\()|\\right(?=\s*\))/gu, "");
  // This is an isolated upper text region. Pix2Text can render its numeric
  // label as a raised annotation, so recognize that layout wrapper here only.
  const label = /^\^\{(\(\d{1,3}\))\}$/u.exec(compact)?.[1] ?? compact;
  const match = /^\((\d{1,3})\)$/u.exec(label);
  return match && columns >= match[1].length + 2 && isQuestionLabel(label) ? label : "";
}

async function crop(bitmap, { x, y, width, height }, { japanese = false, dark = false } = {}) {
  // The Japanese worker expects whitespace around a line of text. Enlarge
  // small captures to preserve narrow punctuation and problem-label glyphs.
  const pad = japanese ? 10 : 0;
  const outputWidth = width + 2 * pad;
  const outputHeight = height + 2 * pad;
  const scale = japanese ? Math.max(1, Math.min(
    4,
    Math.ceil(110 / outputHeight),
    Math.floor(Math.sqrt(MAX_JAPANESE_PIXELS / (outputWidth * outputHeight))),
  )) : 1;
  const canvas = new OffscreenCanvas(outputWidth * scale, outputHeight * scale);
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (dark) context.filter = "invert(1)";
  context.drawImage(bitmap, x, y, width, height, pad * scale, pad * scale, width * scale, height * scale);
  return canvas.convertToBlob({ type: "image/png" });
}

function sameCandidate(left, right) {
  return left.context.label === right.context.label
    && left.context.instruction === right.context.instruction
    && Object.keys(left.formula).every((key) => left.formula[key] === right.formula[key]);
}

async function selectInline(candidates, probe, warnings) {
  let selected = null;
  for (const candidate of candidates) {
    if (selected && candidate.separation < selected.separation * 0.75) break;
    const recognized = await probe(candidate.context);
    const context = readContext(recognized.text);
    if (!context) continue;
    if (context.instruction ? !candidate.instruction : !labelEvidence(context.label, candidate)) continue;
    const match = { ...candidate, context, rawContext: recognized.rawText };
    if (!selected) selected = match;
    else if (!sameCandidate(selected, match)) {
      warnings.push("行内の指示・問題番号の分離候補が一致しません。元画像と照合し、手動で入力してください。");
      return { conflict: true };
    }
  }
  return { selected };
}

export async function recognizeWindowsMixedOcr(blob, { recognizeFormula, recognizeJapanese, signal } = {}) {
  const started = performance.now();
  const warnings = [];
  const rawContext = [];
  let layoutMs = 0;
  let japaneseMs = 0;
  let questionLabel = "";
  let instructionText = "";
  let formulaOutput = null;
  let formulaBounds = null;
  let fractionCount = 0;
  let recognitionMetrics = {};
  let extraInferenceMs = 0;
  let bitmap;
  const result = () => {
    const formulaText = normalizedText(formulaOutput?.text);
    const rawFormulaText = normalizedText(formulaOutput?.rawText ?? formulaOutput?.text);
    const instruction = normalizeInstruction(instructionText, { formulaText });
    return {
      format: "latex",
      model: formulaOutput?.model ?? "Pix2Text MFR 1.5",
      provider: formulaOutput?.provider ?? "cpu",
      confirmationRequired: true,
      verified: false,
      warnings: [...warnings, ...(formulaOutput?.warnings ?? [])],
      metrics: { ...recognitionMetrics, extraInferenceMs, layoutMs, japaneseMs, ocrMs: performance.now() - started },
      layout: { formulaBounds, fractionCount },
      structuredCandidate: {
        questionLabel,
        instructionText,
        instructionIntent: instruction.intent,
        instructionStatus: instruction.status,
        formulaText,
        rawInstructionText: rawContext.join("\n"),
        rawFormulaText,
        conditions: [],
      },
    };
  };

  try {
    signal?.throwIfAborted();
    bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    const { maxDimension, maxPixels } = OCR_IMAGE_LIMITS;
    if (width < 1 || height < 1 || width > maxDimension || height > maxDimension || width * height > maxPixels) {
      throw Object.assign(new Error("認識する画像の寸法が不正です。"), { code: "OCR_IMAGE_INVALID" });
    }
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const layout = analyzeWindowsOcrLayout(context.getImageData(0, 0, width, height));
    fractionCount = layout.fractions.length;
    layoutMs = performance.now() - started;
    if (layout.regions.length > 3) {
      warnings.push("独立した行が多く、1つの数式に絞れません。元画像を確認するか、範囲を選び直してください。");
      return result();
    }

    async function probe(bounds, { retainRaw = false } = {}) {
      signal?.throwIfAborted();
      const probeStarted = performance.now();
      try {
        const output = await recognizeJapanese(
          await crop(bitmap, bounds, { japanese: true, dark: layout.dark }), { signal },
        );
        signal?.throwIfAborted();
        const text = normalizedText(output?.text);
        const rawText = normalizedText(output?.rawText) || text;
        if (retainRaw && rawText) rawContext.push(rawText);
        return { text, rawText };
      } catch (error) {
        signal?.throwIfAborted();
        if (retainRaw) warnings.push("日本語または問題番号の認識を完了できませんでした。");
        return { text: "", rawText: "" };
      } finally {
        japaneseMs += performance.now() - probeStarted;
      }
    }

    function applyContext(context) {
      if (context.label && questionLabel && !sameLabel(context.label, questionLabel)) {
        warnings.push("異なる問題番号が認識されました。元画像と照合してください。");
        return false;
      }
      if (context.label) questionLabel ||= context.label;
      if (context.instruction) instructionText = [instructionText, context.instruction].filter(Boolean).join(" ");
      return true;
    }

    async function recognizeMath(bounds, original = false) {
      signal?.throwIfAborted();
      const formula = await recognizeFormula(
        original && !layout.dark ? blob : await crop(bitmap, bounds, { dark: layout.dark }), { signal },
      );
      signal?.throwIfAborted();
      // A label probe may be the first request to the warm inference process.
      const initialModelMs = recognitionMetrics.loadMs;
      recognitionMetrics = { ...formula?.metrics };
      if (initialModelMs > 0) recognitionMetrics.loadMs = initialModelMs;
      return formula;
    }

    for (const region of layout.regions.slice(0, -1)) {
      const { text } = await probe(region.bounds, { retainRaw: true });
      let recognized = readContext(text);
      const labelLike = /^(?:[()（）①-⑳0-9０-９\s]+)$/u.test(text);
      const tentativeLabel = recognized?.label && /^(?:\d{1,3}\)|[①-⑳])$/u.test(recognized.label);
      if (!questionLabel && region.isolatedLabelColumns >= 3 && region.isolatedLabelColumns <= 7
        && labelLike && (!recognized || tentativeLabel)) {
        let alternative;
        try {
          alternative = await recognizeMath(region.bounds);
        } catch (error) {
          if (error?.code !== "OCR_RECOGNITION_FAILED") throw error;
        }
        extraInferenceMs += alternative?.metrics?.inferenceMs ?? 0;
        const label = numericLabelFromLatex(alternative?.rawText, region.isolatedLabelColumns);
        if (label) rawContext.push(normalizedText(alternative.rawText).slice(0, 128));
        const partial = /^([0-9]{1,3})\)$/u.exec(recognized?.label ?? "");
        if (label && partial && label !== `(${partial[1]})`) {
          warnings.push("独立した問題番号の認識結果が一致しません。元画像と照合してください。");
          return result();
        }
        if (label) recognized = { label, instruction: "" };
      }
      if (!recognized) {
        warnings.push("数式の上段を日本語指示または問題番号として確認できませんでした。元画像と照合してください。");
        return result();
      }
      if (!applyContext(recognized)) return result();
    }

    const last = layout.regions.at(-1);
    const { selected, conflict } = await selectInline(last.inline, probe, warnings);
    if (conflict) return result();
    if (selected?.context.label && questionLabel && !sameLabel(selected.context.label, questionLabel)) {
      warnings.push("異なる問題番号が認識されました。元画像と照合してください。");
      return result();
    }

    const fullBounds = { x: 0, y: 0, width, height };
    const originalBounds = layout.regions.length === 1 ? fullBounds : last.bounds;
    formulaBounds = selected?.formula ?? originalBounds;
    formulaOutput = await recognizeMath(formulaBounds, formulaBounds === fullBounds);
    if (selected) {
      if (selected.context.label && BINARY_CONTINUATION.test(normalizedText(formulaOutput?.rawText))) {
        // The remainder is visibly attached to the prefix. Keep the entire
        // mathematical line rather than dropping its leading factor.
        formulaBounds = originalBounds;
        extraInferenceMs += formulaOutput?.metrics?.inferenceMs ?? 0;
        formulaOutput = await recognizeMath(originalBounds, originalBounds === fullBounds);
        warnings.push("数式の左端が演算の一部である可能性があるため、問題番号として分離しませんでした。");
      } else {
        applyContext(selected.context);
        if (selected.rawContext) rawContext.push(selected.rawContext);
        if (selected.context.label) {
          warnings.push(/^\(/u.test(selected.context.label.normalize("NFKC"))
            ? "行内の問題番号を位置から分けました。括弧付きの係数との区別を元画像で確認してください。"
            : "行内の問題番号を位置から分けました。元画像で区切りを確認してください。");
        }
      }
    }
    signal?.throwIfAborted();
    if (!formulaOutput?.text) warnings.push("数式候補を元画像と照合し、必要に応じて修正してください。");
    return result();
  } finally {
    bitmap?.close();
  }
}
