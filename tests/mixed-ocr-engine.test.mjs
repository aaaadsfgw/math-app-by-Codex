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
  leadingSplitCount = leadingSplit ? 1 : 0,
  leadingComponentCounts = [],
} = {}) {
  const calls = { formula: 0, japanese: 0 };
  const observed = { formulaBlob: null, formulaBlobs: [] };
  const regionBlobs = Array.from({ length: regionCount }, () => png());
  const prefixBlobs = Array.from({ length: leadingSplitCount }, () => png());
  const remainderBlobs = Array.from({ length: leadingSplitCount }, () => png());
  const leadingSplits = prefixBlobs.map((prefixBlob, index) => ({
    regionIndex: regionCount - 1,
    ...(Number.isInteger(leadingComponentCounts[index])
      ? { evidence: { componentCount: leadingComponentCounts[index] } }
      : {}),
    prefix: { blob: prefixBlob },
    remainder: { blob: remainderBlobs[index] },
  }));
  const instance = createMixedOcrEngine({
    segmentImage: async () => ({
      layout: { kind: regionCount === 1 ? "single-region" : "separated-regions" },
      regions: regionBlobs.map((blob, index) => ({ index, blob })),
      leadingSplit: leadingSplits[0] ?? null,
      leadingSplits,
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
        const output = Array.isArray(formula)
          ? formula[calls.formula] ?? formula.at(-1)
          : formula;
        calls.formula += 1;
        observed.formulaBlob = blob;
        observed.formulaBlobs.push(blob);
        if (output instanceof Error) throw output;
        return output;
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
    prefixBlob: prefixBlobs[0] ?? null,
    prefixBlobs,
    remainderBlob: remainderBlobs[0] ?? null,
    remainderBlobs,
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

test("狭い左端候補の(1)・(2)・(10)・全角（2）をexact OCR時だけ分離する", async () => {
  for (const label of ["(1)", "(2)", "(10)", "（2）"]) {
    const { instance, observed, remainderBlob } = engine({
      regionCount: 2,
      japanese: [
        japaneseOutput("次の式を簡単にせよ。"),
        japaneseOutput(label),
      ],
      formula: formulaOutput("x+y"),
      leadingSplit: true,
    });

    const output = await instance.recognize(png());
    assert.equal(output.structuredCandidate.questionLabel, label, label);
    assert.equal(output.structuredCandidate.formulaText, "x+y", label);
    assert.equal(observed.formulaBlob, remainderBlob, label);
    assert.equal(output.confirmationRequired, true, label);
    assert.equal(output.verified, false, label);
  }
});

test("複数の左端候補はexact labelが一意な場合だけ採用する", async () => {
  const unique = engine({
    regionCount: 2,
    japanese: [
      japaneseOutput("次の式を簡単にせよ。"),
      japaneseOutput("(2)"),
      japaneseOutput("(2+x)"),
    ],
    formula: formulaOutput("x+y"),
    leadingSplitCount: 2,
  });
  const uniqueOutput = await unique.instance.recognize(png());
  assert.equal(uniqueOutput.structuredCandidate.questionLabel, "(2)");
  assert.equal(unique.observed.formulaBlob, unique.remainderBlobs[0]);
  assert.deepEqual(unique.calls, { formula: 1, japanese: 3 });

  const ambiguous = engine({
    regionCount: 2,
    japanese: [
      japaneseOutput("次の式を簡単にせよ。"),
      japaneseOutput("(2)"),
      japaneseOutput("(3)"),
    ],
    formula: formulaOutput("(2) x+y"),
    leadingSplitCount: 2,
  });
  const ambiguousOutput = await ambiguous.instance.recognize(png());
  assert.equal(ambiguousOutput.structuredCandidate.questionLabel, "");
  assert.equal(ambiguousOutput.structuredCandidate.formulaText, "(2) x+y");
  assert.equal(ambiguous.observed.formulaBlob, ambiguous.regionBlobs.at(-1));
  assert.match(ambiguousOutput.warnings.join(" "), /複数|一意/u);
});

test("OCRが欠けた括弧を補完しても必要なcomponentがない候補は採用しない", async () => {
  const { instance, observed, remainderBlobs } = engine({
    regionCount: 2,
    japanese: [
      japaneseOutput("次の式を簡単にせよ。"),
      japaneseOutput("(2)"),
      japaneseOutput("(2)"),
    ],
    formula: formulaOutput("x+y"),
    leadingSplitCount: 2,
    leadingComponentCounts: [2, 3],
  });
  const output = await instance.recognize(png());
  assert.equal(output.structuredCandidate.questionLabel, "(2)");
  assert.equal(observed.formulaBlob, remainderBlobs[1]);
});

test("単一componentを丸数字へ補完したOCRだけでは同一行labelにしない", async () => {
  const { instance, observed, regionBlobs } = engine({
    regionCount: 2,
    japanese: [
      japaneseOutput("次の式を簡単にせよ。"),
      japaneseOutput("②"),
    ],
    formula: formulaOutput("(2)*x^2"),
    leadingSplit: true,
    leadingComponentCounts: [1],
  });
  const output = await instance.recognize(png());
  assert.equal(output.structuredCandidate.questionLabel, "");
  assert.equal(output.structuredCandidate.formulaText, "(2)*x^2");
  assert.equal(observed.formulaBlob, regionBlobs.at(-1));
});

test("分離後の数式が二項演算子開始または認識失敗なら元画像へ戻す", async () => {
  for (const firstOutput of [
    formulaOutput("*(x+1)"),
    new Error("cropped formula failed"),
  ]) {
    const { instance, observed, regionBlobs, remainderBlob } = engine({
      regionCount: 2,
      japanese: [
        japaneseOutput("次の式を展開せよ。"),
        japaneseOutput("(2)"),
      ],
      formula: [firstOutput, formulaOutput("(2)*(x+1)")],
      leadingSplit: true,
    });
    const output = await instance.recognize(png());
    assert.equal(output.structuredCandidate.questionLabel, "");
    assert.equal(output.structuredCandidate.formulaText, "(2)*(x+1)");
    assert.deepEqual(observed.formulaBlobs, [remainderBlob, regionBlobs.at(-1)]);
    assert.match(output.warnings.join(" "), /数式候補に戻/u);
  }
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
