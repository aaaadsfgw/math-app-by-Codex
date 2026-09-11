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

function columnInk(image, background, contrastThreshold, region) {
  const counts = new Uint32Array(region.width);
  for (let localX = 0; localX < region.width; localX += 1) {
    const x = region.x + localX;
    for (let y = region.y; y < region.y + region.height; y += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3] < 32) continue;
      if (Math.abs(luminance(image.data, offset) - background) < contrastThreshold) continue;
      counts[localX] += 1;
    }
  }
  return counts;
}

function activeColumnRuns(counts, minimumInk) {
  const runs = [];
  let start = null;
  for (let x = 0; x <= counts.length; x += 1) {
    const active = x < counts.length && counts[x] >= minimumInk;
    if (active && start === null) start = x;
    if (!active && start !== null) {
      runs.push({ left: start, right: x - 1 });
      start = null;
    }
  }
  return runs;
}

function leadingSplitCandidate(
  image,
  background,
  contrastThreshold,
  region,
  { standalone = false } = {},
) {
  const counts = columnInk(image, background, contrastThreshold, region);
  const minimumInk = Math.max(1, Math.floor(region.height * 0.03));
  const runs = activeColumnRuns(counts, minimumInk);
  if (runs.length < 2) return null;

  const firstInk = runs[0].left;
  const lastInk = runs.at(-1).right;
  const inkHeight = region.bottomInk - region.topInk + 1;
  const requiredGap = standalone
    ? Math.max(10, Math.ceil(inkHeight * 0.7))
    : Math.max(8, Math.ceil(inkHeight * 0.55));
  const totalInkWidth = lastInk - firstInk + 1;
  for (let index = 0; index + 1 < runs.length; index += 1) {
    const leftRun = runs[index];
    const rightRun = runs[index + 1];
    const gap = rightRun.left - leftRun.right - 1;
    if (gap < requiredGap) continue;

    const prefixInkWidth = leftRun.right - firstInk + 1;
    const remainderInkWidth = lastInk - rightRun.left + 1;
    const prefixMaximum = Math.max(32, Math.ceil(inkHeight * 4.5));
    const prefixRatioLimit = standalone ? 0.28 : 0.32;
    const minimumRemainder = standalone
      ? Math.max(Math.ceil(inkHeight * 3.5), Math.ceil(prefixInkWidth * 2.5))
      : Math.max(Math.ceil(inkHeight * 3), prefixInkWidth * 2);
    if (
      prefixInkWidth > prefixMaximum
      || prefixInkWidth > Math.floor(totalInkWidth * prefixRatioLimit)
      || remainderInkWidth < minimumRemainder
    ) {
      continue;
    }

    const margin = 2;
    const prefixLeft = Math.max(0, firstInk - margin);
    const prefixRight = Math.min(region.width - 1, leftRun.right + margin);
    const remainderLeft = Math.max(0, rightRun.left - margin);
    const remainderRight = Math.min(region.width - 1, lastInk + margin);
    return Object.freeze({
      regionIndex: null,
      gap,
      requiredGap,
      prefix: Object.freeze({
        x: region.x + prefixLeft,
        y: region.y,
        width: prefixRight - prefixLeft + 1,
        height: region.height,
      }),
      remainder: Object.freeze({
        x: region.x + remainderLeft,
        y: region.y,
        width: remainderRight - remainderLeft + 1,
        height: region.height,
      }),
    });
  }
  return null;
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

function isEdgeFrameArtifact(run, rowData, image) {
  const height = run.bottom - run.top + 1;
  const touchesEdge = run.top <= 1 || run.bottom >= image.height - 2;
  if (!touchesEdge || height > 2) return false;

  let left = image.width;
  let right = -1;
  for (let y = run.top; y <= run.bottom; y += 1) {
    if (rowData.maxX[y] < 0) continue;
    left = Math.min(left, rowData.minX[y]);
    right = Math.max(right, rowData.maxX[y]);
  }
  return right >= left && right - left + 1 >= Math.ceil(image.width * 0.8);
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
  const runs = mergeCloseRuns(activeRowRuns(rows.counts, minimumInk))
    .filter((run) => !isEdgeFrameArtifact(run, rows, image));
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
  const rawLeadingSplit = leadingSplitCandidate(
    image,
    background,
    contrastThreshold,
    regions.at(-1),
    { standalone: regions.length === 1 },
  );
  const formulaRegionIndex = regions.length - 1;
  const formulaLeadingSplit = rawLeadingSplit
    ? Object.freeze({ ...rawLeadingSplit, regionIndex: formulaRegionIndex })
    : null;
  return Object.freeze({
    version: MIXED_OCR_LAYOUT_VERSION,
    kind: regions.length === 1 ? "single-region" : "separated-regions",
    width: image.width,
    height: image.height,
    backgroundLuminance: background,
    regions: Object.freeze(regions),
    separators: Object.freeze(separators.map((separator) => Object.freeze({ ...separator }))),
    leadingSplitCandidate: formulaLeadingSplit,
  });
}
