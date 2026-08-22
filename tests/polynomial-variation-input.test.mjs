import assert from "node:assert/strict";
import test from "node:test";

import { parsePolynomialVariationInput } from "../js/solver/polynomial-variation-input.js";

const RESPONSE_KEYS = [
  "recognized",
  "ok",
  "form",
  "expression",
  "error",
  "errorCode",
];

function assertSchema(parsed) {
  assert.deepEqual(Object.keys(parsed), RESPONSE_KEYS);
  assert.equal(Object.isFrozen(parsed), true);
}

function assertParsed(question, expected) {
  const parsed = parsePolynomialVariationInput(question);
  assertSchema(parsed);
  assert.equal(parsed.recognized, true, question);
  assert.equal(parsed.ok, true, parsed.error || question);
  assert.equal(parsed.form, expected.form);
  assert.equal(parsed.expression, expected.expression);
  assert.equal(parsed.error, "");
  assert.equal(parsed.errorCode, "");
}

function assertRejected(question, errorCode, { recognized = true } = {}) {
  const parsed = parsePolynomialVariationInput(question);
  assertSchema(parsed);
  assert.equal(parsed.recognized, recognized, question);
  assert.equal(parsed.ok, false, question);
  assert.equal(parsed.form, "");
  assert.equal(parsed.expression, "");
  assert.equal(parsed.errorCode, errorCode, `${question}: ${parsed.error}`);
  assert.ok(parsed.error);
}

test("増減・極値・combinedのcanonical全文だけを抽出する", () => {
  assertParsed("monotonicity(x^3-3x)", {
    form: "monotonicity",
    expression: "x^3-3x",
  });
  assertParsed("extrema((x+1)^3)", {
    form: "extrema",
    expression: "(x+1)^3",
  });
  assertParsed("monotonicity_extrema(x^3/3-x)", {
    form: "combined",
    expression: "x^3/3-x",
  });
  assertParsed("  extrema ( (x-1)(x+1) )  ", {
    form: "extrema",
    expression: "(x-1)(x+1)",
  });
});

test("指定された完全日本語4形式と安全な終止表現を受理する", () => {
  assertParsed("関数 y=x^3-3x の増減を調べよ", {
    form: "monotonicity",
    expression: "x^3-3x",
  });
  assertParsed("次の関数 f(x)=x^3-3x の極値を求めよ。", {
    form: "extrema",
    expression: "x^3-3x",
  });
  assertParsed("関数 y=x^3-3x の増減を調べ、極値を求めよ", {
    form: "combined",
    expression: "x^3-3x",
  });
  assertParsed("関数 f(x)=x^3-3x の増減と極値を求めよ", {
    form: "combined",
    expression: "x^3-3x",
  });
  assertParsed("次の関数 y=(x+1)^3 の増減を調べなさい。", {
    form: "monotonicity",
    expression: "(x+1)^3",
  });
  assertParsed("関数 f(x)=x^2/2 の極値を求めてください。", {
    form: "extrema",
    expression: "x^2/2",
  });
  assertParsed("関数 y=(x+1)\n(x-1) の増減と極値を求めよ", {
    form: "combined",
    expression: "(x+1) (x-1)",
  });
});

test("通常微分・接線・面積・体積・極限・方程式・数列増減を横取りしない", () => {
  for (const question of [
    "f(x)=x^3-3xを微分せよ",
    "d/dx (x^3-3x)",
    "tangent_x_[1](x^2)",
    "area_[0,1](x^2;0)",
    "volume_x_axis_[0,1](x)",
    "lim_(x->0) x/x",
    "x^2=4",
    "x^3-3x=0を解け",
    "数列 a_n の増減を調べよ",
    "漸化式で定まる数列の増減を調べよ",
    "グラフを用いて数列 a_n の増減を調べよ",
    "グラフから数列 a_n の増減を調べよ",
    "右図の数列 a_n の増減を調べよ",
    "数列 a_n のグラフの増減を調べよ",
    "関数 y=x^2",
    "sin(x)を微分せよ",
  ]) {
    assertRejected(question, "", { recognized: false });
  }
});

