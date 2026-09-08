import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const overlayUrl = new URL("../js/ocr/capture-overlay.js", import.meta.url);
const source = await readFile(overlayUrl, "utf8");

test("capture overlay remains a classic, idempotent, on-demand script", () => {
  assert.match(source, /^\(\(\) => \{/);
  assert.doesNotMatch(source, /^\s*(?:import|export)\s/m);
  assert.match(source, /if \(window !== window\.top\) return/);
  assert.match(source, /if \(globalThis\[INSTALL_KEY\]\) return/);
  assert.match(source, /message\.type === MESSAGE\.begin/);
  assert.doesNotMatch(source, /createOverlay\([^)]*\);\s*\}\)\(\)/);
});

test("capture UI keeps a dialog top layer while isolating content in a shadow-capable surface", () => {
  assert.match(source, /document\.createElement\("dialog"\)/);
  assert.match(source, /host\.showModal\(\)/);
  assert.match(source, /const surface = document\.createElement\("div"\)/);
  assert.match(source, /surface\.attachShadow\(\{ mode: "closed" \}\)/);
  assert.doesNotMatch(source, /host\.attachShadow\(/);
  assert.match(source, /host\.append\(surface\)/);
  assert.doesNotMatch(source, /\.innerHTML\b/);
  assert.doesNotMatch(source, /\beval\s*\(|new\s+Function\b/);
  assert.match(source, /textContent = text/);
});

test("selection only starts from a trusted primary left-button pointer", () => {
  assert.match(
    source,
    /!event\.isTrusted \|\| !event\.isPrimary \|\| event\.button !== 0/,
  );
  assert.match(source, /state\.pointerId !== null/);
  assert.match(source, /state\.shield\.setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /Math\.min\(firstX, secondX\)/);
  assert.match(source, /Math\.abs\(secondX - firstX\)/);
});

test("too-small ranges stay selectable and explain the 24 CSS px minimum", () => {
  assert.match(source, /const MIN_SELECTION_CSS_PX = 24/);
  assert.match(
    source,
    /selection\.width < MIN_SELECTION_CSS_PX \|\| selection\.height < MIN_SELECTION_CSS_PX/,
  );
  assert.match(source, /もう一度選べます/);
  assert.match(source, /showSelection\(state, selection, "invalid"\)/);
});

test("overlay blocks page interaction and Esc removes it before notifying background", () => {
  for (const eventName of [
    "pointerdown",
    "pointermove",
    "pointerup",
    "keydown",
    "wheel",
    "touchmove",
    "contextmenu",
    "dragstart",
    "selectstart",
  ]) {
    assert.match(source, new RegExp(`addWindowListener\\(state, "${eventName}"`));
  }
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /event\.isTrusted && event\.key === "Escape"/);
  assert.match(source, /host\.addEventListener\("cancel"/);
  assert.match(
    source,
    /function cancelFromUser[\s\S]*?cleanup\(state\);[\s\S]*?sendBackgroundMessage/,
  );
});

test("protocol names and routing are explicit", () => {
  for (const type of [
    "BEGIN_OCR_SELECTION",
    "PREPARE_OCR_SCREENSHOT",
    "OCR_CAPTURE_COMPLETE",
    "CANCEL_OCR_CAPTURE",
    "SUBMIT_OCR_SELECTION",
  ]) {
    assert.match(source, new RegExp(`"${type}"`));
  }
  assert.match(source, /const PROTOCOL_VERSION = 1/);
  assert.match(source, /const BACKGROUND_TARGET = "math-study-log-background"/);
  assert.match(source, /protocolVersion: PROTOCOL_VERSION/);
  assert.match(source, /target: BACKGROUND_TARGET/);
  assert.match(source, /message\.target !== BACKGROUND_TARGET/u);
  assert.match(source, /sender\?\.id !== chrome\.runtime\.id/u);
  assert.match(source, /!validCaptureId\(message\.captureId\)/u);
  assert.match(source, /message\.captureId !== state\.captureId/u);
  assert.match(source, /validBeginMetadata\(message\)/u);
});

test("screenshot preparation hides chrome but keeps a transparent shield for two frames", () => {
  assert.match(source, /removeModalBackdropForScreenshot\(state\)/);
  assert.match(source, /host\.close\(\)/);
  assert.match(source, /host\.show\(\)/);
  assert.match(source, /state\.host\.dataset\.captureReady = "true"/);
  assert.match(source, /\.capture-chrome \{ display: none !important; \}/);
  assert.match(source, /\.shield \{[\s\S]*?background: transparent !important/);
  assert.match(
    source,
    /requestAnimationFrame\(\(\) => \{\s*requestAnimationFrame\(\(\) => \{/,
  );
  assert.match(source, /state\.phase = "capture-ready"/);
  assert.match(source, /sendResponse\(\{\s*ok: true,[\s\S]*?selection: state\.selection/);
});

test("completion and background cancellation both clean up immediately", () => {
  assert.match(
    source,
    /message\.type === MESSAGE\.complete \|\| message\.type === MESSAGE\.cancel/,
  );
  assert.match(source, /cleanup\(state\);\s*sendResponse\(\{ ok: true \}\)/);
  assert.match(source, /state\.host\.remove\(\)/);
});

test("backgroundのerror応答でも透明shieldを残さず終了する", () => {
  assert.match(source, /pending\.then\(\(response\) => \{/u);
  assert.match(source, /response\?\.ok === false/u);
  assert.match(source, /cancelFromUser\(state, "background-rejected"\)/u);
});

test("BEGINの期限とscreenshot watchdogで放置shieldを自動解除する", () => {
  assert.match(source, /Date\.parse\(beginMessage\?\.expiresAt\)/u);
  assert.match(source, /cancelFromUser\(state, "capture-expired"\)/u);
  assert.match(source, /const SCREENSHOT_WATCHDOG_MS = 30_000/u);
  assert.match(source, /cancelFromUser\(state, "background-timeout"\)/u);
  assert.match(source, /cancelFromUser\(state, "screenshot-timeout"\)/u);
  assert.match(source, /window\.clearTimeout\(state\.expiryTimer\)/u);
  assert.match(source, /window\.clearTimeout\(state\.watchdogTimer\)/u);
});
