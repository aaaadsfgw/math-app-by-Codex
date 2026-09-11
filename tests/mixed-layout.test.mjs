import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeHorizontalOcrLayout,
  MixedOcrLayoutError,
} from "../js/ocr/mixed-layout.js";

function image(width, height, rectangles = [], { background = 255, foreground = 0 } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = background;
    data[offset + 1] = background;
    data[offset + 2] = background;
    data[offset + 3] = 255;
  }
  for (const { x, y, width: rectWidth, height: rectHeight } of rectangles) {
    for (let row = y; row < y + rectHeight; row += 1) {
      for (let column = x; column < x + rectWidth; column += 1) {
        const offset = (row * width + column) * 4;
        data[offset] = foreground;
        data[offset + 1] = foreground;
        data[offset + 2] = foreground;
      }
    }
  }
  return { width, height, data };
}

test("1つの連続した印刷領域はsingle-regionとして残す", () => {
  const result = analyzeHorizontalOcrLayout(image(160, 50, [
    { x: 12, y: 12, width: 120, height: 18 },
  ]));
  assert.equal(result.kind, "single-region");
  assert.equal(result.regions.length, 1);
  assert.equal(result.regions[0].x, 10);
  assert.equal(result.regions[0].y, 10);
});

test("crop端に混入した1pxのフレーム線を独立した文字行にしない", () => {
  for (const edgeY of [0, 120]) {
    const result = analyzeHorizontalOcrLayout(image(290, 121, [
      { x: 35, y: 30, width: 210, height: 48 },
      { x: 0, y: edgeY, width: 290, height: 1 },
    ]));
    assert.equal(result.kind, "single-region", String(edgeY));
    assert.equal(result.regions.length, 1, String(edgeY));
  }
});

test("日本語行と下側の数式を強い空白で2領域へ分ける", () => {
  const result = analyzeHorizontalOcrLayout(image(220, 100, [
    { x: 8, y: 8, width: 190, height: 17 },
    { x: 36, y: 58, width: 120, height: 24 },
  ]));
  assert.equal(result.kind, "separated-regions");
  assert.equal(result.regions.length, 2);
  assert.ok(result.separators[0].gap >= result.separators[0].requiredGap);
  assert.ok(result.regions[0].y < result.regions[1].y);
});

test("mixed数式行の左端に十分離れた小領域がある場合だけ位置候補を返す", () => {
  const result = analyzeHorizontalOcrLayout(image(240, 100, [
    { x: 8, y: 8, width: 190, height: 17 },
    { x: 10, y: 60, width: 4, height: 18 },
    { x: 18, y: 60, width: 7, height: 18 },
    { x: 29, y: 60, width: 4, height: 18 },
    { x: 58, y: 57, width: 150, height: 24 },
  ]));

  assert.equal(result.regions.length, 2);
  assert.equal(result.leadingSplitCandidate.regionIndex, 1);
  assert.ok(
    result.leadingSplitCandidate.gap >= result.leadingSplitCandidate.requiredGap,
  );
  assert.ok(
    result.leadingSplitCandidate.prefix.x
      + result.leadingSplitCandidate.prefix.width
      < result.leadingSplitCandidate.remainder.x,
  );
});

test("単一行ではより強い空白だけを意味未確定の左端候補として返す", () => {
  const single = analyzeHorizontalOcrLayout(image(200, 50, [
    { x: 8, y: 10, width: 20, height: 18 },
    { x: 55, y: 10, width: 120, height: 18 },
  ]));
  assert.equal(single.regions.length, 1);
  assert.equal(single.leadingSplitCandidate.regionIndex, 0);
  assert.ok(single.leadingSplitCandidate.gap >= single.leadingSplitCandidate.requiredGap);

  const mixedWithoutGap = analyzeHorizontalOcrLayout(image(220, 100, [
    { x: 8, y: 8, width: 180, height: 17 },
    { x: 24, y: 58, width: 160, height: 24 },
  ]));
  assert.equal(mixedWithoutGap.leadingSplitCandidate, null);
});

test("近接する分子・分数線・分母は1つの数式領域から分裂させない", () => {
  const result = analyzeHorizontalOcrLayout(image(220, 110, [
    { x: 8, y: 7, width: 190, height: 16 },
    { x: 70, y: 62, width: 35, height: 6 },
    { x: 58, y: 70, width: 62, height: 2 },
    { x: 66, y: 74, width: 44, height: 7 },
  ]));
  assert.equal(result.regions.length, 2);
  assert.ok(result.regions[1].height >= 23);
});

test("2行の指示と1つの数式は最大3領域として保持する", () => {
  const result = analyzeHorizontalOcrLayout(image(220, 150, [
    { x: 8, y: 7, width: 180, height: 14 },
    { x: 8, y: 43, width: 160, height: 14 },
    { x: 34, y: 100, width: 135, height: 24 },
  ]));
  assert.equal(result.regions.length, 3);
});

test("4つ以上の独立領域は複数数式の可能性としてfail closedにする", () => {
  assert.throws(
    () => analyzeHorizontalOcrLayout(image(180, 180, [
      { x: 8, y: 5, width: 140, height: 12 },
      { x: 8, y: 45, width: 140, height: 12 },
      { x: 8, y: 85, width: 100, height: 12 },
      { x: 8, y: 125, width: 100, height: 12 },
    ])),
    (error) => error instanceof MixedOcrLayoutError
      && error.code === "MIXED_OCR_LAYOUT_MULTIPLE_FORMULAS",
  );
});

test("暗い背景の明るい文字にも対応し空画像は拒否する", () => {
  const dark = analyzeHorizontalOcrLayout(image(120, 40, [
    { x: 10, y: 10, width: 80, height: 14 },
  ], { background: 20, foreground: 245 }));
  assert.equal(dark.regions.length, 1);

  assert.throws(
    () => analyzeHorizontalOcrLayout(image(120, 40)),
    (error) => error.code === "MIXED_OCR_LAYOUT_EMPTY",
  );
});

test("pixel dataと閾値を厳格に検証する", () => {
  assert.throws(
    () => analyzeHorizontalOcrLayout({ width: 2, height: 2, data: new Uint8Array(3) }),
    (error) => error.code === "MIXED_OCR_PIXEL_DATA_INVALID",
  );
  assert.throws(() => analyzeHorizontalOcrLayout(image(20, 20), { contrastThreshold: 10 }), TypeError);
});
