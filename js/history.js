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
const verificationLabels = { solver: '数式エンジンで検証済み', demo: '旧デモ履歴', 'ai-only': '旧AI履歴・未検証', unsupported: '自動検証不能' };
const sourceLabels = {
  manual: '手入力', selection: 'Web選択', clipboard: 'クリップボード', ocr: '画像OCR',
  popup: 'ポップアップ（旧形式）', shortcut: '選択ショートカット（旧形式）',
  geometry: '図形入力（旧形式）', review: '復習から再実行',
};
const entryPointLabels = { shortcut: 'ショートカット', review: '復習から再実行' };

const elements = {
  main: document.querySelector('#historyMain'), loading: document.querySelector('#historyLoading'),
  list: document.querySelector('#historyList'), empty: document.querySelector('#historyEmpty'),
  message: document.querySelector('#historyMessage'), sort: document.querySelector('#sortSelect'),
  category: document.querySelector('#categoryFilter'), mode: document.querySelector('#modeFilter'),
  source: document.querySelector('#sourceFilter'),
  reviewOnly: document.querySelector('#reviewOnly'), exportButton: document.querySelector('#exportButton'),
  importButton: document.querySelector('#importButton'), importFile: document.querySelector('#importFile'),
  clearButton: document.querySelector('#clearHistoryButton'),
};
let records = [];

function viewedModes(record) {
  const modes = Array.isArray(record.usage?.viewedModes)
    ? record.usage.viewedModes.filter((mode) => Object.hasOwn(modeLabels, mode))
    : [];
  return modes.length ? modes : [record.mode].filter((mode) => Object.hasOwn(modeLabels, mode));
}

function sourceLabel(source) {
  return sourceLabels[source] ?? '入力元不明';
}

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

function safeErrorMessage(error) {
  return error instanceof Error && error.message ? error.message : '詳細不明のエラー';
}

function assessmentSelect(record, inputId) {
  const select = document.createElement('select');
  select.id = inputId;
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
    const previous = record.selfAssessment;
    select.disabled = true;
    try {
      await updateHistory(record.id, {
        selfAssessment: select.value,
        needsReview: select.value === 'unassessed',
      });
      setMessage('自己評価を更新しました。', 'success');
      await load();
    } catch (error) {
      select.value = previous;
      setMessage(`自己評価を更新できません: ${safeErrorMessage(error)}`, 'error');
    } finally {
      select.disabled = false;
    }
  });
  return select;
}

function renderRecord(record, index) {
  const article = document.createElement('article');
  article.className = 'record';
  const heading = document.createElement('h2');
  heading.id = `history-question-${index}`;
  heading.className = 'record-question';
  heading.textContent = record.question;
  article.setAttribute('aria-labelledby', heading.id);
  const meta = document.createElement('div');
  meta.className = 'record-meta';
  const modes = viewedModes(record);
  meta.append(
    createBadge(record.category),
    createBadge(`入力: ${sourceLabel(record.source)}`, 'info'),
    createBadge(`最初: ${modeLabels[modes[0]] ?? '不明'}`),
  );
  if (entryPointLabels[record.entryPoint] && record.entryPoint !== record.source) {
    meta.append(createBadge(entryPointLabels[record.entryPoint]));
  }
  meta.append(createBadge(verificationLabels[record.verificationType] ?? '状態不明', record.verified ? 'success' : 'warning'));
  if (record.ocrUsed) {
    meta.append(createBadge(
      record.ocrConfirmed ? 'OCR文字列を確認済み' : 'OCR文字列は未確認',
      record.ocrConfirmed ? 'info' : 'warning',
    ));
  }
  if (record.needsReview) meta.append(createBadge('要復習', 'danger'));
  meta.append(createBadge(record.score === null ? '未評価' : `${record.score}点`));
  const usage = document.createElement('div');
  usage.className = 'history-usage';
  const usageLabel = document.createElement('span');
  usageLabel.className = 'muted';
  usageLabel.textContent = '利用した内容';
  const usageBadges = document.createElement('div');
  usageBadges.className = 'record-meta';
  for (const mode of modes) usageBadges.append(createBadge(modeLabels[mode]));
  usage.append(usageLabel, usageBadges);
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
  verification.textContent = `数学の検証: ${record.verificationMessage || '検証メッセージなし'}`;
  details.append(summary, output, verification);
  if (record.ocrUsed) {
    const ocr = document.createElement('p');
    ocr.className = 'muted';
    ocr.textContent = record.ocrConfirmed
      ? '画像認識: 認識文字列をユーザーが確認しました。元画像との一致を数学エンジンが保証するものではありません。'
      : '画像認識: 認識文字列のユーザー確認記録がありません。';
    details.append(ocr);
  }
  const field = document.createElement('div');
  field.className = 'field';
  const label = document.createElement('label');
  label.textContent = '自己評価を変更';
  const assessmentId = `history-assessment-${index}`;
  label.htmlFor = assessmentId;
  field.append(label, assessmentSelect(record, assessmentId));
  const actions = document.createElement('div');
  actions.className = 'history-actions';
  const rerun = document.createElement('button');
  rerun.className = 'button small'; rerun.type = 'button'; rerun.textContent = 'もう一度解く';
  rerun.addEventListener('click', async () => {
    rerun.disabled = true;
    try {
      await setPendingQuestion({ question: record.question, parentHistoryId: record.id });
      location.href = 'popup.html';
    } catch (error) {
      rerun.disabled = false;
      setMessage(`問題を開けません: ${safeErrorMessage(error)}`, 'error');
    }
  });
  const remove = document.createElement('button');
  remove.className = 'button small danger'; remove.type = 'button'; remove.textContent = '削除';
  remove.addEventListener('click', async () => {
    if (!confirm('この履歴を削除しますか？')) return;
    remove.disabled = true;
    try {
      await deleteHistory(record.id);
      setMessage('履歴を削除しました。', 'success');
      await load();
    } catch (error) {
      remove.disabled = false;
      setMessage(`履歴を削除できません: ${safeErrorMessage(error)}`, 'error');
    }
  });
  actions.append(rerun, remove);
  article.append(heading, meta, usage, time, details, field, actions);
  return article;
}

