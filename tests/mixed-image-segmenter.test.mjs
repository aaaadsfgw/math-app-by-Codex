import assert from "node:assert/strict";
import test from "node:test";

import { segmentOcrImageBlob } from "../js/ocr/mixed-image-segmenter.js";

function image(width, height, rectangles = []) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = 255;
  }
  for (const rectangle of rectangles) {
    for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
      for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
      }
    }
  }
  return { width, height, data };
}

function fakeBrowserImage(source) {
  const bitmap = {
    width: source.width,
    height: source.height,
    close() {},
  };
  return {
    createImageBitmap: async () => bitmap,
    createCanvas(width, height) {
      let crop = null;
      return {
        width,
        height,
        getContext() {
          return {
            drawImage(...args) {
              if (args.length >= 9) {
                crop = Object.freeze({
                  x: args[1],
                  y: args[2],
                  width: args[3],
                  height: args[4],
                });
              }
            },
            getImageData() {
              return source;
            },
          };
        },
        async convertToBlob() {
          return new Blob([
            JSON.stringify(crop ?? { x: 0, y: 0, width, height }),
          ], { type: "image/png" });
        },
      };
    },
  };
}

test("狭い左端component候補を実cropへ変換しprefixとremainderを重ねない", async () => {
  const source = image(240, 100, [
    { x: 8, y: 8, width: 190, height: 17 },
    { x: 10, y: 60, width: 4, height: 18 },
    { x: 18, y: 60, width: 7, height: 18 },
    { x: 29, y: 60, width: 4, height: 18 },
    { x: 38, y: 57, width: 150, height: 24 },
  ]);
  const segmented = await segmentOcrImageBlob(
    new Blob([new Uint8Array([1])], { type: "image/png" }),
    fakeBrowserImage(source),
  );
  const completeLabel = segmented.leadingSplits.find(
    (candidate) => candidate.evidence.componentCount === 3,
  );
  assert.ok(completeLabel);
  assert.equal(completeLabel.gap, 5);
  assert.ok(
    completeLabel.prefix.bounds.x + completeLabel.prefix.bounds.width
      <= completeLabel.remainder.bounds.x,
  );
  assert.deepEqual(
    JSON.parse(await completeLabel.prefix.blob.text()),
    completeLabel.prefix.bounds,
  );
  assert.deepEqual(
    JSON.parse(await completeLabel.remainder.blob.text()),
    completeLabel.remainder.bounds,
  );
  assert.equal(segmented.leadingSplit, segmented.leadingSplits[0]);
});

test("segmenterは過剰候補と重なるcropを拒否する", async () => {
  const source = image(80, 40, [{ x: 8, y: 8, width: 60, height: 18 }]);
  const browserImage = fakeBrowserImage(source);
  const region = Object.freeze({ x: 4, y: 4, width: 70, height: 30, inkPixels: 40 });
  const base = {
    regionIndex: 0,
    gap: 2,
    requiredGap: 2,
    prefix: { x: 4, y: 4, width: 20, height: 30 },
    remainder: { x: 20, y: 4, width: 54, height: 30 },
  };
  await assert.rejects(
    segmentOcrImageBlob(
      new Blob([new Uint8Array([1])], { type: "image/png" }),
      {
        ...browserImage,
        analyzeLayout: () => ({
          regions: [region],
          leadingSplitCandidates: [base],
        }),
      },
    ),
    (error) => error.code === "MIXED_OCR_SEGMENTATION_INVALID",
  );

  await assert.rejects(
    segmentOcrImageBlob(
      new Blob([new Uint8Array([1])], { type: "image/png" }),
      {
        ...browserImage,
        analyzeLayout: () => ({
          regions: [region],
          leadingSplitCandidates: Array.from({ length: 7 }, () => ({
            ...base,
            prefix: { ...base.prefix, width: 12 },
            remainder: { ...base.remainder, x: 24 },
          })),
        }),
      },
    ),
    (error) => error.code === "MIXED_OCR_SEGMENTATION_INVALID",
  );
});
