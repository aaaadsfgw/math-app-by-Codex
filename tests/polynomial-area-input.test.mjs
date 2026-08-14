import assert from "node:assert/strict";
import test from "node:test";

import { parsePolynomialAreaInput } from "../js/solver/polynomial-area-input.js";

function assertParsed(question, expected) {
  const result = parsePolynomialAreaInput(question);
  assert.equal(Object.isFrozen(result), true, question);
  assert.equal(result.recognized, true, question);
  assert.equal(result.ok, true, `${question}: ${result.error}`);
  assert.equal(result.form, expected.form, question);
  assert.equal(result.firstExpression, expected.firstExpression, question);
  assert.equal(result.secondExpression, expected.secondExpression, question);
  assert.equal(result.lowerSource, expected.lowerSource ?? "", question);
  assert.equal(result.upperSource, expected.upperSource ?? "", question);
  assert.equal(result.error, "", question);
  assert.equal(result.errorCode, "", question);
}

function assertRejected(question, errorCode, { recognized = true } = {}) {
  const result = parsePolynomialAreaInput(question);
  assert.equal(Object.isFrozen(result), true, question);
  assert.equal(result.recognized, recognized, question);
  assert.equal(result.ok, false, question);
  assert.equal(result.firstExpression, "", question);
  assert.equal(result.secondExpression, "", question);
  assert.equal(result.lowerSource, "", question);
  assert.equal(result.upperSource, "", question);
  assert.equal(result.errorCode, errorCode, question);
  assert.ok(result.error, question);
}

test("area記法の明示区間と2交点形式を括弧深さ込みで全文抽出する", () => {
  assertParsed("area_[0,2](x^2;2x)", {
    form: "explicit-interval",
    firstExpression: "x^2",
    secondExpression: "2x",
    lowerSource: "0",
    upperSource: "2",
  });
  assertParsed("area_[-1/2, 1.5]((x+1)^2; x/2)", {
    form: "explicit-interval",
    firstExpression: "(x+1)^2",
    secondExpression: "x/2",
    lowerSource: "-1/2",
    upperSource: "3/2",
  });
  assertParsed("area_intersections(x^2;2x)", {
    form: "two-intersections",
    firstExpression: "x^2",
    secondExpression: "2x",
  });
  assertParsed("ａｒｅａ＿［－１，１］（ｘ＾２－１；０）", {
    form: "explicit-interval",
    firstExpression: "x^2-1",
    secondExpression: "0",
    lowerSource: "-1",
    upperSource: "1",
  });
});

test("日本語の明示区間・x軸alias・異なる2交点形式を固定grammarで受理する", () => {
  assertParsed(
    "x=0からx=2までの区間で、y=x^2とy=2xの間の面積を求めよ",
    {
      form: "explicit-interval",
      firstExpression: "x^2",
      secondExpression: "2x",
      lowerSource: "0",
      upperSource: "2",
    },
  );
  assertParsed(
    "x=-1からx=1まで、曲線 y=x^2-1 と x軸 の間の面積を求めなさい！",
    {
      form: "explicit-interval",
      firstExpression: "x^2-1",
      secondExpression: "0",
      lowerSource: "-1",
      upperSource: "1",
    },
  );
  assertParsed(
    "x=0からx=2までの区間で、x軸と直線 y=x の間の面積を計算せよ",
    {
      form: "explicit-interval",
      firstExpression: "0",
      secondExpression: "x",
      lowerSource: "0",
      upperSource: "2",
    },
  );
  assertParsed(
    "曲線 y=x^2 と直線 y=2x の異なる2交点の間にある面積を求めよ",
    {
      form: "two-intersections",
      firstExpression: "x^2",
      secondExpression: "2x",
    },
  );
  assertParsed(
    "曲線 y=x^2-1 と x軸 で囲まれた部分の面積を求めてください",
    {
      form: "two-intersections",
      firstExpression: "x^2-1",
      secondExpression: "0",
    },
  );
  assertParsed(
    "x=0からx=2までの区間で、y=x^2とy=2xの間の面積を求めよ。",
    {
      form: "explicit-interval",
      firstExpression: "x^2",
      secondExpression: "2x",
      lowerSource: "0",
      upperSource: "2",
    },
  );
  assertParsed(
    "y=x^2とy=2xで囲まれる部分の面積を求めよ？",
    {
      form: "two-intersections",
      firstExpression: "x^2",
      secondExpression: "2x",
    },
  );
  assertParsed(
    "放物線 y=x^2 と直線 y=2x の異なる2交点の間にある面積を求めよ.",
    {
      form: "two-intersections",
      firstExpression: "x^2",
      secondExpression: "2x",
    },
  );
});