test("canonicalや完全日本語形式の欠落・壊れ・非aliasを推測しない", () => {
  assertRejected("monotonicity()", "MISSING_VARIATION_EXPRESSION");
  assertRejected("extrema()", "MISSING_VARIATION_EXPRESSION");
  for (const question of [
    "monotonicity",
    "extrema(",
    "monotonicity_extrema(x^3",
    "monotonicity[x^2]",
    "関数 y=x^2 の増減を",
    "関数 y=x^2 の極値を計算せよ",
    "関数 y=x^2 の増減を考えよ",
    "増減を調べよ",
    "極値を求めよ",
  ]) {
    assertRejected(question, "MALFORMED_VARIATION_INPUT");
  }
  for (const question of [
    "variation(x^2)",
    "combined(x^2)",
    "foo_monotonicity(x^2)",
    "please monotonicity(x^2)",
  ]) {
    assertRejected(question, "", { recognized: false });
  }
});

test("区間・最大最小・凹凸・変曲点・概形・図依存をunsupportedにする", () => {
  for (const question of [
    "monotonicity_[0,1](x^2)",
    "extrema_[0,1](x^2)",
    "区間 0<=x<=1 で関数 y=x^2 の増減を調べよ",
    "関数 y=x^2 の区間[0,1]における極値を求めよ",
    "関数 y=x^2 の x=0からx=1までの増減を調べよ",
    "関数 y=x^2 の 0<=x<=1 において増減を調べよ",
    "関数 y=x^2 の x∈[0,1] における極値を求めよ",
    "関数 y=x^2（0≦x≦1）の増減を調べよ",
    "関数 y=x^2 (0<x<1) の極値を求めよ",
    "関数 y=x^2, 0<=x<=1 の増減を調べよ",
    "関数 y=x^2（定義域 0≦x≦1）の増減を調べよ",
    "関数 y=x^2 の x=0から1までの増減を調べよ",
    "関数 y=x^2 の 0から1までの増減を調べよ",
    "関数 y=x^2 の xが0から1までの極値を求めよ",
    "関数 y=x^2 (x≠0) の増減を調べよ",
    "関数 y=x^2, x≠0 の増減を調べよ",
    "関数 y=x^2 x>=0 の増減を調べよ",
    "関数 y=x^2 の xは0以上で増減を調べよ",
    "関数 y=x^2 の xが0以上で極値を求めよ",
    "関数 y=x^2 の x>0のときの増減を調べよ",
    "関数 y=x^2 の xは0より大きいときの増減を調べよ",
    "関数 y=x^2 の xは0より小さいときの極値を求めよ",
    "関数 y=x^2 の xは0を超えるときの増減を調べよ",
    "関数 y=x^2 の x≠0のときの増減を調べよ",
    "関数 y=x^2 の x=0のときの極値を求めよ",
    "関数 y=x^2 の x>\n0のときの増減を調べよ",
    "関数 y=x^2 の x>0の場合の増減を調べよ",
    "関数 y=x^2 の x≠0での増減を調べよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_VARIATION_DOMAIN");
  }
  for (const question of [
    "関数 y=x^2 の最大値を求めよ",
    "関数 y=x^2 の最小値を求めよ",
    "関数 y=x^2 の最大・最小を求めよ",
    "関数 y=x^2 の最大と最小を求めよ",
    "関数 y=x^2 の最小・最大を求めよ",
    "関数 y=x^2 の最大、最小を求めよ",
    "関数 y=x^2 の最小、最大を求めよ",
    "関数 y=x^2 の最大および最小を求めよ",
    "関数 y=x^2 の最大ならびに最小を求めよ",
    "関数 y=x^3 の極大値と極小値を求めよ",
    "関数 y=x^3 の凹凸を調べよ",
    "関数 y=x^3 が上に凸か下に凸か調べよ",
    "関数 y=x^3 の変曲点を求めよ",
    "関数 y=x^3 のグラフの概形を求めよ",
    "関数 y=x^3 の増減表を作れ",
    "関数 y=x^3 の増減表を書け",
    "関数 y=x^3 の増減表を求めよ",
    "関数 y=x^3 の増減を証明せよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_VARIATION_REQUEST");
  }
  for (const question of [
    "右図の関数 y=x^3 の増減を調べよ",
    "グラフから関数 y=x^3 の極値を求めよ",
    "増減表から関数 y=x^3 の極値を求めよ",
    "次の図を見て関数 y=x^3 の極値を求めよ",
    "関数 y=x^3 のグラフを用いて増減を調べよ",
    "関数 y=x^3 のグラフを描いて極値を求めよ",
    "関数 y=x^3 のグラフの増減を調べよ",
    "関数 y=x^3 を図示して極値を求めよ",
    "関数 y=x^3 のグラフを書いて極値を求めよ",
    "関数 y=x^3 のグラフを作成して極値を求めよ",
    "関数 y=x^3 をグラフに表して増減を調べよ",
    "関数 y=x^3 のグラフを参照して極値を求めよ",
    "関数 y=x^3 のグラフを参考にして増減を調べよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_DIAGRAM_VARIATION");
  }
});

