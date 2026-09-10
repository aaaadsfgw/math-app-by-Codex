import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseCombinedProblemText } from "../js/problem/problem-input.js";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("popupは任意の問題番号・指示と数式をProblemInputとしてlearning sessionへ渡す", async () => {
  const script = await source("js/popup.js");

  assert.match(script, /import\s*\{[\s\S]*?normalizeProblemInput,[\s\S]*?parseCombinedProblemText,[\s\S]*?\}\s*from\s*["']\.\/problem\/problem-input\.js["']/u);
  assert.match(script, /questionLabelInput:\s*document\.querySelector\(["']#questionLabelInput["']\)/u);
  assert.match(script, /instructionInput:\s*document\.querySelector\(["']#instructionInput["']\)/u);
  assert.match(script, /function currentStructuredProblemInput\(\)[\s\S]*?questionLabel,[\s\S]*?instructionText,[\s\S]*?formulaText:\s*elements\.questionInput\.value,[\s\S]*?conditions:\s*\[\.\.\.preservedConditions\],[\s\S]*?instructionSource:[\s\S]*?formulaSource:/u);
  assert.match(script, /learningSession\.setInput\(\{[\s\S]*?question,[\s\S]*?\.\.\.\(problemInput \? \{ problemInput \} : \{\}\),[\s\S]*?source:\s*currentInputSource/u);
});

test("structured pendingを各入力欄へ復元し、OCR autoSolveを確認済みOCRだけに限定する", async () => {
  const script = await source("js/popup.js");
  const restore = script.match(/function restoreStructuredInput\([\s\S]*?\n\}/u)?.[0] ?? "";
  const pending = script.match(/async function loadPendingQuestion\(\)[\s\S]*?\n\}/u)?.[0] ?? "";

  assert.match(restore, /questionLabelInput\.value\s*=\s*normalized\.questionLabel/u);
  assert.match(restore, /instructionInput\.value\s*=\s*normalized\.instructionText/u);
  assert.match(restore, /questionInput\.value\s*=\s*normalized\.formulaText/u);
  assert.match(restore, /preservedConditions\s*=\s*\[\.\.\.normalized\.conditions\]/u);
  assert.match(pending, /pending\.problemInput/u);
  assert.match(pending, /problemInput,/u);
  assert.match(pending, /pending\.autoSolve\s*===\s*true[\s\S]*?source\s*===\s*["']ocr["'][\s\S]*?pending\.ocrConfirmed\s*===\s*true[\s\S]*?await runOutputMode\(requestedMode\)/u);
});

test("手編集は全体sourceと編集対象のprovenanceをmanualへ戻す", async () => {
  const script = await source("js/popup.js");
  const manual = script.match(/function handleManualInput\(event\)[\s\S]*?\n\}/u)?.[0] ?? "";

  assert.match(manual, /target === elements\.questionInput[\s\S]*?formulaSource\s*=\s*["']manual["']/u);
  assert.match(manual, /target === elements\.instructionInput[\s\S]*?instructionSource\s*=\s*cleanText\([\s\S]*?["']manual["']/u);
  assert.match(manual, /preservedInstructionIntent\s*=\s*null/u);
  assert.match(manual, /setInputSource\(["']manual["']\)/u);
  assert.match(script, /questionLabelInput\.addEventListener\(["']input["'],\s*handleManualInput\)/u);
  assert.match(script, /instructionInput\.addEventListener\(["']input["'],\s*handleManualInput\)/u);
  assert.match(script, /questionInput\.addEventListener\(["']input["'],\s*handleManualInput\)/u);
});

test("取得中・解析中は追加フィールドも既存入力と同じ境界で無効化する", async () => {
  const script = await source("js/popup.js");
  const sync = script.match(/function syncControlStates\(\)[\s\S]*?\n\}/u)?.[0] ?? "";

  assert.match(sync, /questionLabelInput\.disabled\s*=\s*analysisRunning \|\| selectionLoading/u);
  assert.match(sync, /instructionInput\.disabled\s*=\s*analysisRunning \|\| selectionLoading/u);
  assert.match(sync, /questionInput\.disabled\s*=\s*analysisRunning \|\| selectionLoading/u);
});

test("selectionは強い行構造だけ分離し、plain textのx2を推測変換しない", async () => {
  const structured = parseCombinedProblemText(
    "(1)\n次の方程式を解け\n2*x^2+5*x+2=0",
    { source: "selection" },
  );
  assert.equal(structured.questionLabel, "(1)");
  assert.equal(structured.instructionIntent, "solve_equation");
  assert.equal(structured.formulaText, "2*x^2+5*x+2=0");
  assert.equal(structured.instructionSource, "selection");
  assert.equal(structured.formulaSource, "selection");

  const plain = parseCombinedProblemText("x2 + 5x + 2 = 0", { source: "selection" });
  assert.equal(plain.questionLabel, "");
  assert.equal(plain.instructionText, "");
  assert.equal(plain.formulaText, "x2 + 5x + 2 = 0");

  const script = await source("js/popup.js");
  const selection = script.match(/async function loadSelection\(\)[\s\S]*?\n\}/u)?.[0] ?? "";
  assert.match(selection, /parseCombinedProblemText\(text,\s*\{ source:\s*["']selection["'] \}\)/u);
  assert.match(selection, /hasSelectionStructure\(parsedProblemInput\)/u);
  assert.doesNotMatch(selection, /x2|replace\([^)]*\^/u);
});
