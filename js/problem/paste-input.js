import "../selection-math-extractor.js";

import {
  normalizeProblemInput,
  parseCombinedProblemText,
} from "./problem-input.js";
import { normalizeStructuredProblemSet } from "./structured-input.js";

function readClipboardType(clipboardData, type) {
  try {
    return typeof clipboardData?.getData === "function"
      ? String(clipboardData.getData(type) ?? "")
      : "";
  } catch {
    return "";
  }
}
function plainExtraction(plainText, fallbackReason = "") {
  const text = String(plainText ?? "").trim();
  return Object.freeze({
    text,
    rawText: text,
    usedStructure: false,
    format: "plain",
    fallbackReason,
  });
}

/**
 * Snapshots a user-initiated paste without executing or attaching clipboard
 * HTML. Supported semantic math is accepted only by the shared DOM extractor;
 * every other case keeps text/plain byte-for-byte apart from outer whitespace.
 */
export function acquirePastedProblem(
  clipboardData,
  {
    extractor = globalThis.__mathStudyLogSelectionMathExtractor,
    documentObject = globalThis.document,
  } = {},
) {
  const plainText = readClipboardType(clipboardData, "text/plain").trim();
  const htmlText = readClipboardType(clipboardData, "text/html");
  if (!plainText) {
    return Object.freeze({
      handled: false,
      extraction: plainExtraction("", "clipboard text is empty"),
      problemInput: null,
      problemSet: null,
    });
  }

  let extraction = plainExtraction(plainText, "structured clipboard extraction is unavailable");
  if (typeof extractor?.extractClipboardHtml === "function") {
    try {
      const candidate = extractor.extractClipboardHtml({
        plainText,
        htmlText,
        documentObject,
      });
      if (candidate && typeof candidate === "object" && typeof candidate.text === "string") {
        extraction = candidate;
      }
    } catch {
      // The plain clipboard representation remains the authoritative fallback.
    }
  }

  const candidateText = String(extraction.text || plainText).trim();
  const parsed = parseCombinedProblemText(candidateText, { source: "clipboard" });
  const problemInput = normalizeProblemInput({
    ...parsed,
    rawText: plainText,
    status: parsed.status,
    error: parsed.error,
    source: "clipboard",
    instructionSource: parsed.instructionText ? "clipboard" : "none",
    formulaSource: "clipboard",
  });
  const acquisitionWarnings = extraction.fallbackReason
    ? [String(extraction.fallbackReason)]
    : [];
  const problemSet = normalizeStructuredProblemSet(problemInput, {
    source: "clipboard",
    formulaStructure: extraction.usedStructure ? "semantic" : "plain",
    warnings: acquisitionWarnings,
  });

  return Object.freeze({
    handled: true,
    extraction,
    problemInput,
    problemSet,
  });
}
