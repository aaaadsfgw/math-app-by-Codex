import assert from "node:assert/strict";
import test from "node:test";

import { parseFiniteLimitInput } from "../js/solver/limit-input.js";

function assertParsed(question, {
  expression,
  pointSource,
  approachKind = "finite",
  direction = "both",
}) {
  const result = parseFiniteLimitInput(question);
  assert.equal(Object.isFrozen(result), true, question);
  assert.equal(result.recognized, true, question);
  assert.equal(result.ok, true, `${question}: ${result.error}`);
  assert.equal(result.expression, expression, question);
  assert.equal(result.pointSource, pointSource, question);
  assert.equal(result.approachKind, approachKind, question);
  assert.equal(result.direction, direction, question);
  assert.equal(result.error, "", question);
  assert.equal(result.errorCode, "", question);
}

function assertRejected(question, errorCode, { recognized = true } = {}) {
  const result = parseFiniteLimitInput(question);
  assert.equal(Object.isFrozen(result), true, question);
  assert.equal(result.recognized, recognized, question);
  assert.equal(result.ok, false, question);
  assert.equal(result.expression, "", question);
  assert.equal(result.pointSource, "", question);
  assert.equal(result.approachKind, "finite", question);
  assert.equal(result.errorCode, errorCode, question);
  assert.ok(result.error, question);
}

test("括弧付き・波括弧・空白区切りのlim表記を全文一致で抽出する", () => {
  for (const [question, expected] of [
    ["lim_(x->2) (x^2-4)/(x-2)", {
      expression: "(x^2-4)/(x-2)",
      pointSource: "2",
    }],
    ["lim_{x→2}(x^2-4)/(x-2)", {
      expression: "(x^2-4)/(x-2)",
      pointSource: "2",
    }],
    ["lim x->-3 x^2+1", {
      expression: "x^2+1",
      pointSource: "-3",
    }],
  ]) {
    assertParsed(question, expected);
  }
});

test("LaTeX・Unicode矢印・上付き方向・全角文字を正規化する", () => {
  for (const [question, expected] of [
    [String.raw`\lim_{x\to -1/2} (x+1)/(x-1)`, {
      expression: "(x+1)/(x-1)",
      pointSource: "-1/2",
    }],
    [String.raw`\lim_{x\to 1^{+}} \left(1/(x-1)\right)`, {
      expression: "(1/(x-1))",
      pointSource: "1",
      direction: "right",
    }],
    ["lim_(x⟶0.5) X^2", {
      expression: "X^2",
      pointSource: "1/2",
    }],
    ["lim_(x→2⁺) 1/(x-2)", {
      expression: "1/(x-2)",
      pointSource: "2",
      direction: "right",
    }],
    ["ｌｉｍ_{Ｘ→−０．５} Ｘ＋１．", {
      expression: "X+1",
      pointSource: "-1/2",
    }],
  ]) {
    assertParsed(question, expected);
  }
});

test("日本語の接近表現と左右からの接近を解釈する", () => {
  for (const [question, expected] of [
    ["xを2に近づけたとき (x^2-4)/(x-2)", {
      expression: "(x^2-4)/(x-2)",
      pointSource: "2",
    }],
    ["xが1/2に右から近づくときの1/(2*x-1)の極限を求めよ", {
      expression: "1/(2*x-1)",
      pointSource: "1/2",
      direction: "right",
    }],
    ["xを-.5に左側から近づけるとき x+1 を求めなさい", {
      expression: "x+1",
      pointSource: "-1/2",
      direction: "left",
    }],
    ["xを2に近づけたとき x^2 の極限を求めよ！", {
      expression: "x^2",
      pointSource: "2",
    }],
  ]) {
    assertParsed(question, expected);
  }
});

test("大文字Xをxとして受理し、別変数をwell-formed unsupportedにする", () => {
  assertParsed("lim_(X->2) X^2", {
    expression: "X^2",
    pointSource: "2",
  });
  assertParsed("Xを2に近づけたとき X+1", {
    expression: "X+1",
    pointSource: "2",
  });

  for (const question of [
    "lim_(t->2) t^2",
    "yを1/2に左から近づけたとき y+1",
  ]) {
    assertRejected(question, "UNSUPPORTED_LIMIT_VARIABLE");
  }
});

test("記号と末尾語による左右極限を統合し、競合指定を拒否する", () => {
  for (const [question, expected] of [
    ["lim_(x->2-) 1/(x-2)", {
      expression: "1/(x-2)",
      pointSource: "2",
      direction: "left",
    }],
    ["lim_(x->2 +) 1/(x-2)", {
      expression: "1/(x-2)",
      pointSource: "2",
      direction: "right",
    }],
    ["lim_(x->2) 1/(x-2)の左極限を求めよ", {
      expression: "1/(x-2)",
      pointSource: "2",
      direction: "left",
    }],
    ["lim_(x->2+) 1/(x-2) の右側極限値", {
      expression: "1/(x-2)",
      pointSource: "2",
      direction: "right",
    }],
    ["lim_(x->2) 1/(x-2) の極限値", {
      expression: "1/(x-2)",
      pointSource: "2",
    }],
  ]) {
    assertParsed(question, expected);
  }

  assertRejected(
    "lim_(x->2+) 1/(x-2)の左極限を求めよ",
    "CONFLICTING_LIMIT_DIRECTION",
  );
  assertRejected(
    "xを2に右から近づけたとき 1/(x-2) の左極限",
    "CONFLICTING_LIMIT_DIRECTION",
  );
});