test("通常の方程式・定積分・三角形面積を多項式面積として認識しない", () => {
  for (const question of [
    "x^2=4",
    "∫_0^1 x^2 dx",
    "三角形ABCの面積を求めよ",
    "図の斜線部分の面積を求めよ",
    "長方形の面積を求めよ",
  ]) {
    assertRejected(question, "", { recognized: false });
  }
});

test("区間・2曲線・区切り・modeが欠けたarea shaped入力をinvalidにする", () => {
  for (const question of [
    "area_[0](x;0)",
    "area_[0,1](x)",
    "area_[0,1](x;0;y)",
    "area_[0,1](x;0",
    "area_intersections(x)",
    "area_intersections(x;0) trailing",
    "y=x^2とy=2xの面積を求めよ",
    "x=0からx=2までの区間で、y=x^2の面積を求めよ",
  ]) {
    assertRejected(question, "MALFORMED_AREA_INPUT");
  }
});

test("逆順・空区間と非有理・曖昧な境界を推測しない", () => {
  for (const question of [
    "area_[1,1](x;0)",
    "area_[2,-1](x;0)",
  ]) {
    assertRejected(question, "INVALID_AREA_INTERVAL_ORDER");
  }
  for (const question of [
    "area_[1e2,3](x;0)",
    "area_[1e-2,3](x;0)",
  ]) {
    assertRejected(question, "AMBIGUOUS_AREA_BOUND_SCIENTIFIC_NOTATION");
  }
  for (const question of [
    "area_[pi,3](x;0)",
    "area_[a,3](x;0)",
    "area_[∞,3](x;0)",
  ]) {
    assertRejected(question, "UNSUPPORTED_AREA_BOUND");
  }
  assertRejected("area_[1 2,3](x;0)", "AMBIGUOUS_AREA_BOUND_NUMBER_SPACING");
  assertRejected("area_[1/0,3](x;0)", "INVALID_AREA_BOUND");
});

test("式の関係付加・曖昧連結・科学記数法・factorialをinvalidにする", () => {
  for (const [question, errorCode] of [
    ["area_[0,1](x=1;0)", "AREA_RELATION_ATTACHED"],
    ["area_[0,1](x<1;0)", "AREA_RELATION_ATTACHED"],
    ["area_[0,1](x2;0)", "AMBIGUOUS_AREA_X_SUFFIX"],
    ["area_[0,1](1 2;0)", "AMBIGUOUS_AREA_NUMBER_SPACING"],
    ["area_[0,1](1e2;0)", "AMBIGUOUS_AREA_SCIENTIFIC_NOTATION"],
    ["area_[0,1](pi2;0)", "AMBIGUOUS_AREA_PI_MULTIPLICATION"],
    ["area_[0,1](e2;0)", "AMBIGUOUS_AREA_E_MULTIPLICATION"],
    ["area_[0,1](x/2x;0)", "AMBIGUOUS_AREA_DIVISION_MULTIPLICATION"],
    ["area_[0,1](1/(x-1)(x+1);0)", "AMBIGUOUS_AREA_DIVISION_MULTIPLICATION"],
    ["area_[0,1](5!;0)", "UNEXPECTED_CHARACTER"],
    ["area_[0,1](x;0)!", "MALFORMED_AREA_INPUT"],
  ]) {
    assertRejected(question, errorCode);
  }
});

test("答え付き入力と図依存を認識したままinvalid/unsupportedへ分ける", () => {
  for (const question of [
    "area_[0,2](x^2;2x)=4/3",
    "area_[0,2](x^2;2x):4/3",
    "x=0からx=2まで、y=x^2とy=2xの間の面積は4/3",
  ]) {
    assertRejected(question, "AREA_ANSWER_ATTACHED");
  }
  for (const question of [
    "右図のy=x^2とy=2xで囲まれた部分の面積を求めよ",
    "グラフの斜線についてx=0からx=2まで、y=x^2とx軸の間の面積を求めよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_DIAGRAM_AREA");
  }
});

test("構文正常な関数・別変数はsolverのunsupported判定まで完全な式として保持する", () => {
  assertParsed("area_[0,1](sin(x);0)", {
    form: "explicit-interval",
    firstExpression: "sin(x)",
    secondExpression: "0",
    lowerSource: "0",
    upperSource: "1",
  });
  assertRejected("area_[0,1](y;0)", "UNSUPPORTED_AREA_EXPRESSION");
});

