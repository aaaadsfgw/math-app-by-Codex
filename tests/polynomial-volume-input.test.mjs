import assert from "node:assert/strict";
import test from "node:test";

import { parsePolynomialVolumeInput } from "../js/solver/polynomial-volume-input.js";

function assertParsed(question, expected) {
  const parsed = parsePolynomialVolumeInput(question);
  assert.equal(parsed.recognized, true, question);
  assert.equal(parsed.ok, true, parsed.error || question);
  assert.equal(parsed.form, "explicit-x-axis");
  assert.equal(parsed.outerExpression, expected.outerExpression);
  assert.equal(parsed.innerExpression, expected.innerExpression);
  assert.equal(parsed.lowerSource, expected.lowerSource);
  assert.equal(parsed.upperSource, expected.upperSource);
  assert.equal(parsed.error, "");
  assert.equal(parsed.errorCode, "");
  assert.equal(Object.isFrozen(parsed), true);
}

function assertRejected(question, errorCode, { recognized = true } = {}) {
  const parsed = parsePolynomialVolumeInput(question);
  assert.equal(parsed.recognized, recognized, question);
  assert.equal(parsed.ok, false, question);
  assert.equal(parsed.form, "");
  assert.equal(parsed.outerExpression, "");
  assert.equal(parsed.innerExpression, "");
  assert.equal(parsed.lowerSource, "");
  assert.equal(parsed.upperSource, "");
  assert.equal(parsed.errorCode, errorCode, `${question}: ${parsed.error}`);
  assert.ok(parsed.error);
  assert.equal(Object.isFrozen(parsed), true);
}

test("x軸回転のcanonical記法・別名・円板・ワッシャーを全文抽出する", () => {
  assertParsed("volume_x_axis_[0,1](x)", {
    outerExpression: "x",
    innerExpression: "0",
    lowerSource: "0",
    upperSource: "1",
  });
  assertParsed("volume_xaxis_[(-1/2),(3/2)]((x+1)^2;1)", {
    outerExpression: "(x+1)^2",
    innerExpression: "1",
    lowerSource: "-1/2",
    upperSource: "3/2",
  });
  assertParsed("VOLUME_X_[ -0.5 , 1.25 ](x+1;0)", {
    outerExpression: "x+1",
    innerExpression: "0",
    lowerSource: "-1/2",
    upperSource: "5/4",
  });
  assertParsed("volume_x_axis_[0,1](sqrt((x+1)^2);sin(x))", {
    outerExpression: "sqrt((x+1)^2)",
    innerExpression: "sin(x)",
    lowerSource: "0",
    upperSource: "1",
  });
});

test("日本語の円板・2曲線ワッシャーを外半径と内半径の固定順で受理する", () => {
  assertParsed(
    "x=0からx=1まで、y=x^2とx軸の間の部分をx軸のまわりに1回転してできる立体の体積を求めよ",
    {
      outerExpression: "x^2",
      innerExpression: "0",
      lowerSource: "0",
      upperSource: "1",
    },
  );
  assertParsed(
    "x=-1/2からx=3/2までの区間で、曲線 y=x^2+1と直線 y=x^2の間の部分をx軸の周りに回転させてできる回転体の体積を求めなさい。",
    {
      outerExpression: "x^2+1",
      innerExpression: "x^2",
      lowerSource: "-1/2",
      upperSource: "3/2",
    },
  );
  assertParsed(
    "次の x=0からx=2までの区間で、関数 y=2x+1と関数 y=xのあいだの領域をx軸のまわりに一回転させてできる立体の体積を計算しなさい！",
    {
      outerExpression: "2x+1",
      innerExpression: "x",
      lowerSource: "0",
      upperSource: "2",
    },
  );
});

test("通常の方程式・積分・面積・一般立体体積を回転体として認識しない", () => {
  for (const question of [
    "x^2=4",
    "∫_0^1 x^2 dx",
    "area_[0,1](x;0)",
    "半径2、高さ3の円柱の体積を求めよ",
    "半径rの球の体積を求めよ",
    "y=x^2を微分せよ",
  ]) {
    assertRejected(question, "", { recognized: false });
  }
});

