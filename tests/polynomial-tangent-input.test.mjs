import assert from "node:assert/strict";
import test from "node:test";

import { parsePolynomialTangentInput } from "../js/solver/polynomial-tangent-input.js";

function assertParsed(question, expected) {
  const parsed = parsePolynomialTangentInput(question);
  assert.equal(parsed.recognized, true, question);
  assert.equal(parsed.ok, true, parsed.error || question);
  assert.equal(parsed.form, expected.form);
  assert.equal(parsed.expression, expected.expression);
  assert.equal(parsed.xSource, expected.xSource);
  assert.equal(parsed.ySource, expected.ySource ?? "");
  assert.equal(parsed.error, "");
  assert.equal(parsed.errorCode, "");
  assert.equal(Object.isFrozen(parsed), true);
}

function assertRejected(question, errorCode, { recognized = true } = {}) {
  const parsed = parsePolynomialTangentInput(question);
  assert.equal(parsed.recognized, recognized, question);
  assert.equal(parsed.ok, false, question);
  assert.equal(parsed.form, "");
  assert.equal(parsed.expression, "");
  assert.equal(parsed.xSource, "");
  assert.equal(parsed.ySource, "");
  assert.equal(parsed.errorCode, errorCode, question + ": " + parsed.error);
  assert.ok(parsed.error);
  assert.equal(Object.isFrozen(parsed), true);
}

test("x座標・alias・点指定のcanonical接線記法を全文抽出する", () => {
  assertParsed("tangent_x_[2](x^2+1)", {
    form: "x-coordinate",
    expression: "x^2+1",
    xSource: "2",
  });
  assertParsed("tangent_[(-1/2)]((x+1)^2)", {
    form: "x-coordinate",
    expression: "(x+1)^2",
    xSource: "-1/2",
  });
  assertParsed("TANGENT_POINT_(1.5,-2/3)(x^3-2x)", {
    form: "point",
    expression: "x^3-2x",
    xSource: "3/2",
    ySource: "-2/3",
  });
  assertParsed("tangent_point_((-1/2),(3/2))(sin(x))", {
    form: "point",
    expression: "sin(x)",
    xSource: "-1/2",
    ySource: "3/2",
  });
});

test("完全な日本語のx座標指定と点指定だけを受理する", () => {
  assertParsed(
    "曲線 y=x^2+1 の x=2 における接線の方程式を求めよ",
    {
      form: "x-coordinate",
      expression: "x^2+1",
      xSource: "2",
    },
  );
  assertParsed(
    "曲線 y=x^3 上の点 (2,8) における接線の方程式を求めなさい。",
    {
      form: "point",
      expression: "x^3",
      xSource: "2",
      ySource: "8",
    },
  );
  assertParsed(
    "次の 曲線 y=(x+1)^2 の x=-0.5 における接線の方程式を求めてください！",
    {
      form: "x-coordinate",
      expression: "(x+1)^2",
      xSource: "-1/2",
    },
  );
  assertParsed(
    "曲線 ｙ＝ｘ² 上の点 （－１，１） における接線の方程式を求めよ？",
    {
      form: "point",
      expression: "x^2",
      xSource: "-1",
      ySource: "1",
    },
  );
});

test("通常の方程式・微分・三角関数名を接線問題として認識しない", () => {
  for (const question of [
    "x^2=4",
    "y=x^2を微分せよ",
    "tan(x)=1",
    "area_[0,1](x;0)",
    "volume_x_axis_[0,1](x)",
    "点(1,2)を通る直線の方程式を求めよ",
  ]) {
    assertRejected(question, "", { recognized: false });
  }
});

test("座標・式・括弧・完全な日本語要素が欠けた接線入力をinvalidにする", () => {
  for (const question of [
    "tangent_x_[1](x",
    "tangent_x_[1](x) trailing",
    "tangent_point_(1)(x^2)",
    "tangent_point_(1,2,3)(x^2)",
    "tangent_point_[1,2](x^2)",
    "tangent_point_(1,2) x^2",
    "tangent_x_(1)(x^2)",
    "曲線 y=x^2 の接線の方程式を求めよ",
    "曲線 y=x^2 の x=1 における接線を求めよ",
    "曲線 y=x^2 上の点 (1,1) の接線の方程式を求めよ",
    "曲線 y=x^2 の x=1 における接線の方程式は何か求めよ",
    "曲線 y=x^2 の x=1 における接線の方程式はどれか",
    "tangent_x_[1](x^2) 接線は何か",
    "tangent_x_[1](x^2) 接線はどれか",
    "tangent_x_[1](x^2) 答えは何か",
  ]) {
    assertRejected(question, "MALFORMED_TANGENT_INPUT");
  }
  assertRejected("tangent_x_[](x)", "MISSING_TANGENT_COORDINATE");
  assertRejected("tangent_x_[1]()", "MISSING_TANGENT_EXPRESSION");
  assertRejected("tangent_point_(,2)(x)", "MISSING_TANGENT_COORDINATE");
  assertRejected("tangent_point_(1,)(x)", "MISSING_TANGENT_COORDINATE");
});

