import assert from "node:assert/strict";
import test from "node:test";

import { parsePolynomialNormalInput } from "../js/solver/polynomial-normal-input.js";

function assertSchema(parsed) {
  assert.deepEqual(Object.keys(parsed), [
    "recognized",
    "ok",
    "form",
    "expression",
    "xSource",
    "ySource",
    "error",
    "errorCode",
  ]);
  assert.equal(Object.isFrozen(parsed), true);
}

function assertParsed(question, expected) {
  const parsed = parsePolynomialNormalInput(question);
  assertSchema(parsed);
  assert.equal(parsed.recognized, true, question);
  assert.equal(parsed.ok, true, parsed.error || question);
  assert.equal(parsed.form, expected.form);
  assert.equal(parsed.expression, expected.expression);
  assert.equal(parsed.xSource, expected.xSource);
  assert.equal(parsed.ySource, expected.ySource ?? "");
  assert.equal(parsed.error, "");
  assert.equal(parsed.errorCode, "");
}

function assertRejected(question, errorCode, { recognized = true } = {}) {
  const parsed = parsePolynomialNormalInput(question);
  assertSchema(parsed);
  assert.equal(parsed.recognized, recognized, question);
  assert.equal(parsed.ok, false, question);
  assert.equal(parsed.form, "");
  assert.equal(parsed.expression, "");
  assert.equal(parsed.xSource, "");
  assert.equal(parsed.ySource, "");
  assert.equal(parsed.errorCode, errorCode, question + ": " + parsed.error);
  assert.ok(parsed.error);
}

test("x座標・alias・点指定のcanonical法線記法を全文抽出する", () => {
  assertParsed("normal_x_[2](x^2+1)", {
    form: "x-coordinate",
    expression: "x^2+1",
    xSource: "2",
  });
  assertParsed("normal_[(-1/2)]((x+1)^2)", {
    form: "x-coordinate",
    expression: "(x+1)^2",
    xSource: "-1/2",
  });
  assertParsed("NORMAL_POINT_(1.5,-2/3)(x^3-2x)", {
    form: "point",
    expression: "x^3-2x",
    xSource: "3/2",
    ySource: "-2/3",
  });
  assertParsed("normal_point_((-1/2),(3/2))(sin(x))", {
    form: "point",
    expression: "sin(x)",
    xSource: "-1/2",
    ySource: "3/2",
  });
});

test("完全な日本語のx座標指定と点指定だけを受理する", () => {
  assertParsed(
    "曲線 y=x^2+1 の x=2 における法線の方程式を求めよ",
    {
      form: "x-coordinate",
      expression: "x^2+1",
      xSource: "2",
    },
  );
  assertParsed(
    "曲線 y=x^3 上の点 (2,8) における法線方程式を求めなさい。",
    {
      form: "point",
      expression: "x^3",
      xSource: "2",
      ySource: "8",
    },
  );
  assertParsed(
    "次の 曲線 y=(x+1)^2 の x=-0.5 における法線の方程式を求めてください！",
    {
      form: "x-coordinate",
      expression: "(x+1)^2",
      xSource: "-1/2",
    },
  );
  assertParsed(
    "曲線 ｙ＝ｘ² 上の点 （－１，１） における法線の方程式を求めよ？",
    {
      form: "point",
      expression: "x^2",
      xSource: "-1",
      ySource: "1",
    },
  );
});

test("接線・微分・増減などを法線問題として横取りしない", () => {
  for (const question of [
    "tangent_x_[1](x^2)",
    "曲線 y=x^2 の x=1 における接線の方程式を求めよ",
    "y=x^2を微分せよ",
    "monotonicity(x^3)",
    "関数 y=x^3 の増減を調べよ",
    "x^2=4",
    "tan(x)=1",
  ]) {
    assertRejected(question, "", { recognized: false });
  }
});

