export const MIXED_OCR_LAYOUT_VERSION = 1;

const MAX_PIXELS = 16 * 1024 * 1024;
const MAX_DIMENSION = 8_192;
const MAX_LEADING_COMPONENT_PIXELS = 1_000_000;
const MAX_LEADING_COMPONENT_WIDTH = 512;
const MAX_LEADING_SPLIT_CANDIDATES = 6;

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

function foregroundPixel(image, background, contrastThreshold, x, y) {
  const offset = (y * image.width + x) * 4;
  return image.data[offset + 3] >= 32
    && Math.abs(luminance(image.data, offset) - background) >= contrastThreshold;
}

function componentScanWidth(region) {
  const inkHeight = region.bottomInk - region.topInk + 1;
  return Math.min(
    region.width,
    MAX_LEADING_COMPONENT_WIDTH,
    Math.max(96, Math.ceil(inkHeight * 6)),
  );
}

function connectedComponents(image, background, contrastThreshold, region) {
  const width = componentScanWidth(region);
  const height = region.height;
  const pixelCount = width * height;
  if (pixelCount > MAX_LEADING_COMPONENT_PIXELS) return [];

  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const components = [];
  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start]) continue;
    const startX = start % width;
    const startY = Math.floor(start / width);
    if (!foregroundPixel(
      image,
      background,
      contrastThreshold,
      region.x + startX,
      region.y + startY,
    )) {
      visited[start] = 1;
      continue;
    }

    let head = 0;
    let tail = 0;
    let left = startX;
    let right = startX;
    let top = startY;
    let bottom = startY;
    let area = 0;
    visited[start] = 1;
    queue[tail] = start;
    tail += 1;
    while (head < tail) {
      const current = queue[head];
      head += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          if (deltaX === 0 && deltaY === 0) continue;
          const nextX = x + deltaX;
          const nextY = y + deltaY;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (visited[next]) continue;
          if (!foregroundPixel(
            image,
            background,
            contrastThreshold,
            region.x + nextX,
            region.y + nextY,
          )) {
            visited[next] = 1;
            continue;
          }
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
    }
    if (area >= 2 && (right > left || bottom > top)) {
      components.push({ left, right, top, bottom, area });
    }
  }
  return components;
}

