export const OCR_CAPTURE_MIN_CSS_SIZE = 24;

const DIMENSION_KEYS = Object.freeze(["width", "height"]);
const RECT_KEYS = Object.freeze(["x", "y", ...DIMENSION_KEYS]);

export class OcrCaptureGeometryError extends Error {
  constructor(message, { code = "OCR_CAPTURE_GEOMETRY_INVALID", details = null } = {}) {
    super(message);
    this.name = "OcrCaptureGeometryError";
    this.code = code;
    this.details = details;
  }
}

function geometryError(message, code, details = null) {
  return new OcrCaptureGeometryError(message, { code, details });
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw geometryError(`${label}の形式が不正です。`, "OCR_CAPTURE_MALFORMED");
  }
  return value;
}

function readFiniteNumber(record, key, label) {
  let value;
  try {
    value = record[key];
  } catch {
    throw geometryError(`${label}.${key}を読み取れません。`, "OCR_CAPTURE_MALFORMED");
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw geometryError(`${label}.${key}は有限の数値で指定してください。`, "OCR_CAPTURE_MALFORMED");
  }
  return value;
}

function readDimensions(value, label, { requireIntegers = false } = {}) {
  const record = requireRecord(value, label);
  const dimensions = Object.fromEntries(
    DIMENSION_KEYS.map((key) => [key, readFiniteNumber(record, key, label)]),
  );
  for (const key of DIMENSION_KEYS) {
    const dimension = dimensions[key];
    const validInteger = !requireIntegers || Number.isSafeInteger(dimension);
    if (dimension <= 0 || !validInteger) {
      throw geometryError(
        `${label}.${key}は正の${requireIntegers ? "整数" : "数値"}で指定してください。`,
        "OCR_CAPTURE_MALFORMED",
      );
    }
  }
  return dimensions;
}

function readDevicePixelRatio(viewport) {
  let value;
  try {
    value = viewport.devicePixelRatio;
  } catch {
    throw geometryError(
      "viewport.devicePixelRatioを読み取れません。",
      "OCR_CAPTURE_MALFORMED",
    );
  }
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw geometryError(
      "viewport.devicePixelRatioは正の有限数で指定してください。",
      "OCR_CAPTURE_MALFORMED",
    );
  }
  return value;
}

function readMinimumSize(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError("minCssSizeは正の有限数で指定してください。");
  }
  return value;
}

function normalizedRect(selection) {
  const record = requireRecord(selection, "selection");
  const values = Object.fromEntries(
    RECT_KEYS.map((key) => [key, readFiniteNumber(record, key, "selection")]),
  );
  if (values.width === 0 || values.height === 0) {
    throw geometryError("選択範囲が空です。", "OCR_CAPTURE_EMPTY");
  }

  const endX = values.x + values.width;
  const endY = values.y + values.height;
  if (!Number.isFinite(endX) || !Number.isFinite(endY)) {
    throw geometryError("選択範囲が数値の上限を超えています。", "OCR_CAPTURE_MALFORMED");
  }

  const x = Math.min(values.x, endX);
  const y = Math.min(values.y, endY);
  return Object.freeze({
    x,
    y,
    width: Math.max(values.x, endX) - x,
    height: Math.max(values.y, endY) - y,
  });
}

function frozenRect(x, y, width, height) {
  return Object.freeze({ x, y, width, height });
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Validates a CSS-pixel selection and clips it to the visible viewport.
 * Negative width/height are accepted so callers may pass an unnormalised drag.
 */
export function validateViewportSelection(
  selection,
  viewport,
  { minCssSize = OCR_CAPTURE_MIN_CSS_SIZE } = {},
) {
  const minimum = readMinimumSize(minCssSize);
  const viewportRecord = requireRecord(viewport, "viewport");
  const viewportSize = readDimensions(viewportRecord, "viewport");
  const devicePixelRatio = readDevicePixelRatio(viewportRecord);
  const original = normalizedRect(selection);

  const left = clamp(original.x, 0, viewportSize.width);
  const top = clamp(original.y, 0, viewportSize.height);
  const right = clamp(original.x + original.width, 0, viewportSize.width);
  const bottom = clamp(original.y + original.height, 0, viewportSize.height);
  const width = right - left;
  const height = bottom - top;

  if (width <= 0 || height <= 0) {
    throw geometryError(
      "選択範囲が表示領域の外にあります。",
      "OCR_CAPTURE_OUT_OF_BOUNDS",
      Object.freeze({ selection: original, viewport: frozenRect(0, 0, viewportSize.width, viewportSize.height) }),
    );
  }
  if (width < minimum || height < minimum) {
    throw geometryError(
      `選択範囲は縦横とも${minimum} CSS px以上にしてください。`,
      "OCR_CAPTURE_TOO_SMALL",
      Object.freeze({ width, height, minCssSize: minimum }),
    );
  }

  const clipped = frozenRect(left, top, width, height);
  return Object.freeze({
    selectionCss: clipped,
    originalSelectionCss: original,
    viewportCss: frozenRect(0, 0, viewportSize.width, viewportSize.height),
    devicePixelRatio,
    wasClamped: left !== original.x
      || top !== original.y
      || right !== original.x + original.width
      || bottom !== original.y + original.height,
  });
}

/**
 * Maps a CSS-pixel selection to the actual captured bitmap dimensions.
 * The screenshot-derived X/Y scales are authoritative because browser zoom and
 * capture implementation details can differ from window.devicePixelRatio.
 */
export function planScreenshotCrop(
  { selection, viewport, screenshot } = {},
  options = {},
) {
  const validated = validateViewportSelection(selection, viewport, options);
  const screenshotSize = readDimensions(screenshot, "screenshot", { requireIntegers: true });
  const scaleX = screenshotSize.width / validated.viewportCss.width;
  const scaleY = screenshotSize.height / validated.viewportCss.height;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    throw geometryError("スクリーンショットの縮尺を計算できません。", "OCR_CAPTURE_MALFORMED");
  }

  const css = validated.selectionCss;
  const left = clamp(Math.floor(css.x * scaleX), 0, screenshotSize.width);
  const top = clamp(Math.floor(css.y * scaleY), 0, screenshotSize.height);
  const right = clamp(Math.ceil((css.x + css.width) * scaleX), 0, screenshotSize.width);
  const bottom = clamp(Math.ceil((css.y + css.height) * scaleY), 0, screenshotSize.height);
  if (right <= left || bottom <= top) {
    throw geometryError(
      "選択範囲を有効な画像領域へ変換できません。",
      "OCR_CAPTURE_EMPTY_PIXEL_CROP",
    );
  }

  const dpr = validated.devicePixelRatio;
  const tolerance = 0.01;
  const dprMatchesScreenshot = dpr === null
    ? null
    : Math.abs(scaleX - dpr) <= tolerance && Math.abs(scaleY - dpr) <= tolerance;

  return Object.freeze({
    selectionCss: css,
    originalSelectionCss: validated.originalSelectionCss,
    viewportCss: validated.viewportCss,
    screenshotPixels: frozenRect(0, 0, screenshotSize.width, screenshotSize.height),
    cropPixels: frozenRect(left, top, right - left, bottom - top),
    scale: Object.freeze({ x: scaleX, y: scaleY }),
    devicePixelRatio: dpr,
    dprMatchesScreenshot,
    wasClamped: validated.wasClamped,
  });
}
