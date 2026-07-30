const OUTPUT_MODES = new Set(["answer", "hint1", "hint2", "steps", "explain"]);

const METHOD_HINTS = Object.freeze({
  "linear-equation": "等号の両側で同じ操作を行い、変数を含む項と定数項を分けます。",
  "linear-inequality": "変数項を片側へ集め、負の数で割る場合だけ不等号を反転します。",
  "linear-system": "2本の式から一方の変数を消去し、得られた値を元の式へ戻します。",
  "quadratic-equation": "式を ax²+bx+c=0 の形に整理し、因数分解または解の公式を選びます。",
  "base-conversion": "各桁に、右端から0、1、2…乗した基数を掛けて足します。",
  percentage: "「全体×割合÷100」の形に直して計算します。",
  "algebra-transformation": "項と因数の構造を確認し、指定された形へ同値変形します。",
  derivative: "各項に微分公式を適用し、合成関数では内側の導関数を掛けます。",
  "indefinite-integral": "基本積分公式を適用し、最後に積分定数 C を付けます。",
});

function cleanText(value) {
  return String(value ?? "").trim();
}

function comparable(value) {
  return cleanText(value)
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .toLowerCase();
}

function usableSteps(result) {
  if (!Array.isArray(result?.steps)) return [];
  return result.steps.map(cleanText).filter(Boolean);
}

function stepsWithoutFinalAnswer(result) {
  const answer = comparable(result?.answer);
  return usableSteps(result).filter((step) => comparable(step) !== answer);
}

function assertVerifiedResult(result) {
  const hasAnswer = Boolean(cleanText(result?.answer));
  if (!result?.supported || !result?.solved || !result?.verified || !hasAnswer) {
    throw new TypeError("検証済みの解答結果が必要です。");
  }
}

function methodHint(result) {
  return METHOD_HINTS[result.solverId]
    || stepsWithoutFinalAnswer(result)[0]
    || "問題文から既知の値・未知の値・求めるものを整理します。";
}

function secondHint(result) {
  const method = methodHint(result);
  const progress = stepsWithoutFinalAnswer(result).slice(0, 3);
  if (!progress.length) return method;
  return `${method}\n\nここまで進めてみましょう:\n${progress.join("\n")}`;
}

function stepContent(result) {
  const steps = usableSteps(result);
  if (!steps.length) return `最終回答: ${cleanText(result.answer)}`;
  return steps.join("\n");
}

function explanationContent(result, category) {
  const sections = [
    `分類: ${cleanText(category) || "その他"}`,
    `考え方: ${methodHint(result)}`,
    `計算:\n${stepContent(result)}`,
    `最終回答: ${cleanText(result.answer)}`,
  ];
  const verification = cleanText(result.verification);
  if (verification) sections.push(`検算: ${verification}`);
  return sections.join("\n\n");
}

export function presentSolution(result, { mode = "answer", category = "その他" } = {}) {
  assertVerifiedResult(result);
  const selectedMode = OUTPUT_MODES.has(mode) ? mode : "answer";
  const finalAnswer = cleanText(result.answer);
  const contentByMode = {
    answer: finalAnswer,
    hint1: methodHint(result),
    hint2: secondHint(result),
    steps: stepContent(result),
    explain: explanationContent(result, category),
  };

  return {
    content: contentByMode[selectedMode],
    finalAnswer,
  };
}

export { OUTPUT_MODES };
