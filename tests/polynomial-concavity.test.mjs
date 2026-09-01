import assert from "node:assert/strict";
import test from "node:test";

import { presentSolution } from "../js/solution-presenter.js";
import {
  POLYNOMIAL_CONCAVITY_SOLVER_ID,
  solvePolynomialConcavity,
} from "../js/solver/polynomial-concavity.js";

const NONE = "なし";
const ALL_REAL = "(-∞,+∞)";

function concavityAnswer(lower, upper) {
  return `下に凸: ${lower}; 上に凸: ${upper}`;
}

function inflectionAnswer(points) {
  return `変曲点: ${points}`;
}

function combinedAnswer(lower, upper, points) {
  return `${concavityAnswer(lower, upper)}; ${inflectionAnswer(points)}`;
}

function assertExact(result, answer) {
  assert.equal(result.supported, true, result.error);
  assert.equal(result.solved, true, result.error);
  assert.equal(result.verified, true, result.error);
  assert.equal(result.resultKind, "exact");
  assert.equal(result.solverId, POLYNOMIAL_CONCAVITY_SOLVER_ID);
  assert.equal(result.answer, answer);
  assert.equal(result.exactAnswer, answer);
  assert.equal(result.approximateAnswer, "");
  assert.deepEqual(result.conditions, []);
  assert.equal(result.solutionSet, null);
  assert.ok(result.solutionTrace.length >= 8);
  assert.equal(result.solutionTrace.at(-1).type, "result");
  assert.equal(result.solutionTrace.at(-1).content, `凹凸・変曲点: ${answer}`);
}

function assertRejected(result, kind) {
  assert.equal(result.verified, false);
  assert.equal(result.solved, false);
  assert.equal(result.answer, "");
  assert.equal(result.exactAnswer, "");
  assert.equal(result.approximateAnswer, "");
  assert.equal(result.resultKind, kind);
  assert.ok(result.error);
}

test("concavity formは日本の符号規約で下に凸・上に凸を固定順表示する", () => {
  for (const [question, expected] of [
    ["concavity(x^3)", concavityAnswer("(0,+∞)", "(-∞,0)")],
    ["concavity(-x^3)", concavityAnswer("(-∞,0)", "(0,+∞)")],
    ["concavity(x^2)", concavityAnswer(ALL_REAL, NONE)],
    ["concavity(-x^2)", concavityAnswer(NONE, ALL_REAL)],
    ["concavity(2x+1)", concavityAnswer(NONE, NONE)],
    ["concavity(5/3)", concavityAnswer(NONE, NONE)],
  ]) {
    assertExact(solvePolynomialConcavity(question), expected);
  }
});

test("inflection formは二階導関数の符号変化だけを変曲点として返す", () => {
  for (const [question, expected] of [
    ["inflection(x^3)", inflectionAnswer("(0, 0)")],
    ["inflection(-x^3+2)", inflectionAnswer("(0, 2)")],
    ["inflection(x^4)", inflectionAnswer(NONE)],
    ["inflection(x^2)", inflectionAnswer(NONE)],
    ["inflection(7)", inflectionAnswer(NONE)],
  ]) {
    assertExact(solvePolynomialConcavity(question), expected);
  }
});

test("combined formは凹凸2項の後へ変曲点を置き日本語形式も同じ結果にする", () => {
  const expected = combinedAnswer("(0,+∞)", "(-∞,0)", "(0, 0)");
  for (const question of [
    "concavity_inflection(x^3)",
    "関数 y=x^3 の凹凸を調べ、変曲点を求めよ",
    "次の関数 f(x)=x^3 の凹凸と変曲点を求めなさい。",
  ]) {
    assertExact(solvePolynomialConcavity(question), expected);
  }
});

test("4次式は二階導関数の重根を変曲点と誤認せず最大凹凸区間を保つ", () => {
  assertExact(
    solvePolynomialConcavity("concavity_inflection(x^4)"),
    combinedAnswer(ALL_REAL, NONE, NONE),
  );
});