test("入力長上限を完全正規化前に適用し認識状態を保持する", () => {
  assertRejected(
    `area_[0,1](${"x+".repeat(2_500)}x;0)`,
    "AREA_INPUT_TOO_LONG",
  );
  assertRejected(
    `∫_0^1 x dx${" ".repeat(5_001)}area_[0,1](x;0)`,
    "AREA_INPUT_TOO_LONG",
  );
  assertRejected(
    `${" ".repeat(5_001)}area_[0,1](x;0)`,
    "AREA_INPUT_TOO_LONG",
  );
  assertRejected(
    `ａｒｅａ＿［０，１］（${"ｘ＋".repeat(2_500)}ｘ；０）`,
    "AREA_INPUT_TOO_LONG",
  );
  assertRejected("a".repeat(5_001), "AREA_INPUT_TOO_LONG", { recognized: false });
});

test("上付き指数を意味を保って正規化し下付き文字を安全に拒否する", () => {
  assertParsed("area_[0,1](2\u00B2;0)", {
    form: "explicit-interval",
    firstExpression: "2^2",
    secondExpression: "0",
    lowerSource: "0",
    upperSource: "1",
  });
  assertParsed("area_[0,1]((x+1)\u00B2;0)", {
    form: "explicit-interval",
    firstExpression: "(x+1)^2",
    secondExpression: "0",
    lowerSource: "0",
    upperSource: "1",
  });
  assertParsed("area_[0,1](1\u00D710\u00B2;0)", {
    form: "explicit-interval",
    firstExpression: "1*10^2",
    secondExpression: "0",
    lowerSource: "0",
    upperSource: "1",
  });
  assertParsed("area_[0,1](x\u207A\u00B2;0)", {
    form: "explicit-interval",
    firstExpression: "x^+2",
    secondExpression: "0",
    lowerSource: "0",
    upperSource: "1",
  });
  assertRejected(
    "area_[0,1](x\u208B\u2081;0)",
    "AMBIGUOUS_AREA_SCRIPT_CHARACTER",
  );
  assertRejected(
    "area_[0,1](2\u2082;0)",
    "AMBIGUOUS_AREA_SCRIPT_CHARACTER",
  );
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
      `area_[0,1](${character};0)`,
      "AMBIGUOUS_AREA_COMPATIBILITY_CHARACTER",
    );
  }
  for (const question of [
    "area_[0,1](1\\left2;0)",
    "area_[0,1](x\\right;0)",
    "area_[0,1](x;0)\\left\\right",
    "\\leftarea_[0,1](x;0)",
    "area_[0,1](1\uFF3Cleft2;0)",
    "area_[0,1](1\uFF3C\uFF4C\uFF45\uFF46\uFF542;0)",
    "area_[0,1](1\uFE68left2;0)",
    "area_[0,1](x;0)\uFF3Cleft\uFF3Cright",
    "\uFF3Cleftarea_[0,1](x;0)",
  ]) {
    assertRejected(question, "AMBIGUOUS_AREA_LATEX_DELIMITER");
  }
  for (const question of [
    "area_[0,1](2\u00B2\u207B\u00B9;0)",
    "area_[0,1](2\u00B9\u207A\u00B9;0)",
    "area_[0,1](x\u00B2\u207B\u00B9;0)",
    "area_[0,1](x\u00B9\u207A\u00B9;0)",
    "area_[0,1]((x+1)\u00B2\u207B\u00B9;0)",
    "area_[0,1](x\u207A;0)",
  ]) {
    assertRejected(question, "AMBIGUOUS_AREA_SUPERSCRIPT_SEQUENCE");
  }
  for (const question of [
    "area_[0,1](x\u20701;0)",
    "area_[0,1](x\u20702;0)",
    "area_[0,1](2\u20700;0)",
    "area_[0,1](2\u20701;0)",
    "area_[0,1](2\u20702;0)",
    "area_[0,1](2\u2070\uFF12;0)",
    "area_[0,1](x\u00B2.5;0)",
    "area_[0,1](2\u00B9 \u00B2;0)",
    "area_[0,1](2\u00B9\t\u00B2;0)",
    "area_[0,1](2\u00B9\u3000\u00B2;0)",
    "area_[0,1](2\u00B9\u00A0\u00B2;0)",
    "area_[0,1](2\u00B9\u2000\u00B2;0)",
    "area_[0,1](2\u00B9\u2002\u00B2;0)",
    "area_[0,1](2\u00B9\u2003\u00B2;0)",
    "area_[0,1](2\u00B9\u2009\u00B2;0)",
    "area_[0,1](2\u00B9\u202F\u00B2;0)",
    "area_[0,1](2\u00B9\u205F\u00B2;0)",
    "area_[0,1](x\u00B9 \u00B2;0)",
  ]) {
    assertRejected(question, "AMBIGUOUS_AREA_SUPERSCRIPT_BOUNDARY");
  }
});