test("接点座標は有限有理数だけを丸めず正規化する", () => {
  assertParsed("tangent_point_(+.25,-1.5)(x^2)", {
    form: "point",
    expression: "x^2",
    xSource: "1/4",
    ySource: "-3/2",
  });
  for (const question of [
    "tangent_x_[1e2](x)",
    "tangent_point_(1,1e-2)(x)",
  ]) {
    assertRejected(
      question,
      "AMBIGUOUS_TANGENT_COORDINATE_SCIENTIFIC_NOTATION",
    );
  }
  assertRejected(
    "tangent_x_[1 2](x)",
    "AMBIGUOUS_TANGENT_COORDINATE_NUMBER_SPACING",
  );
  for (const question of [
    "tangent_x_[pi](x)",
    "tangent_x_[sqrt(2)](x)",
    "tangent_x_[a](x)",
    "tangent_x_[∞](x)",
  ]) {
    assertRejected(question, "UNSUPPORTED_TANGENT_COORDINATE");
  }
  assertRejected(
    "tangent_x_[x=1](x^2)",
    "TANGENT_COORDINATE_RELATION_ATTACHED",
  );
  assertRejected("tangent_x_[1/0](x)", "INVALID_TANGENT_COORDINATE");
  assertRejected(
    "tangent_x_[" + "1".repeat(513) + "](x)",
    "TANGENT_COORDINATE_COMPONENT_TOO_LONG",
  );
});

test("曲線式の関係付加・曖昧連結・別変数を安全に分類する", () => {
  for (const [question, errorCode] of [
    ["tangent_x_[1](x=1)", "TANGENT_RELATION_ATTACHED"],
    ["tangent_x_[1](x<1)", "TANGENT_RELATION_ATTACHED"],
    ["tangent_x_[1](x2)", "AMBIGUOUS_TANGENT_X_SUFFIX"],
    ["tangent_x_[1](1 2)", "AMBIGUOUS_TANGENT_NUMBER_SPACING"],
    ["tangent_x_[1](1e2)", "AMBIGUOUS_TANGENT_SCIENTIFIC_NOTATION"],
    ["tangent_x_[1](pi2)", "AMBIGUOUS_TANGENT_PI_MULTIPLICATION"],
    ["tangent_x_[1](e2)", "AMBIGUOUS_TANGENT_E_MULTIPLICATION"],
    ["tangent_x_[1](x/2x)", "AMBIGUOUS_TANGENT_DIVISION_MULTIPLICATION"],
    [
      "tangent_x_[1](1/(x-1)(x+1))",
      "AMBIGUOUS_TANGENT_DIVISION_MULTIPLICATION",
    ],
    ["tangent_x_[1](5!)", "UNEXPECTED_CHARACTER"],
  ]) {
    assertRejected(question, errorCode);
  }
  assertParsed("tangent_x_[1](sin(x))", {
    form: "x-coordinate",
    expression: "sin(x)",
    xSource: "1",
  });
  assertParsed("tangent_x_[1](1/(x+1))", {
    form: "x-coordinate",
    expression: "1/(x+1)",
    xSource: "1",
  });
  assertRejected(
    "tangent_x_[1](y^2)",
    "UNSUPPORTED_TANGENT_EXPRESSION",
  );
});

