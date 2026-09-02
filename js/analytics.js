import { getAnalytics } from "./storage.js";

const metricsGrid = document.querySelector("#metricsGrid");
const categoryAnalytics = document.querySelector("#categoryAnalytics");
const empty = document.querySelector("#analyticsEmpty");
const content = document.querySelector("#analyticsContent");
const loading = document.querySelector("#analyticsLoading");
const main = document.querySelector("#analyticsMain");

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percent(value) {
  const number = Number(value);
  return `${Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0}%`;
}

function understanding(value) {
  const number = finiteNumber(value);
  return number === null ? "未評価" : `${Math.max(0, Math.min(100, number))}点`;
}

function metricCard(value, label, detail = "") {
  const card = document.createElement("article");
  card.className = "card metric";
  const number = document.createElement("span");
  number.className = "metric-value";
  number.textContent = String(value);
  const text = document.createElement("span");
  text.className = "metric-label";
  text.textContent = label;
  card.append(number, text);
  if (detail) {
    const description = document.createElement("span");
    description.className = "metric-detail";
    description.textContent = detail;
    card.append(description);
  }
  return card;
}

function priorityLabel(level) {
  if (level === "high") return "復習優先度 高";
  if (level === "medium") return "復習優先度 中";
  return "復習優先度 低";
}

function priorityClass(level) {
  if (level === "high") return "danger";
  if (level === "medium") return "warning";
  return "success";
}

function smallMetric(label, value) {
  const item = document.createElement("div");
  item.className = "category-metric";
  const name = document.createElement("dt");
  name.className = "category-metric-label";
  name.textContent = label;
  const number = document.createElement("dd");
  number.className = "category-metric-value";
  number.textContent = value;
  item.append(name, number);
  return item;
}

function categoryEvidence(item) {
  const facts = [];
  const average = finiteNumber(item.averageUnderstanding);
  if (average !== null) facts.push(`自己評価の平均は${understanding(average)}です`);
  if (Number(item.hint2UsageRate) > 0) facts.push(`Hint 2利用率は${percent(item.hint2UsageRate)}です`);
  if (Number(item.stepsUsageRate) > 0) facts.push(`途中式利用率は${percent(item.stepsUsageRate)}です`);
  if (Number(item.directAnswerRate) > 0) facts.push(`答えを最初に表示した率は${percent(item.directAnswerRate)}です`);

  const recent = Number(item.recentAttemptCount) > 0
    ? `直近30日は${item.recentAttemptCount}件中${item.recentStruggleCount}件で、60点以下の自己評価またはHint 2・途中式・解説・答えの直接表示が記録されています。`
    : "直近30日の記録はありません。";
  return `${facts.length ? `${facts.join("。")}。` : "自己評価や段階別利用の記録はまだありません。"}${recent}`;
}

function categoryCard(item) {
  const article = document.createElement("article");
  article.className = "category-card";
  article.setAttribute("role", "listitem");

  const header = document.createElement("div");
  header.className = "category-card-header";
  const title = document.createElement("h3");
  title.textContent = item.category;
  const badges = document.createElement("div");
  badges.className = "record-meta";
  const count = document.createElement("span");
  count.className = "badge";
  count.textContent = `${item.count}件`;
  const priority = document.createElement("span");
  priority.className = `badge ${priorityClass(item.reviewPriorityLevel)}`;
  priority.textContent = `${priorityLabel(item.reviewPriorityLevel)}（${item.reviewPriorityScore}）`;
  badges.append(count, priority);
  header.append(title, badges);

  const understandingBlock = document.createElement("div");
  understandingBlock.className = "understanding-block";
  const understandingText = document.createElement("div");
  understandingText.className = "spread";
  const understandingName = document.createElement("strong");
  understandingName.textContent = "自己評価の平均";
  const understandingValue = document.createElement("span");
  understandingValue.textContent = `${understanding(item.averageUnderstanding)}（評価 ${item.evaluatedCount}/${item.count}件）`;
  understandingText.append(understandingName, understandingValue);
  const track = document.createElement("div");
  track.className = "progress-track";
  const average = finiteNumber(item.averageUnderstanding);
  if (average !== null) {
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", `${item.category}の自己評価平均`);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(Math.max(0, Math.min(100, average))));
  } else {
    track.setAttribute("aria-hidden", "true");
  }
  const bar = document.createElement("div");
  bar.className = "progress-bar";
  bar.style.width = average !== null
    ? `${Math.max(0, Math.min(100, average))}%`
    : "0%";
  track.append(bar);
  understandingBlock.append(understandingText, track);

  const usage = document.createElement("dl");
  usage.className = "category-metrics";
  usage.setAttribute("aria-label", `${item.category}の利用率`);
  usage.append(
    smallMetric("Hint 1", percent(item.hint1UsageRate)),
    smallMetric("Hint 2", percent(item.hint2UsageRate)),
    smallMetric("途中式", percent(item.stepsUsageRate)),
    smallMetric("答えを最初に表示", percent(item.directAnswerRate)),
  );

  const evidence = document.createElement("p");
  evidence.className = "category-evidence";
  evidence.textContent = categoryEvidence(item);

  article.append(header, understandingBlock, usage, evidence);
  return article;
}

function overallMetrics(analytics) {
  const metrics = [
    metricCard(analytics.totalCount, "Study記録", `自己評価済み ${analytics.evaluatedCount}件`),
    metricCard(understanding(analytics.averageUnderstanding), "自己評価の平均", "未評価の記録は平均から除外"),
    metricCard(percent(analytics.hint1UsageRate), "Hint 1使用率"),
    metricCard(percent(analytics.hint2UsageRate), "Hint 2使用率"),
    metricCard(percent(analytics.stepsUsageRate), "途中式使用率"),
    metricCard(percent(analytics.directAnswerRate), "答えを最初に表示した率"),
    metricCard(analytics.ocrUsageCount, "画像OCR入力", "OCR文字列の正しさを保証する指標ではありません"),
    metricCard(analytics.needsReviewCount, "要復習"),
  ];
  if (analytics.unverifiedAiCount > 0) {
    metrics.push(metricCard(analytics.unverifiedAiCount, "旧版の未検証回答"));
  }
  return metrics;
}

function categoriesByReviewPriority(items) {
  if (!Array.isArray(items)) return [];
  return [...items].sort((left, right) => (
    (finiteNumber(right.reviewPriorityScore) ?? 0)
    - (finiteNumber(left.reviewPriorityScore) ?? 0)
    || (finiteNumber(right.recentStruggleRate) ?? 0)
      - (finiteNumber(left.recentStruggleRate) ?? 0)
    || (finiteNumber(right.count) ?? 0) - (finiteNumber(left.count) ?? 0)
    || String(left.category ?? "").localeCompare(String(right.category ?? ""), "ja")
  ));
}

async function load() {
  const analytics = await getAnalytics();
  loading.hidden = true;
  main.setAttribute("aria-busy", "false");
  empty.hidden = analytics.totalCount !== 0;
  content.hidden = analytics.totalCount === 0;
  if (!analytics.totalCount) return;

  metricsGrid.replaceChildren(...overallMetrics(analytics));
  categoryAnalytics.replaceChildren(...categoriesByReviewPriority(analytics.byCategory).map(categoryCard));
  document.querySelector("#last7Days").textContent = analytics.recent7Days;
  document.querySelector("#last30Days").textContent = analytics.recent30Days;
}

load().catch((error) => {
  loading.hidden = true;
  main.setAttribute("aria-busy", "false");
  empty.hidden = false;
  content.hidden = true;
  empty.textContent = `分析を読み込めません: ${error.message}`;
});
