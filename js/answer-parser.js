const ANSWER_MODE = "answer";
const VERBOSE_MODES = new Set(["hint1", "hint2", "steps", "explain"]);
const ANSWER_MAX_LENGTH = 500;
const VERBOSE_MAX_LENGTH = 4000;

export function stripThinkBlocks(value) {
  let text = String(value ?? "");
  text = text.replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, "");
  text = text.replace(/<think\b[^>]*>[\s\S]*$/gi, "");
  return text;
}

export function stripCodeFences(value) {
  return String(value ?? "")
    .replace(/^\s*```[^\n\r]*\r?\n?/gm, "")
    .replace(/^\s*```\s*$/gm, "")
    .replace(/```/g, "");
}

function removeAnswerPrefix(value) {
  return String(value)
    .replace(/^\s*(?:最終回答|最終的な答え|答え|解答|final\s*answer|answer)\s*[：:]\s*/i, "")
    .trim();
}

function stripWrappingPair(value) {
  let text = String(value).trim();
  const pairs = [
    ["[", "]"], ["【", "】"], ["「", "」"], ["『", "』"],
    ["\"", "\""], ["'", "'"], ["“", "”"], ["‘", "’"],
  ];
  let changed = true;
  while (changed && text.length >= 2) {
    changed = false;
    for (const [opening, closing] of pairs) {
      if (text.startsWith(opening) && text.endsWith(closing)) {
        text = text.slice(opening.length, -closing.length).trim();
        changed = true;
        break;
      }
    }
  }
  return text;
}

function limitLength(value, maximum) {
  const text = String(value);
  if (text.length <= maximum) return text;
  return `${text.slice(0, maximum - 1).trimEnd()}…`;
}

export function cleanModelOutput(raw, maximumLength = VERBOSE_MAX_LENGTH) {
  const withoutThink = stripThinkBlocks(raw);
  const withoutFences = stripCodeFences(withoutThink);
  const cleaned = withoutFences
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => removeAnswerPrefix(line).trimEnd())
    .join("\n")
    .replace(/^\s+|\s+$/g, "")
    .replace(/\n{3,}/g, "\n\n");
  return limitLength(cleaned || "不明", maximumLength);
}

export function extractFinalAnswer(raw, options = {}) {
  const maximumLength = Number.isFinite(options.maxLength) ? options.maxLength : ANSWER_MAX_LENGTH;
  const base = stripCodeFences(stripThinkBlocks(raw)).replace(/\r\n?/g, "\n").trim();
  if (!base) return "不明";
  const lines = base.split("\n").map((line) => line.trim()).filter(Boolean);
  const selected = findExplicitFinalAnswer(lines) ?? lines.at(-1) ?? "";
  const cleaned = stripWrappingPair(removeAnswerPrefix(selected).replace(/^\s*[-*]\s+/, ""));
  return limitLength(cleaned || "不明", maximumLength);
}

function findExplicitFinalAnswer(linesOrRaw) {
  const lines = Array.isArray(linesOrRaw)
    ? linesOrRaw
    : stripCodeFences(stripThinkBlocks(linesOrRaw))
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  return lines
    .filter((line) => /^(?:最終回答|最終的な答え|答え|解答|final\s*answer|answer)\s*[：:]/i.test(line))
    .at(-1) ?? null;
}

export function parseAnswer(raw, mode = ANSWER_MODE) {
  const normalizedMode = [ANSWER_MODE, ...VERBOSE_MODES].includes(mode) ? mode : ANSWER_MODE;
  if (normalizedMode === ANSWER_MODE) {
    const finalAnswer = extractFinalAnswer(raw);
    return { content: finalAnswer, finalAnswer, mode: normalizedMode };
  }

  const content = cleanModelOutput(raw, VERBOSE_MAX_LENGTH);
  const explicitFinalAnswer = findExplicitFinalAnswer(raw);
  const finalAnswer = ["steps", "explain"].includes(normalizedMode)
    ? explicitFinalAnswer
      ? extractFinalAnswer(explicitFinalAnswer)
      : extractFinalAnswer(content)
    : null;
  return { content, finalAnswer, mode: normalizedMode };
}

export const parseResponse = parseAnswer;
export default parseAnswer;
