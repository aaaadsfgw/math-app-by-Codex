import { OCR_IMAGE_LIMITS } from "../../js/ocr/ocr-config.js";

const MAX_BANDS = 64;
const MAX_INLINE_PROBES = 3;
const CONTRAST = 36;

function layoutError(message) {
  return Object.assign(new Error(message), { code: "WINDOWS_OCR_LAYOUT_INVALID" });
}

function luminance(data, index) {
  const offset = index * 4;
  const alpha = data[offset + 3] / 255;
  const color = (299 * data[offset] + 587 * data[offset + 1] + 114 * data[offset + 2]) / 1_000;
  return alpha * color + (1 - alpha) * 255;
}

function backgroundLuminance(width, height, data) {
  const samples = [];
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 128))) {
    samples.push(luminance(data, x), luminance(data, (height - 1) * width + x));
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 128))) {
    samples.push(luminance(data, y * width), luminance(data, y * width + width - 1));
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

function readInk({ width, height, data } = {}) {
  const { maxDimension, maxPixels } = OCR_IMAGE_LIMITS;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width > maxDimension || height > maxDimension
    || width * height > maxPixels
    || !(data instanceof Uint8ClampedArray || data instanceof Uint8Array)
    || data.length !== width * height * 4) {
    throw layoutError("画像の寸法または画素データが不正です。");
  }
  const background = backgroundLuminance(width, height, data);
  const mask = new Uint8Array(width * height);
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = { x0: width, x1: 0, strokeStart: 0, strokeWidth: 0 };
    let length = 0;
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (Math.abs(luminance(data, index) - background) < CONTRAST) {
        length = 0;
        continue;
      }
      mask[index] = 1;
      row.x0 = Math.min(x, row.x0);
      row.x1 = x + 1;
      length += 1;
      if (length > row.strokeWidth) {
        row.strokeWidth = length;
        row.strokeStart = x + 1 - length;
      }
    }
    rows.push(row);
  }
  return { width, height, mask, rows, background };
}

function extents(image, y0, y1, x0 = 0, x1 = image.width) {
  let result = null;
  for (let y = y0; y < y1; y += 1) {
    const row = image.rows[y];
    if (row.x0 >= x1 || row.x1 <= x0) continue;
    for (let x = Math.max(x0, row.x0); x < Math.min(x1, row.x1); x += 1) {
      if (!image.mask[y * image.width + x]) continue;
      if (!result) result = { x0: x, x1: x + 1, y0: y, y1: y + 1 };
      result.x0 = Math.min(result.x0, x);
      result.x1 = Math.max(result.x1, x + 1);
      result.y1 = y + 1;
    }
  }
  return result;
}

function axisRuns(values) {
  const runs = [];
  for (let i = 0; i < values.length; i += 1) {
    if (!values[i]) continue;
    const previous = runs.at(-1);
    if (previous?.end === i) previous.end += 1;
    else runs.push({ start: i, end: i + 1 });
  }
  return runs;
}

function inkBands(image) {
  return axisRuns(image.rows.map((row) => row.x0 < row.x1))
    .map(({ start, end }) => {
      const rows = image.rows.slice(start, end);
      return {
        y0: start,
        y1: end,
        x0: Math.min(...rows.map((row) => row.x0)),
        x1: Math.max(...rows.map((row) => row.x1)),
      };
    });
}

function span(box) {
  return box.x1 - box.x0;
}

function height(box) {
  return box.y1 - box.y0;
}

function overlap(left, right) {
  return Math.min(left.x1, right.x1) - Math.max(left.x0, right.x0);
}

function fractionBoundaries(bands, image) {
  const protectedBoundaries = new Set();
  const fractions = [];
  // A detached fraction bar occupies only a thin band. Compare the nearby
  // ink inside that stroke's x-range so a left label does not distort its evidence.
  for (let index = 1; index < bands.length - 1; index += 1) {
    const bar = bands[index];
    const upper = bands[index - 1];
    const lower = bands[index + 1];
    const bodyHeight = Math.min(height(upper), height(lower));
    if (bodyHeight < 3 || height(bar) > Math.max(2, bodyHeight * 0.19)) continue;
    const stroke = image.rows.slice(bar.y0, bar.y1)
      .reduce((longest, row) => row.strokeWidth > longest.strokeWidth ? row : longest);
    if (stroke.strokeWidth < Math.max(8, bodyHeight * 0.85)) continue;
    if (stroke.strokeWidth > image.width * 0.94
      && Math.min(bar.x0, image.width - bar.x1) <= 1) continue;
    if (bar.y0 - upper.y1 > Math.max(5, height(upper) * 0.95)
      || lower.y0 - bar.y1 > Math.max(5, height(lower) * 0.95)) continue;
    const x0 = stroke.strokeStart;
    const x1 = x0 + stroke.strokeWidth;
    const above = extents(image, upper.y0, upper.y1, x0, x1);
    const below = extents(image, lower.y0, lower.y1, x0, x1);
    if (!above || !below || height(above) < 3 || height(below) < 3
      || overlap(above, below) < Math.min(span(above), span(below)) * 0.4
      || Math.min(span(above), span(below)) < 3
      || Math.max(span(above), span(below)) < stroke.strokeWidth * 0.45) continue;
    protectedBoundaries.add(index - 1);
    protectedBoundaries.add(index);
    fractions.push({ x: x0, y: upper.y0, width: x1 - x0, height: lower.y1 - upper.y0 });
  }
  return { protectedBoundaries, fractions };
}

