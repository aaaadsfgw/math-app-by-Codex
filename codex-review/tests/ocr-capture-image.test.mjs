import assert from "node:assert/strict";
import test from "node:test";

import {
  OCR_CAPTURE_IMAGE_LIMITS,
  OcrCaptureImageError,
  createRevocablePngBlobUrl,
  cropScreenshotPng,
} from "../js/ocr/capture-image.js";

function pngHeader(width = 1600, height = 1200) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

function screenshotDataUrl(bytes = pngHeader()) {
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

function imageError(code) {
  return (error) => error instanceof OcrCaptureImageError && error.code === code;
}

function createHarness({
  width = 1600,
  height = 1200,
  decodedBytes = pngHeader(width, height),
  outputBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]),
  outputType = "image/png",
  canvasOverrides = {},
  bitmapOverrides = {},
} = {}) {
  const calls = {
    bitmapInputs: [],
    canvasSizes: [],
    drawImage: [],
    closes: 0,
    objectUrls: [],
    revokedUrls: [],
  };
  const bitmap = {
    width,
    height,
    close() {
      calls.closes += 1;
    },
    ...bitmapOverrides,
  };
  const dependencies = {
    decodeBase64() {
      return decodedBytes;
    },
    async createImageBitmap(blob) {
      calls.bitmapInputs.push(blob);
      return bitmap;
    },
    createCanvas(canvasWidth, canvasHeight) {
      calls.canvasSizes.push([canvasWidth, canvasHeight]);
      return {
        width: canvasWidth,
        height: canvasHeight,
        getContext() {
          return {
            drawImage(...args) {
              calls.drawImage.push(args);
            },
          };
        },
        async convertToBlob() {
          return new Blob([outputBytes], { type: outputType });
        },
        ...canvasOverrides,
      };
    },
    encodeBase64(bytes) {
      return Buffer.from(bytes).toString("base64");
    },
    createObjectURL(blob) {
      calls.objectUrls.push(blob);
      return `blob:ocr-${calls.objectUrls.length}`;
    },
    revokeObjectURL(url) {
      calls.revokedUrls.push(url);
    },
  };
  return { calls, dependencies, bitmap };
}

const commonInput = Object.freeze({
  screenshotDataUrl: screenshotDataUrl(),
  selection: Object.freeze({ x: 100, y: 50, width: 240, height: 80 }),
  viewport: Object.freeze({ width: 800, height: 600, devicePixelRatio: 1 }),
});

test("実画像寸法でcropを計画しdrawImageへ同じ座標を渡す", async () => {
  const { calls, dependencies, bitmap } = createHarness();
  const result = await cropScreenshotPng(commonInput, { dependencies });

  assert.equal(result.blob.type, "image/png");
  assert.deepEqual(result.plan.scale, { x: 2, y: 2 });
  assert.deepEqual(result.plan.cropPixels, { x: 200, y: 100, width: 480, height: 160 });
  assert.deepEqual(calls.canvasSizes, [[480, 160]]);
  assert.deepEqual(calls.drawImage, [[
    bitmap,
    200,
    100,
    480,
    160,
    0,
    0,
    480,
    160,
  ]]);
  assert.equal(calls.bitmapInputs.length, 1);
  assert.equal(calls.bitmapInputs[0].type, "image/png");
  assert.equal(calls.closes, 1);
  assert.deepEqual(result.source, { width: 1600, height: 1200, bytes: 33 });
  assert.deepEqual(result.crop, { width: 480, height: 160, pixels: 76800, bytes: 8 });
});

test("PNG Blobを明示的にData URLへ変換する", async () => {
  const outputBytes = new Uint8Array([1, 2, 3, 4, 5]);
  const { calls, dependencies } = createHarness({ outputBytes });
  const result = await cropScreenshotPng(
    { ...commonInput, output: "data-url" },
    { dependencies },
  );

  assert.equal(result.dataUrl, screenshotDataUrl(outputBytes));
  assert.equal(result.blob.size, outputBytes.byteLength);
  assert.equal(calls.objectUrls.length, 0);
  assert.equal(calls.closes, 1);
});