test("答え付加・図依存・別の座標変数をinvalidとunsupportedへ分ける", () => {
  for (const question of [
    "tangent_x_[1](x^2)=y=2x-1",
    "tangent_point_(1,1)(x^2): y=2x-1",
    "tangent_x_[1](x^2) 接線は y=2x-1",
    "tangent_x_[1](x^2) 答えは y=2x-1",
    "tangent_x_[1](x^2)=2x-1",
    "tangent_x_[1](x^2): 2x-1",
    "曲線 y=x^2 の x=1 における接線の方程式を求めよ。答え y=2x-1",
    "曲線 y=x^2 の x=1 における接線の方程式はy=2x-1",
    "曲線 y=x^2 の x=1 における接線の方程式=2x-1",
    "曲線 y=x^2 の x=1 における接線の方程式: 2x-1",
  ]) {
    assertRejected(question, "TANGENT_ANSWER_ATTACHED");
  }
  for (const question of [
    "右図の曲線 y=x^2 の x=1 における接線の方程式を求めよ",
    "グラフから接点を読み取り、その接線の方程式を求めよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_DIAGRAM_TANGENT");
  }
  for (const question of [
    "円の外部の点Aから引いた接線の長さを求めよ",
    "2つの円の共通接線を求めよ",
    "点Aを通る円の接線の方程式を求めよ",
    "曲線C上の点Pにおける接線を求めよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_GEOMETRIC_TANGENT");
  }
  for (const question of [
    "放物線 y^2=4x 上の点(1,2)における接線の方程式を求めよ",
    "双曲線 x^2-y^2=1 上の点における接線の方程式を求めよ",
    "関数 f(x)=x^2 の x=1 における接線の方程式を求めよ",
    "接線と弦のなす角を求めよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_TANGENT_FORM");
  }
  for (const question of [
    "tangent_y_[1](x^2)",
    "tangent_t_[1](x^2)",
    "曲線 z=x^2 の x=1 における接線の方程式を求めよ",
    "曲線 y=x^2 の t=1 における接線の方程式を求めよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_TANGENT_VARIABLE");
  }
});

test("入力長上限を完全正規化前に適用し認識状態を保持する", () => {
  assertRejected(
    "tangent_x_[1](" + "x+".repeat(2_500) + "x)",
    "TANGENT_INPUT_TOO_LONG",
  );
  assertRejected(
    " ".repeat(5_001) + "tangent_x_[1](x)",
    "TANGENT_INPUT_TOO_LONG",
  );
  assertRejected(
    "接線" + " ".repeat(5_001),
    "TANGENT_INPUT_TOO_LONG",
  );
  assertRejected(
    "a".repeat(5_001),
    "TANGENT_INPUT_TOO_LONG",
    { recognized: false },
  );
});

test("全角と安全な上付き指数を保ち、危険なUnicode互換を拒否する", () => {
  assertParsed("ｔａｎｇｅｎｔ＿ｘ＿［１］（ｘ²）", {
    form: "x-coordinate",
    expression: "x^2",
    xSource: "1",
  });
  assertParsed("tangent_x_[1]((x+1)²)", {
    form: "x-coordinate",
    expression: "(x+1)^2",
    xSource: "1",
  });
  assertParsed("tangent_x_[1](x⁺²)", {
    form: "x-coordinate",
    expression: "x^+2",
    xSource: "1",
  });
  for (const question of [
    "tangent_x_[1](x₋₁)",
    "tangent_x_[1](2₂)",
  ]) {
    assertRejected(question, "AMBIGUOUS_TANGENT_SCRIPT_CHARACTER");
  }
  for (const character of [
    "\u02E3",
    "\u2169",
    "\u2179",
    "\u24CD",
    "\u24E7",
    "\u{1F147}",
    "\u2461",
  ]) {
    assertRejected(
      "tangent_x_[1](" + character + ")",
      "AMBIGUOUS_TANGENT_COMPATIBILITY_CHARACTER",
    );
  }
  for (const question of [
    "tangent_x_[1](1\\left2)",
    "tangent_x_[1](x\\right)",
    "\\lefttangent_x_[1](x)",
    "tangent_x_[1](1＼left2)",
  ]) {
    assertRejected(question, "AMBIGUOUS_TANGENT_LATEX_DELIMITER");
  }
  for (const question of [
    "tangent_x_[1](2²⁻¹)",
    "tangent_x_[1](2¹⁺¹)",
    "tangent_x_[1](x⁺)",
  ]) {
    assertRejected(question, "AMBIGUOUS_TANGENT_SUPERSCRIPT_SEQUENCE");
  }
  for (const question of [
    "tangent_x_[1](x⁰1)",
    "tangent_x_[1](2⁰２)",
    "tangent_x_[1](x².5)",
    "tangent_x_[1](2¹ ²)",
    "tangent_x_[1](2¹　²)",
  ]) {
    assertRejected(question, "AMBIGUOUS_TANGENT_SUPERSCRIPT_BOUNDARY");
  }
});
