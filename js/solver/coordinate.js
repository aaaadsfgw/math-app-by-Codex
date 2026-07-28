import {
  failedResult,
  formatNumber,
  nearlyEqual,
  normalizeMathText,
  simplifySquareRoot,
  solvedResult,
  unsupportedResult,
} from "./utils.js";

export const COORDINATE_SOLVER_ID = "coordinate";

function parsePoints(value) {
  const text = normalizeMathText(value).replace(/\s+/g, "");
  const pointPattern = /([A-Za-z])\((-?(?:\d+(?:\.\d+)?|\.\d+)),(-?(?:\d+(?:\.\d+)?|\.\d+))\)/g;
  const points = [...text.matchAll(pointPattern)].map((match) => ({
    label: match[1].toUpperCase(),
    x: Number(match[2]),
    y: Number(match[3]),
  }));
  return { text, points };
}

function exactDistance(squaredDistance) {
  if (!Number.isInteger(squaredDistance) || squaredDistance < 0) return null;
  const root = Math.sqrt(squaredDistance);
  if (Number.isInteger(root)) return String(root);
  const { outside, inside } = simplifySquareRoot(squaredDistance);
  if (inside <= 0) return null;
  return `${outside === 1 ? "" : outside}√${inside}`;
}

export function solveCoordinate(question) {
  const { text, points } = parsePoints(question);
  if (points.length < 2) return unsupportedResult("2点の座標を検出できません");
  const [first, second] = points;
  if (![first.x, first.y, second.x, second.y].every(Number.isFinite)) {
    return failedResult(COORDINATE_SOLVER_ID, "座標値が不正です");
  }

  if (/中点/u.test(text)) {
    const midpointX = (first.x + second.x) / 2;
    const midpointY = (first.y + second.y) / 2;
    const answer = `(${formatNumber(midpointX)},${formatNumber(midpointY)})`;
    return solvedResult({
      answer,
      steps: [
        `x座標=(${formatNumber(first.x)}+${formatNumber(second.x)})/2=${formatNumber(midpointX)}`,
        `y座標=(${formatNumber(first.y)}+${formatNumber(second.y)})/2=${formatNumber(midpointY)}`,
        answer,
      ],
      verification: `中点から${first.label}、${second.label}への座標差が互いに反対符号になることを確認しました`,
      solverId: COORDINATE_SOLVER_ID,
    });
  }

  if (!/(?:距離|間|長さ)/u.test(text)) {
    return unsupportedResult("座標から求める対象（距離または中点）を指定してください");
  }
  const deltaX = second.x - first.x;
  const deltaY = second.y - first.y;
  const squaredDistance = deltaX ** 2 + deltaY ** 2;
  const distance = Math.sqrt(squaredDistance);
  if (!Number.isFinite(distance)) return failedResult(COORDINATE_SOLVER_ID, "距離を計算できません");
  const exact = exactDistance(squaredDistance);
  const answer = exact ?? formatNumber(distance);
  const displayAnswer = exact && !nearlyEqual(distance, Math.round(distance))
    ? `${exact}（約${formatNumber(distance)}）`
    : answer;
  return solvedResult({
    answer: displayAnswer,
    steps: [
      `√((${formatNumber(second.x)}-${formatNumber(first.x)})^2+(${formatNumber(second.y)}-${formatNumber(first.y)})^2)`,
      displayAnswer,
    ],
    verification: `距離の2乗は${formatNumber(squaredDistance)}で、${formatNumber(distance)}^2と一致します`,
    solverId: COORDINATE_SOLVER_ID,
  });
}

export default solveCoordinate;
