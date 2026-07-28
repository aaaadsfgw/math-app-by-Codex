import {
  failedResult,
  normalizeMathText,
  solvedResult,
  unsupportedResult,
} from "./utils.js";

export const BASE_CONVERSION_SOLVER_ID = "base-conversion";

const SUBSCRIPT_DIGITS = Object.freeze({
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
});

function parseSubscriptBase(value) {
  const text = String(value);
  const match = text.match(/(?:^|[^0-9A-Za-z])([+-]?[0-9][0-9A-Za-z]*)\s*([₀-₉]+)(?=$|[^0-9A-Za-z])/u);
  if (!match) return null;
  const base = Number([...match[2]].map((digit) => SUBSCRIPT_DIGITS[digit]).join(""));
  return { digits: match[1], base };
}

function parseParenthesizedBase(value) {
  const normalized = normalizeMathText(value);
  const match = normalized.match(/(?:^|[^0-9A-Za-z])([+-]?[0-9][0-9A-Za-z]*)\s*\(\s*(\d{1,2})\s*\)/);
  if (match) return { digits: match[1], base: Number(match[2]) };

  const verbose = normalized.match(/(\d{1,2})進数(?:の|で表された)?\s*([+-]?[0-9A-Za-z]+)/u);
  return verbose ? { digits: verbose[2], base: Number(verbose[1]) } : null;
}

function convertToDecimal(digitText, base) {
  const sign = digitText.startsWith("-") ? -1n : 1n;
  const unsigned = digitText.replace(/^[+-]/, "").toUpperCase();
  if (!unsigned) throw new Error("変換する数がありません");
  let result = 0n;
  for (const character of unsigned) {
    const digit = character >= "0" && character <= "9"
      ? character.charCodeAt(0) - 48
      : character.charCodeAt(0) - 55;
    if (digit < 0 || digit >= base) {
      throw new Error(`基数${base}では「${character}」を使用できません`);
    }
    result = result * BigInt(base) + BigInt(digit);
  }
  return sign * result;
}

export function solveBaseConversion(question) {
  const parsed = parseSubscriptBase(question) ?? parseParenthesizedBase(question);
  if (!parsed) return unsupportedResult("基数表記を検出できません");
  if (!Number.isInteger(parsed.base) || parsed.base < 2 || parsed.base > 36) {
    return failedResult(BASE_CONVERSION_SOLVER_ID, "基数は2以上36以下にしてください");
  }

  const normalized = normalizeMathText(question);
  const targetMatch = normalized.match(/(?:を|から)\s*(\d{1,2})進数/u);
  if (targetMatch && Number(targetMatch[1]) !== 10) {
    return unsupportedResult("初期版は10進数への変換だけに対応しています");
  }

  try {
    const decimal = convertToDecimal(parsed.digits, parsed.base);
    const answer = decimal.toString();
    return solvedResult({
      answer,
      steps: [
        `${parsed.digits}（${parsed.base}進数）`,
        `各桁を${parsed.base}の累乗で展開`,
        `${answer}（10進数）`,
      ],
      verification: `10進数${answer}を${parsed.base}進表記へ戻すと${parsed.digits.replace(/^\+/, "").toUpperCase()}になります`,
      solverId: BASE_CONVERSION_SOLVER_ID,
    });
  } catch (error) {
    return failedResult(BASE_CONVERSION_SOLVER_ID, error.message);
  }
}

export default solveBaseConversion;
