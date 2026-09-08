import {
  OCR_MAX_OUTPUT_CHARACTERS,
  OCR_PROVISIONAL_BACKEND,
  OCR_PROVISIONAL_MODEL,
} from "./ocr-config.js";

export const OCR_OUTPUT_FORMATS = Object.freeze(["latex", "text"]);
const OUTPUT_FORMAT_SET = new Set(OCR_OUTPUT_FORMATS);
const DISALLOWED_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

export class OcrOutputValidationError extends Error {
  constructor(message, { code = "OCR_OUTPUT_INVALID", cause = null } = {}) {
    super(message, cause instanceof Error ? { cause } : undefined);
    this.name = "OcrOutputValidationError";
    this.code = code;
  }
}

function readField(value, key) {
  try {
    return value[key];
  } catch (error) {
    throw new OcrOutputValidationError("OCR出力を安全に読み取れませんでした。", {
      code: "OCR_OUTPUT_INVALID",
      cause: error,
    });
  }
}

function normalizedText(value, maxCharacters) {
  if (typeof value !== "string") {
    throw new OcrOutputValidationError("OCR出力は文字列である必要があります。", {
      code: "OCR_OUTPUT_INVALID",
    });
  }

  const text = value.replace(/\r\n?/gu, "\n").trim();
  if (!text) {
    throw new OcrOutputValidationError("OCR結果が空です。", {
      code: "OCR_OUTPUT_EMPTY",
    });
  }
  if (text.length > maxCharacters) {
    throw new OcrOutputValidationError("OCR結果が許容長を超えています。", {
      code: "OCR_OUTPUT_TOO_LONG",
    });
  }
  if (DISALLOWED_CONTROL_CHARACTERS.test(text)) {
    throw new OcrOutputValidationError("OCR結果に使用できない制御文字が含まれています。", {
      code: "OCR_OUTPUT_INVALID_CHARACTERS",
    });
  }
  return text;
}

function positiveInteger(value, fallback) {
  const candidate = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(candidate) || candidate <= 0) {
    throw new TypeError("maxCharactersは正の整数で指定してください。");
  }
  return candidate;
}

function snapshotBackend(metadata) {
  if (!metadata || typeof metadata !== "object") {
    throw new TypeError("backend metadataが不正です。");
  }
  return Object.freeze({
    id: String(metadata.id || "").trim(),
    name: String(metadata.name || "").trim(),
    runtime: String(metadata.runtime || "").trim(),
    provisional: metadata.provisional === true,
  });
}

function snapshotModel(metadata) {
  if (!metadata || typeof metadata !== "object") {
    throw new TypeError("model metadataが不正です。");
  }
  return Object.freeze({
    id: String(metadata.id || "").trim(),
    family: String(metadata.family || "").trim(),
    revision: metadata.revision === null ? null : String(metadata.revision || "").trim(),
    provisional: metadata.provisional === true,
    assetsBundled: metadata.assetsBundled === true,
    licenseStatus: String(metadata.licenseStatus || "unknown").trim(),
    redistributionStatus: String(metadata.redistributionStatus || "unknown").trim(),
  });
}

function candidateFromObject(raw) {
  const latexValue = readField(raw, "latex");
  const textValue = readField(raw, "text");
  const rawTextValue = readField(raw, "rawText");
  const formatValue = readField(raw, "format");

  if (latexValue !== undefined && typeof latexValue !== "string") {
    throw new OcrOutputValidationError("OCRのlatexフィールドが文字列ではありません。");
  }
  if (textValue !== undefined && typeof textValue !== "string") {
    throw new OcrOutputValidationError("OCRのtextフィールドが文字列ではありません。");
  }
  if (rawTextValue !== undefined && typeof rawTextValue !== "string") {
    throw new OcrOutputValidationError("OCRのrawTextフィールドが文字列ではありません。");
  }

  const latex = typeof latexValue === "string" ? latexValue.trim() : "";
  const text = typeof textValue === "string" ? textValue.trim() : "";
  if (latex && text && latex !== text) {
    throw new OcrOutputValidationError("OCRのlatex出力とtext出力が一致しません。", {
      code: "OCR_OUTPUT_AMBIGUOUS",
    });
  }

  let format = formatValue === undefined
    ? (latex ? "latex" : "text")
    : String(formatValue).trim().toLowerCase();
  if (!OUTPUT_FORMAT_SET.has(format)) {
    throw new OcrOutputValidationError("OCR出力形式が未対応です。", {
      code: "OCR_OUTPUT_FORMAT_UNSUPPORTED",
    });
  }
  if (format === "latex" && !latex && text) format = "text";

  const warningsValue = readField(raw, "warnings");
  const confidenceValue = readField(raw, "confidence");
  const timingsValue = readField(raw, "timings");
  const warnings = Array.isArray(warningsValue)
    ? warningsValue
        .filter((warning) => typeof warning === "string" && warning.trim())
        .slice(0, 20)
        .map((warning) => warning.trim().slice(0, 500))
    : [];
  const finiteSnapshot = (value, allowedKeys) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const snapshot = {};
    for (const key of allowedKeys) {
      const number = readField(value, key);
      if (typeof number === "number" && Number.isFinite(number)) snapshot[key] = number;
    }
    return Object.keys(snapshot).length > 0 ? Object.freeze(snapshot) : null;
  };

  return Object.freeze({
    value: latex || text,
    rawText: rawTextValue === undefined ? (latex || text) : rawTextValue,
    format,
    warnings: Object.freeze(warnings),
    confidence: finiteSnapshot(confidenceValue, [
      "geometricMeanProbability",
      "meanMargin",
      "minimumMargin",
      "minimumProbability",
    ]),
    timings: finiteSnapshot(timingsValue, [
      "encoderMilliseconds",
      "decoderMilliseconds",
      "totalMilliseconds",
    ]),
  });
}

export function createOcrOutput(
  raw,
  {
    provider,
    backend = OCR_PROVISIONAL_BACKEND,
    model = OCR_PROVISIONAL_MODEL,
    maxCharacters = OCR_MAX_OUTPUT_CHARACTERS,
  } = {},
) {
  const limit = positiveInteger(maxCharacters, OCR_MAX_OUTPUT_CHARACTERS);
  let candidate;
  if (typeof raw === "string") {
    candidate = Object.freeze({
      value: raw,
      rawText: raw,
      format: "latex",
      warnings: Object.freeze([]),
      confidence: null,
      timings: null,
    });
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    candidate = candidateFromObject(raw);
  } else {
    throw new OcrOutputValidationError("OCR出力の構造が不正です。", {
      code: "OCR_OUTPUT_INVALID",
    });
  }

  const actualProvider = typeof provider === "string" ? provider.trim() : "";
  if (!actualProvider) throw new TypeError("provider metadataが必要です。");

  const outputText = normalizedText(candidate.value, limit);
  const rawText = normalizedText(candidate.rawText, limit);
  return Object.freeze({
    text: outputText,
    rawText,
    latex: candidate.format === "latex" ? outputText : null,
    format: candidate.format,
    provider: actualProvider,
    status: "unconfirmed",
    verified: false,
    confirmationRequired: true,
    backend: snapshotBackend(backend),
    model: snapshotModel(model),
    warnings: candidate.warnings,
    confidence: candidate.confidence,
    timings: candidate.timings,
  });
}

export const validateOcrOutput = createOcrOutput;
