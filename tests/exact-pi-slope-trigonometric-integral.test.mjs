import assert from "node:assert/strict";
import test from "node:test";

import {
  ExactPiTrigonometricIntegralError,
  MAX_PI_TRIGONOMETRIC_TERMS,
  analyzeExactPiSlopeTrigonometricIntegrand,
  evaluateExactPiSlopeTrigonometricIntegral,
  formatExactPiElementarySum,
} from "../js/math-core/exact-pi-trigonometric-integral.js";
import { ExactRational } from "../js/math-core/exact-rational.js";
import { parseMathExpression } from "../js/math-core/expression-parser.js";

function ast(source) {
  return parseMathExpression(source, { symbols: ["x"] }).ast;
}

function rational(numerator, denominator = 1n) {
  return new ExactRational(BigInt(numerator), BigInt(denominator));
}

function summarizeTerm(term) {
  return {
    functionName: term.functionName,
    amplitude: String(term.amplitude),
    slopePi: String(term.slope),
    intercept: String(term.intercept),
  };
}

function assertPiSlopeError(source, code = null, unsupported = true) {
  assert.throws(
    () => analyzeExactPiSlopeTrigonometricIntegrand(ast(source)),
    (error) => (
      error instanceof ExactPiTrigonometricIntegralError
      && (code === null || error.code === code)
      && error.unsupported === unsupported
    ),
    source,
  );
}

test("pi係数の一次傾斜とpure-pi位相をledger付きで厳密分解する", () => {
  const analyzed = analyzeExactPiSlopeTrigonometricIntegrand(
    ast("(1/2)*sin(2*pi*x+pi/3)-3*cos((-pi/2)*x-pi/4)"),
  );
  assert.deepEqual(analyzed.trigonometric.map(summarizeTerm), [
    {
      functionName: "sin",
      amplitude: "1/2",
      slopePi: "2",
      intercept: "pi/3",
    },
    {
      functionName: "cos",
      amplitude: "-3",
      slopePi: "-1/2",
      intercept: "-pi/4",
    },
  ]);

  for (const source of [
    "sin(pi*(x+1/3))",
    "sin((x+1/3)*pi)",
    "sin(pi*x+x-x+pi/3)",
  ]) {
    const [term] = analyzeExactPiSlopeTrigonometricIntegrand(ast(source)).trigonometric;
    assert.equal(String(term.slope), "1", source);
    assert.equal(String(term.intercept), "pi/3", source);
  }

  assert.equal(Object.isFrozen(analyzed), true);
  assert.equal(Object.isFrozen(analyzed.trigonometric), true);
  assert.ok(analyzed.trigonometric.every(Object.isFrozen));
});

test("混合傾斜・混合位相・pi分母をwell-formed unsupportedに保つ", () => {
  for (const [source, code] of [
    ["sin((pi+1)*x)", "MIXED_RATIONAL_PI_SLOPE"],
    ["sin(pi*x+x)", "MIXED_RATIONAL_PI_SLOPE"],
    ["sin(pi*x+1)", "MIXED_RADIAN_PI_PHASE"],
    ["sin(x/pi)", "NON_RATIONAL_PI_SLOPE_DENOMINATOR"],
    ["sin(pi/(2*x))", "NON_RATIONAL_PI_SLOPE_DENOMINATOR"],
    ["sin(pi*x^2)", "UNSUPPORTED_PI_SLOPE_POWER"],
    ["sin(pi^2*x)", "UNSUPPORTED_PI_SLOPE_POWER"],
  ]) {
    assertPiSlopeError(source, code);
  }
  for (const source of [
    "sin(pi*x)+sin(x)",
    "1+sin(pi*x)",
    "exp(x)+sin(pi*x)",
    "pi*sin(pi*x)",
  ]) {
    assertPiSlopeError(source);
  }
});

