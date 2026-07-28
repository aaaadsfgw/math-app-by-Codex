import {
  ASSESSMENT_SCORES,
  clearHistory,
  deleteHistory,
  getHistory,
  importData,
  setPendingQuestion,
  updateHistory,
} from './storage.js';
import { formatDateTime } from './utils.js';

const assessmentLabels = {
  unassessed: '未評価', self_solved: '自力で解けた', hint1_solved: 'ヒント1で解けた',
  hint2_solved: 'ヒント2で解けた', steps_solved: '途中式で解けた',
  explain_understood: '解説を見て理解した', answer_seen: '答えを見た', unsolved: '解けなかった',
};
const modeLabels = { answer: '答え', hint1: 'ヒント1', hint2: 'ヒント2', steps: '途中式', explain: '解説' };
const verificationLabels = { solver: '自作ソルバーで検証済み', demo: 'デモデータ', 'ai-only': 'AI回答・未検証', unsupported: '自動検証不能' };

const elements = {
  list: document.querySelector('#historyList'), empty: document.querySelector('#historyEmpty'),
  message: document.querySelector('#historyMessage'), sort: document.querySelector('#sortSelect'),
  category: document.querySelector('#categoryFilter'), mode: document.querySelector('#modeFilter'),
  reviewOnly: document.querySelector('#reviewOnly'), exportButton: document.querySelector('#exportButton'),
  importButton: document.querySelector('#importButton'), importFile: document.querySelector('#importFile'),
  clearButton: document.querySelector('#clearHistoryButton'),
};
let records = [];

function setMessage(text, kind = '') {
  elements.message.className = kind ? `notice ${kind}` : '';
  elements.message.textContent = text;
}

function createBadge(text, kind = '') {
  const badge = document.createElement('span');
  badge.className = `badge ${kind}`.trim();
  badge.textContent = text;
  return badge;
}

function assessmentSelect(record) {
  const select = document.createElement('select');
  select.setAttribute('aria-label', `自己評価: ${record.question}`);
  for (const [value, label] of Object.entries(assessmentLabels)) {
    const option = document.createElement('option');
    option.value = value;
    const score = ASSESSMENT_SCORES[value];
    option.textContent = `${label}${score === null ? '' : `（${score}）`}`;
    option.selected = value === record.selfAssessment;
    select.append(option);
  }
  select.addEventListener('change', async () => {
    await updateHistory(record.id, { selfAssessment: select.value, needsReview: select.value === 'unassessed' });
    setMessage('自己評価を更新しました。', 'success');
    await load();
  });
  return select;
}

function renderRecord(record) {
  const article = document.createElement('article');
  article.className = 'record';
  const heading = document.createElement('div');
  heading.className = 'record-question';
  heading.textContent = record.question;
  const meta = document.createElement('div');
  meta.className = 'record-meta';
  meta.append(createBadge(record.category), createBadge(modeLabels[record.mode] ?? record.mode));
  meta.append(createBadge(verificationLabels[record.verificationType] ?? '状態不明', record.verified ? 'success' : 'warning'));
  if (record.needsReview) meta.append(createBadge('要復習', 'danger'));
  meta.append(createBadge(record.score === null ? '未評価' : `${record.score}点`));
  const time = document.createElement('p');
  time.className = 'muted';
  time.textContent = formatDateTime(record.createdAt);
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '出力と検証の詳細';
  const output = document.createElement('div');
  output.className = 'history-output';
  output.textContent = record.output || record.finalAnswer || '出力なし';
  const verification = document.createElement('p');
  verification.className = 'muted';
  verification.textContent = record.verificationMessage || '検証メッセージなし';
  details.append(summary, output, verification);
  const field = document.createElement('div');
  field.className = 'field';
  const label = document.createElement('label');
  label.textContent = '自己評価を変更';
  field.append(label, assessmentSelect(record));
  const actions = document.createElement('div');
  actions.className = 'history-actions';
  const rerun = document.createElement('button');
  rerun.className = 'button small'; rerun.type = 'button'; rerun.textContent = 'もう一度解く';
  rerun.addEventListener('click', async () => {
    await setPendingQuestion({ question: record.question, parentHistoryId: record.id });
    location.href = 'popup.html';
  });
  const remove = document.createElement('button');
  remove.className = 'button small danger'; remove.type = 'button'; remove.textContent = '削除';
  remove.addEventListener('click', async () => {
    if (!confirm('この履歴を削除しますか？')) return;
    await deleteHistory(record.id); setMessage('履歴を削除しました。', 'success'); await load();
  });
  actions.append(rerun, remove);
  article.append(heading, meta, time, details, field, actions);
  return article;
}

function filteredRecords() {
  const filtered = records.filter((record) => !elements.category.value || record.category === elements.category.value)
    .filter((record) => !elements.mode.value || record.mode === elements.mode.value)
    .filter((record) => !elements.reviewOnly.checked || record.needsReview);
  return filtered.sort((left, right) => {
    if (elements.sort.value === 'oldest') return Date.parse(left.createdAt) - Date.parse(right.createdAt);
    if (elements.sort.value === 'score') return (left.score ?? -1) - (right.score ?? -1) || Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
}

function render() {
  const visible = filteredRecords();
  elements.list.replaceChildren(...visible.map(renderRecord));
  elements.empty.hidden = visible.length !== 0;
}

async function load() {
  records = await getHistory();
  const current = elements.category.value;
  const categories = [...new Set(records.map((record) => record.category))].sort((a, b) => a.localeCompare(b, 'ja'));
  elements.category.replaceChildren(new Option('すべて', ''), ...categories.map((category) => new Option(category, category)));
  elements.category.value = categories.includes(current) ? current : '';
  render();
}

for (const control of [elements.sort, elements.category, elements.mode, elements.reviewOnly]) control.addEventListener('change', render);
elements.exportButton.addEventListener('click', async () => {
  const backup = { version: 1, type: 'math-study-log-history', exportedAt: new Date().toISOString(), history: await getHistory() };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `math-study-log-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  URL.revokeObjectURL(url); setMessage('JSONを書き出しました。', 'success');
});
elements.importButton.addEventListener('click', () => elements.importFile.click());
elements.importFile.addEventListener('change', async () => {
  const [file] = elements.importFile.files;
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const history = Array.isArray(parsed) ? parsed : parsed?.history;
    if (!Array.isArray(history)) throw new Error('履歴配列を確認できません。');
    const result = await importData({ history }, { mode: 'merge' });
    setMessage(`${result.importedHistoryCount}件を確認し、履歴は合計${result.totalHistoryCount}件になりました。`, 'success');
    await load();
  } catch (error) { setMessage(`読み込みに失敗しました: ${error.message}`, 'error'); }
  finally { elements.importFile.value = ''; }
});
elements.clearButton.addEventListener('click', async () => {
  if (!confirm('学習履歴をすべて削除しますか？この操作は取り消せません。')) return;
  await clearHistory(); setMessage('学習履歴をすべて削除しました。', 'success'); await load();
});
load().catch((error) => setMessage(`履歴を読み込めません: ${error.message}`, 'error'));
