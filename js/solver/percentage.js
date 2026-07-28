import {
  failedResult,
  formatNumber,
  nearlyEqual,
  normalizeMathText,
  solvedResult,
  unsupportedResult,
} from "./utils.js";

export const PERCENTAGE_SOLVER_ID = "percentage";

export function solvePercentage(question) {
  const text = normalizeMathText(question).replace(/,/g, "");
  if (/(?:引き|割引|増し|増加|減少|上乗せ)/u.test(text)) {
    return unsupportedResult("割引・増減計算は初期ソルバーの対象外です");
  }
  const match = text.match(/([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:円)?\s*の\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:%|パーセント)/u);
  if (!match) return unsupportedResult("「数値のパーセント」の形式を検出できません");

  const total = Number(match[1]);
  const percentage = Number(match[2]);
  if (![total, percentage].every(Number.isFinite)) {
    return failedResult(PERCENTAGE_SOLVER_ID, "数値が不正です");
  }
  if (total < 0 || percentage < 0) {
    return failedResult(PERCENTAGE_SOLVER_ID, "負の値には対応していません");
  }

  const result = total * percentage / 100;
  if (!Number.isFinite(result)) return failedResult(PERCENTAGE_SOLVER_ID, "計算結果が大きすぎます");
  const reversePercentage = total === 0 ? 0 : result / total * 100;
  const verified = total === 0 ? nearlyEqual(result, 0) : nearlyEqual(reversePercentage, percentage);
  if (!verified) return failedResult(PERCENTAGE_SOLVER_ID, "逆算検証に失敗しました");

  const answer = formatNumber(result);
  return solvedResult({
    answer,
    steps: [`${formatNumber(total)}×${formatNumber(percentage)}/100`, answer],
    verification: `${answer}÷${formatNumber(total || 1)}×100=${formatNumber(reversePercentage)}%として確認しました`,
    solverId: PERCENTAGE_SOLVER_ID,
  });
}

export default solvePercentage;
