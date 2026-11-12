import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compareStructure } from "../bench/ocr/structure.mjs";
import { convertMfrLatex } from "../desktop/services/mfr-latex.js";
import { parseDefiniteIntegralInput } from "../js/solver/definite-integral-input.js";
import { parseFiniteLimitInput } from "../js/solver/limit-input.js";

test("MFR LaTeX transcribes grouping, operators and multiplication without simplification", () => {
  const cases = [
    [String.raw`\frac{x^{2}-5x+6}{x-2}`, "(x^2-5*x+6)/(x-2)"],
    ["3a(2a-b)-2b(a+3b)", "3*a*(2*a-b)-2*b*(a+3*b)"],
    ["(2)(x+1)", "(2)*(x+1)"],
    ["(+1 9)+(-1 4)", "(+19)+(-14)"],
    ["(x+1)^{2}", "(x+1)^2"],
    ["-x^{-2}", "-x^(-2)"],
    ["(x^2)^3", "(x^2)^3"],
    [String.raw`\dfrac{1+\frac12}{x}`, "(1+(1)/(2))/(x)"],
    [String.raw`\frac{x}{2}^2`, "((x)/(2))^2"],
    [String.raw`\sqrt{x^2+1}-\sqrt{3}`, "sqrt(x^2+1)-sqrt(3)"],
    [String.raw`\left(\pi*x\right)\geq 2a`, "(pi*x)>=2*a"],
    [String.raw`\operatorname{s i n}^{2} x=\cos^2 x`, "sin(x)^2=cos(x)^2"],
    [String.raw`\operatorname{l o g}_{2}{(x-1)}=3`, "log_2(x-1)=3"],
    [String.raw`f(x)=\mathrm{s i n}\left(3x^{2}\right)`, "f(x)=sin(3*x^2)"],
    ["2a=b", "2*a=b"],
  ];
  for (const [input, expected] of cases) assert.equal(convertMfrLatex(input), expected, input);
});

test("MFR LaTeX produces limits and integrals in the existing desktop solver notation", () => {
  const integral = convertMfrLatex(String.raw`\int^{1}_{0}(x^2+1)\,\mathrm{d}x`);
  assert.equal(integral, "∫_(0)^(1) x^2+1 dx");
  assert.equal(parseDefiniteIntegralInput(integral).ok, true);
  assert.equal(convertMfrLatex(String.raw`\int 2x\cos(x^2)\,dx`), "∫ 2*x*cos(x^2) dx");

  const oneSided = convertMfrLatex(String.raw`\underset{x\to1^{+}}{\operatorname*{l i m}}\frac{1}{x-1}`);
  assert.equal(oneSided, "lim_(x->1+) (1)/(x-1)");
  assert.equal(parseFiniteLimitInput(oneSided).direction, "right");
  const styledArrow = convertMfrLatex(String.raw`\underset { x \mathop \to 2 ^ { - } } { \operatorname* { l i m } } \frac { 1 } { 2 - x }`);
  assert.equal(styledArrow, "lim_(x->2-) (1)/(2-x)");
  assert.equal(parseFiniteLimitInput(styledArrow).direction, "left");
  assert.equal(convertMfrLatex(String.raw`\lim_{x\mathop{\rightarrow}0}x`), "lim_(x->0) x");
  const infinity = convertMfrLatex(String.raw`\lim_{x\rightarrow\infty}\frac{2x^2}{x^2-3}`);
  assert.equal(parseFiniteLimitInput(infinity).approachKind, "positive-infinity");
});

test("MFR LaTeX rejects unsupported notation and ambiguous or damaged input", () => {
  const cases = [
    "", "a".repeat(2001), "(".repeat(50) + "x" + ")".repeat(50), "x\nx", "x\u2028x",
    "x2", "x^12", "x^", "(x-1)2", "(x-1", "2a==b", "1/2x", "x=1=2", "x_2", "x^2^3",
    "f(x)+1", "g(x+1)=2", "[x+1]", String.raw`1\quad2`,
    String.raw`\frac{x}{}`, String.raw`\left(x+1)`, String.raw`(x+1\right)`,
    String.raw`\left.x\right)`, String.raw`\sqrt[3]{x}`, String.raw`\sin^{-1}x`,
    String.raw`\sin xy`, String.raw`\log_{x} 2`, String.raw`\foo{a}`, String.raw`\text{dx}`,
    String.raw`\begin{array}{c}x\\y\end{array}`, String.raw`\int_0 x dx`, String.raw`\int x dy`,
    String.raw`\underset{x\to1}{\cos}x`, String.raw`\lim_{x\to1}x=1`,
    String.raw`\mathop{x+y}`, String.raw`\lim_{x\mathop{\to 0}}x`,
  ];
  for (const input of cases) assert.throws(() => convertMfrLatex(input), { code: "OCR_LATEX_UNSUPPORTED" }, input);
});

test("MFR LaTeX conversion preserves all 31 structurally correct outputs in the recorded benchmark", () => {
  const manifest = JSON.parse(readFileSync(new URL("../bench/ocr/data/manifest.json", import.meta.url)));
  const { rows } = JSON.parse(readFileSync(new URL("../bench/ocr/results/pix2text-cpu.json", import.meta.url)));
  const expected = new Map(manifest.cases.map(({ id, canonical }) => [id, canonical]));
  const rejected = [];
  const mismatches = [];
  for (const { id, text } of rows) {
    let formula;
    try {
      formula = convertMfrLatex(text);
    } catch (error) {
      assert.equal(error.code, "OCR_LATEX_UNSUPPORTED");
      rejected.push(id);
      continue;
    }
    const result = compareStructure(expected.get(id), formula);
    if (!result.structural_match) mismatches.push(id);
  }
  assert.equal(rows.length, 34);
  assert.deepEqual(rejected, ["05-signed-arithmetic", "11-power-grouping"]);
  assert.deepEqual(mismatches, ["13-cube-root"]);
});