test("座標・式・括弧・完全な日本語要素が欠けた入力をinvalidにする", () => {
  for (const question of [
    "normal_x_[1](x",
    "normal_x_[1](x) trailing",
    "normal_point_(1)(x^2)",
    "normal_point_(1,2,3)(x^2)",
    "normal_point_[1,2](x^2)",
    "normal_point_(1,2) x^2",
    "normal_x_(1)(x^2)",
    "法線の方程式を求めよ",
    "曲線 y=x^2 の法線の方程式を求めよ",
    "曲線 y=x^2 の x=1 における法線を求めよ",
    "曲線 y=x^2 上の点 (1,1) の法線の方程式を求めよ",
    "曲線 y=x^2 の x=1 における法線の方程式は何か",
  ]) {
    assertRejected(question, "MALFORMED_NORMAL_INPUT");
  }
  assertRejected("normal_x_[](x)", "MISSING_NORMAL_COORDINATE");
  assertRejected("normal_x_[1]()", "MISSING_NORMAL_EXPRESSION");
  assertRejected("normal_point_(,2)(x)", "MISSING_NORMAL_COORDINATE");
  assertRejected("normal_point_(1,)(x)", "MISSING_NORMAL_COORDINATE");
});

test("接点座標は有限有理数だけを丸めず正規化する", () => {
  assertParsed("normal_point_(+.25,-1.5)(x^2)", {
    form: "point",
    expression: "x^2",
    xSource: "1/4",
    ySource: "-3/2",
  });
  for (const question of [
    "normal_x_[1e2](x)",
    "normal_point_(1,1e-2)(x)",
  ]) {
    assertRejected(
      question,
      "AMBIGUOUS_NORMAL_COORDINATE_SCIENTIFIC_NOTATION",
    );
  }
  assertRejected(
    "normal_x_[1 2](x)",
    "AMBIGUOUS_NORMAL_COORDINATE_NUMBER_SPACING",
  );
  for (const question of [
    "normal_x_[pi](x)",
    "normal_x_[sqrt(2)](x)",
    "normal_x_[a](x)",
    "normal_x_[∞](x)",
  ]) {
    assertRejected(question, "UNSUPPORTED_NORMAL_COORDINATE");
  }
  assertRejected(
    "normal_x_[x=1](x^2)",
    "NORMAL_COORDINATE_RELATION_ATTACHED",
  );
  assertRejected("normal_x_[1/0](x)", "INVALID_NORMAL_COORDINATE");
  assertRejected(
    "normal_x_[" + "1".repeat(513) + "](x)",
    "NORMAL_COORDINATE_COMPONENT_TOO_LONG",
  );
});

test("曲線式の関係付加・曖昧連結・別変数を安全に分類する", () => {
  for (const [question, errorCode] of [
    ["normal_x_[1](x=1)", "NORMAL_RELATION_ATTACHED"],
    ["normal_x_[1](x<1)", "NORMAL_RELATION_ATTACHED"],
    ["normal_x_[1](x2)", "AMBIGUOUS_NORMAL_X_SUFFIX"],
    ["normal_x_[1](1 2)", "AMBIGUOUS_NORMAL_NUMBER_SPACING"],
    ["normal_x_[1](1e2)", "AMBIGUOUS_NORMAL_SCIENTIFIC_NOTATION"],
    ["normal_x_[1](pi2)", "AMBIGUOUS_NORMAL_PI_MULTIPLICATION"],
    ["normal_x_[1](e2)", "AMBIGUOUS_NORMAL_E_MULTIPLICATION"],
    ["normal_x_[1](x/2x)", "AMBIGUOUS_NORMAL_DIVISION_MULTIPLICATION"],
    [
      "normal_x_[1](1/(x-1)(x+1))",
      "AMBIGUOUS_NORMAL_DIVISION_MULTIPLICATION",
    ],
    ["normal_x_[1](5!)", "UNEXPECTED_CHARACTER"],
  ]) {
    assertRejected(question, errorCode);
  }
  assertParsed("normal_x_[1](1/(x+1))", {
    form: "x-coordinate",
    expression: "1/(x+1)",
    xSource: "1",
  });
  assertRejected("normal_x_[1](y^2)", "UNSUPPORTED_NORMAL_EXPRESSION");
});

