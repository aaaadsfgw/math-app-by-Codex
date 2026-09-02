import assert from "node:assert/strict";
import test from "node:test";

import { parsePolynomialConcavityInput } from "../js/solver/polynomial-concavity-input.js";

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
  const parsed = parsePolynomialConcavityInput(question);
  assertSchema(parsed);
  assert.equal(parsed.recognized, true, question);
  assert.equal(parsed.ok, true, parsed.error || question);
  assert.equal(parsed.form, expected.form);
  assert.equal(parsed.expression, expected.expression);
  assert.equal(parsed.error, "");
  assert.equal(parsed.errorCode, "");
}

function assertRejected(question, errorCode, { recognized = true } = {}) {
  const parsed = parsePolynomialConcavityInput(question);
  assertSchema(parsed);
  assert.equal(parsed.recognized, recognized, question);
  assert.equal(parsed.ok, false, question);
  assert.equal(parsed.form, "");
  assert.equal(parsed.expression, "");
  assert.equal(parsed.errorCode, errorCode, `${question}: ${parsed.error}`);
  assert.ok(parsed.error);
}

test("凹凸・変曲点・combinedのcanonical全文だけを抽出する", () => {
  assertParsed("concavity(x^4-2x^2)", {
    form: "concavity",
    expression: "x^4-2x^2",
  });
  assertParsed("inflection((x+1)^3)", {
    form: "inflection",
    expression: "(x+1)^3",
  });
  assertParsed("concavity_inflection(x^3/3-x)", {
    form: "combined",
    expression: "x^3/3-x",
  });
  assertParsed("  inflection ( (x-1)(x+1) )  ", {
    form: "inflection",
    expression: "(x-1)(x+1)",
  });
});

test("指定された完全日本語4形式と安全な終止表現を受理する", () => {
  assertParsed("関数 y=x^3-3x の凹凸を調べよ", {
    form: "concavity",
    expression: "x^3-3x",
  });
  assertParsed("次の関数 f(x)=x^3-3x の変曲点を求めよ。", {
    form: "inflection",
    expression: "x^3-3x",
  });
  assertParsed("関数 y=x^3-3x の凹凸を調べ、変曲点を求めなさい。", {
    form: "combined",
    expression: "x^3-3x",
  });
  assertParsed("関数 f(x)=x^3-3x の凹凸と変曲点を求めてください！", {
    form: "combined",
    expression: "x^3-3x",
  });
  assertParsed("次の 関数 y=(x+1)^4 の凹凸を調べなさい？", {
    form: "concavity",
    expression: "(x+1)^4",
  });
  assertParsed("関数 f(x)=x^3 の変曲点を求めてください。", {
    form: "inflection",
    expression: "x^3",
  });
  assertParsed("関数 y=(x+1)\n(x-1) の凹凸と変曲点を求めよ", {
    form: "combined",
    expression: "(x+1) (x-1)",
  });
});

test("通常微分・接線・法線・増減極値・方程式・積分・極限・数列を横取りしない", () => {
  for (const question of [
    "f(x)=x^3-3xを微分せよ",
    "d/dx (x^3-3x)",
    "tangent_x_[1](x^2)",
    "normal_x_[1](x^2)",
    "monotonicity(x^3-3x)",
    "extrema(x^3-3x)",
    "関数 y=x^3-3x の増減と極値を求めよ",
    "area_[0,1](x^2;0)",
    "volume_x_axis_[0,1](x)",
    "lim_(x->0) x/x",
    "x^2=4",
    "x^3-3x=0を解け",
    "数列 a_n の変曲点を求めよ",
    "数列 a_n の最大値を求めよ",
    "漸化式で定まる数列の凹凸を調べよ",
    "関数 y=x^2",
  ]) {
    assertRejected(question, "", { recognized: false });
  }
});