test("有限有理接近点を厳密分数へ正規化する", () => {
  for (const [question, pointSource, direction] of [
    ["lim_(x->+.5) x", "1/2", "both"],
    ["lim_(x->(-.25)) x", "-1/4", "both"],
    ["lim_(x->(1+1)) x", "2", "both"],
    ["lim_(x->2^-1) x", "1/2", "both"],
    ["lim_(x->1/2+) x", "1/2", "right"],
    ["lim_(x->-2+) x", "-2", "right"],
    ["lim_(x->2+0) x", "2", "both"],
    ["lim_(x->(2+0)) x", "2", "both"],
  ]) {
    assertParsed(question, { expression: "x", pointSource, direction });
  }
});

test("正負の無限遠を厳密な接近種別と正規形へ揃える", () => {
  for (const question of [
    "lim_(x->∞) 1/x",
    "lim_(x->+∞) 1/x",
    "lim_(x->infinity) 1/x",
    "lim_(x->+infinity) 1/x",
    String.raw`\lim_{x\to \infty} 1/x`,
    String.raw`\lim_{x\to +\infty} 1/x`,
    String.raw`\lim_{x\to + \infty} 1/x`,
    "ｌｉｍ_{ｘ→＋∞} １／ｘ．",
    "xを正の無限大に近づけるとき 1/x",
  ]) {
    assertParsed(question, {
      expression: "1/x",
      pointSource: "+infinity",
      approachKind: "positive-infinity",
    });
  }

  for (const question of [
    "lim_(x->-∞) 1/x",
    "lim_(x->-infinity) 1/x",
    String.raw`\lim_{x\to -\infty} 1/x`,
    String.raw`\lim_{x\to - \infty} 1/x`,
    "xが負の無限大に近づくときの1/xの極限を求めよ",
  ]) {
    assertParsed(question, {
      expression: "1/x",
      pointSource: "-infinity",
      approachKind: "negative-infinity",
    });
  }
});

test("無限遠を複合した接近点や符号不明の日本語を推測しない", () => {
  for (const question of [
    "lim_(x->±∞) 1/x",
    "lim_(x->+/-infinity) 1/x",
    "lim_(x->infinity2) 1/x",
    "lim_(x->1+infinity) 1/x",
    "lim_(x->--infinity) 1/x",
    "lim_(x->∞+∞) 1/x",
    "xを無限大に近づけるとき 1/x",
    "xを正負の無限大に近づけるとき 1/x",
  ]) {
    assertRejected(question, "MALFORMED_INFINITE_LIMIT_POINT");
  }
});

test("無限遠には左右方向を付けず、式のinvalidを先に返す", () => {
  for (const question of [
    "lim_(x->infinity+) 1/x",
    "lim_(x->-∞-) 1/x",
    "lim_(x->∞^(+)) 1/x",
    "lim_(x->infinity) 1/xの右極限を求めよ",
    "xを正の無限大に右から近づけるとき 1/x",
  ]) {
    assertRejected(question, "INFINITE_LIMIT_DIRECTION_ATTACHED");
  }

  for (const [question, errorCode] of [
    ["lim_(x->infinity+) 1/x=0", "LIMIT_RELATION_ATTACHED"],
    ["lim_(x->1+infinity) 1/x=0", "LIMIT_RELATION_ATTACHED"],
    ["xを正の無限大に近づけるとき x/2x", "AMBIGUOUS_DIVISION_MULTIPLICATION"],
  ]) {
    assertRejected(question, errorCode);
  }
});

test("非有理・記号接近点を構文正常なunsupportedにする", () => {
  for (const question of [
    "lim_(x->pi) x",
    "lim_(x->sqrt(2)) x",
    "lim_(x->a) x",
  ]) {
    assertRejected(question, "UNSUPPORTED_LIMIT_POINT");
  }
});

test("接近点の数字空白・科学記数法風連結・pi連結を推測しない", () => {
  for (const question of [
    "lim_(x->1 2) x",
    "lim_(x->.5 2) x",
  ]) {
    assertRejected(question, "AMBIGUOUS_LIMIT_POINT_NUMBER_SPACING");
  }
  for (const question of [
    "lim_(x->1e2) x",
    "lim_(x->1e-2) x",
    "lim_(x->2.5E+3) x",
    "lim_(x->１ｅ２) x",
  ]) {
    assertRejected(question, "AMBIGUOUS_LIMIT_POINT_SCIENTIFIC_NOTATION");
  }
  for (const question of [
    "lim_(x->pi2) x",
    "lim_(x->π.5) x",
  ]) {
    assertRejected(question, "AMBIGUOUS_LIMIT_POINT_PI_MULTIPLICATION");
  }
  for (const question of [
    "lim_(x->e2) x",
    "lim_(x->e.5) x",
    "lim_(x->e 2) x",
  ]) {
    assertRejected(question, "AMBIGUOUS_LIMIT_POINT_E_MULTIPLICATION");
  }
});