function horizontalComponentClusters(components) {
  const sorted = [...components].sort((left, right) => (
    left.left - right.left
    || left.top - right.top
    || left.right - right.right
  ));
  const clusters = [];
  for (const component of sorted) {
    const previous = clusters.at(-1);
    if (previous && component.left <= previous.right + 1) {
      previous.left = Math.min(previous.left, component.left);
      previous.right = Math.max(previous.right, component.right);
      previous.top = Math.min(previous.top, component.top);
      previous.bottom = Math.max(previous.bottom, component.bottom);
      previous.area += component.area;
      previous.componentCount += 1;
    } else {
      clusters.push({ ...component, componentCount: 1 });
    }
  }
  return clusters;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function leadingSplitCandidates(
  image,
  background,
  contrastThreshold,
  region,
  { standalone = false } = {},
) {
  const components = connectedComponents(image, background, contrastThreshold, region);
  const clusters = horizontalComponentClusters(components);
  if (clusters.length < 2) return Object.freeze([]);

  const firstInk = clusters[0].left;
  // regionFromRuns already bounds the complete row. Component analysis is
  // intentionally limited to its leading edge, but the remainder crop must
  // retain the whole formula even when it extends beyond that scan window.
  const lastInk = region.width - 1;
  const totalInkWidth = lastInk - firstInk + 1;
  const candidates = [];
  let prefixTop = clusters[0].top;
  let prefixBottom = clusters[0].bottom;
  const internalGaps = [];
  for (let index = 0; index + 1 < clusters.length; index += 1) {
    const leftCluster = clusters[index];
    const rightCluster = clusters[index + 1];
    prefixTop = Math.min(prefixTop, leftCluster.top);
    prefixBottom = Math.max(prefixBottom, leftCluster.bottom);
    const gap = rightCluster.left - leftCluster.right - 1;
    const medianInternalGap = median(internalGaps);
    internalGaps.push(gap);
    const prefixInkHeight = prefixBottom - prefixTop + 1;
    const requiredGap = Math.max(
      standalone ? 4 : 2,
      Math.ceil(prefixInkHeight * (standalone ? 0.34 : 0.16)),
    );
    if (gap < requiredGap) continue;
    // A parenthesized number normally contributes at least three horizontal
    // components. In that case, the boundary after it must be wider than the
    // prefix's own character spacing. This is the pixel-level distinction
    // between a layout-separated label and an attached coefficient such as
    // `(2)x^2`; absolute 2–12 px thresholds alone cannot provide it.
    const gapAdvantage = internalGaps.length >= 2 ? gap - medianInternalGap : null;
    if (gapAdvantage !== null && gapAdvantage < 1) continue;

    const prefixInkWidth = leftCluster.right - firstInk + 1;
    const remainderInkWidth = lastInk - rightCluster.left + 1;
    const prefixMaximum = Math.max(48, Math.ceil(prefixInkHeight * 5.5));
    const prefixRatioLimit = standalone ? 0.3 : 0.36;
    const minimumRemainder = standalone
      ? Math.max(Math.ceil(prefixInkHeight * 2.5), Math.ceil(prefixInkWidth * 2))
      : Math.max(Math.ceil(prefixInkHeight * 2), Math.ceil(prefixInkWidth * 1.25));
    if (
      prefixInkWidth > prefixMaximum
      || prefixInkWidth > Math.floor(totalInkWidth * prefixRatioLimit)
      || remainderInkWidth < minimumRemainder
    ) {
      continue;
    }

    // Keep the prefix readable, but give most separator whitespace to the
    // formula crop. IBEM is sensitive to a formula being tightened directly
    // to its first ink pixel; ordinary source images retain a left margin.
    const prefixMargin = Math.min(2, Math.floor((gap - 1) / 3));
    const remainderMargin = Math.min(12, Math.max(0, gap - prefixMargin - 1));
    const prefixLeft = Math.max(0, firstInk - 2);
    const prefixRight = Math.min(region.width - 1, leftCluster.right + prefixMargin);
    const remainderLeft = Math.max(0, rightCluster.left - remainderMargin);
    const remainderRight = region.width - 1;
    const prefixCropTop = Math.max(0, prefixTop - 3);
    const prefixCropBottom = Math.min(region.height - 1, prefixBottom + 3);
    if (prefixRight >= remainderLeft) continue;
    candidates.push(Object.freeze({
      regionIndex: null,
      gap,
      requiredGap,
      evidence: Object.freeze({
        componentCount: clusters
          .slice(0, index + 1)
          .reduce((sum, cluster) => sum + cluster.componentCount, 0),
        prefixInkHeight,
        prefixInkWidth,
        remainderInkWidth,
        gapToPrefixHeight: gap / prefixInkHeight,
        medianInternalGap,
        gapAdvantage,
        baselineDelta: Math.abs(prefixBottom - rightCluster.bottom),
        leftAnchored: firstInk <= 2,
        standalone,
      }),
      prefix: Object.freeze({
        x: region.x + prefixLeft,
        y: region.y + prefixCropTop,
        width: prefixRight - prefixLeft + 1,
        height: prefixCropBottom - prefixCropTop + 1,
      }),
      remainder: Object.freeze({
        x: region.x + remainderLeft,
        y: region.y,
        width: remainderRight - remainderLeft + 1,
        height: region.height,
      }),
    }));
    if (candidates.length >= MAX_LEADING_SPLIT_CANDIDATES) break;
  }
  return Object.freeze(candidates);
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
  const rawLeadingSplits = leadingSplitCandidates(
    image,
    background,
    contrastThreshold,
    regions.at(-1),
    { standalone: regions.length === 1 },
  );
  const formulaRegionIndex = regions.length - 1;
  const formulaLeadingSplits = Object.freeze(rawLeadingSplits.map((split) => (
    Object.freeze({ ...split, regionIndex: formulaRegionIndex })
  )));
  return Object.freeze({
    version: MIXED_OCR_LAYOUT_VERSION,
    kind: regions.length === 1 ? "single-region" : "separated-regions",
    width: image.width,
    height: image.height,
    backgroundLuminance: background,
    regions: Object.freeze(regions),
    separators: Object.freeze(separators.map((separator) => Object.freeze({ ...separator }))),
    leadingSplitCandidate: formulaLeadingSplits[0] ?? null,
    leadingSplitCandidates: formulaLeadingSplits,
  });
}
