import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeWindowsOcrLayout } from "../desktop/ocr-host/windows-layout.js";
import { recognizeWindowsMixedOcr } from "../desktop/ocr-host/windows-mixed-ocr.js";

function printedImage(boxes, { width = 210, height = 130, scale = 1, dark = false } = {}) {
  const image = { width: width * scale, height: height * scale };
  const data = new Uint8ClampedArray(image.width * image.height * 4);
  const background = dark ? 16 : 255;
  const foreground = dark ? 245 : 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    data.fill(background, offset, offset + 3);
    data[offset + 3] = 255;
  }
  for (const [x, y, w, h] of boxes) {
    for (let yy = y * scale; yy < (y + h) * scale; yy += 1) {
      for (let xx = x * scale; xx < (x + w) * scale; xx += 1) {
        const offset = (yy * image.width + xx) * 4;
        data.fill(foreground, offset, offset + 3);
      }
    }
  }
  return { ...image, data };
}

const standaloneLabel = [[10, 9, 2, 17], [16, 11, 5, 12], [25, 9, 2, 17]];
const fraction = [[45, 54, 14, 13], [65, 53, 13, 15], [85, 57, 9, 11],
  [42, 78, 55, 1], [53, 88, 13, 14], [72, 86, 12, 17]];
const japaneseRow = Array.from({ length: 7 }, (_, index) => [10 + index * 14, 43, 11, 16]);
const inlineFormula = [[134, 45, 8, 13], [149, 47, 8, 10], [166, 44, 10, 14]];

test("a detached fraction bar protects both adjacent bands at normal and high DPI", () => {
  for (const scale of [1, 3]) {
    const layout = analyzeWindowsOcrLayout(printedImage([...standaloneLabel, ...fraction], { scale }));
    assert.equal(layout.regions.length, 2);
    assert.equal(layout.regions[0].isolatedLabelColumns, 3);
    assert.equal(layout.fractions.length, 1);
    const formula = layout.regions[1].bounds;
    assert.ok(formula.y > 26 * scale);
    assert.ok(formula.y <= 53 * scale);
    assert.ok(formula.y + formula.height >= 103 * scale);
  }
});

test("a near-edge horizontal rule does not attest a fraction", () => {
  const layout = analyzeWindowsOcrLayout(printedImage([
    [18, 18, 80, 16], [1, 48, 208, 1], [25, 66, 60, 16],
  ]));
  assert.equal(layout.fractions.length, 0);
});

test("an exponent, radical and integral bounds each stay in the formula region", () => {
  for (const boxes of [
    [[51, 11, 8, 9], [34, 24, 18, 23]],
    [[30, 19, 2, 23], [30, 16, 79, 3], [47, 24, 13, 14], [67, 26, 19, 13]],
    [[46, 10, 7, 8], [35, 22, 13, 36], [59, 30, 55, 17], [43, 62, 9, 11]],
  ]) {
    const layout = analyzeWindowsOcrLayout(printedImage(boxes, { dark: true }));
    assert.equal(layout.regions.length, 1);
    assert.equal(layout.dark, true);
    const region = layout.regions[0].bounds;
    assert.ok(region.y <= Math.min(...boxes.map((box) => box[1])));
    assert.ok(region.y + region.height >= Math.max(...boxes.map((box) => box[1] + box[3])));
  }
});

test("column whitespace proposes a Japanese prefix without cutting any mathematical ink", () => {
  const { regions } = analyzeWindowsOcrLayout(printedImage([...japaneseRow, ...inlineFormula]));
  const prefix = regions[0].inline.find(({ context, formula, instruction }) => (
    instruction && context.x < formula.x
  ));
  assert.ok(prefix);
  assert.ok(prefix.context.x + prefix.context.width > 104);
  assert.ok(prefix.context.x + prefix.context.width <= prefix.formula.x);
  assert.ok(prefix.formula.x <= 134);
  assert.ok(prefix.formula.x + prefix.formula.width >= 176);
});

test("attached parenthesized coefficients do not produce a label split", () => {
  const { regions } = analyzeWindowsOcrLayout(printedImage([
    [10, 40, 3, 20], [15, 42, 7, 16], [24, 40, 3, 20],
    [29, 40, 3, 20], [34, 44, 10, 14], [46, 45, 8, 12], [56, 44, 6, 14], [64, 40, 3, 20],
  ]));
  assert.equal(regions.length, 1);
  assert.equal(regions[0].inline.some(({ label }) => label), false);
});

