export const OUTPUT_MODES = Object.freeze([
  "answer",
  "hint1",
  "hint2",
  "steps",
  "explain",
]);
const OUTPUT_MODE_SET = new Set(OUTPUT_MODES);

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
  "definite-integral": "原始関数 F(x) を作り、指定された向きのまま F(上端)-F(下端) を厳密に計算します。",
  "indefinite-integral": "基本積分公式を適用し、最後に積分定数 C を付けます。",
  "finite-limit": "有限点では分子・分母の零点次数を、無限遠では次数と最高次係数を比較します。",
  "polynomial-area": "2曲線の差の全交点で区間を分け、各区間の上下関係を確かめて絶対値積分を足します。",
  "polynomial-tangent": "接点での関数値と導関数値を厳密に求め、点と傾きから直線の方程式を作ります。",
  "polynomial-normal": "接点での関数値と導関数値を厳密に求め、接線方向に直交する直線の方程式を作ります。",
  "polynomial-variation": "導関数の全実根で数直線を区切り、各区間の符号変化から増減と極値を判定します。",
  "polynomial-volume": "区間全体で外半径と内半径の非負性・順序を確かめ、pi(R²-r²)を積分します。",
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

function topLevelCommaParts(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (["(", "[", "{"].includes(character)) depth += 1;
    else if ([")", "]", "}"].includes(character)) depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function answerCandidates(result) {
  const candidates = [];
  for (const value of [result?.answer, result?.exactAnswer, result?.approximateAnswer]) {
    const normalized = comparable(value);
    if (!normalized) continue;
    candidates.push(normalized);
    const parts = topLevelCommaParts(normalized);
    if (parts.length < 2) continue;
    const first = /^([A-Za-z][A-Za-z0-9_]*)=(.+)$/u.exec(parts[0]);
    if (!first) continue;
    candidates.push(parts[0], first[2]);
    for (const part of parts.slice(1)) {
      candidates.push(part, part.includes("=") ? part : `${first[1]}=${part}`);
    }
  }
  return [...new Set(candidates)];
}

const ANSWER_PREFIX_MARKER = /(?:最終回答|最終的に|最終|答え|結論|解|結果|値)(?:は|が|[:：=])?$|(?:したがって|従って|ゆえに|よって|このあと|変形すると|計算すると)$/u;
const ANSWER_SUFFIX_MARKER = /^(?:です|でした|である|とな(?:る|ります|った)|にな(?:る|ります|った)|を得(?:る|ます|ました)|が得られ(?:る|ます|ました)|と求ま(?:る|ります|った)|が答え|まで|[。．.!！?？])/u;

function occurrenceDisclosesAnswer(normalized, answer) {
  let offset = 0;
  while (offset <= normalized.length - answer.length) {
    const index = normalized.indexOf(answer, offset);
    if (index < 0) return false;
    const before = normalized.slice(0, index);
    const after = normalized.slice(index + answer.length);
    const prefixed = ANSWER_PREFIX_MARKER.test(before)
      || /[A-Za-z][A-Za-z0-9_]*=$/u.test(before);
    const suffixed = ANSWER_SUFFIX_MARKER.test(after);
    if (
      (!before && (!after || suffixed))
      || suffixed
      || (prefixed && (!after || /^[、,;；)）\]]/u.test(after)))
    ) {
      return true;
    }
    offset = index + Math.max(1, answer.length);
  }
  return false;
}

function disclosesAnswer(value, answers) {
  const normalized = comparable(value);
  return answers.some((answer) => (
    normalized === answer
    // A complete equality/inequality answer is conclusive wherever it appears
    // outside the original input line; it never belongs in a staged hint.
    || (/[=≈<>≤≥≦≧]/u.test(answer) && normalized.includes(answer))
    || occurrenceDisclosesAnswer(normalized, answer)
  ));
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
  const answers = answerCandidates(result);
  const safeSteps = [];
  for (const step of usableTrace(result)) {
    if (["answer", "conclusion", "result"].includes(step.type)) continue;
    const contentLeaks = disclosesAnswer(step.content, answers);
    const explanationLeaks = disclosesAnswer(step.explanation, answers);
    if (step.type === "input") {
      safeSteps.push(explanationLeaks ? { ...step, explanation: "" } : step);
    } else if (!contentLeaks && !explanationLeaks) {
      safeSteps.push(step);
    }
  }
  return safeSteps;
}

function assertVerifiedResult(result) {
  const hasAnswer = Boolean(cleanText(result?.answer));
  if (!result?.supported || !result?.solved || !result?.verified || !hasAnswer) {
    throw new TypeError("検証済みの解答結果が必要です。");
  }
}

function methodHint(result) {
  const strategy = result.solverId === "algebra-transformation"
    ? stepsWithoutFinalAnswer(result).find((step) => step.type === "strategy")
    : null;
  return strategy?.explanation
    || strategy?.content
    || METHOD_HINTS[result.solverId]
    || stepsWithoutFinalAnswer(result)[0]?.explanation
    || stepsWithoutFinalAnswer(result)[0]?.content
    || "問題文から既知の値・未知の値・求めるものを整理します。";
}

function secondHint(result) {
  const method = methodHint(result);
  const guided = stepsWithoutFinalAnswer(result)
    .find((step) => step.type === "guided-transformation");
  if (guided) {
    return `${method}\n\n次の変形まで進めます:\n${guided.explanation || guided.content}`;
  }
  const showConcreteTrace = result.solverId === "quadratic-equation";
  const progress = stepsWithoutFinalAnswer(result)
    .map((step) => {
      const content = cleanText(step.content);
      const explanation = cleanText(step.explanation);
      if (!showConcreteTrace) return explanation || content;
      if (!content) return explanation;
      if (!explanation || comparable(content) === comparable(explanation)) return content;
      return `${content}\n${explanation}`;
    })
    .filter(Boolean)
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
  const selectedMode = OUTPUT_MODE_SET.has(mode) ? mode : "answer";
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