function filteredRecords() {
  const filtered = records.filter((record) => !elements.category.value || record.category === elements.category.value)
    .filter((record) => !elements.mode.value || viewedModes(record).includes(elements.mode.value))
    .filter((record) => !elements.source.value || record.source === elements.source.value)
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
  elements.list.hidden = visible.length === 0;
  elements.empty.hidden = visible.length !== 0;
}

async function load() {
  elements.main.setAttribute('aria-busy', 'true');
  records = (await getHistory()).filter((record) => record.learningMode !== 'quick');
  const currentCategory = elements.category.value;
  const currentSource = elements.source.value;
  const categories = [...new Set(records.map((record) => record.category))].sort((a, b) => a.localeCompare(b, 'ja'));
  elements.category.replaceChildren(new Option('すべて', ''), ...categories.map((category) => new Option(category, category)));
  elements.category.value = categories.includes(currentCategory) ? currentCategory : '';
  const sources = [...new Set(records.map((record) => record.source))]
    .sort((left, right) => sourceLabel(left).localeCompare(sourceLabel(right), 'ja'));
  elements.source.replaceChildren(
    new Option('すべて', ''),
    ...sources.map((source) => new Option(sourceLabel(source), source)),
  );
  elements.source.value = sources.includes(currentSource) ? currentSource : '';
  elements.loading.hidden = true;
  elements.main.setAttribute('aria-busy', 'false');
  render();
}

for (const control of [elements.sort, elements.category, elements.mode, elements.source, elements.reviewOnly]) control.addEventListener('change', render);
elements.exportButton.addEventListener('click', async () => {
  elements.exportButton.disabled = true;
  try {
    const backup = { version: 2, type: 'math-study-log-history', exportedAt: new Date().toISOString(), history: records };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `math-study-log-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage('JSONを書き出しました。', 'success');
  } catch (error) {
    setMessage(`JSONを書き出せません: ${safeErrorMessage(error)}`, 'error');
  } finally {
    elements.exportButton.disabled = false;
  }
});
elements.importButton.addEventListener('click', () => elements.importFile.click());
elements.importFile.addEventListener('change', async () => {
  const [file] = elements.importFile.files;
  if (!file) return;
  elements.importButton.disabled = true;
  try {
    const parsed = JSON.parse(await file.text());
    const history = Array.isArray(parsed) ? parsed : parsed?.history;
    if (!Array.isArray(history)) throw new Error('履歴配列を確認できません。');
    const result = await importData({ history }, { mode: 'merge' });
    await load();
    setMessage(`${result.importedHistoryCount}件を確認しました。表示対象のStudy履歴は${records.length}件です。`, 'success');
  } catch (error) { setMessage(`読み込みに失敗しました: ${safeErrorMessage(error)}`, 'error'); }
  finally {
    elements.importFile.value = '';
    elements.importButton.disabled = false;
  }
});
elements.clearButton.addEventListener('click', async () => {
  if (!confirm('学習履歴をすべて削除しますか？この操作は取り消せません。')) return;
  elements.clearButton.disabled = true;
  try {
    await clearHistory();
    setMessage('学習履歴をすべて削除しました。', 'success');
    await load();
  } catch (error) {
    setMessage(`学習履歴を削除できません: ${safeErrorMessage(error)}`, 'error');
  } finally {
    elements.clearButton.disabled = false;
  }
});
load().catch((error) => {
  elements.loading.hidden = true;
  elements.main.setAttribute('aria-busy', 'false');
  elements.list.hidden = true;
  elements.empty.hidden = true;
  setMessage(`履歴を読み込めません: ${safeErrorMessage(error)}`, 'error');
});
