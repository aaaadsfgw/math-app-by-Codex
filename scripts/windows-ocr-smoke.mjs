// Run with npm.cmd exec --no -- electron scripts/windows-ocr-smoke.mjs
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, protocol, session } from "electron";
import { createLocalOcr, registerOcrScheme } from "../desktop/services/local-ocr.js";

registerOcrScheme(protocol);
if (process.argv.includes("--force-wasm")) app.disableHardwareAcceleration();

const examples = [
  { label: "(1)", numerator: "x²−5x+6", denominator: "x−2", id: "fraction" },
  { formula: "3a(2a−b)−2b(a+3b)", id: "implicit-multiplication" },
  { label: "(1)", numerator: "2ab(a+b)", denominator: "4a", id: "fraction-and-multiplication" },
  { formula: "2+3", expectedFormula: "2+3", id: "simple-formula" },
  { instruction: "次の式を計算しなさい", formula: "2+3", id: "japanese-instruction" },
];

const fractionFixture = fileURLToPath(new URL("../tests/browser/fraction-ocr-capture-harness.html", import.meta.url));

function renderExample({ label, numerator, denominator, formula, instruction }) {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = numerator || instruction ? 180 : 100;
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "black";
  context.font = "38px Cambria Math";
  context.textBaseline = "middle";
  if (numerator) {
    const fractionX = 105;
    const width = Math.max(context.measureText(numerator).width, context.measureText(denominator).width) + 14;
    if (label) context.fillText(label, 22, 90);
    context.fillRect(fractionX, 87, width, 2);
    context.textAlign = "center";
    context.fillText(numerator, fractionX + width / 2, 55);
    context.fillText(denominator, fractionX + width / 2, 125);
  } else {
    if (instruction) {
      context.font = '32px "Yu Gothic", sans-serif';
      context.fillText(instruction, 22, 44);
      context.font = "38px Cambria Math";
    }
    context.fillText(formula, 22, instruction ? 125 : 50);
  }
  return canvas.toDataURL("image/png").split(",")[1];
}

async function run() {
  const ocr = createLocalOcr({ BrowserWindow, ipcMain, session });
  const source = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  let failed = false;
  try {
    await source.loadURL("about:blank");
    const pixels = await source.webContents.executeJavaScript(
      `(${renderExample})(${JSON.stringify(examples.at(-1))})`,
    );
    const png = Buffer.from(pixels, "base64");
    const oversized = Buffer.from(png);
    oversized.writeUInt32BE(9_000, 16);
    await assert.rejects(ocr.recognize(oversized), { code: "OCR_IMAGE_INVALID" });
    const controller = new AbortController();
    const pending = ocr.recognize(png, { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, { code: "OCR_CANCELLED" });
    await assert.rejects(ocr.recognize(png, { timeoutMs: 1 }), { code: "OCR_TIMEOUT" });
    console.log("PASS: oversized PNG rejected, abort and deadline release the Electron OCR host");
    for (const example of examples) {
      const pixels = await source.webContents.executeJavaScript(
        `(${renderExample})(${JSON.stringify(example)})`,
      );
      try {
        const result = await ocr.recognize(Buffer.from(pixels, "base64"));
        if (example.expectedFormula) {
          assert.equal(result.structuredCandidate.formulaText.replace(/\s+/gu, ""), example.expectedFormula);
        }
        if (example.instruction) {
          assert.equal(result.structuredCandidate.instructionText, example.instruction);
          assert.equal(result.structuredCandidate.formulaText.replace(/\s+/gu, ""), example.formula);
          assert.equal(result.structuredCandidate.instructionIntent, "simplify");
        }
        console.log(JSON.stringify({
          id: example.id,
          kind: result.recognitionKind,
          provider: result.provider,
          candidate: result.structuredCandidate,
          warnings: result.warnings,
        }));
      } catch (error) {
        failed = true;
        console.error(JSON.stringify({ id: example.id, code: error.code, message: error.message }));
      }
    }
    await source.loadFile(fractionFixture);
    const fractionPixels = await source.webContents.executeJavaScript(
      'document.querySelector("#ocrCaptureTarget").toDataURL("image/png").split(",")[1]',
    );
    try {
      const fraction = await ocr.recognize(Buffer.from(fractionPixels, "base64"));
      const formulaText = fraction.structuredCandidate.formulaText;
      console.log(JSON.stringify({
        id: "reference-fraction",
        provider: fraction.provider,
        formulaText,
        matchesExpected: formulaText.replace(/\s+/gu, "") === "((X)/(2))=3",
      }));
    } catch (error) {
      console.log(JSON.stringify({ id: "reference-fraction", code: error.code, message: error.message }));
    }
  } finally {
    ocr.close();
    source.destroy();
  }
  app.exit(failed ? 1 : 0);
}

void app.whenReady().then(run).catch((error) => {
  console.error(error);
  app.exit(1);
});
