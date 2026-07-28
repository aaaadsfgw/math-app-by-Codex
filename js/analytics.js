import { getAnalytics } from './storage.js';

const metricDefinitions = [
  ['totalCount', '総問題数'], ['averageUnderstanding', '平均理解度'], ['selfSolvedCount', '自力正解数'],
  ['answerDisplayCount', '答え表示回数'], ['hintUsageCount', 'ヒント利用回数'],
  ['unverifiedAiCount', '未検証AI回答数'], ['needsReviewCount', '要復習数'],
];
const metricsGrid = document.querySelector('#metricsGrid');
const categoryAnalytics = document.querySelector('#categoryAnalytics');
const empty = document.querySelector('#analyticsEmpty');
const content = document.querySelector('#analyticsContent');

function metricCard(value, label) {
  const card = document.createElement('article'); card.className = 'card metric';
  const number = document.createElement('span'); number.className = 'metric-value'; number.textContent = value;
  const text = document.createElement('span'); text.className = 'metric-label'; text.textContent = label;
  card.append(number, text); return card;
}

function categoryRow(item) {
  const row = document.createElement('div'); row.className = 'category-row';
  const name = document.createElement('strong'); name.textContent = `${item.category}（${item.count}件）`;
  const track = document.createElement('div'); track.className = 'progress-track'; track.title = `平均理解度 ${item.averageUnderstanding}`;
  const bar = document.createElement('div'); bar.className = 'progress-bar'; bar.style.width = `${Math.max(0, Math.min(100, item.averageUnderstanding))}%`; track.append(bar);
  const details = document.createElement('span'); details.className = 'muted'; details.textContent = `平均 ${item.averageUnderstanding} / 答え ${item.answerDisplayRate}% / ヒント ${item.hintDependencyRate}%`;
  row.append(name, track, details); return row;
}

async function load() {
  const analytics = await getAnalytics();
  empty.hidden = analytics.totalCount !== 0; content.hidden = analytics.totalCount === 0;
  if (!analytics.totalCount) return;
  metricsGrid.replaceChildren(...metricDefinitions.map(([key, label]) => metricCard(
    key === 'averageUnderstanding' ? `${analytics[key]}点` : analytics[key], label,
  )));
  categoryAnalytics.replaceChildren(...analytics.byCategory.map(categoryRow));
  document.querySelector('#last7Days').textContent = analytics.recent7Days;
  document.querySelector('#last30Days').textContent = analytics.recent30Days;
}
load().catch((error) => { empty.hidden = false; content.hidden = true; empty.textContent = `分析を読み込めません: ${error.message}`; });

