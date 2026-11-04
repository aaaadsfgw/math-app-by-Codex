import {
  looksLikeInstructionText,
} from "./instruction-normalizer.js";
import { parseMathExpression } from "../math-core/expression-parser.js";

const MAX_LABEL_CHARACTERS = 32;
const CIRCLED_NUMBER = /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/u;
const PARENTHESIZED_NUMBER = /^[（(]\s*[0-9０-９]{1,3}\s*[)）]/u;
const QUESTION_WORD_NUMBER = /^(?:問|問題)\s*[0-9０-９]{1,3}(?![0-9０-９])(?:\s*[.．:：])?/u;
const DOTTED_NUMBER = /^[0-9０-９]{1,3}[.．](?![0-9０-９])/u;
const CLOSING_PAREN_NUMBER = /^[0-9０-９]{1,3}[)）]/u;
const JAPANESE_START = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function result({ detected = false, questionLabel = "", remainingText = "", reason = "" }) {
  return Object.freeze({ detected, questionLabel, remainingText, reason });
}

function validLabelNumber(label) {
  const digits = label.normalize("NFKC").match(/\d+/u)?.[0] ?? "";
  if (!digits) return true;
  const number = Number(digits);
  return Number.isSafeInteger(number) && number >= 1 && number <= 999;
}

function labelCandidate(line) {
  const source = String(line ?? "").trimStart();
  const candidates = [
    { kind: "question-word", match: source.match(QUESTION_WORD_NUMBER), strong: true },
    { kind: "circled", match: source.match(CIRCLED_NUMBER), strong: true },
    { kind: "parenthesized", match: source.match(PARENTHESIZED_NUMBER), strong: false },
    { kind: "dotted", match: source.match(DOTTED_NUMBER), strong: false },
    { kind: "closing-parenthesis", match: source.match(CLOSING_PAREN_NUMBER), strong: false },
  ];
  for (const candidate of candidates) {
    if (!candidate.match) continue;
    const questionLabel = candidate.kind === "question-word"
      ? candidate.match[0].trim().replace(/[.．:：]$/u, "").trim()
      : candidate.match[0].trim();
    const suffix = source.slice(candidate.match[0].length);
    const remainder = suffix.trim();
    if (
      questionLabel.length > MAX_LABEL_CHARACTERS
      || !validLabelNumber(questionLabel)
    ) {
      return null;
    }
    return {
      questionLabel,
      remainder,
      strong: candidate.strong,
      kind: candidate.kind,
      separatedByHorizontalSpace: /^[\t \u3000]+/u.test(suffix),
    };
  }
  return null;
}

export function isQuestionLabel(value) {
  const source = String(value ?? "").trim();
  const candidate = labelCandidate(source);
  return Boolean(candidate && !candidate.remainder && candidate.questionLabel === (
    candidate.kind === "question-word" ? source.replace(/[.．:：]$/u, "") : source
  ));
}

function isSeparatedCalculation(candidate) {
  if (!candidate.separatedByHorizontalSpace) return false;
  // `(2) x` and `(2) (x+1)` can still be a coefficient. A digit-led
  // complete calculation after whitespace is the bounded textbook convention.
  if (!/^[0-9０-９]/u.test(candidate.remainder)) return false;
  try {
    return parseMathExpression(candidate.remainder).ast.type === "binary";
  } catch {
    return false;
  }
}

/**
 * Returns an untrusted weak label candidate without removing it. Callers must
 * supply independent evidence that the remainder is one complete problem.
 */
export function inspectWeakInlineQuestionLabel(value) {
  let source;
  try {
    source = String(value ?? "").trim();
  } catch {
    return null;
  }
  if (!source || /[\r\n]/u.test(source)) return null;
  const candidate = labelCandidate(source);
  if (
    !candidate
    || candidate.strong
    || candidate.kind !== "parenthesized"
    || !candidate.separatedByHorizontalSpace
    || !candidate.remainder
  ) return null;
  return Object.freeze({
    questionLabel: candidate.questionLabel,
    remainingText: candidate.remainder,
  });
}

/**
 * Removes a label only from the first non-empty line. Weak numeric forms such
 * as `(1)` require a separate line, instruction, or a whitespace-separated,
 * digit-led complete calculation. Attached parentheses remain mathematics.
 */
export function separateQuestionLabel(value) {
  let source;
  try {
    source = String(value ?? "").replace(/\r\n?/gu, "\n");
  } catch {
    return result({ remainingText: "", reason: "問題番号を安全に読み取れませんでした。" });
  }
  const lines = source.split("\n");
  const firstIndex = lines.findIndex((line) => line.trim());
  if (firstIndex < 0) return result({ remainingText: source });

  const candidate = labelCandidate(lines[firstIndex]);
  if (!candidate) return result({ remainingText: source });
  const safeRemainder = !candidate.remainder
    || candidate.strong
    || isSeparatedCalculation(candidate)
    || (
      JAPANESE_START.test(candidate.remainder)
      && looksLikeInstructionText(candidate.remainder)
    );
  if (!safeRemainder) {
    return result({
      remainingText: source,
      reason: candidate.separatedByHorizontalSpace
        ? "数式先頭の括弧または番号と区別できないため、問題番号として分離しませんでした。" : "",
    });
  }

  if (candidate.remainder) lines[firstIndex] = candidate.remainder;
  else lines.splice(firstIndex, 1);
  return result({
    detected: true,
    questionLabel: candidate.questionLabel,
    remainingText: lines.join("\n").trim(),
  });
}
