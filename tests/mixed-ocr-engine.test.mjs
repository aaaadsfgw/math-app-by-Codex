import assert from "node:assert/strict";
import test from "node:test";

import {
  createMixedOcrEngine,
  MixedOcrError,
} from "../js/ocr/mixed-ocr-engine.js";
import {
  areSymbolicallyEquivalent,
  simplifySymbolic,
} from "../js/math-core/symbolic-adapter.js";
import { solveWorkflow } from "../js/solve-workflow.js";

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

function engine({
  regionCount,
  japanese = [],
  formula = formulaOutput(),
  japaneseError = null,
  leadingSplit = false,
} = {}) {
  const calls = { formula: 0, japanese: 0 };
  const observed = { formulaBlob: null };
  const regionBlobs = Array.from({ length: regionCount }, () => png());
  const prefixBlob = png();
  const remainderBlob = png();
  const instance = createMixedOcrEngine({
    segmentImage: async () => ({
      layout: { kind: regionCount === 1 ? "single-region" : "separated-regions" },
      regions: regionBlobs.map((blob, index) => ({ index, blob })),
      leadingSplit: leadingSplit
        ? {
            regionIndex: regionCount - 1,
            prefix: { blob: prefixBlob },
            remainder: { blob: remainderBlob },
          }
        : null,
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
  return {
    instance,
    calls,
    observed,
    regionBlobs,
    prefixBlob,
    remainderBlob,
  };
}

const symbolicOperations = Object.freeze({
  equivalent: async (left, right) => areSymbolicallyEquivalent(left, right),
  simplify: async (expression) => simplifySymbolic(expression),
});

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

test("mixed同一行の位置分離された(2)だけをquestionLabelへ移し誤答を防ぐ", async () => {
  const { instance, calls, observed, remainderBlob } = engine({
    regionCount: 2,
    japanese: [
      japaneseOutput("次の分数式を計算せよ。"),
      japaneseOutput("(2)"),
    ],
    formula: formulaOutput("((1)/(x)) + ((2)/(x + 1))"),
    leadingSplit: true,
  });

  const output = await instance.recognize(png());
  assert.equal(output.structuredCandidate.questionLabel, "(2)");
  assert.equal(
    output.structuredCandidate.formulaText,
    "((1)/(x)) + ((2)/(x + 1))",
  );
  assert.match(output.structuredCandidate.rawInstructionText, /\(2\)/u);
  assert.equal(observed.formulaBlob, remainderBlob);
  assert.equal(output.confirmationRequired, true);
  assert.equal(output.verified, false);
  assert.deepEqual(calls, { formula: 1, japanese: 2 });

  const leaked = await solveWorkflow({
    instructionIntent: "simplify",
    formulaText: "( 2 ) ((1)/(x)) + ((2)/(x + 1))",
  }, { symbolicOperations });
  assert.equal(leaked.solverResult.exactAnswer, "2*(2*x+1)/(x*(x+1))");

  const corrected = await solveWorkflow(output.structuredCandidate, { symbolicOperations });
  assert.equal(corrected.presentable, true, corrected.solverResult.error);
  assert.equal(corrected.solverResult.solverId, "algebra-transformation");
  assert.equal(corrected.solverResult.exactAnswer, "(3*x+1)/(x*(x+1))");
  assert.deepEqual(corrected.solverResult.conditions, ["x≠0", "x≠-1"]);
  assert.equal(corrected.solverResult.verified, true);
});

test("左端の(1+x)は位置候補でも問題番号扱いせず数式全体を保持する", async () => {
  const { instance, observed, regionBlobs } = engine({
    regionCount: 2,
    japanese: [
      japaneseOutput("次の式を展開せよ。"),
      japaneseOutput("(1+x)"),
    ],
    formula: formulaOutput("(1+x)*(1-x)"),
    leadingSplit: true,
  });
  const output = await instance.recognize(png());
  assert.equal(output.structuredCandidate.questionLabel, "");
  assert.equal(output.structuredCandidate.formulaText, "(1+x)*(1-x)");
  assert.equal(observed.formulaBlob, regionBlobs.at(-1));
  assert.match(output.warnings.join(" "), /断定せず/u);
});

test("上段と同一行で問題番号が競合したらformula OCR前に停止する", async () => {
  const { instance, calls } = engine({
    regionCount: 2,
    japanese: [
      japaneseOutput("(1) 次の式を簡単にせよ。"),
      japaneseOutput("(2)"),
    ],
    leadingSplit: true,
  });
  await assert.rejects(
    instance.recognize(png()),
    (error) => error instanceof MixedOcrError
      && error.code === "MIXED_OCR_QUESTION_LABEL_CONFLICT",
  );
  assert.deepEqual(calls, { formula: 0, japanese: 2 });
});

test("同じ問題番号の末尾句読点差は競合とせずformulaから分離する", async () => {
  for (const [upper, probe, expected] of [
    ["2. 次の式を簡単にせよ。", "2.", "2"],
    ["問題2: 次の式を簡単にせよ。", "問題2", "問題2"],
  ]) {
    const { instance, calls, observed, remainderBlob } = engine({
      regionCount: 2,
      japanese: [japaneseOutput(upper), japaneseOutput(probe)],
      formula: formulaOutput("1/x+2/(x+1)"),
      leadingSplit: true,
    });
    const output = await instance.recognize(png());
    assert.equal(output.structuredCandidate.questionLabel, expected, upper);
    assert.equal(output.structuredCandidate.formulaText, "1/x+2/(x+1)", upper);
    assert.equal(observed.formulaBlob, remainderBlob, upper);
    assert.deepEqual(calls, { formula: 1, japanese: 2 }, upper);
  }
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

test("単一行の数式と対応済み日本語指示は構造を分けて未確認候補にする", async () => {
  const { instance, calls } = engine({
    regionCount: 1,
    japanese: [japaneseOutput("x^2-5x+6=0を解け")],
  });
  const output = await instance.recognize(png());
  assert.equal(output.recognitionKind, "mixed");
  assert.equal(output.structuredCandidate.instructionText, "方程式を解け");
  assert.equal(output.structuredCandidate.instructionIntent, "solve_equation");
  assert.equal(output.structuredCandidate.formulaText, "x^2-5x+6=0");
  assert.equal(output.confirmationRequired, true);
  assert.equal(output.verified, false);
  assert.deepEqual(calls, { formula: 0, japanese: 1 });
});

test("問題番号と数式だけの単一行も強い位置証拠とlabel OCR一致時だけ分離する", async () => {
  const { instance, calls, observed, remainderBlob } = engine({
    regionCount: 1,
    japanese: [
      japaneseOutput("(2) 1/x+2/(x+1)"),
      japaneseOutput("(2)"),
    ],
    formula: formulaOutput("1/x+2/(x+1)"),
    leadingSplit: true,
  });
  const output = await instance.recognize(png());
  assert.equal(output.recognitionKind, "mixed");
  assert.equal(output.structuredCandidate.questionLabel, "(2)");
  assert.equal(output.structuredCandidate.formulaText, "1/x+2/(x+1)");
  assert.equal(output.structuredCandidate.instructionText, "");
  assert.equal(observed.formulaBlob, remainderBlob);
  assert.equal(output.confirmationRequired, true);
  assert.equal(output.verified, false);
  assert.deepEqual(calls, { formula: 1, japanese: 2 });
});

test("単一行の左端probeがlabelでなければ元画像をformula OCRへ渡す", async () => {
  const { instance, observed } = engine({
    regionCount: 1,
    japanese: [
      japaneseOutput("(1+x) (1-x)"),
      japaneseOutput("(1+x)"),
    ],
    formula: formulaOutput("(1+x)*(1-x)"),
    leadingSplit: true,
  });
  const original = png();
  const output = await instance.recognize(original);
  assert.equal(output.recognitionKind, "formula-only");
  assert.equal(output.structuredCandidate.questionLabel, "");
  assert.equal(output.structuredCandidate.formulaText, "(1+x)*(1-x)");
  assert.equal(observed.formulaBlob, original);
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
