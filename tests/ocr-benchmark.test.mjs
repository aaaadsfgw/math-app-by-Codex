import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compareStructure } from "../bench/ocr/structure.mjs";

test("OCR benchmark accepts notation variants and preserves mathematical roles", () => {
  assert.equal(compareStructure("2ab(a+b)/(4a)", String.raw`\frac{2*a*b\left(a+b\right)}{4*a}`).structural_match, true);
  assert.equal(compareStructure("(x^2-1)/(x-1)", String.raw`\frac{x-1}{x^2-1}`).structure_error, true);
  assert.equal(compareStructure("2a-b", "2a=b").operator_error, true);
  assert.equal(compareStructure("x^2", "x2").structure_error, true);
  assert.equal(compareStructure("2(a-b)", "2a-b").structural_match, false);
  assert.equal(compareStructure("sqrt(x+1)", String.raw`\sqrt{x}+1`).structure_error, true);
  assert.equal(compareStructure("sqrt(27)", String.raw`\sqrt { 2 7 }`, { latex: true }).structural_match, true);
  assert.equal(compareStructure("lim_(x->1+)1/(x-1)",
    String.raw`\underset { x \to 1^{+} } { \operatorname* { l i m } } \cfrac{1}{x-1}`, { latex: true }).structural_match, true);
  assert.equal(compareStructure("integral(0,1,x^2+1,x)",
    String.raw`\textstyle{\int_{0}^{1}\left(x^{2}+1\right)d x}`, { latex: true }).structural_match, true);
  assert.equal(compareStructure("(sin(x))^2+(cos(x))^2=1",
    String.raw`{\sin{^2}}x+{\cos{^2}}x=1`, { latex: true }).structural_match, true);
  assert.equal(compareStructure("2+3", "2+3????").structural_match, false);
  assert.ok(compareStructure("2+3", "2+3????").parse_error);
});

test("OCR benchmark reference formulas and committed PNG hashes agree", async () => {
  const path = new URL("../bench/ocr/data/", import.meta.url);
  const { cases } = JSON.parse(await readFile(new URL("manifest.json", path)));
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  assert.ok(cases.length >= 30);
  for (const item of cases) {
    assert.equal(compareStructure(item.canonical, item.latex, { latex: true }).structural_match, true, item.id);
    for (const [file, expected] of [[item.image, item.sha256], [item.formulaImage, item.formulaSha256]]) {
      const image = await readFile(new URL(file, path));
      assert.equal(createHash("sha256").update(image).digest("hex"), expected, item.id);
    }
  }
});
