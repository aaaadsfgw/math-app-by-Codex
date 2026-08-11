const OUTPUT_MODES = new Set(["answer", "hint1", "hint2", "steps", "explain"]);

const METHOD_HINTS = Object.freeze({
  "linear-equation": "等号の両側で同じ操作を行い、変数を含む項と定数項を分けます。",
  "linear-inequality": "変数項を片側へ集め、負の数で割る場合だけ不等号を反転します。",
  "quadratic-inequality": "右辺を0にし、2つの根と最高次係数から各区間の符号を調べます。",
  "rational-inequality": "左右を一つの分数にまとめ、分子の零点と分母が0になる点で数直線を区切り、各区間の符号を調べます。",
  "linear-system": "2本の式から一方の変数を消去し、得られた値を元の式へ戻します。",
  "quadratic-equation": "式を ax²+bx+c=0 の形に整理し、因数分解または解の公式を選びます。",
  "rational-equation": "元の分母が0でない条件を先に保ち、通分後の候補を元の式で検査します。",
  "exponential-equation": "正の有理数の底を素因数の累乗へ分け、すべての指数が一致するxを求めます。",
  "logarithmic-equation": "元の全引数を正に保ち、同じ底の対数法則で二次以下の方程式へ変換します。",
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
  return usableTrace(result).map((step) => step.content);
}

function usableTrace(result) {
  if (Array.isArray(result?.solutionTrace) && result.solutionTrace.length) {
    return result.solutionTrace
      .map((step) => ({
        type: cleanText(step?.type) || "transformation",
        content: cleanText(step?.content),
        explanation: cleanText(step?.explanation),
      }))
      .filter((step) => step.content);
  }
  if (!Array.isArray(result?.steps)) return [];
  return result.steps
    .map((step) => ({
      type: "transformation",
      content: cleanText(step),
      explanation: "",
    }))
    .filter((step) => step.content);
}

function stepsWithoutFinalAnswer(result) {
  const answers = [
    result?.answer,
    result?.exactAnswer,
    result?.approximateAnswer,
  ].map(comparable).filter(Boolean);
  return usableTrace(result).filter((step) => {
    if (["answer", "conclusion", "result"].includes(step.type)) return false;
    const content = comparable(step.content);
    return !answers.some((answer) => content === answer || content.includes(answer));
  });
}

function assertVerifiedResult(result) {
  const hasAnswer = Boolean(cleanText(result?.answer));
  if (!result?.supported || !result?.solved || !result?.verified || !hasAnswer) {
    throw new TypeError("検証済みの解答結果が必要です。");
  }
}

function methodHint(result) {
  return METHOD_HINTS[result.solverId]
    || stepsWithoutFinalAnswer(result)[0]?.explanation
    || stepsWithoutFinalAnswer(result)[0]?.content
    || "問題文から既知の値・未知の値・求めるものを整理します。";
}

function secondHint(result) {
  const method = methodHint(result);
  const progress = stepsWithoutFinalAnswer(result)
    .map((step) => step.explanation || step.content)
    .slice(0, 3);
  if (!progress.length) return method;
  return `${method}\n\nここまで進めてみましょう:\n${progress.join("\n")}`;
}

function stepContent(result) {
  const steps = usableSteps(result);
  if (!steps.length) return `最終回答: ${cleanText(result.answer)}`;
  return steps.join("\n");
}

function explainedStepContent(result) {
  const trace = usableTrace(result);
  if (!trace.length) return stepContent(result);
  return trace.map((step) => (
    step.explanation ? `${step.content}\n  ${step.explanation}` : step.content
  )).join("\n");
}

function explanationContent(result, category) {
  const sections = [
    `分類: ${cleanText(category) || "その他"}`,
    `考え方: ${methodHint(result)}`,
    `計算:\n${explainedStepContent(result)}`,
    `最終回答: ${cleanText(result.answer)}`,
  ];
  const approximateAnswer = cleanText(result.approximateAnswer);
  if (
    approximateAnswer
    && !comparable(result.answer).includes(comparable(approximateAnswer))
  ) {
    sections.push(`近似値: ${approximateAnswer}`);
  }
  const verification = cleanText(result.verification);
  if (verification) sections.push(`検算: ${verification}`);
  return sections.join("\n\n");
}

function answerContent(result) {
  const finalAnswer = cleanText(result.answer);
  const approximateAnswer = cleanText(result.approximateAnswer);
  if (
    !approximateAnswer
    || comparable(finalAnswer).includes(comparable(approximateAnswer))
  ) {
    return finalAnswer;
  }
  return `${finalAnswer}\n${approximateAnswer}`;
}

export function presentSolution(result, { mode = "answer", category = "その他" } = {}) {
  assertVerifiedResult(result);
  const selectedMode = OUTPUT_MODES.has(mode) ? mode : "answer";
  const finalAnswer = cleanText(result.answer);
  const contentByMode = {
    answer: answerContent(result),
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
