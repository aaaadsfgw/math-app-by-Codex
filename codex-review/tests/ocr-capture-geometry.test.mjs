import assert from "node:assert/strict";
import test from "node:test";

import {
  OCR_CAPTURE_MIN_CSS_SIZE,
  OcrCaptureGeometryError,
  planScreenshotCrop,
  validateViewportSelection,
} from "../js/ocr/capture-geometry.js";

function assertGeometryError(code) {
  return (error) => error instanceof OcrCaptureGeometryError && error.code === code;
}

test("viewport内の選択範囲をCSS座標のまま検証する", () => {
  const result = validateViewportSelection(
    { x: 100, y: 40, width: 240, height: 80 },
    { width: 800, height: 600, devicePixelRatio: 2 },
  );

  assert.deepEqual(result.selectionCss, { x: 100, y: 40, width: 240, height: 80 });
  assert.deepEqual(result.viewportCss, { x: 0, y: 0, width: 800, height: 600 });
  assert.equal(result.devicePixelRatio, 2);
  assert.equal(result.wasClamped, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.selectionCss), true);
});

test("逆方向dragの負の幅と高さを正規化する", () => {
  const result = validateViewportSelection(
    { x: 300, y: 200, width: -120, height: -60 },
    { width: 800, height: 600 },
  );

  assert.deepEqual(result.selectionCss, { x: 180, y: 140, width: 120, height: 60 });
  assert.deepEqual(result.originalSelectionCss, { x: 180, y: 140, width: 120, height: 60 });
  assert.equal(result.devicePixelRatio, null);
});

test("viewportから部分的にはみ出した範囲をclampする", () => {
  const result = validateViewportSelection(
    { x: -20, y: 570, width: 100, height: 80 },
    { width: 800, height: 600, devicePixelRatio: 1 },
  );

  assert.deepEqual(result.selectionCss, { x: 0, y: 570, width: 80, height: 30 });
  assert.equal(result.wasClamped, true);
});

test("既定の最小CSS寸法は縦横それぞれに適用する", () => {
  assert.equal(OCR_CAPTURE_MIN_CSS_SIZE, 24);
  assert.doesNotThrow(() => validateViewportSelection(
    { x: 0, y: 0, width: 24, height: 24 },
    { width: 100, height: 100 },
  ));

  for (const selection of [
    { x: 0, y: 0, width: 23.99, height: 30 },
    { x: 0, y: 0, width: 30, height: 23.99 },
    { x: -100, y: 0, width: 110, height: 30 },
  ]) {
    assert.throws(
      () => validateViewportSelection(selection, { width: 100, height: 100 }),
      assertGeometryError("OCR_CAPTURE_TOO_SMALL"),
    );
  }
});

test("空範囲と完全なviewport外範囲を区別して拒否する", () => {
  assert.throws(
    () => validateViewportSelection(
      { x: 10, y: 10, width: 0, height: 30 },
      { width: 100, height: 100 },
    ),
    assertGeometryError("OCR_CAPTURE_EMPTY"),
  );
  assert.throws(
    () => validateViewportSelection(
      { x: 100, y: 0, width: 30, height: 30 },
      { width: 100, height: 100 },
    ),
    assertGeometryError("OCR_CAPTURE_OUT_OF_BOUNDS"),
  );
});

test("不正なselection、viewport、DPR、最小寸法を拒否する", () => {
  for (const selection of [
    null,
    [],
    { x: "0", y: 0, width: 30, height: 30 },
    { x: 0, y: Number.NaN, width: 30, height: 30 },
    { x: Number.MAX_VALUE, y: 0, width: Number.MAX_VALUE, height: 30 },
  ]) {
    assert.throws(
      () => validateViewportSelection(selection, { width: 100, height: 100 }),
      assertGeometryError("OCR_CAPTURE_MALFORMED"),
    );
  }

  for (const viewport of [
    null,
    { width: 0, height: 100 },
    { width: 100, height: Infinity },
    { width: 100, height: 100, devicePixelRatio: 0 },
  ]) {
    assert.throws(
      () => validateViewportSelection({ x: 0, y: 0, width: 30, height: 30 }, viewport),
      assertGeometryError("OCR_CAPTURE_MALFORMED"),
    );
  }

  assert.throws(
    () => validateViewportSelection(
      { x: 0, y: 0, width: 30, height: 30 },
      { width: 100, height: 100 },
      { minCssSize: 0 },
    ),
    TypeError,
  );
});

test("DPR 2のcaptureを実pixelのcropへ写像する", () => {
  const plan = planScreenshotCrop({
    selection: { x: 100, y: 50, width: 240, height: 80 },
    viewport: { width: 800, height: 600, devicePixelRatio: 2 },
    screenshot: { width: 1600, height: 1200 },
  });

  assert.deepEqual(plan.scale, { x: 2, y: 2 });
  assert.deepEqual(plan.cropPixels, { x: 200, y: 100, width: 480, height: 160 });
  assert.equal(plan.dprMatchesScreenshot, true);
  assert.equal(Object.isFrozen(plan.cropPixels), true);
});

test("実screenshot寸法をDPRより優先し各軸を独立にscaleする", () => {
  const plan = planScreenshotCrop({
    selection: { x: 80, y: 60, width: 160, height: 120 },
    viewport: { width: 800, height: 600, devicePixelRatio: 2 },
    screenshot: { width: 1200, height: 750 },
  });

  assert.deepEqual(plan.scale, { x: 1.5, y: 1.25 });
  assert.deepEqual(plan.cropPixels, { x: 120, y: 75, width: 240, height: 150 });
  assert.equal(plan.dprMatchesScreenshot, false);
});

test("fractional座標は選択全体を含むようleft/topをfloorしright/bottomをceilする", () => {
  const plan = planScreenshotCrop({
    selection: { x: 10.2, y: 20.4, width: 20.2, height: 30.2 },
    viewport: { width: 100, height: 100, devicePixelRatio: 1.5 },
    screenshot: { width: 150, height: 150 },
  }, { minCssSize: 1 });

  assert.deepEqual(plan.cropPixels, { x: 15, y: 30, width: 31, height: 46 });
});

test("clamp後のpixel cropはscreenshot境界を越えない", () => {
  const plan = planScreenshotCrop({
    selection: { x: 75, y: 70, width: 50, height: 60 },
    viewport: { width: 100, height: 100, devicePixelRatio: 2 },
    screenshot: { width: 199, height: 201 },
  });

  assert.deepEqual(plan.selectionCss, { x: 75, y: 70, width: 25, height: 30 });
  assert.deepEqual(plan.cropPixels, { x: 149, y: 140, width: 50, height: 61 });
  assert.equal(plan.wasClamped, true);
});

test("不正または空のscreenshot寸法を拒否する", () => {
  const common = {
    selection: { x: 0, y: 0, width: 30, height: 30 },
    viewport: { width: 100, height: 100 },
  };

  for (const screenshot of [
    undefined,
    { width: 0, height: 100 },
    { width: 100.5, height: 100 },
    { width: 100, height: Number.NaN },
  ]) {
    assert.throws(
      () => planScreenshotCrop({ ...common, screenshot }),
      assertGeometryError("OCR_CAPTURE_MALFORMED"),
    );
  }
});