test("canonicalや完全日本語形式の欠落・壊れ・非aliasを推測しない", () => {
  assertRejected("concavity()", "MISSING_CONCAVITY_EXPRESSION");
  assertRejected("inflection()", "MISSING_CONCAVITY_EXPRESSION");
  for (const question of [
    "concavity",
    "inflection(",
    "concavity_inflection",
    "concavity_",
    "concavity_inflection(x^3",
    "concavity[x^2]",
    "関数 y=x^2 の凹凸を",
    "関数 y=x^2 の変曲点を計算せよ",
    "関数 y=x^2 の凹凸を考えよ",
    "凹凸を調べよ",
    "変曲点を求めよ",
  ]) {
    assertRejected(question, "MALFORMED_CONCAVITY_INPUT");
  }
  for (const question of [
    "convexity(x^2)",
    "inflection_points(x^3)",
    "foo_concavity(x^2)",
    "please concavity(x^2)",
  ]) {
    assertRejected(question, "", { recognized: false });
  }
});

test("区間・最大最小・概形・増減表・図表依存をunsupportedにする", () => {
  for (const question of [
    "concavity_[0,1](x^2)",
    "inflection_[0,1](x^3)",
    "区間 0<=x<=1 で関数 y=x^3 の凹凸を調べよ",
    "関数 y=x^3 の x∈[0,1] における変曲点を求めよ",
    "関数 y=x^3 の x=0からx=1までの凹凸を調べよ",
    "関数 y=x^3 の x>0のときの変曲点を求めよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_CONCAVITY_DOMAIN");
  }
  for (const question of [
    "関数 y=x^2 の最大値を求めよ",
    "関数 y=x^2 の最小値を求めよ",
    "関数 y=x^2 の最大・最小を求めよ",
    "関数 y=x^3 の概形を描け",
    "関数 y=x^3 の増減表を作れ",
    "関数 y=x^3 の凹凸と極値を求めよ",
    "関数 y=x^3 が上に凸か下に凸か調べよ",
    "関数 y=x^3 の凹凸を証明せよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_CONCAVITY_REQUEST");
  }
  for (const question of [
    "右図の関数 y=x^3 の凹凸を調べよ",
    "第A図に示す関数 y=x^3 の変曲点を求めよ",
    "Figure 1 のグラフから変曲点を求めよ",
    "添付画像から関数 y=x^3 の凹凸を調べよ",
    "写真のグラフから変曲点を求めよ",
    "増減表から関数 y=x^3 の変曲点を求めよ",
    "表を見て関数 y=x^3 の凹凸を調べよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_DIAGRAM_CONCAVITY");
  }
});

test("別変数・未文書化形式・非多項式・5次以上をunsupportedに分ける", () => {
  for (const question of [
    "concavity_y(y^3)",
    "inflection_t(t^2)",
    "関数 z=x^2 の凹凸を調べよ",
    "関数 f(t)=t^3-t の変曲点を求めよ",
    "concavity(y^2)",
    "inflection(a*x)",
  ]) {
    assertRejected(question, "UNSUPPORTED_CONCAVITY_VARIABLE");
  }
  for (const question of [
    "concavity_x(x^3)",
    "関数 g(x)=x^3 の変曲点を求めよ",
    "多項式 x^3-3x の凹凸を調べよ",
    "y=x^3-3x の変曲点を求めよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_CONCAVITY_FORM");
  }
  for (const question of [
    "concavity(sin(x))",
    "inflection(exp(x))",
    "concavity(sqrt(x))",
    "inflection(1/(x-1))",
    "concavity(x^-1)",
    "inflection(pi*x)",
    "concavity(x^5)",
    "inflection(0*x^5)",
    "concavity(x^5-x^5)",
  ]) {
    assertRejected(question, "UNSUPPORTED_CONCAVITY_EXPRESSION");
  }
});

test("関係式・曖昧連結・科学記数法をinvalidにする", () => {
  for (const [question, errorCode] of [
    ["concavity(x=1)", "CONCAVITY_RELATION_ATTACHED"],
    ["inflection(x<1)", "CONCAVITY_RELATION_ATTACHED"],
    ["concavity(x2+1)", "AMBIGUOUS_CONCAVITY_X_SUFFIX"],
    ["inflection(2 3x)", "AMBIGUOUS_CONCAVITY_NUMBER_SPACING"],
    ["concavity(2e3*x)", "AMBIGUOUS_CONCAVITY_SCIENTIFIC_NOTATION"],
    ["inflection(pi2*x)", "AMBIGUOUS_CONCAVITY_PI_MULTIPLICATION"],
    ["concavity(e2*x)", "AMBIGUOUS_CONCAVITY_E_MULTIPLICATION"],
    ["inflection(1/2x)", "AMBIGUOUS_CONCAVITY_DIVISION_MULTIPLICATION"],
    ["concavity(x+*1)", "EXPECTED_PRIMARY"],
    ["inflection(1/0)", "DIVISION_BY_ZERO"],
  ]) {
    assertRejected(question, errorCode);
  }
});