test("別変数・未文書化形式と非多項式をunsupportedに分ける", () => {
  for (const question of [
    "monotonicity_y(y^3)",
    "extrema_t(t^2)",
    "関数 z=x^2 の極値を求めよ",
    "関数 f(t)=t^3-t の増減を調べよ",
    "monotonicity(y^2)",
    "extrema(a*x)",
  ]) {
    assertRejected(question, "UNSUPPORTED_VARIATION_VARIABLE");
  }
  for (const question of [
    "monotonicity_x(x^3)",
    "関数 g(x)=x^3 の極値を求めよ",
    "多項式 x^3-3x の極値を求めよ",
    "y=x^3-3x の増減を調べよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_VARIATION_FORM");
  }
  for (const question of [
    "monotonicity(sin(x))",
    "extrema(exp(x))",
    "monotonicity(sqrt(x))",
    "extrema(1/(x-1))",
    "monotonicity(x^-1)",
    "extrema(pi*x)",
    "monotonicity(x^5)",
    `monotonicity((${"9".repeat(257)}*x)^2)`,
    `monotonicity(${"9".repeat(513)}*x)`,
  ]) {
    assertRejected(question, "UNSUPPORTED_VARIATION_EXPRESSION");
  }
});

test("関係式・曖昧連結・科学記数法をinvalidにする", () => {
  for (const [question, errorCode] of [
    ["monotonicity(x=1)", "VARIATION_RELATION_ATTACHED"],
    ["extrema(x<1)", "VARIATION_RELATION_ATTACHED"],
    ["monotonicity(x2+1)", "AMBIGUOUS_VARIATION_X_SUFFIX"],
    ["extrema(2 3x)", "AMBIGUOUS_VARIATION_NUMBER_SPACING"],
    ["monotonicity(2e3*x)", "AMBIGUOUS_VARIATION_SCIENTIFIC_NOTATION"],
    ["extrema(pi2*x)", "AMBIGUOUS_VARIATION_PI_MULTIPLICATION"],
    ["monotonicity(e2*x)", "AMBIGUOUS_VARIATION_E_MULTIPLICATION"],
    ["extrema(1/2x)", "AMBIGUOUS_VARIATION_DIVISION_MULTIPLICATION"],
    ["monotonicity(x+*1)", "EXPECTED_PRIMARY"],
    ["extrema(1/0)", "DIVISION_BY_ZERO"],
  ]) {
    assertRejected(question, errorCode);
  }
});

