export const MIXED_OCR_LAYOUT_VERSION = 1;

const MAX_PIXELS = 16 * 1024 * 1024;
const MAX_DIMENSION = 8_192;

export class MixedOcrLayoutError extends Error {
  constructor(message, { code = "MIXED_OCR_LAYOUT_INVALID", details = null } = {}) {
    super(message);
    this.name = "MixedOcrLayoutError";
    this.code = code;
    this.details = details;
  }
}

function layoutError(message, code, details = null) {
  return new MixedOcrLayoutError(message, { code, details });
}

function validateImageData(value) {
  const width = value?.width;
  const height = value?.height;
  const data = value?.data;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
    || width > MAX_DIMENSION
    || height > MAX_DIMENSION
    || width > Math.floor(MAX_PIXELS / height)
  ) {
    throw layoutError("OCR画像の寸法が不正です。", "MIXED_OCR_IMAGE_DIMENSIONS_INVALID");
  }
  if (
    !(data instanceof Uint8ClampedArray || data instanceof Uint8Array)
    || data.byteLength !== width * height * 4
  ) {
    throw layoutError("OCR画像のpixel dataが不正です。", "MIXED_OCR_PIXEL_DATA_INVALID");
  }
  return { width, height, data };
}

function luminance(data, offset) {
  return Math.round(
    (data[offset] * 299 + data[offset + 1] * 587 + data[offset + 2] * 114) / 1_000,
  );
}

function borderBackground({ width, height, data }) {
  const samples = [];
  const xStep = Math.max(1, Math.floor(width / 128));
  const yStep = Math.max(1, Math.floor(height / 128));
  for (let x = 0; x < width; x += xStep) {
    samples.push(luminance(data, x * 4));
    samples.push(luminance(data, ((height - 1) * width + x) * 4));
  }
  for (let y = 0; y < height; y += yStep) {
    samples.push(luminance(data, (y * width) * 4));
    samples.push(luminance(data, (y * width + width - 1) * 4));
  }
  samples.sort((left, right) => left - right);
  return samples[Math.floor(samples.length / 2)] ?? 255;
}

function rowInk(image, background, contrastThreshold) {
  const { width, height, data } = image;
  const counts = new Uint32Array(height);
  const minX = new Int32Array(height).fill(width);
  const maxX = new Int32Array(height).fill(-1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] < 32) continue;
      if (Math.abs(luminance(data, offset) - background) < contrastThreshold) continue;
      counts[y] += 1;
      if (x < minX[y]) minX[y] = x;
      if (x > maxX[y]) maxX[y] = x;
    }
  }
  return { counts, minX, maxX };
}

function activeRowRuns(counts, minimumInk) {
  const active = Array.from(counts, (count) => count >= minimumInk);
  for (let y = 1; y + 1 < active.length; y += 1) {
    if (!active[y] && active[y - 1] && active[y + 1]) active[y] = true;
  }
  const runs = [];
  let start = null;
  for (let y = 0; y <= active.length; y += 1) {
    if (active[y] && start === null) start = y;
    if (!active[y] && start !== null) {
      runs.push({ top: start, bottom: y - 1 });
      start = null;
    }
  }
  return runs;
}

function mergeCloseRuns(runs) {
  const merged = [];
  for (const run of runs) {
    const previous = merged.at(-1);
    if (previous && run.top - previous.bottom - 1 <= 2) previous.bottom = run.bottom;
    else merged.push({ ...run });
  }
  return merged;
}

function regionFromRuns(runs, rowData, image, margin = 2) {
  const topInk = runs[0].top;
  const bottomInk = runs.at(-1).bottom;
  let leftInk = image.width;
  let rightInk = -1;
  let inkPixels = 0;
  for (let y = topInk; y <= bottomInk; y += 1) {
    inkPixels += rowData.counts[y];
    if (rowData.maxX[y] >= 0) {
      leftInk = Math.min(leftInk, rowData.minX[y]);
      rightInk = Math.max(rightInk, rowData.maxX[y]);
    }
  }
  const top = Math.max(0, topInk - margin);
  const bottom = Math.min(image.height - 1, bottomInk + margin);
  const left = Math.max(0, leftInk - margin);
  const right = Math.min(image.width - 1, rightInk + margin);
  return Object.freeze({
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
    inkPixels,
    topInk,
    bottomInk,
  });
}

function meaningfulSeparators(runs) {
  const separators = [];
  for (let index = 0; index + 1 < runs.length; index += 1) {
    const left = runs[index];
    const right = runs[index + 1];
    const gap = right.top - left.bottom - 1;
    const leftHeight = left.bottom - left.top + 1;
    const rightHeight = right.bottom - right.top + 1;
    const requiredGap = Math.max(8, Math.ceil(Math.min(leftHeight, rightHeight) * 0.55));
    if (gap >= requiredGap) separators.push({ after: index, gap, requiredGap });
  }
  return separators;
}

function groupRuns(runs, separators) {
  const separatorIndexes = new Set(separators.map(({ after }) => after));
  const groups = [];
  let current = [];
  runs.forEach((run, index) => {
    current.push(run);
    if (separatorIndexes.has(index)) {
      groups.push(current);
      current = [];
    }
  });
  if (current.length) groups.push(current);
  return groups;
}

/**
 * Finds only strong horizontal whitespace separators. It deliberately does
 * not label a region as Japanese or mathematics from pixels alone. Semantic
 * classification happens later with the dedicated recognizers.
 */
export function analyzeHorizontalOcrLayout(value, { contrastThreshold = 36 } = {}) {
  const image = validateImageData(value);
  if (!Number.isFinite(contrastThreshold) || contrastThreshold < 20 || contrastThreshold > 96) {
    throw new TypeError("contrastThresholdは20以上96以下で指定してください。");
  }
  const background = borderBackground(image);
  const rows = rowInk(image, background, contrastThreshold);
  const minimumInk = Math.max(2, Math.floor(image.width * 0.002));
  const runs = mergeCloseRuns(activeRowRuns(rows.counts, minimumInk));
  if (!runs.length) {
    throw layoutError("画像内に十分な文字領域を確認できません。", "MIXED_OCR_LAYOUT_EMPTY");
  }

  const separators = meaningfulSeparators(runs);
  const groups = groupRuns(runs, separators);
  if (groups.length > 3) {
    throw layoutError(
      "独立した行領域が多く、1つの数式を安全に特定できません。",
      "MIXED_OCR_LAYOUT_MULTIPLE_FORMULAS",
      Object.freeze({ regionCount: groups.length }),
    );
  }
  const regions = groups.map((group) => regionFromRuns(group, rows, image));
  if (regions.some((region) => region.width < 3 || region.height < 3 || region.inkPixels < 3)) {
    throw layoutError("行領域が小さすぎて安全に分離できません。", "MIXED_OCR_LAYOUT_AMBIGUOUS");
  }
  return Object.freeze({
    version: MIXED_OCR_LAYOUT_VERSION,
    kind: regions.length === 1 ? "single-region" : "separated-regions",
    width: image.width,
    height: image.height,
    backgroundLuminance: background,
    regions: Object.freeze(regions),
    separators: Object.freeze(separators.map((separator) => Object.freeze({ ...separator }))),
  });
}