test("Blob URLには一度だけ破棄できるrevoke手段を付ける", async () => {
  const { calls, dependencies } = createHarness();
  const result = await cropScreenshotPng(
    { ...commonInput, output: "blob-url" },
    { dependencies },
  );

  assert.equal(result.blobUrl, "blob:ocr-1");
  assert.equal(typeof result.revoke, "function");
  assert.equal(calls.objectUrls[0], result.blob);
  result.revoke();
  result.revoke();
  assert.deepEqual(calls.revokedUrls, ["blob:ocr-1"]);
  assert.equal(calls.closes, 1);
});

test("Blob URL providerの不正URLはbest effortで破棄して拒否する", () => {
  const revoked = [];
  assert.throws(
    () => createRevocablePngBlobUrl(new Blob([1], { type: "image/png" }), {
      createObjectURL: () => ["https:", "//example.invalid/image.png"].join(""),
      revokeObjectURL: (url) => revoked.push(url),
    }),
    imageError("OCR_CAPTURE_BLOB_URL_FAILED"),
  );
  assert.deepEqual(revoked, [["https:", "//example.invalid/image.png"].join("")]);
});

test("任意URL・JPEG・非canonical Base64をdecoderより前に拒否する", async () => {
  let decodes = 0;
  const dependencies = { decodeBase64: () => { decodes += 1; } };
  for (const screenshot of [
    ["https:", "//example.invalid/screenshot.png"].join(""),
    "data:image/jpeg;base64,AAAA",
    "data:image/png;base64,",
    "data:image/png;base64,AA A=",
    "data:image/png;base64,AAA",
  ]) {
    await assert.rejects(
      cropScreenshotPng({ ...commonInput, screenshotDataUrl: screenshot }, { dependencies }),
      (error) => error instanceof OcrCaptureImageError,
    );
  }
  assert.equal(decodes, 0);
});

test("入力文字数と推定decoded byteの上限をdecode前に適用する", async () => {
  let decodes = 0;
  const dependencies = { decodeBase64: () => { decodes += 1; } };
  await assert.rejects(
    cropScreenshotPng(commonInput, {
      limits: { maxInputCharacters: 40 },
      dependencies,
    }),
    imageError("OCR_CAPTURE_INPUT_CHAR_LIMIT"),
  );
  await assert.rejects(
    cropScreenshotPng(commonInput, {
      limits: { maxDecodedBytes: 32 },
      dependencies,
    }),
    imageError("OCR_CAPTURE_DECODED_BYTE_LIMIT"),
  );
  assert.equal(decodes, 0);
});

test("decoderが推定値より大きいbyte列を返しても実byte上限で拒否する", async () => {
  const bytes = new Uint8Array(34);
  bytes.set(pngHeader());
  await assert.rejects(
    cropScreenshotPng(commonInput, {
      limits: { maxDecodedBytes: 33 },
      dependencies: { decodeBase64: () => bytes },
    }),
    imageError("OCR_CAPTURE_DECODED_BYTE_LIMIT"),
  );
});

test("壊れたPNG headerと画像decoder失敗を型付きで拒否する", async () => {
  const corrupt = pngHeader();
  corrupt[0] = 0;
  await assert.rejects(
    cropScreenshotPng(
      { ...commonInput, screenshotDataUrl: screenshotDataUrl(corrupt) },
      { dependencies: { decodeBase64: () => corrupt } },
    ),
    imageError("OCR_CAPTURE_PNG_INVALID"),
  );

  const bytes = pngHeader();
  await assert.rejects(
    cropScreenshotPng(commonInput, {
      dependencies: {
        decodeBase64: () => bytes,
        createImageBitmap: async () => { throw new Error("decode failed"); },
      },
    }),
    imageError("OCR_CAPTURE_IMAGE_DECODE_FAILED"),
  );
});

test("PNG headerと実bitmap寸法の不一致を拒否してbitmapを閉じる", async () => {
  const { calls, dependencies } = createHarness({
    bitmapOverrides: { width: 1599 },
  });
  await assert.rejects(
    cropScreenshotPng(commonInput, { dependencies }),
    imageError("OCR_CAPTURE_PNG_DIMENSION_MISMATCH"),
  );
  assert.equal(calls.closes, 1);
});

