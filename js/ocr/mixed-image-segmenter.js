import { analyzeHorizontalOcrLayout } from "./mixed-layout.js";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const PNG_TYPE = "image/png";

export class MixedOcrSegmentationError extends Error {
  constructor(message, { code = "MIXED_OCR_SEGMENTATION_FAILED", cause = null } = {}) {
    super(message, cause instanceof Error ? { cause } : undefined);
    this.name = "MixedOcrSegmentationError";
    this.code = code;
  }
}

function segmentError(message, code, cause = null) {
  return new MixedOcrSegmentationError(message, { code, cause });
}

function validateBlob(blob) {
  if (!(blob instanceof Blob) || blob.size <= 0 || blob.size > MAX_INPUT_BYTES) {
    throw segmentError("mixed OCR画像の容量が不正です。", "MIXED_OCR_IMAGE_INVALID");
  }
  if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(blob.type.toLowerCase())) {
    throw segmentError("mixed OCR画像の形式が未対応です。", "MIXED_OCR_IMAGE_TYPE_UNSUPPORTED");
  }
}

function defaultCreateCanvas(width, height) {
  if (typeof globalThis.OffscreenCanvas === "function") {
    return new globalThis.OffscreenCanvas(width, height);
  }
  const canvas = globalThis.document?.createElement?.("canvas");
  if (!canvas) {
    throw segmentError("領域分割用Canvasを利用できません。", "MIXED_OCR_CANVAS_UNAVAILABLE");
  }
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasPng(canvas) {
  let blob;
  if (typeof canvas.convertToBlob === "function") {
    blob = await canvas.convertToBlob({ type: PNG_TYPE });
  } else if (typeof canvas.toBlob === "function") {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, PNG_TYPE));
  }
  if (!(blob instanceof Blob) || blob.size <= 0 || blob.type.toLowerCase() !== PNG_TYPE) {
    throw segmentError("分離画像をPNGへ変換できません。", "MIXED_OCR_REGION_ENCODING_FAILED");
  }
  return blob;
}

function closeBitmap(bitmap) {
  try {
    bitmap?.close?.();
  } catch {
    // Cleanup is best effort; a typed recognition error remains authoritative.
  }
}

/** Decodes once, detects strong line separators, and returns bounded PNG crops. */
export async function segmentOcrImageBlob(
  blob,
  {
    createImageBitmap = globalThis.createImageBitmap,
    createCanvas = defaultCreateCanvas,
    analyzeLayout = analyzeHorizontalOcrLayout,
  } = {},
) {
  validateBlob(blob);
  if (typeof createImageBitmap !== "function" || typeof createCanvas !== "function") {
    throw segmentError("画像分離APIを利用できません。", "MIXED_OCR_SEGMENTER_UNAVAILABLE");
  }

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob);
    const width = bitmap?.width;
    const height = bitmap?.height;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
      throw segmentError("mixed OCR画像の寸法が不正です。", "MIXED_OCR_IMAGE_INVALID");
    }
    const canvas = createCanvas(width, height);
    const context = canvas?.getContext?.("2d", { willReadFrequently: true });
    if (
      !context
      || typeof context.drawImage !== "function"
      || typeof context.getImageData !== "function"
    ) {
      throw segmentError("領域分割用2D contextを利用できません。", "MIXED_OCR_CANVAS_UNAVAILABLE");
    }
    context.drawImage(bitmap, 0, 0);
    const layout = analyzeLayout(context.getImageData(0, 0, width, height));
    const regions = [];
    for (let index = 0; index < layout.regions.length; index += 1) {
      const bounds = layout.regions[index];
      const regionCanvas = createCanvas(bounds.width, bounds.height);
      const regionContext = regionCanvas?.getContext?.("2d");
      if (!regionContext || typeof regionContext.drawImage !== "function") {
        throw segmentError("分離領域用2D contextを利用できません。", "MIXED_OCR_CANVAS_UNAVAILABLE");
      }
      regionContext.drawImage(
        bitmap,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        0,
        0,
        bounds.width,
        bounds.height,
      );
      regions.push(Object.freeze({
        index,
        bounds,
        blob: await canvasPng(regionCanvas),
      }));
    }
    return Object.freeze({ layout, regions: Object.freeze(regions) });
  } catch (error) {
    if (error?.name === "MixedOcrLayoutError" || error instanceof MixedOcrSegmentationError) {
      throw error;
    }
    throw segmentError(
      "画像の行領域を安全に分離できませんでした。",
      "MIXED_OCR_SEGMENTATION_FAILED",
      error,
    );
  } finally {
    closeBitmap(bitmap);
  }
}