function mergeBands(bands, protectedBoundaries) {
  const merged = [{ ...bands[0] }];
  for (let index = 1; index < bands.length; index += 1) {
    const band = bands[index];
    const previous = bands[index - 1];
    const gap = band.y0 - previous.y1;
    const smaller = Math.min(height(previous), height(band));
    const larger = Math.max(height(previous), height(band));
    // Detached superscripts, dotted glyphs and limits can have a much smaller
    // extent than the baseline. Their x-ranges still touch the base expression.
    const scriptLike = smaller <= larger * 0.66
      && overlap(band, previous) >= -larger * 0.16
      && gap <= larger * 0.42;
    if (protectedBoundaries.has(index - 1) || scriptLike || gap < Math.max(5, smaller * 0.52)) {
      const current = merged.at(-1);
      current.x0 = Math.min(current.x0, band.x0);
      current.x1 = Math.max(current.x1, band.x1);
      current.y1 = band.y1;
    } else {
      merged.push({ ...band });
    }
  }
  return merged;
}

function padded(box, limits, pad) {
  const x = Math.max(limits.x0, box.x0 - pad);
  const y = Math.max(limits.y0, box.y0 - pad);
  return { x, y, width: Math.min(limits.x1, box.x1 + pad) - x, height: Math.min(limits.y1, box.y1 + pad) - y };
}

function columnRuns(image, band) {
  const columns = new Uint8Array(image.width);
  for (let y = band.y0; y < band.y1; y += 1) {
    for (let x = image.rows[y].x0; x < image.rows[y].x1; x += 1) {
      columns[x] |= image.mask[y * image.width + x];
    }
  }
  return axisRuns(columns);
}

function horizontalCandidates(image, band, limits) {
  const runs = columnRuns(image, band);
  const gaps = runs.slice(1).map((run, index) => ({
    index,
    leftEnd: runs[index].end,
    rightStart: run.start,
    gap: run.start - runs[index].end,
  })).filter(({ gap }) => gap >= 4);
  // Cap expensive rectangular scans independently of captured width and noise.
  gaps.sort((left, right) => right.gap - left.gap);
  const candidates = [];
  for (const { index, leftEnd, rightStart, gap } of gaps.slice(0, 8)) {
    const left = extents(image, band.y0, band.y1, band.x0, leftEnd);
    const right = extents(image, band.y0, band.y1, rightStart, band.x1);
    const cut = Math.floor((leftEnd + rightStart) / 2);
    const leftCount = index + 1;
    const rightCount = runs.length - leftCount;
    const leftScale = height(left);
    const rightScale = height(right);
    const label = leftCount <= 7 && span(left) <= leftScale * 2.8 && gap >= leftScale * 0.35;
    const leftText = leftCount >= 4 && span(left) >= leftScale * 2.5 && gap >= leftScale * 0.31;
    const rightText = rightCount >= 4 && span(right) >= rightScale * 2.5 && gap >= rightScale * 0.31;
    if (!label && !leftText && !rightText) continue;
    // Both halves are independently bounded. No glyph is intersected by a cut.
    const leftBounds = padded(left, { ...limits, x1: cut }, 14);
    const rightBounds = padded(right, { ...limits, x0: cut }, 14);
    if (label || leftText) candidates.push({
      context: leftBounds, formula: rightBounds, label, instruction: leftText,
      columns: leftCount, separation: gap / leftScale,
    });
    if (rightText) candidates.push({
      context: rightBounds, formula: leftBounds, label: false, instruction: true,
      columns: rightCount, separation: gap / rightScale,
    });
  }
  return candidates.sort((a, b) => b.separation - a.separation).slice(0, MAX_INLINE_PROBES);
}

/** A bounded projection over geometry. The recognizers decide whether a proposed context crop contains text. */
export function analyzeWindowsOcrLayout(imageData) {
  const image = readInk(imageData);
  const bands = inkBands(image);
  if (!bands.length || bands.length > MAX_BANDS) {
    throw layoutError("画像内から数式の位置を確認できません。数式の周囲を選び直してください。");
  }
  const { protectedBoundaries, fractions } = fractionBoundaries(bands, image);
  const merged = mergeBands(bands, protectedBoundaries);
  const full = { x0: 0, x1: image.width, y0: 0, y1: image.height };
  const regions = merged.map((band, index) => {
    const previous = merged[index - 1];
    const next = merged[index + 1];
    const limits = {
      ...full,
      y0: previous ? Math.floor((previous.y1 + band.y0) / 2) : 0,
      y1: next ? Math.floor((next.y0 + band.y1) / 2) : image.height,
    };
    return {
      bounds: padded(band, limits, Math.max(8, Math.min(24, Math.ceil(height(band) * 0.39)))),
      inline: index === merged.length - 1 ? horizontalCandidates(image, band, limits) : [],
      isolatedLabelColumns: index < merged.length - 1 && span(band) <= height(band) * 2.8
        ? columnRuns(image, band).length
        : 0,
    };
  });
  return { regions, fractions, dark: image.background < 100 };
}