test("piとxのbearingを0倍・相殺・累乗の後も失わない", () => {
  for (const source of [
    "sin(0*(pi*pi*x))",
    "sin((pi*pi*x)-(pi*pi*x))",
    "sin((pi-pi)*(pi*x))",
    "sin((0*pi)*(pi*x))",
    "sin(pi*(pi-pi)*x)",
    "sin(pi/(pi-pi+1)*x)",
    "sin((pi*pi*x)^0)",
    "sin(pi^(pi-pi)*x)",
    "sin((x-x)*x)",
    "sin((0*x)*x)",
    "sin(0*(x*x))",
  ]) {
    assertPiSlopeError(source);
  }

  for (const source of [
    "sin(0*pi*x)",
    "sin((pi-pi)*x)",
    "sin(pi*(x-x))",
  ]) {
    const evaluated = evaluateExactPiSlopeTrigonometricIntegral(
      ast(source),
      rational(0),
      rational(1),
    );
    assert.equal(evaluated.exact, "0", source);
  }
});

test("pi傾きの標準角を1/pi付き根号basisへ厳密展開する", () => {
  for (const [source, lower, upper, expected] of [
    ["sin(pi*x)", rational(0), rational(1), "2/pi"],
    ["cos(pi*x/2)", rational(0), rational(1), "2/pi"],
    ["sin(pi*x+pi/3)", rational(0), rational(1), "1/pi"],
    ["cos(pi*x+pi/6)", rational(0), rational(1), "-1/pi"],
    ["3sin(3*pi*x+pi/6)", rational(0), rational(1), "√3/pi"],
    ["cos(pi*x/12)", rational(0), rational(1), "3*√6/pi-3*√2/pi"],
    [
      "sin(pi*x/12)",
      rational(0),
      rational(1),
      "12/pi-3*√6/pi-3*√2/pi",
    ],
    [
      "cos(5*pi*x/12)",
      rational(0),
      rational(1),
      "3*√6/(5*pi)+3*√2/(5*pi)",
    ],
    [
      "sin(5*pi*x/12)",
      rational(0),
      rational(1),
      "12/(5*pi)+3*√2/(5*pi)-3*√6/(5*pi)",
    ],
  ]) {
    const evaluated = evaluateExactPiSlopeTrigonometricIntegral(
      ast(source),
      lower,
      upper,
    );
    assert.equal(evaluated.exact, expected, source);
    assert.equal(formatExactPiElementarySum(evaluated.value), expected, source);
    assert.ok(evaluated.value.terms.every(({ piPower }) => [-1, 0].includes(piPower)));
  }
});

test("非標準pi角を近似せずformal atomと1/pi係数へ正規化する", () => {
  for (const [source, lower, upper, expected] of [
    ["cos(pi*x/5)", rational(0), rational(1), "5*sin(pi/5)/pi"],
    ["sin(pi*x/5)", rational(0), rational(1), "5/pi-5*cos(pi/5)/pi"],
    [
      "cos(pi*x)",
      rational(1, 7),
      rational(2, 7),
      "sin(2*pi/7)/pi-sin(pi/7)/pi",
    ],
    ["cos(4*pi*x/5)", rational(0), rational(1), "5*sin(pi/5)/(4*pi)"],
    ["cos(6*pi*x/5)", rational(0), rational(1), "-5*sin(pi/5)/(6*pi)"],
    [
      "sin(2*pi*x/5+pi/5)",
      rational(0),
      rational(1),
      "5*cos(2*pi/5)/(2*pi)+5*cos(pi/5)/(2*pi)",
    ],
    [
      "cos(2*pi*x/5+pi/5)",
      rational(0),
      rational(1),
      "5*sin(2*pi/5)/(2*pi)-5*sin(pi/5)/(2*pi)",
    ],
  ]) {
    const evaluated = evaluateExactPiSlopeTrigonometricIntegral(
      ast(source),
      lower,
      upper,
    );
    assert.equal(evaluated.exact, expected, source);
  }
});

