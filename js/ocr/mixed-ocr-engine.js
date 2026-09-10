import { normalizeInstruction } from "../problem/instruction-normalizer.js";
import {
  isQuestionLabel,
  separateQuestionLabel,
} from "../problem/question-label.js";
import { segmentOcrImageBlob } from "./mixed-image-segmenter.js";

const JAPANESE_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

export class MixedOcrError extends Error {
  constructor(message, { code = "MIXED_OCR_FAILED", cause = null } = {}) {
    super(message, cause instanceof Error ? { cause } : undefined);
    this.name = "MixedOcrError";
    this.code = code;
  }
}

function mixedError(message, code, cause = null) {
  return new MixedOcrError(message, { code, cause });
}

function countJapanese(value) {
  return String(value ?? "").match(JAPANESE_CHARACTER)?.length ?? 0;
}

function normalizedText(value) {
  return String(value ?? "")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function recognitionKindOutput({
  kind,
  questionLabel = "",
  instructionText = "",
  instructionRawText = "",
  formulaOutput = null,
  japaneseOutputs = [],
  warnings = [],
}) {
  const formulaText = normalizedText(formulaOutput?.text);
  const rawFormulaText = normalizedText(formulaOutput?.rawText ?? formulaText);
  const firstJapanese = japaneseOutputs[0] ?? null;
  const instruction = normalizeInstruction(instructionText);
  return Object.freeze({
    text: formulaText,
    rawText: rawFormulaText,
    latex: formulaOutput?.latex ?? null,
    format: formulaOutput?.format ?? "text",
    provider: formulaOutput?.provider ?? firstJapanese?.provider ?? "wasm",
    status: "unconfirmed",
    verified: false,
    confirmationRequired: true,
    backend: formulaOutput?.backend ?? firstJapanese?.backend ?? null,
    model: formulaOutput?.model ?? firstJapanese?.model ?? null,
    warnings: Object.freeze([
      ...(Array.isArray(formulaOutput?.warnings) ? formulaOutput.warnings : []),
      ...warnings,
    ]),
    confidence: formulaOutput?.confidence ?? null,
    timings: formulaOutput?.timings ?? null,
    recognitionKind: kind,
    structuredCandidate: Object.freeze({
      questionLabel,
      instructionText,
      instructionIntent: instruction.intent,
      instructionStatus: instruction.status,
      formulaText,
      conditions: Object.freeze([]),
      rawInstructionText: instructionRawText,
      rawFormulaText,
      source: "ocr",
      instructionSource: instructionText ? "ocr" : "none",
      formulaSource: formulaText ? "ocr" : "none",
    }),
    japaneseOcr: firstJapanese
      ? Object.freeze({
          provider: firstJapanese.provider,
          backend: firstJapanese.backend,
          model: firstJapanese.model,
          confidences: Object.freeze(
            japaneseOutputs.map((output) => output.confidence).filter((value) => value !== null),
          ),
          timings: Object.freeze(japaneseOutputs.map((output) => output.timings)),
        })
      : null,
  });
}

function classifyInstructionRegions(outputs) {
  const lines = [];
  for (const output of outputs) {
    const text = normalizedText(output?.text);
    if (!text) {
      throw mixedError(
        "日本語指示領域を認識できませんでした。",
        "MIXED_OCR_JAPANESE_OUTPUT_EMPTY",
      );
    }
    const japaneseCount = countJapanese(text);
    if (japaneseCount < 2 && !isQuestionLabel(text)) {
      throw mixedError(
        "上側にも数式らしい領域があり、1つの数式を特定できません。",
        "MIXED_OCR_MULTIPLE_FORMULAS",
      );
    }
    lines.push(text);
  }
  const rawText = lines.join("\n");
  const separated = separateQuestionLabel(rawText);
  const instructionText = normalizedText(separated.remainingText);
  if (countJapanese(instructionText) < 2) {
    throw mixedError(
      "数式とは別の日本語指示を確認できませんでした。",
      "MIXED_OCR_INSTRUCTION_AMBIGUOUS",
    );
  }
  return Object.freeze({
    questionLabel: separated.questionLabel,
    instructionText,
    rawText,
  });
}

function singleRegionJapanese(output) {
  const rawText = normalizedText(output?.text);
  if (countJapanese(rawText) < 2) return null;
  const separated = separateQuestionLabel(rawText);
  return Object.freeze({
    questionLabel: separated.questionLabel,
    instructionText: normalizedText(separated.remainingText),
    rawText,
  });
}

export function createMixedOcrEngine({
  formulaEngine,
  japaneseRecognizer,
  segmentImage = segmentOcrImageBlob,
} = {}) {
  if (!formulaEngine || typeof formulaEngine.recognize !== "function") {
    throw new TypeError("formulaEngine.recognizeが必要です。");
  }
  if (!japaneseRecognizer || typeof japaneseRecognizer.recognize !== "function") {
    throw new TypeError("japaneseRecognizer.recognizeが必要です。");
  }
  if (typeof segmentImage !== "function") throw new TypeError("segmentImageは関数で指定してください。");

  let active = 0;
  return Object.freeze({
    async recognize(blob, options = {}) {
      active += 1;
      try {
        const segmented = await segmentImage(blob);
        const regions = segmented?.regions;
        if (!Array.isArray(regions) || regions.length < 1 || regions.length > 3) {
          throw mixedError("OCR領域分割結果が不正です。", "MIXED_OCR_SEGMENTATION_INVALID");
        }

        if (regions.length === 1) {
          let japaneseOutput = null;
          try {
            japaneseOutput = await japaneseRecognizer.recognize(regions[0].blob, options);
          } catch {
            // Formula-only OCR remains available if the independent Japanese
            // preflight cannot load. Confirmation is still mandatory.
          }
          const japanese = japaneseOutput ? singleRegionJapanese(japaneseOutput) : null;
          if (japanese) {
            return recognitionKindOutput({
              kind: "instruction-only",
              questionLabel: japanese.questionLabel,
              instructionText: japanese.instructionText,
              instructionRawText: japanese.rawText,
              japaneseOutputs: [japaneseOutput],
              warnings: ["日本語指示だけを認識しました。数式は手動で入力してください。"],
            });
          }
          // A single-region image is already the trusted user crop. Keep its
          // original whitespace and scale for the formula model; tightening
          // it to detected ink changes IBEM's input distribution and can turn
          // a previously correct formula-only recognition into garbage.
          const formulaOutput = await formulaEngine.recognize(blob, options);
          return recognitionKindOutput({
            kind: "formula-only",
            formulaOutput,
            warnings: japaneseOutput
              ? []
              : ["日本語OCR preflightは利用できませんでした。数式候補を必ず確認してください。"],
          });
        }

        const instructionRegions = regions.slice(0, -1);
        let japaneseOutputs;
        try {
          japaneseOutputs = [];
          for (const region of instructionRegions) {
            japaneseOutputs.push(await japaneseRecognizer.recognize(region.blob, options));
          }
        } catch (error) {
          throw mixedError(
            "日本語指示を認識できなかったため、数式OCRを開始しませんでした。",
            "MIXED_OCR_JAPANESE_RECOGNITION_FAILED",
            error,
          );
        }
        const instruction = classifyInstructionRegions(japaneseOutputs);
        const formulaOutput = await formulaEngine.recognize(regions.at(-1).blob, options);
        return recognitionKindOutput({
          kind: "mixed",
          questionLabel: instruction.questionLabel,
          instructionText: instruction.instructionText,
          instructionRawText: instruction.rawText,
          formulaOutput,
          japaneseOutputs,
          warnings: ["指示と数式を別々に認識しました。各欄を画像と照合してください。"],
        });
      } finally {
        active = Math.max(0, active - 1);
      }
    },
    cancel() {
      const cancelled = Math.max(
        Number(formulaEngine.cancel?.() || 0),
        Number(japaneseRecognizer.cancel?.() || 0),
        active > 0 ? 1 : 0,
      );
      return cancelled;
    },
    async dispose() {
      await Promise.allSettled([
        formulaEngine.dispose?.(),
        japaneseRecognizer.dispose?.(),
      ]);
    },
    get status() {
      return Object.freeze({
        state: active ? "working" : "idle",
        available: formulaEngine.status?.available === true,
        formula: formulaEngine.status,
        japanese: japaneseRecognizer.status,
      });
    },
    get metadata() {
      return Object.freeze({
        formula: formulaEngine.metadata,
        japanese: japaneseRecognizer.status,
      });
    },
  });
}
