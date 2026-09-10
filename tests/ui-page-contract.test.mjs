import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const pageContracts = [
  ["popup.html", "js/popup.js"],
  ["panel-launcher.html", "js/panel-launcher.js"],
  ["analytics.html", "js/analytics.js"],
  ["history.html", "js/history.js"],
  ["settings.html", "js/settings.js"],
  ["ocr-confirm.html", "js/ocr/ocr-confirm.js"],
];

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

function attributeValues(html, attribute) {
  const pattern = new RegExp(`\\b${attribute}=["']([^"']+)["']`, "gu");
  return [...html.matchAll(pattern)].map((match) => match[1]);
}

test("learning UI pages have unique IDs and valid label targets", async () => {
  for (const [htmlPath] of pageContracts) {
    const html = await source(htmlPath);
    const ids = attributeValues(html, "id");
    assert.equal(new Set(ids).size, ids.length, `${htmlPath} has duplicate IDs`);
    const idSet = new Set(ids);
    for (const target of attributeValues(html, "for")) {
      assert.ok(idSet.has(target), `${htmlPath} label target #${target} does not exist`);
    }
    for (const target of attributeValues(html, "aria-describedby")) {
      for (const id of target.split(/\s+/u)) {
        assert.ok(idSet.has(id), `${htmlPath} description target #${id} does not exist`);
      }
    }
  }
});

test("literal document ID selectors match elements in their page", async () => {
  for (const [htmlPath, scriptPath] of pageContracts) {
    const [html, script] = await Promise.all([source(htmlPath), source(scriptPath)]);
    const idSet = new Set(attributeValues(html, "id"));
    const selectors = [...script.matchAll(/document\.querySelector\(["']#([A-Za-z][\w:-]*)["']\)/gu)]
      .map((match) => match[1]);
    assert.ok(selectors.length > 0, `${scriptPath} should declare ID selectors`);
    for (const id of selectors) {
      assert.ok(idSet.has(id), `${scriptPath} references missing ${htmlPath}#${id}`);
    }
  }
});

test("v2 learning controls and metadata regions remain wired", async () => {
  const [popup, settings, history, analytics, scripts] = await Promise.all([
    source("popup.html"),
    source("settings.html"),
    source("history.html"),
    source("analytics.html"),
    Promise.all(pageContracts.map(([, scriptPath]) => source(scriptPath))),
  ]);

  for (const id of [
    "learningMode",
    "shortcutAction",
    "saveHistory",
    "ocrAvailabilityInfo",
    "ocrBackendInfo",
    "ocrModelInfo",
  ]) {
    assert.match(settings, new RegExp(`id=["']${id}["']`, "u"));
  }
  for (const id of [
    "learningModeStatus",
    "questionLabelInput",
    "instructionInput",
    "ocrButton",
    "ocrStatus",
    "inputSourceStatus",
    "outputActions",
  ]) {
    assert.match(popup, new RegExp(`id=["']${id}["']`, "u"));
  }
  const outputModes = attributeValues(popup, "data-output-mode");
  assert.deepEqual(outputModes, ["hint1", "hint2", "steps", "answer", "explain"]);
  assert.doesNotMatch(popup, /id=["']ocrButton["'][^>]*\bdisabled\b/u);
  assert.match(scripts[0], /START_OCR_CAPTURE/u);
  assert.match(scripts[0], /ocrButton\.addEventListener\(["']click["']/u);
  assert.match(scripts[0], /pending\.autoSolve\s*===\s*true/u);
  assert.match(scripts[0], /await runOutputMode\(requestedMode\)/u);
  assert.match(scripts[0], /ocrConfirmed:\s*typeof pending === ["']object["'] && pending\.ocrConfirmed === true/u);
  assert.match(history, /id=["']sourceFilter["']/u);
  assert.match(analytics, /id=["']categoryAnalytics["'][^>]*role=["']list["']/u);
  for (const script of scripts) assert.doesNotMatch(script, /\.innerHTML\b/u);
});

test("workspace action opens the persistent Side Panel and keeps the compact flow visible", async () => {
  const [manifest, background, popup] = await Promise.all([
    source("manifest.json"),
    source("js/background.js"),
    source("popup.html"),
  ]);
  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.side_panel?.default_path, "popup.html");
  assert.equal(parsedManifest.action?.default_popup, "panel-launcher.html");
  assert.ok(Number(parsedManifest.minimum_chrome_version) >= 114);
  assert.ok(parsedManifest.permissions.includes("sidePanel"));
  assert.doesNotMatch(background, /setPanelBehavior\(/u);
  assert.match(popup, /class=["'][^"']*workflow-steps/u);
  const launcher = await source("panel-launcher.html");
  const launcherScript = await source("js/panel-launcher.js");
  assert.match(launcher, /id=["']openPanelButton["']/u);
  assert.match(launcherScript, /chrome\.sidePanel\.open/u);
  assert.match(launcherScript, /chrome\.tabs\.query/u);
  assert.match(popup, /id=["']problemMetaDetails["'][^>]*\bclass=["'][^"']*optional-details/u);
  assert.match(popup, /文章と数式の混在にも対応/u);
});