test("区間・式・区切り・固定日本語要素が欠けたvolume shaped入力をinvalidにする", () => {
  for (const question of [
    "volume_x_axis_[0](x)",
    "volume_x_axis_[0,1,2](x)",
    "volume_x_axis_[0,1](x;0;y)",
    "volume_x_axis_[0,1](x;0",
    "volume_x_axis_[0,1](x) trailing",
    "volume_[0,1](x)",
    "回転体の体積を求めよ",
    "y=x^2とx軸の間の部分をx軸のまわりに1回転してできる立体の体積を求めよ",
    "x=0からx=1まで、y=x^2をx軸のまわりに1回転してできる立体の体積を求めよ",
  ]) {
    assertRejected(question, "MALFORMED_VOLUME_INPUT");
  }
  assertRejected("volume_x_axis_[0,1]()", "MISSING_VOLUME_EXPRESSION");
  assertRejected("volume_x_axis_[0,1](;x)", "MISSING_VOLUME_EXPRESSION");
  assertRejected("volume_x_axis_[0,1](x;)", "MISSING_VOLUME_EXPRESSION");
});

test("逆順・空区間と非有理・曖昧な境界を推測しない", () => {
  for (const question of [
    "volume_x_axis_[1,1](x)",
    "volume_x_axis_[2,-1](x)",
  ]) {
    assertRejected(question, "INVALID_VOLUME_INTERVAL_ORDER");
  }
  for (const question of [
    "volume_x_axis_[1e2,3](x)",
    "volume_x_axis_[1e-2,3](x)",
  ]) {
    assertRejected(question, "AMBIGUOUS_VOLUME_BOUND_SCIENTIFIC_NOTATION");
  }
  for (const question of [
    "volume_x_axis_[pi,3](x)",
    "volume_x_axis_[sqrt(2),3](x)",
    "volume_x_axis_[a,3](x)",
    "volume_x_axis_[∞,3](x)",
  ]) {
    assertRejected(question, "UNSUPPORTED_VOLUME_BOUND");
  }
  assertRejected(
    "volume_x_axis_[1 2,3](x)",
    "AMBIGUOUS_VOLUME_BOUND_NUMBER_SPACING",
  );
  assertRejected("volume_x_axis_[1/0,3](x)", "INVALID_VOLUME_BOUND");
  assertRejected(
    `volume_x_axis_[${"1".repeat(513)},${"2".repeat(513)}](x)`,
    "VOLUME_BOUND_COMPONENT_TOO_LONG",
  );
});

test("式の関係付加・曖昧連結・科学記数法・factorialをinvalidにする", () => {
  for (const [question, errorCode] of [
    ["volume_x_axis_[0,1](x=1)", "VOLUME_RELATION_ATTACHED"],
    ["volume_x_axis_[0,1](x<1)", "VOLUME_RELATION_ATTACHED"],
    ["volume_x_axis_[0,1](x2)", "AMBIGUOUS_VOLUME_X_SUFFIX"],
    ["volume_x_axis_[0,1](1 2)", "AMBIGUOUS_VOLUME_NUMBER_SPACING"],
    ["volume_x_axis_[0,1](1e2)", "AMBIGUOUS_VOLUME_SCIENTIFIC_NOTATION"],
    ["volume_x_axis_[0,1](pi2)", "AMBIGUOUS_VOLUME_PI_MULTIPLICATION"],
    ["volume_x_axis_[0,1](e2)", "AMBIGUOUS_VOLUME_E_MULTIPLICATION"],
    ["volume_x_axis_[0,1](x/2x)", "AMBIGUOUS_VOLUME_DIVISION_MULTIPLICATION"],
    ["volume_x_axis_[0,1](1/(x-1)(x+1))", "AMBIGUOUS_VOLUME_DIVISION_MULTIPLICATION"],
    ["volume_x_axis_[0,1](5!)", "UNEXPECTED_CHARACTER"],
  ]) {
    assertRejected(question, errorCode);
  }
  assertParsed("volume_x_axis_[0,1](sin(x);sqrt(x))", {
    outerExpression: "sin(x)",
    innerExpression: "sqrt(x)",
    lowerSource: "0",
    upperSource: "1",
  });
  assertRejected("volume_x_axis_[0,1](y;0)", "UNSUPPORTED_VOLUME_EXPRESSION");
});