function mockRaster(t, image) {
  const source = new Blob(["full"], { type: "image/png" });
  const originalBitmap = globalThis.createImageBitmap;
  const originalCanvas = globalThis.OffscreenCanvas;
  globalThis.createImageBitmap = async () => ({ ...image, close() {} });
  globalThis.OffscreenCanvas = class {
    getContext() {
      return {
        drawImage: (_bitmap, ...args) => { this.bounds = args.slice(0, 4); },
        getImageData: () => image,
        fillRect() {},
      };
    }
    convertToBlob() {
      return Promise.resolve(new Blob([JSON.stringify(this.bounds)], { type: "image/png" }));
    }
  };
  t.after(() => {
    if (originalBitmap) globalThis.createImageBitmap = originalBitmap;
    else delete globalThis.createImageBitmap;
    if (originalCanvas) globalThis.OffscreenCanvas = originalCanvas;
    else delete globalThis.OffscreenCanvas;
  });
  return source;
}

test("isolated numeric labels require explicit model evidence rather than adding a missing parenthesis", async (t) => {
  const blob = mockRaster(t, printedImage([...standaloneLabel, ...fraction]));
  let attempts = 0;
  const result = await recognizeWindowsMixedOcr(blob, {
    recognizeJapanese: async () => ({ text: "⑪)" }),
    async recognizeFormula() {
      attempts += 1;
      return attempts === 1
        ? { text: "", rawText: "^{(1)}", metrics: { loadMs: 800, inferenceMs: 160 } }
        : { text: "(x-1)/(x+1)", rawText: "\\frac{x-1}{x+1}", metrics: { loadMs: 0, inferenceMs: 600 } };
    },
  });
  assert.equal(attempts, 2);
  assert.equal(result.structuredCandidate.questionLabel, "(1)");
  assert.equal(result.structuredCandidate.rawInstructionText, "⑪)\n^{(1)}");
  assert.equal(result.structuredCandidate.formulaText, "(x-1)/(x+1)");
  assert.equal(result.metrics.loadMs, 800);
  assert.equal(result.metrics.extraInferenceMs, 160);
  assert.equal(result.confirmationRequired, true);
});

test("incompatible numeric label readings require manual review", async (t) => {
  const blob = mockRaster(t, printedImage([...standaloneLabel, ...fraction]));
  let attempts = 0;
  const result = await recognizeWindowsMixedOcr(blob, {
    recognizeJapanese: async () => ({ text: "1)" }),
    recognizeFormula: async () => {
      attempts += 1;
      return { text: "7", rawText: "(7)" };
    },
  });
  assert.equal(attempts, 1);
  assert.equal(result.structuredCandidate.questionLabel, "");
  assert.equal(result.structuredCandidate.formulaText, "");
  assert.match(result.warnings.join(" "), /一致しません/u);
});

test("optional label recognition failures allow review but worker failures propagate", async (t) => {
  const blob = mockRaster(t, printedImage([...standaloneLabel, ...fraction]));
  const recognize = (code) => recognizeWindowsMixedOcr(blob, {
    recognizeJapanese: async () => ({ text: "⑪)" }),
    recognizeFormula: async () => { throw Object.assign(new Error(code), { code }); },
  });
  const result = await recognize("OCR_RECOGNITION_FAILED");
  assert.equal(result.structuredCandidate.rawInstructionText, "⑪)");
  assert.match(result.warnings.join(" "), /確認できません/u);
  await assert.rejects(recognize("OCR_WORKER_FAILED"), { code: "OCR_WORKER_FAILED" });
});

test("unclassified upper regions are kept for review rather than omitted", async (t) => {
  const blob = mockRaster(t, printedImage([...standaloneLabel, ...fraction]));
  const result = await recognizeWindowsMixedOcr(blob, {
    recognizeJapanese: async () => ({ text: "2x+1" }),
    recognizeFormula: () => assert.fail("must not guess which formula the user selected"),
  });
  assert.equal(result.structuredCandidate.formulaText, "");
  assert.equal(result.structuredCandidate.rawInstructionText, "2x+1");
  assert.match(result.warnings.join(" "), /確認できません/u);
});

test("same-line instructions send only the formula remainder to Pix2Text", async (t) => {
  const blob = mockRaster(t, printedImage([...japaneseRow, ...inlineFormula]));
  let formulaBounds;
  const result = await recognizeWindowsMixedOcr(blob, {
    async recognizeJapanese(sample) {
      const [x, , width] = JSON.parse(await sample.text());
      return { text: x === 0 && width > 105 ? "次の式を展開しなさい。" : "2a(a-b)" };
    },
    async recognizeFormula(sample) {
      formulaBounds = JSON.parse(await sample.text());
      return { text: "2*a*(a-b)", rawText: "2a(a-b)" };
    },
  });
  assert.ok(formulaBounds[0] > 104);
  assert.equal(result.structuredCandidate.instructionText, "次の式を展開しなさい。");
  assert.equal(result.structuredCandidate.formulaText, "2*a*(a-b)");
});