test("接近点と式の割り算直後の暗黙積をinvalidにする", () => {
  for (const question of [
    "lim_(x->1/2x) x",
    "lim_(x->3/4pi) x",
  ]) {
    assertRejected(question, "AMBIGUOUS_LIMIT_POINT");
  }
  for (const question of [
    "lim_(x->2) x/2x",
    "lim_(x->2) 1/(x-2)(x+1)",
  ]) {
    assertRejected(question, "AMBIGUOUS_DIVISION_MULTIPLICATION");
  }
});

test("式側の曖昧連結・答え付き関係・不完全構文をinvalidにする", () => {
  for (const [question, errorCode] of [
    ["lim_(x->2) 1 2", "AMBIGUOUS_NUMBER_SPACING"],
    ["lim_(x->2) 1e2", "AMBIGUOUS_SCIENTIFIC_NOTATION"],
    ["lim_(x->2) pi2", "AMBIGUOUS_PI_MULTIPLICATION"],
    ["lim_(x->2) e2", "AMBIGUOUS_E_MULTIPLICATION"],
    ["lim_(x->2) e.5", "AMBIGUOUS_E_MULTIPLICATION"],
    ["lim_(x->2) e 2", "AMBIGUOUS_E_MULTIPLICATION"],
    ["lim_(x->2) x^2=4", "LIMIT_RELATION_ATTACHED"],
    ["lim_(x->2) x<3", "LIMIT_RELATION_ATTACHED"],
    ["lim_(x->2) 5!", "UNEXPECTED_CHARACTER"],
    ["lim_(x->2) (x+2)!", "UNEXPECTED_CHARACTER"],
    ["lim_(x->2) 5！！", "UNEXPECTED_CHARACTER"],
    ["lim_(x->) x", "MALFORMED_LIMIT_INPUT"],
    ["lim_(x->2)", "MISSING_LIMIT_EXPRESSION"],
    ["lim_(x->2->3) x", "UNEXPECTED_CHARACTER"],
    ["limx->1 x の極限を求めよ", "MALFORMED_LIMIT_INPUT"],
    [String.raw`\limx->1 x の極限を求めよ`, "MALFORMED_LIMIT_INPUT"],
    [String.raw`lim_(x->1) x\left`, "MALFORMED_LATEX_DELIMITER"],
    [String.raw`lim_(x->1) x\right`, "MALFORMED_LATEX_DELIMITER"],
    [String.raw`lim_(x->1) \left x`, "MALFORMED_LATEX_DELIMITER"],
    [String.raw`lim_(x->1) x\left\right`, "MALFORMED_LATEX_DELIMITER"],
    ["lim_(x->1) x＼left", "MALFORMED_LATEX_DELIMITER"],
    ["lim_(x->1) ＼right x", "MALFORMED_LATEX_DELIMITER"],
    ["lim_(x->1) x＼left＼right", "MALFORMED_LATEX_DELIMITER"],
    ["lim_(x->1) x＼ｌｅｆｔ", "MALFORMED_LATEX_DELIMITER"],
  ]) {
    assertRejected(question, errorCode);
  }

  assertRejected("x^2+1", "", { recognized: false });
});

test("invalid構文をunsupportedな変数・接近点より優先する", () => {
  for (const question of [
    "lim_(t->2) t=4",
    "lim_(x->∞) x=4",
    "lim_(x->pi) x/2x",
  ]) {
    const result = parseFiniteLimitInput(question);
    assert.equal(result.recognized, true, question);
    assert.equal(result.ok, false, question);
    assert.equal(result.errorCode.startsWith("UNSUPPORTED_"), false, question);
  }
  assert.equal(parseFiniteLimitInput("lim_(t->2) t=4").errorCode, "LIMIT_RELATION_ATTACHED");
  assert.equal(parseFiniteLimitInput("lim_(x->∞) x=4").errorCode, "LIMIT_RELATION_ATTACHED");
  assert.equal(
    parseFiniteLimitInput("lim_(x->pi) x/2x").errorCode,
    "AMBIGUOUS_DIVISION_MULTIPLICATION",
  );
});

test("入力長上限を正規化前に適用し、認識状態を保持する", () => {
  assertRejected(
    `lim_(x->2) ${"x+".repeat(2_500)}x`,
    "LIMIT_INPUT_TOO_LONG",
  );
  assertRejected(
    `ｌｉｍ＿（ｘ－＞２） ${"ｘ＋".repeat(2_500)}ｘ`,
    "LIMIT_INPUT_TOO_LONG",
  );
  assertRejected(
    `𝐥𝐢𝐦_(x->2) ${"x+".repeat(2_500)}x`,
    "LIMIT_INPUT_TOO_LONG",
  );
  assertRejected("a".repeat(5_001), "LIMIT_INPUT_TOO_LONG", { recognized: false });
});