test("答え付加・図依存・x軸以外の回転を認識したままinvalid/unsupportedへ分ける", () => {
  for (const question of [
    "volume_x_axis_[0,1](x)=pi/3",
    "volume_x_axis_[0,1](x):pi/3",
    "x=0からx=1まで、y=xとx軸の間の部分をx軸のまわりに1回転してできる立体の体積を求めよ。答え=pi/3",
  ]) {
    assertRejected(question, "VOLUME_ANSWER_ATTACHED");
  }
  for (const question of [
    "右図のx=0からx=1まで、y=xとx軸の間の部分をx軸のまわりに1回転してできる立体の体積を求めよ",
    "グラフの斜線部分をx軸のまわりに回転してできる回転体の体積を求めよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_DIAGRAM_VOLUME");
  }
  for (const question of [
    "volume_y_axis_[0,1](x)",
    "volume_yaxis_[0,1](x)",
    "volume_z_[0,1](x)",
    "x=0からx=1まで、y=xとy=0の間の部分をy軸のまわりに1回転してできる立体の体積を求めよ",
    "x=0からx=1まで、y=xとx軸の間の部分を直線 y=1 のまわりに1回転してできる立体の体積を求めよ",
  ]) {
    assertRejected(question, "UNSUPPORTED_VOLUME_AXIS");
  }
});

test("入力長上限を完全正規化前に適用し認識状態を保持する", () => {
  assertRejected(
    `volume_x_axis_[0,1](${"x+".repeat(2_500)}x)`,
    "VOLUME_INPUT_TOO_LONG",
  );
  assertRejected(
    `${" ".repeat(5_001)}volume_x_axis_[0,1](x)`,
    "VOLUME_INPUT_TOO_LONG",
  );
  assertRejected(
    `回転${" ".repeat(5_001)}体積`,
    "VOLUME_INPUT_TOO_LONG",
  );
  assertRejected("a".repeat(5_001), "VOLUME_INPUT_TOO_LONG", { recognized: false });
});

test("全角と安全な上付き指数を保ち、危険な互換文字を拒否する", () => {
  assertParsed("ｖｏｌｕｍｅ＿ｘ＿ａｘｉｓ＿［０，１］（ｘ²）", {
    outerExpression: "x^2",
    innerExpression: "0",
    lowerSource: "0",
    upperSource: "1",
  });
  assertParsed("volume_x_axis_[0,1](2²;1×10²)", {
    outerExpression: "2^2",
    innerExpression: "1*10^2",
    lowerSource: "0",
    upperSource: "1",
  });
  assertParsed("volume_x_axis_[0,1]((x+1)²;x⁺²)", {
    outerExpression: "(x+1)^2",
    innerExpression: "x^+2",
    lowerSource: "0",
    upperSource: "1",
  });
  assertParsed("volume_x_axis_[0,1](x⁻¹)", {
    outerExpression: "x^-1",
    innerExpression: "0",
    lowerSource: "0",
    upperSource: "1",
  });
  for (const question of [
    "volume_x_axis_[0,1](x₋₁)",
    "volume_x_axis_[0,1](2₂)",
  ]) {
    assertRejected(question, "AMBIGUOUS_VOLUME_SCRIPT_CHARACTER");
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
      `volume_x_axis_[0,1](${character})`,
      "AMBIGUOUS_VOLUME_COMPATIBILITY_CHARACTER",
    );
  }
  for (const question of [
    "volume_x_axis_[0,1](1\\left2)",
    "volume_x_axis_[0,1](x\\right)",
    "volume_x_axis_[0,1](x)\\left\\right",
    "\\leftvolume_x_axis_[0,1](x)",
    "volume_x_axis_[0,1](1＼left2)",
    "volume_x_axis_[0,1](x)＼left＼right",
  ]) {
    assertRejected(question, "AMBIGUOUS_VOLUME_LATEX_DELIMITER");
  }
  for (const question of [
    "volume_x_axis_[0,1](2²⁻¹)",
    "volume_x_axis_[0,1](2¹⁺¹)",
    "volume_x_axis_[0,1](x⁺)",
  ]) {
    assertRejected(question, "AMBIGUOUS_VOLUME_SUPERSCRIPT_SEQUENCE");
  }
  for (const question of [
    "volume_x_axis_[0,1](x⁰1)",
    "volume_x_axis_[0,1](2⁰２)",
    "volume_x_axis_[0,1](x².5)",
    "volume_x_axis_[0,1](2¹ ²)",
    "volume_x_axis_[0,1](2¹　²)",
  ]) {
    assertRejected(question, "AMBIGUOUS_VOLUME_SUPERSCRIPT_BOUNDARY");
  }
});