test("有理係数を浮動小数へ落とさずf'・f''・点のexact証拠を保持する", () => {
  const result = solvePolynomialConcavity("concavity_inflection((1/3)x^3+1/2)");
  assertExact(
    result,
    combinedAnswer("(0,+∞)", "(-∞,0)", "(0, 1/2)"),
  );
  const trace = result.solutionTrace.map(({ content }) => content).join("\n");
  assert.match(trace, /f'\(x\)=x\^2/u);
  assert.match(trace, /f''\(x\)=2x/u);
  assert.match(trace, /f\(0\)=1\/2/u);
  assert.doesNotMatch(JSON.stringify(result), /≈|Infinity|NaN/u);
  assert.match(result.verification, /BigInt|厳密/u);
  assert.match(result.verification, /浮動小数/u);
});

test("関数・変数分母・負冪・4次超過をunsupportedのままにする", () => {
  for (const question of [
    "concavity(sin(x))",
    "concavity(sqrt(x))",
    "concavity(1/x)",
    "concavity(x^-1)",
    "concavity(x^5)",
    "concavity(0*x^5)",
    "concavity(x^5-x^5)",
    "concavity((x^5)^0)",
  ]) {
    assertRejected(solvePolynomialConcavity(question), "unsupported");
  }
});

test("不完全構文・答え付加・関係式・曖昧入力をinvalidにする", () => {
  for (const question of [
    "concavity()",
    "concavity(x^3",
    "inflection()",
    "concavity_inflection()",
    "concavity(x^3)=下に凸",
    "inflection(x^3):答え(0,0)",
    "concavity(x^2=1)",
    "concavity(x2)",
    "concavity(1 2+x)",
    "concavity(x/2x)",
    "concavity(5!)",
    "concavity(x₋₁)",
    "concavity(ⓧ)",
    "concavity(x²⁻¹)",
  ]) {
    assertRejected(solvePolynomialConcavity(question), "invalid");
  }
});

test("区間・最大最小・図表・証明など認識済み範囲外をunsupportedにする", () => {
  for (const question of [
    "区間 0<=x<=1 で関数 y=x^3 の凹凸を調べよ",
    "関数 y=x^3 のグラフを用いて凹凸を調べよ",
    "関数 y=x^3 の増減表と凹凸を調べよ",
    "関数 y=x^3 の変曲点を証明せよ",
    "関数 y=x^3 の最大値と変曲点を求めよ",
  ]) {
    const result = solvePolynomialConcavity(question);
    assertRejected(result, "unsupported");
    assert.equal(result.recognized, true);
  }
});

test("通常微分・増減・接線・法線・面積・体積・極限・方程式を横取りしない", () => {
  for (const question of [
    "x^2を微分せよ",
    "monotonicity(x^3)",
    "tangent_x_[1](x^2)",
    "normal_x_[1](x^2)",
    "area_[0,1](x;0)",
    "volume_x_axis_[0,1](x)",
    "lim_(x->0) x",
    "x^2=4",
    "数列a_nの凹凸を調べよ",
  ]) {
    const result = solvePolynomialConcavity(question);
    assertRejected(result, "unsupported");
    assert.equal(result.recognized, undefined);
  }
});

test("危険な問題文文字列化例外をsolver境界のinvalidへ封じ込める", () => {
  for (const input of [
    {
      [Symbol.toPrimitive]() {
        throw new Error("coercion failed");
      },
    },
    {
      [Symbol.toPrimitive]() {
        throw null;
      },
    },
    {
      [Symbol.toPrimitive]() {
        throw {
          get message() {
            throw new Error("message getter failed");
          },
        };
      },
    },
  ]) {
    const result = solvePolynomialConcavity(input);
    assertRejected(result, "invalid");
    assert.equal(result.recognized, true);
  }
});

test("5表示モードは答えを必要なモードだけへ出しhintへ完成区間・座標を漏らさない", () => {
  const result = solvePolynomialConcavity("concavity_inflection(x^3)");
  const expected = combinedAnswer("(0,+∞)", "(-∞,0)", "(0, 0)");
  assertExact(result, expected);

  assert.equal(presentSolution(result, { mode: "answer" }).content, expected);
  const hint1 = presentSolution(result, { mode: "hint1" }).content;
  const hint2 = presentSolution(result, { mode: "hint2" }).content;
  for (const hint of [hint1, hint2]) {
    assert.doesNotMatch(hint, /下に凸:|上に凸:|変曲点:|\(-∞,0\)|\(0,\+∞\)|\(0, 0\)/u);
  }
  assert.match(hint1, /二階導関数/u);
  assert.match(presentSolution(result, { mode: "steps" }).content, /凹凸・変曲点:/u);
  const explanation = presentSolution(result, {
    mode: "explain",
    category: "微分",
  }).content;
  assert.match(explanation, /分類: 微分/u);
  assert.match(explanation, /BigInt|厳密/u);
});

test("solverId・exact種別・typed traceを履歴投入可能なJSON素材として保持する", () => {
  const result = solvePolynomialConcavity("concavity_inflection(x^3)");
  assert.equal(result.solverId, POLYNOMIAL_CONCAVITY_SOLVER_ID);
  assert.equal(result.resultKind, "exact");
  assert.ok(result.solutionTrace.every(({ type, content }) => type && content));

  const roundTrip = JSON.parse(JSON.stringify({
    category: "微分",
    solverId: result.solverId,
    resultKind: result.resultKind,
    finalAnswer: result.exactAnswer,
    solutionTrace: result.solutionTrace,
    verificationMessage: result.verification,
  }));
  assert.equal(roundTrip.category, "微分");
  assert.equal(roundTrip.solverId, POLYNOMIAL_CONCAVITY_SOLVER_ID);
  assert.equal(roundTrip.resultKind, "exact");
  assert.equal(roundTrip.solutionTrace.at(-1).content, `凹凸・変曲点: ${result.answer}`);
  assert.equal(roundTrip.verificationMessage, result.verification);
});