test("画像pixel上限はbitmap生成前、crop pixel上限は計画後に適用する", async () => {
  const smallBytes = pngHeader(100, 100);
  let bitmapCreates = 0;
  await assert.rejects(
    cropScreenshotPng(
      {
        screenshotDataUrl: screenshotDataUrl(smallBytes),
        selection: { x: 0, y: 0, width: 30, height: 30 },
        viewport: { width: 100, height: 100 },
      },
      {
        limits: { maxImagePixels: 9999 },
        dependencies: {
          decodeBase64: () => smallBytes,
          createImageBitmap: async () => { bitmapCreates += 1; },
        },
      },
    ),
    imageError("OCR_CAPTURE_IMAGE_PIXEL_LIMIT"),
  );
  assert.equal(bitmapCreates, 0);

  const { calls, dependencies } = createHarness({ width: 100, height: 100, decodedBytes: smallBytes });
  await assert.rejects(
    cropScreenshotPng(
      {
        screenshotDataUrl: screenshotDataUrl(smallBytes),
        selection: { x: 0, y: 0, width: 50, height: 50 },
        viewport: { width: 100, height: 100 },
      },
      { limits: { maxCropPixels: 2499 }, dependencies },
    ),
    imageError("OCR_CAPTURE_CROP_PIXEL_LIMIT"),
  );
  assert.equal(calls.closes, 1);
  assert.equal(calls.canvasSizes.length, 0);
});

test("空Blob・非PNG Blob・出力byte超過を拒否してbitmapを閉じる", async () => {
  for (const expectation of [
    { outputBytes: new Uint8Array(), outputType: "image/png", code: "OCR_CAPTURE_OUTPUT_INVALID" },
    { outputBytes: new Uint8Array([1]), outputType: "image/jpeg", code: "OCR_CAPTURE_OUTPUT_INVALID" },
    { outputBytes: new Uint8Array([1, 2, 3, 4, 5]), outputType: "image/png", code: "OCR_CAPTURE_OUTPUT_BYTE_LIMIT", max: 4 },
  ]) {
    const { calls, dependencies } = createHarness(expectation);
    await assert.rejects(
      cropScreenshotPng(commonInput, {
        limits: expectation.max ? { maxOutputBytes: expectation.max } : undefined,
        dependencies,
      }),
      imageError(expectation.code),
    );
    assert.equal(calls.closes, 1);
  }
});

test("Canvas context・draw・PNG exportの失敗を型付きにしてbitmapを閉じる", async () => {
  const scenarios = [
    {
      canvasOverrides: { getContext: () => null },
      code: "OCR_CAPTURE_CANVAS_CONTEXT_FAILED",
    },
    {
      canvasOverrides: {
        getContext: () => ({ drawImage: () => { throw new Error("draw failed"); } }),
      },
      code: "OCR_CAPTURE_CANVAS_DRAW_FAILED",
    },
    {
      canvasOverrides: { convertToBlob: async () => { throw new Error("export failed"); } },
      code: "OCR_CAPTURE_CANVAS_EXPORT_FAILED",
    },
  ];
  for (const scenario of scenarios) {
    const { calls, dependencies } = createHarness(scenario);
    await assert.rejects(
      cropScreenshotPng(commonInput, { dependencies }),
      imageError(scenario.code),
    );
    assert.equal(calls.closes, 1);
  }
});

test("Canvas factoryの寸法違いをfail closedにする", async () => {
  const { calls, dependencies } = createHarness({
    canvasOverrides: { width: 1 },
  });
  await assert.rejects(
    cropScreenshotPng(commonInput, { dependencies }),
    imageError("OCR_CAPTURE_CANVAS_INVALID"),
  );
  assert.equal(calls.closes, 1);
});

test("limitsはhard maximumを越えて緩和できない", async () => {
  await assert.rejects(
    cropScreenshotPng(commonInput, {
      limits: { maxImagePixels: OCR_CAPTURE_IMAGE_LIMITS.maxImagePixels + 1 },
    }),
    imageError("OCR_CAPTURE_LIMIT_INVALID"),
  );
});

test("geometryの拒否も画像処理の型付きerrorとして伝える", async () => {
  const { calls, dependencies } = createHarness();
  await assert.rejects(
    cropScreenshotPng(
      { ...commonInput, selection: { x: 0, y: 0, width: 10, height: 10 } },
      { dependencies },
    ),
    imageError("OCR_CAPTURE_TOO_SMALL"),
  );
  assert.equal(calls.closes, 1);
});