test("答え付加をinvalidにし、図・曲線形式・高次元の法線をunsupportedにする", () => {
  for (const question of [
    "normal_x_[1](x^2)=y=-x/2+3/2",
    "normal_point_(1,1)(x^2): y=-x/2+3/2",
    "normal_x_[1](x^2) 法線は y=-x/2+3/2",
    "normal_x_[1](x^2) 答えは y=-x/2+3/2",
    "曲線 y=x^2 の x=1 における法線の方程式を求めよ。答え y=-x/2+3/2",
    "曲線 y=x^2 の x=1 における法線の方程式はy=-x/2+3/2",
  ]) {
    assertRejected(question, "NORMAL_ANSWER_ATTACHED");
  }
  for (const question of [
    "右図の曲線 y=x^2 の x=1 における法線の方程式を求めよ",
    "グラフから接点を読み取り、その法線の方程式を求めよ",
    "曲線 y=x^2 のグラフを用いて法線の方程式を求めよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_DIAGRAM_NORMAL");
  }
  for (const question of [
    "円 x^2+y^2=1 上の点における法線の方程式を求めよ",
    "放物線 y^2=4x 上の点(1,2)における法線の方程式を求めよ",
    "曲線 y^2=4x 上の点(1,2)における法線の方程式を求めよ",
    "陰関数 F(x,y)=0 の法線の方程式を求めよ",
    "媒介変数 t で x=t^2,y=t^3 と表される曲線の法線を求めよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_NORMAL_CURVE");
  }
  assertRejected(
    "関数 f(x)=x^2 の x=1 における法線の方程式を求めよ",
    "UNSUPPORTED_NORMAL_FORM",
  );
  for (const question of [
    "曲線 y=x^2 の法線ベクトルを求めよ",
    "曲面 z=x^2+y^2 の法線の方程式を求めよ",
    "平面 x+y+z=1 の法線を求めよ",
    "normal_vector(x^2)",
  ]) {
    assertRejected(question, "UNSUPPORTED_NORMAL_GEOMETRY");
  }
  for (const question of [
    "normal_y_[1](x^2)",
    "normal_t_[1](x^2)",
    "曲線 z=x^2 の x=1 における法線の方程式を求めよ",
    "曲線 y=x^2 の t=1 における法線の方程式を求めよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_NORMAL_VARIABLE");
  }
});

test("全角と安全な上付き指数を保ち、危険なUnicode互換を拒否する", () => {
  assertParsed("ｎｏｒｍａｌ＿ｘ＿［１］（ｘ²）", {
    form: "x-coordinate",
    expression: "x^2",
    xSource: "1",
  });
  assertParsed("normal_x_[1]((x+1)²)", {
    form: "x-coordinate",
    expression: "(x+1)^2",
    xSource: "1",
  });
  assertParsed("normal_x_[1](x⁺²)", {
    form: "x-coordinate",
    expression: "x^+2",
    xSource: "1",
  });
  assertRejected("normal_x_[1](x₂)", "AMBIGUOUS_NORMAL_SCRIPT_CHARACTER");
  assertRejected("normal_x_[1](x⁻)", "AMBIGUOUS_NORMAL_SUPERSCRIPT_SEQUENCE");
  assertRejected("normal_x_[1](x²3)", "AMBIGUOUS_NORMAL_SUPERSCRIPT_BOUNDARY");
  assertRejected(
    "normal_x_[1](x\\left(x+1\\right))",
    "AMBIGUOUS_NORMAL_LATEX_DELIMITER",
  );
  for (const character of ["\u02E3", "\u2169", "\u24E7", "\u2461"]) {
    assertRejected(
      "normal_x_[1](" + character + ")",
      "AMBIGUOUS_NORMAL_COMPATIBILITY_CHARACTER",
    );
  }
});

test("入力長上限を正規化前に適用し、hostile文字列化を1回だけsnapshotする", () => {
  assertRejected(
    "normal_x_[1](" + "x+".repeat(2_500) + "x)",
    "NORMAL_INPUT_TOO_LONG",
  );
  assertRejected(
    "法線" + " ".repeat(5_001),
    "NORMAL_INPUT_TOO_LONG",
  );
  assertRejected(
    "a".repeat(5_001),
    "NORMAL_INPUT_TOO_LONG",
    { recognized: false },
  );

  let conversions = 0;
  const hostile = {
    [Symbol.toPrimitive]() {
      conversions += 1;
      return conversions === 1
        ? "normal_x_[1](x^2)"
        : "tangent_x_[1](x^2)";
    },
  };
  const parsed = parsePolynomialNormalInput(hostile);
  assert.equal(conversions, 1);
  assertSchema(parsed);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.form, "x-coordinate");
  assert.equal(parsed.expression, "x^2");
  assert.equal(parsed.xSource, "1");
});