test("答え・完成した増減区間・極値を付加した入力をinvalidにする", () => {
  for (const question of [
    "extrema(x^2)=0",
    "extrema(x^2): x=0",
    "monotonicity(x^3) 答え 増加区間はすべての実数",
    "monotonicity_extrema(x^3) 極値なし",
    "関数 y=x^2 の極値を求めよ。答え x=0",
    "関数 y=x^3 の増減を調べよ。増加区間はすべての実数",
    "関数 y=x^2 の極値は0",
  ]) {
    assertRejected(question, "VARIATION_ANSWER_ATTACHED");
  }
});

test("質問形を答え付加と誤診断せず、実値の付加だけを区別する", () => {
  for (const question of [
    "関数 y=x^2 の極値は何か",
    "関数 y=x^2 の極値はどれか",
    "関数 y=x^2 の増減はどうなるか",
    "関数 y=x^2 の極値は2つか",
    "関数 y=x^2 の極値は x=0 か",
    "関数 y=x^2 の極値はなしですか",
  ]) {
    assertRejected(question, "MALFORMED_VARIATION_INPUT");
  }
  assertRejected("関数 y=x^2 の極値は0", "VARIATION_ANSWER_ATTACHED");
  assertRejected("関数 y=x^2 の極値は x=0", "VARIATION_ANSWER_ATTACHED");
  assertRejected("extrema(x^2) x=0", "VARIATION_ANSWER_ATTACHED");
  assertRejected("関数 y=x^2 の極値を求めよ。x=0", "VARIATION_ANSWER_ATTACHED");
});

test("全角と安全な上付き指数を受理し、危険なUnicode互換を拒否する", () => {
  assertParsed("ｍｏｎｏｔｏｎｉｃｉｔｙ（ｘ³－３ｘ）", {
    form: "monotonicity",
    expression: "x^3-3x",
  });
  assertParsed("ｅｘｔｒｅｍａ（ｘ²）", {
    form: "extrema",
    expression: "x^2",
  });
  assertParsed("関数 ｙ＝ｘ⁴－２ｘ² の極値を求めよ", {
    form: "extrema",
    expression: "x^4-2x^2",
  });
  assertRejected("monotonicity(x₂)", "AMBIGUOUS_VARIATION_SCRIPT_CHARACTER");
  assertRejected("extrema(xⁱ)", "AMBIGUOUS_VARIATION_SCRIPT_CHARACTER");
  assertRejected("monotonicity(x⁻)", "AMBIGUOUS_VARIATION_SUPERSCRIPT_SEQUENCE");
  assertRejected("extrema(x² ³)", "AMBIGUOUS_VARIATION_SUPERSCRIPT_BOUNDARY");
  assertRejected("monotonicity(x²3)", "AMBIGUOUS_VARIATION_SUPERSCRIPT_BOUNDARY");
  assertRejected("extrema(\\left(x^2\\right))", "AMBIGUOUS_VARIATION_LATEX_DELIMITER");
  assertRejected("monotonicity(𝑥^2)", "AMBIGUOUS_VARIATION_COMPATIBILITY_CHARACTER");
  assertRejected("extrema(①*x)", "AMBIGUOUS_VARIATION_COMPATIBILITY_CHARACTER");
});

test("入力長上限を正規化前に適用し、hostile文字列化を1回だけsnapshotする", () => {
  assertRejected(
    "monotonicity(" + "x+".repeat(2_500) + "x)",
    "VARIATION_INPUT_TOO_LONG",
  );
  assertRejected(
    "関数 y=" + "x+".repeat(2_500) + "x の極値を求めよ",
    "VARIATION_INPUT_TOO_LONG",
  );
  assertRejected("a".repeat(5_001), "VARIATION_INPUT_TOO_LONG", { recognized: false });

  let conversions = 0;
  const hostile = {
    [Symbol.toPrimitive]() {
      conversions += 1;
      return conversions === 1
        ? "monotonicity(x^3)"
        : "f(x)=x^3を微分せよ";
    },
  };
  const parsed = parsePolynomialVariationInput(hostile);
  assert.equal(conversions, 1);
  assertSchema(parsed);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.form, "monotonicity");
  assert.equal(parsed.expression, "x^3");
});