test("答え付加をinvalidにし、質問形と区別する", () => {
  for (const question of [
    "inflection(x^3)=(0,0)",
    "inflection(x^3): x=0",
    "concavity(x^3) 答え 上に凸",
    "concavity_inflection(x^3) 変曲点は(0,0)",
    "関数 y=x^3 の変曲点を求めよ。答え (0,0)",
    "関数 y=x^3 の凹凸を調べよ。上に凸",
    "関数 y=x^3 の変曲点は(0,0)",
  ]) {
    assertRejected(question, "CONCAVITY_ANSWER_ATTACHED");
  }
  for (const question of [
    "関数 y=x^3 の変曲点は何か",
    "関数 y=x^3 の変曲点はどれか",
    "関数 y=x^3 の凹凸はどうなるか",
    "関数 y=x^3 の変曲点は1つか",
  ]) {
    assertRejected(question, "MALFORMED_CONCAVITY_INPUT");
  }
});

test("全角・安全な上付き指数と全改行を受理し、危険なUnicodeを拒否する", () => {
  assertParsed("ｃｏｎｃａｖｉｔｙ（ｘ⁴－２ｘ²）", {
    form: "concavity",
    expression: "x^4-2x^2",
  });
  assertParsed("ｉｎｆｌｅｃｔｉｏｎ（ｘ³）", {
    form: "inflection",
    expression: "x^3",
  });
  for (const separator of ["\r", "\n", "\r\n", "\v", "\f", "\u0085", "\u2028", "\u2029"]) {
    assertParsed(
      `関数 y=x^3+${separator}x の変曲点を求めよ`,
      { form: "inflection", expression: "x^3+ x" },
    );
    assertRejected(
      `関数 y=1${separator}2*x の凹凸を調べよ`,
      "AMBIGUOUS_CONCAVITY_NUMBER_SPACING",
    );
  }
  assertRejected("concavity(x₂)", "AMBIGUOUS_CONCAVITY_SCRIPT_CHARACTER");
  assertRejected("inflection(xⁱ)", "AMBIGUOUS_CONCAVITY_SCRIPT_CHARACTER");
  assertRejected("concavity(x⁻)", "AMBIGUOUS_CONCAVITY_SUPERSCRIPT_SEQUENCE");
  assertRejected("inflection(x² ³)", "AMBIGUOUS_CONCAVITY_SUPERSCRIPT_BOUNDARY");
  assertRejected("concavity(x²3)", "AMBIGUOUS_CONCAVITY_SUPERSCRIPT_BOUNDARY");
  assertRejected("inflection(\\left(x^3\\right))", "AMBIGUOUS_CONCAVITY_LATEX_DELIMITER");
  assertRejected("concavity(𝑥^2)", "AMBIGUOUS_CONCAVITY_COMPATIBILITY_CHARACTER");
  assertRejected("inflection(①*x)", "AMBIGUOUS_CONCAVITY_COMPATIBILITY_CHARACTER");
});

test("入力長上限を正規化前に適用し、hostile文字列化を1回だけsnapshotする", () => {
  assertRejected(
    "concavity(" + "x+".repeat(2_500) + "x)",
    "CONCAVITY_INPUT_TOO_LONG",
  );
  assertRejected(
    "関数 y=" + "x+".repeat(2_500) + "x の変曲点を求めよ",
    "CONCAVITY_INPUT_TOO_LONG",
  );
  assertRejected("a".repeat(5_001), "CONCAVITY_INPUT_TOO_LONG", { recognized: false });

  let conversions = 0;
  const hostile = {
    [Symbol.toPrimitive]() {
      conversions += 1;
      return conversions === 1
        ? "concavity(x^4)"
        : "f(x)=x^4を微分せよ";
    },
  };
  const parsed = parsePolynomialConcavityInput(hostile);
  assert.equal(conversions, 1);
  assertSchema(parsed);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.form, "concavity");
  assert.equal(parsed.expression, "x^4");
});