test("零傾斜・逆順・同一境界と複数項相殺を全AST検証後に処理する", () => {
  for (const [source, lower, upper, expected] of [
    ["sin(pi*x)", rational(1), rational(0), "-2/pi"],
    ["sin(-pi*x)", rational(0), rational(1), "-2/pi"],
    ["cos(-pi*x+pi/2)", rational(0), rational(1), "2/pi"],
    ["3sin(pi/6)", rational(0), rational(2), "3"],
    ["3cos(pi/4)", rational(0), rational(2), "3*√2"],
    ["sin(pi/5)", rational(0), rational(2), "2*sin(pi/5)"],
    ["cos(pi/3)", rational(2), rational(0), "-1"],
    [
      "sin(7*pi*x/5+pi/11)",
      rational(2, 3),
      rational(2, 3),
      "0",
    ],
    ["sin(pi*x)+sin(-pi*x)", rational(0), rational(1), "0"],
    ["cos(pi*x)-cos(-pi*x)", rational(0), rational(1), "0"],
    ["sin(pi*x+2*pi)-sin(pi*x)", rational(0), rational(1), "0"],
    ["sin(pi*x)-cos(pi*x/2)", rational(0), rational(1), "0"],
    ["sin(pi*x)+sin(3*pi*x)", rational(0), rational(1), "8/(3*pi)"],
  ]) {
    const evaluated = evaluateExactPiSlopeTrigonometricIntegral(
      ast(source),
      lower,
      upper,
    );
    assert.equal(evaluated.exact, expected, source);
  }

  for (const source of [
    "0*sin(pi*x^2)",
    "sin(pi*x^2)-sin(pi*x^2)",
    "sin((pi*pi-pi*pi)*x)",
    "sin(pi*x)^0",
    "0/sin(pi*x)",
  ]) {
    assert.throws(
      () => evaluateExactPiSlopeTrigonometricIntegral(
        ast(source),
        rational(3, 5),
        rational(3, 5),
      ),
      (error) => error instanceof ExactPiTrigonometricIntegralError
        && error.unsupported === true,
      source,
    );
  }
});

test("piPower=-1を既存canonical keyから落とさず固定順で整形する", () => {
  const evaluated = evaluateExactPiSlopeTrigonometricIntegral(
    ast(
      "sin(pi*x)+cos(pi/3)+cos((pi/5)*x)+sin(pi/5)"
      + "+sin((pi/5)*x)-cos(pi/5)",
    ),
    rational(0),
    rational(1),
  );
  assert.equal(
    evaluated.exact,
    "7/pi+1/2+5*sin(pi/5)/pi+sin(pi/5)-5*cos(pi/5)/pi-cos(pi/5)",
  );
  assert.deepEqual(
    [...new Set(evaluated.value.terms.map(({ piPower }) => piPower))],
    [-1, 0],
  );
});

test("sin・cos各32項のsource上限を相殺前に適用する", () => {
  const sines = Array.from(
    { length: MAX_PI_TRIGONOMETRIC_TERMS },
    () => "sin(pi*x)",
  );
  const cosines = Array.from(
    { length: MAX_PI_TRIGONOMETRIC_TERMS },
    () => "cos(pi*x/2)",
  );
  const withinLimit = [...sines, ...cosines].join("+");
  assert.equal(
    evaluateExactPiSlopeTrigonometricIntegral(
      ast(withinLimit),
      rational(0),
      rational(1),
    ).exact,
    "128/pi",
  );

  for (const source of [
    `${sines.join("+")}+sin(pi*x)`,
    `${cosines.join("+")}+cos(pi*x/2)`,
    Array.from({ length: 33 }, () => "sin(pi*x)-sin(pi*x)").join("+"),
  ]) {
    assertPiSlopeError(source, "TOO_MANY_PI_TRIGONOMETRIC_TERMS");
  }

  const zeroTerms = Array.from({ length: 33 }, () => "0*sin(pi*x)").join("+");
  assert.equal(
    evaluateExactPiSlopeTrigonometricIntegral(
      ast(zeroTerms),
      rational(0),
      rational(1),
    ).exact,
    "0",
  );
});

test("公開pi傾きAPIは厳密分数境界以外を拒否する", () => {
  const source = ast("sin(pi*x)");
  assert.throws(
    () => evaluateExactPiSlopeTrigonometricIntegral(source, 0, rational(1)),
    TypeError,
  );
  assert.throws(
    () => evaluateExactPiSlopeTrigonometricIntegral(source, rational(0), {}),
    TypeError,
  );
  for (const term of [
    {
      kind: "scalar",
      argument: null,
      coefficient: rational(1),
      piPower: -2,
      radicand: 1,
    },
    {
      kind: "sin",
      argument: null,
      coefficient: rational(1),
      piPower: -1,
      radicand: 1,
    },
  ]) {
    assert.throws(() => formatExactPiElementarySum({ terms: [term] }), TypeError);
  }
});
