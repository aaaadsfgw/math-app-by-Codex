import {
  looksLikeInstructionText,
} from "./instruction-normalizer.js";

const MAX_LABEL_CHARACTERS = 32;
const CIRCLED_NUMBER = /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/u;
const PARENTHESIZED_NUMBER = /^[（(]\s*[0-9０-９]{1,3}\s*[)）]/u;
const QUESTION_WORD_NUMBER = /^(?:問|問題)\s*[0-9０-９]{1,3}(?![0-9０-９])(?:\s*[.．:：])?/u;
const DOTTED_NUMBER = /^[0-9０-９]{1,3}[.．]/u;

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
    { match: source.match(QUESTION_WORD_NUMBER), strong: true },
    { match: source.match(CIRCLED_NUMBER), strong: true },
    { match: source.match(PARENTHESIZED_NUMBER), strong: false },
    { match: source.match(DOTTED_NUMBER), strong: false },
  ];
  for (const candidate of candidates) {
    if (!candidate.match) continue;
    const questionLabel = candidate.match[0].trim().replace(/[.．:：]$/u, "").trim();
    const remainder = source.slice(candidate.match[0].length).trim();
    if (
      questionLabel.length > MAX_LABEL_CHARACTERS
      || !validLabelNumber(questionLabel)
    ) {
      return null;
    }
    return { questionLabel, remainder, strong: candidate.strong };
  }
  return null;
}

export function isQuestionLabel(value) {
  const source = String(value ?? "").trim();
  const candidate = labelCandidate(source);
  return Boolean(candidate && !candidate.remainder && candidate.questionLabel === source.replace(/[.．:：]$/u, ""));
}

/**
 * Removes a label only from the first non-empty line. Weak numeric forms such
 * as `(1)` and `1.` require either their own line or a following Japanese
 * instruction. A following mathematical expression is never consumed.
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
    || looksLikeInstructionText(candidate.remainder);
  if (!safeRemainder) {
    return result({
      remainingText: source,
      reason: "数式先頭の括弧または番号と区別できないため、問題番号として分離しませんでした。",
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
