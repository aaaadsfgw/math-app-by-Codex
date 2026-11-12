import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { cpus, tmpdir, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { app, BrowserWindow, ipcMain, protocol, session } from "electron";
import { createLocalOcr, registerOcrScheme } from "../../desktop/services/local-ocr.js";
import { convertMfrLatex } from "../../desktop/services/mfr-latex.js";
import { createOcrWorkflow } from "../../desktop/services/ocr-workflow.js";
import { createPix2TextService } from "../../desktop/services/pix2text.js";
import { compareStructure } from "./structure.mjs";

const [, , output, pythonPath, modelDirectory] = process.argv;
if (!output || Boolean(pythonPath) !== Boolean(modelDirectory)) {
  throw new Error("Usage: electron bench/ocr/run-windows-phase3.mjs output.json [python.exe model-directory]");
}
registerOcrScheme(protocol);
app.disableHardwareAcceleration();
app.setPath("userData", await mkdtemp(join(tmpdir(), "math-study-log-phase3-bench-")));
app.on("window-all-closed", () => {});
const pix2text = createPix2TextService(pythonPath ? {
  pythonPath: resolve(pythonPath), modelDirectory: resolve(modelDirectory),
} : {});
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const literalInstruction = (value) => value.normalize("NFKC").replace(/[\s。]+/gu, "");
const summarize = (items) => Object.fromEntries(["raw_match", "structural_match", "operator_error",
  "structure_error", "label_match", "instruction_match", "complete_match", "review_warning", "copyable"]
  .map((key) => [key, items.filter((item) => item[key] === true).length]));

async function loadCorpus(directory) {
  const data = new URL(`./${directory}/`, import.meta.url);
  const manifest = (await readFile(new URL("manifest.json", data), "utf8")).replaceAll("\r\n", "\n");
  return { data, sha: sha256(manifest), cases: JSON.parse(manifest).cases };
}

async function readFixture(corpus, item, formulaOnly) {
  const png = await readFile(new URL(formulaOnly ? item.formulaImage : item.image, corpus.data));
  assert.equal(sha256(png), formulaOnly ? item.formulaSha256 : item.sha256, item.id);
  return png;
}

function score(item, { latex = "", formula = "", label = "", instruction = "", ...evidence }) {
  const match = compareStructure(item.canonical, formula);
  const labelMatch = item.label === label;
  const instructionMatch = literalInstruction(item.instruction) === literalInstruction(instruction);
  return { id: item.id, expected: { formula: item.canonical, label: item.label, instruction: item.instruction },
    latex, formula, label, instruction, raw_match: compareStructure(item.canonical, latex, { latex: true }).structural_match,
    ...match, label_match: labelMatch, instruction_match: instructionMatch,
    complete_match: match.structural_match && labelMatch && instructionMatch,
    ...evidence };
}

async function formulaCase(corpus, item) {
  const png = await readFixture(corpus, item, true);
  const target = { ...item, label: "", instruction: "" };
  const started = performance.now();
  try {
    const { latex, metrics } = await pix2text.recognize(png);
    let formula = "";
    let conversionError;
    const conversionStarted = performance.now();
    try {
      formula = convertMfrLatex(latex);
    } catch (error) {
      conversionError = error.message;
    }
    return score(target, { latex, formula, conversionError, metrics: {
      ...metrics, conversionMs: performance.now() - conversionStarted, totalMs: performance.now() - started,
    } });
  } catch (error) {
    return score(target, { error: error.message });
  }
}

async function pipelineCase(ocr, corpus, item) {
  const png = await readFixture(corpus, item, false);
  let copied;
  let result;
  const workflow = createOcrWorkflow({
    capture: { select: async () => png },
    recognize: async (image, options) => {
      result = await ocr.recognize(image, { ...options, model: "pix2text" });
      return result;
    },
    clipboard: { writeText: (text) => { copied = text; } },
    isCalculationBusy: () => false,
    onChange() {},
    notify() {},
  });
  await workflow.start();
  const state = workflow.getState();
  assert.equal(copied, undefined, "OCR must await an explicit copy action");
  const candidate = state.preview;
  if (state.phase !== "review") return score(item, { error: state.message });
  await workflow.copy(candidate.id, candidate.text);
  return score(item, {
    latex: candidate.rawFormula, formula: candidate.formula, label: candidate.label, instruction: candidate.instruction,
    raw_instruction: candidate.rawInstruction, warnings: candidate.warnings, review_warning: candidate.warnings.length > 0,
    copyable: copied === candidate.text, candidate: candidate.text, metrics: workflow.getState().preview.metrics,
    layout: result.layout,
  });
}

async function run() {
  assert.ok(pix2text.isAvailable(), "Run Windows setup or provide the isolated benchmark environment.");
  const baseline = await loadCorpus("data");
  const unseen = await loadCorpus("phase3-data");
  const ocr = createLocalOcr({ BrowserWindow, ipcMain, session, pix2text });
  const groups = { formula: [], mixed: [], unseen: [] };
  try {
    for (const item of baseline.cases) groups.formula.push(await formulaCase(baseline, item));
    for (const item of baseline.cases.filter(({ image, formulaImage }) => image !== formulaImage)) {
      groups.mixed.push(await pipelineCase(ocr, baseline, item));
    }
    for (const item of unseen.cases) groups.unseen.push(await pipelineCase(ocr, unseen, item));
  } finally {
    ocr.close();
    pix2text.close();
  }
  const totals = Object.fromEntries(Object.entries(groups).map(([name, items]) =>
    [name, { n: items.length, ...summarize(items) }]));
  await writeFile(resolve(output), JSON.stringify({
    environment: { platform: process.platform, arch: process.arch, cpu: cpus()[0].model, ramBytes: totalmem(),
      electron: process.versions.electron, chromium: process.versions.chrome },
    fixture_hashes: { baseline: baseline.sha, unseen: unseen.sha }, totals, groups,
  }, null, 2) + "\n");
  console.table(totals);
}

void app.whenReady().then(run).then(() => app.quit(), (error) => {
  console.error(error);
  app.exit(1);
});
