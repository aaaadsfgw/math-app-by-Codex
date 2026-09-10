import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

function attributeValues(html, attribute) {
  const pattern = new RegExp(`\\b${attribute}=["']([^"']+)["']`, "gu");
  return [...html.matchAll(pattern)].map((match) => match[1]);
}

test("OCR確認ページのDOM契約とアクセシブルな状態領域を固定する", async () => {
  const html = await source("ocr-confirm.html");
  const ids = attributeValues(html, "id");
  const idSet = new Set(ids);

  assert.equal(idSet.size, ids.length, "duplicate IDs are not allowed");
  for (const id of [
    "ocrConfirmMain",
    "captureStatus",
    "previewFrame",
    "previewImage",
    "previewPlaceholder",
    "cropInfo",
    "sourceInfo",
    "availabilityInfo",
    "recognitionStatus",
    "recognizeButton",
    "cancelRecognitionButton",
    "recognitionProgress",
    "recognitionError",
    "candidatePanel",
    "questionLabelInput",
    "questionLabelHelp",
    "instructionInput",
    "instructionHelp",
    "candidateInput",
    "candidateHelp",
    "conditionsInput",
    "conditionsHelp",
    "providerInfo",
    "backendInfo",
    "modelInfo",
    "candidateWarning",
    "solveButton",
    "solveHelp",
    "discardButton",
    "discardHelp",
    "pageMessage",
  ]) {
    assert.ok(idSet.has(id), `missing #${id}`);
  }

  for (const target of attributeValues(html, "aria-describedby")) {
    for (const id of target.split(/\s+/u)) assert.ok(idSet.has(id), `missing description #${id}`);
  }
  assert.match(html, /id=["']previewImage["'][^>]*\balt=["'][^"']+["']/u);
  assert.match(html, /id=["']previewImage["'][^>]*\breferrerpolicy=["']no-referrer["']/u);
  assert.match(html, /id=["']captureStatus["'][^>]*\brole=["']status["']/u);
  assert.match(html, /id=["']pageMessage["'][^>]*\brole=["']status["'][^>]*\baria-live=["']polite["']/u);
  assert.match(html, /id=["']candidateInput["'][^>]*\bmaxlength=["']4096["']/u);
  assert.match(html, /id=["']questionLabelInput["'][^>]*\bmaxlength=["']32["']/u);
  assert.match(html, /id=["']instructionInput["'][^>]*\bmaxlength=["']512["']/u);
  assert.match(html, /id=["']conditionsInput["'][^>]*\bmaxlength=["']4096["']/u);
  assert.match(html, /画像に明記された条件だけを1行ずつ入力/u);
  assert.match(html, /id=["']recognizeButton["'][^>]*\btype=["']button["']/u);
  assert.match(html, /id=["']cancelRecognitionButton["'][^>]*\btype=["']button["']/u);
  assert.match(html, /id=["']solveButton["'][^>]*\btype=["']button["']/u);
  assert.match(html, /id=["']discardButton["'][^>]*\btype=["']button["']/u);
  assert.match(html, /「この内容で解く」を押すまで、解答処理は始まりません/u);
  assert.match(html, /日本語の指示と数式が混在する画像にも対応/u);
  assert.match(html, /手書き・図・ページ全体の読み取りは対象外/u);
  assert.match(html, /画像は履歴や保存領域へ残しません/u);
});

test("確認ページはローカルassetだけを読み込む", async () => {
  const html = await source("ocr-confirm.html");
  assert.match(html, /href=["']css\/ocr-confirm\.css["']/u);
  assert.match(html, /<script\s+type=["']module["']\s+src=["']js\/ocr\/ocr-confirm\.js["']/u);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/iu);
  assert.doesNotMatch(html, /<iframe\b|\bsrcdoc=/iu);
});

test("確認scriptはprotocol v1で認識・中止・破棄を要求する", async () => {
  const script = await source("js/ocr/ocr-confirm.js");

  for (const token of [
    "OCR_CAPTURE_TARGET",
    "OCR_CAPTURE_PROTOCOL_VERSION",
    "GET_OCR_CAPTURE_PREVIEW",
    "RECOGNIZE_OCR_CAPTURE",
    "CANCEL_OCR_RECOGNITION",
    "DISCARD_OCR_CAPTURE",
    "normalizeOcrCaptureMessage",
  ]) {
    assert.match(script, new RegExp(`\\b${token}\\b`, "u"));
  }
  assert.match(script, /searchParams\.get\(["']captureId["']\)/u);
  assert.match(script, /chrome\?\.runtime\?\.sendMessage/u);
  assert.match(script, /recognizeButton\.addEventListener\(["']click["']/u);
  assert.match(script, /cancelRecognitionButton\.addEventListener\(["']click["']/u);
  assert.match(script, /solveButton\.addEventListener\(["']click["']/u);
  assert.match(script, /discardButton\.addEventListener\(["']click["']/u);
  assert.match(script, /showManualCandidateFallback\(\)/u);
  assert.match(script, /candidatePanel\.hidden = false/u);
  assert.match(script, /DISALLOWED_INVISIBLE_CHARACTERS/u);
  assert.doesNotMatch(script, /solveWorkflow|createLearningSession|addHistory|copyText/u);
});

test("認識だけでは保存も解答開始もせず、明示操作だけが確認済み問題を渡す", async () => {
  const script = await source("js/ocr/ocr-confirm.js");
  const recognition = script.match(/async function startRecognition\(\) \{([\s\S]*?)\n\}/u)?.[1] || "";
  const submission = script.match(/async function solveCandidate\(\) \{([\s\S]*?)\n\}/u)?.[1] || "";

  assert.ok(recognition, "startRecognition body must be inspectable");
  assert.ok(submission, "solveCandidate body must be inspectable");
  assert.doesNotMatch(recognition, /setPendingQuestion|location\.replace/u);
  assert.match(recognition, /showRecognitionResult\(normalizeRecognitionResponse\(response\)\)/u);
  assert.match(submission, /setPendingQuestion\(\{[\s\S]*?source:\s*["']ocr["'][\s\S]*?ocrConfirmed:\s*true[\s\S]*?requestedMode:\s*["']answer["'][\s\S]*?autoSolve:\s*true/u);
  assert.match(submission, /setPendingQuestion\(\{[\s\S]*?question,[\s\S]*?problemInput,[\s\S]*?source:\s*["']ocr["']/u);
  assert.match(submission, /location\.replace\(["']popup\.html["']\)/u);
  assert.match(submission, /await discardPreview\(\)[\s\S]*?await setPendingQuestion/u);
});

test("数式OCRと手修正の由来を分離し、4項目をProblemInputへ渡す", async () => {
  const script = await source("js/ocr/ocr-confirm.js");

  assert.match(script, /candidateInput\.value\s*=\s*candidate\.formulaText/u);
  assert.doesNotMatch(script, /instructionInput\.value\s*=\s*result\.candidateText/u);
  assert.match(script, /rawOcrText\s*=\s*\[candidate\.rawInstructionText, candidate\.rawFormulaText \|\| result\.rawText\]/u);
  assert.match(script, /fieldProvenance\.formulaSource\s*=\s*candidate\.formulaSource/u);
  assert.match(script, /if \(field === ["']formula["']\) fieldProvenance\.formulaSource = ["']manual["']/u);
  assert.match(script, /fieldProvenance\.instructionSource\s*=\s*cleanText\(elements\.instructionInput\.value\)/u);
  assert.match(script, /questionLabel:\s*cleanText\(elements\.questionLabelInput\.value\)/u);
  assert.match(script, /instructionText,/u);
  assert.match(script, /formulaText,/u);
  assert.match(script, /conditions:\s*conditionLines\(elements\.conditionsInput\.value\)/u);
  assert.match(script, /source:\s*["']ocr["']/u);
  assert.match(script, /instructionSource:\s*instructionText/u);
  assert.match(script, /formulaSource:\s*fieldProvenance\.formulaSource === ["']ocr["'] \? ["']ocr["'] : ["']manual["']/u);
  for (const id of ["questionLabelInput", "instructionInput", "candidateInput", "conditionsInput"]) {
    assert.match(script, new RegExp(`elements\\.${id}\\.addEventListener\\(["']input["']`, "u"));
  }
});

test("応答を文字列挿入せず、外部画像URLをfail closedにする", async () => {
  const script = await source("js/ocr/ocr-confirm.js");

  assert.match(script, /\.textContent\s*=/u);
  assert.match(script, /startsWith\(["']blob:["']\)/u);
  assert.match(script, /data:image\/png;base64,/u);
  assert.match(script, /parsed\.href\.startsWith\(`blob:\$\{globalThis\.location\.origin\}\/`\)/u);
  assert.match(script, /payload\.startsWith\(["']iVBORw0KGgo["']\)/u);
  assert.match(script, /外部URLのプレビュー画像は表示できません/u);
  assert.match(script, /availability\.available\s*===\s*true/u);
  assert.match(script, /confirmationRequired\s*!==\s*true/u);
  assert.match(script, /new Set\(\[["']webgpu["'],\s*["']wasm["']\]\)/u);
  assert.match(script, /expiresAt:\s*previewExpiryTimestamp\(result\.expiresAt\)/u);
  assert.match(script, /previewExpiryTimer\s*=\s*globalThis\.setTimeout/u);
  assert.match(script, /function expirePreview\(\)[\s\S]*?clearPreviewSource\(\)[\s\S]*?discardAndClose\(\)/u);
  assert.match(script, /elements\.image\.removeAttribute\(["']src["']\)/u);
  assert.match(script, /image\.addEventListener\(["']error["']/u);
  assert.doesNotMatch(script, /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write/u);
  assert.doesNotMatch(script, /\beval\s*\(|new\s+Function\b/u);
  assert.doesNotMatch(script, /elements\.image\.src\s*=\s*result\.previewUrl/u);
});

test("認識失敗時も候補欄を開き、手入力を明示確定へ渡せる", async () => {
  const script = await source("js/ocr/ocr-confirm.js");
  const failure = script.match(/if \(!cancelled\) \{([\s\S]*?)\n\s*\}/u)?.[1] || "";
  assert.match(failure, /showManualCandidateFallback\(\)/u);
  assert.match(failure, /setRecognitionError\(/u);
  assert.match(failure, /candidateInput\.focus\(\)/u);
  assert.match(script, /DISALLOWED_INVISIBLE_CHARACTERS\s*=\s*\/[^/]*\\u202A[^/]*\\u2066/u);
});

test("専用CSSは狭い画面と状態表示を扱う", async () => {
  const css = await source("css/ocr-confirm.css");

  assert.match(css, /\.preview-frame\b/u);
  assert.match(css, /\.preview-frame\[data-state=["']error["']\]/u);
  assert.match(css, /\.capture-details\b/u);
  assert.match(css, /\.candidate-panel\b/u);
  assert.match(css, /\.candidate-fields\b/u);
  assert.match(css, /\.candidate-formula-field\b/u);
  assert.match(css, /\.runtime-details\b/u);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/u);
  assert.doesNotMatch(css, /url\s*\(/iu);
});
