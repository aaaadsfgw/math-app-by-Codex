import assert from "node:assert/strict";
import test from "node:test";

import {
  createMixedOcrEngine,
  MixedOcrError,
} from "../js/ocr/mixed-ocr-engine.js";

const png = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

function formulaOutput(text = "1/x+2/(x+1)") {
  return {
    text,
    rawText: text,
    latex: text,
    format: "latex",
    provider: "wasm",
    backend: { id: "ibem" },
    model: { id: "formula-model" },
    warnings: [],
    confirmationRequired: true,
    verified: false,
  };
}

function japaneseOutput(text, confidence = 91) {
  return {
    text,
    rawText: text,
    confidence,
    provider: "wasm",
    backend: { id: "tesseract" },
    model: { id: "jpn-fast" },
    timings: { totalMilliseconds: 12 },
    confirmationRequired: true,
    verified: false,
  };
}

function engine({ regionCount, japanese = [], formula = formulaOutput(), japaneseError = null } = {}) {
  const calls = { formula: 0, japanese: 0 };
  const observed = { formulaBlob: null };
  const regionBlobs = Array.from({ length: regionCount }, () => png());
  const instance = createMixedOcrEngine({
    segmentImage: async () => ({
      layout: { kind: regionCount === 1 ? "single-region" : "separated-regions" },
      regions: regionBlobs.map((blob, index) => ({ index, blob })),
    }),
    japaneseRecognizer: {
      async recognize() {
        const index = calls.japanese;
        calls.japanese += 1;
        if (japaneseError) throw japaneseError;
        return japanese[index] ?? japanese.at(-1);
      },
      cancel: () => 0,
      dispose: async () => {},
      status: { available: true },
    },
    formulaEngine: {
      async recognize(blob) {
        calls.formula += 1;
        observed.formulaBlob = blob;
        return formula;
      },
      cancel: () => 0,
      dispose: async () => {},
      status: { available: true },
      metadata: { model: "formula" },
    },
  });
  return { instance, calls, observed, regionBlobs };
}

test("mixed画像は上の日本語と下の数式を別engineで認識して統合する", async () => {
  const { instance, calls, observed, regionBlobs } = engine({
    regionCount: 2,
    japanese: [japaneseOutput("(1) 次の分数式を計算せよ。")],
  });
  const output = await instance.recognize(png());
  assert.equal(output.recognitionKind, "mixed");
  assert.equal(output.structuredCandidate.questionLabel, "(1)");
  assert.equal(output.structuredCandidate.instructionText, "次の分数式を計算せよ。");
  assert.equal(output.structuredCandidate.instructionIntent, "simplify");
  assert.equal(output.structuredCandidate.formulaText, "1/x+2/(x+1)");
  assert.equal(output.structuredCandidate.instructionSource, "ocr");
  assert.equal(output.structuredCandidate.formulaSource, "ocr");
  assert.equal(output.confirmationRequired, true);
  assert.equal(output.verified, false);
  assert.equal(observed.formulaBlob, regionBlobs.at(-1));
  assert.notEqual(observed.formulaBlob, regionBlobs[0]);
  assert.deepEqual(calls, { formula: 1, japanese: 1 });
});

test("問題番号行と2行指示を許可し、最大1つの数式だけIBEMへ渡す", async () => {
  const { instance, calls } = engine({
    regionCount: 3,
    japanese: [japaneseOutput("①"), japaneseOutput("次の方程式を解け。")],
    formula: formulaOutput("(4*x-6)/(x^2-5*x+6)=1"),
  });
  const output = await instance.recognize(png());
  assert.equal(output.structuredCandidate.questionLabel, "①");
  assert.equal(output.structuredCandidate.instructionIntent, "solve_equation");
  assert.equal(output.text, "(4*x-6)/(x^2-5*x+6)=1");
  assert.deepEqual(calls, { formula: 1, japanese: 2 });
});

test("上側が日本語でない複数式画像はformula OCR前に拒否する", async () => {
  const { instance, calls } = engine({
    regionCount: 2,
    japanese: [japaneseOutput("x + 1")],
  });
  await assert.rejects(
    instance.recognize(png()),
    (error) => error instanceof MixedOcrError && error.code === "MIXED_OCR_MULTIPLE_FORMULAS",
  );
  assert.equal(calls.formula, 0);
});

test("mixed画像で日本語OCRが失敗したらIBEMへ画像全体も下段も渡さない", async () => {
  const { instance, calls } = engine({
    regionCount: 2,
    japaneseError: new Error("failed"),
  });
  await assert.rejects(
    instance.recognize(png()),
    (error) => error.code === "MIXED_OCR_JAPANESE_RECOGNITION_FAILED",
  );
  assert.equal(calls.formula, 0);
});

test("日本語だけの単一領域はinstruction-only候補となりformula OCRを呼ばない", async () => {
  const { instance, calls } = engine({
    regionCount: 1,
    japanese: [japaneseOutput("次の式を簡単にせよ。")],
  });
  const output = await instance.recognize(png());
  assert.equal(output.recognitionKind, "instruction-only");
  assert.equal(output.text, "");
  assert.equal(output.structuredCandidate.instructionIntent, "simplify");
  assert.equal(output.structuredCandidate.formulaText, "");
  assert.equal(calls.formula, 0);
});

test("数式だけの単一領域は従来のIBEMへ渡す", async () => {
  const { instance, calls, observed } = engine({
    regionCount: 1,
    japanese: [japaneseOutput("x^2 - 1")],
    formula: formulaOutput("x^2-1"),
  });
  const original = png();
  const output = await instance.recognize(original);
  assert.equal(output.recognitionKind, "formula-only");
  assert.equal(output.text, "x^2-1");
  assert.equal(observed.formulaBlob, original);
  assert.deepEqual(calls, { formula: 1, japanese: 1 });
});

test("単一領域では日本語preflight失敗後も確認必須の数式OCRへ安全にfallbackする", async () => {
  const { instance, calls } = engine({
    regionCount: 1,
    japaneseError: new Error("runtime unavailable"),
    formula: formulaOutput("2*x=4"),
  });
  const output = await instance.recognize(png());
  assert.equal(output.recognitionKind, "formula-only");
  assert.match(output.warnings.join(" "), /preflight/u);
  assert.deepEqual(calls, { formula: 1, japanese: 1 });
});
