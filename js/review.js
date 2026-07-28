import { getReviewItems, setPendingQuestion, updateHistory } from './storage.js';
import { formatDateTime } from './utils.js';

const list = document.querySelector('#reviewList');
const empty = document.querySelector('#reviewEmpty');
const count = document.querySelector('#reviewCount');
const preferOldest = document.querySelector('#preferOldest');
const message = document.querySelector('#reviewMessage');

function renderItem(record) {
  const article = document.createElement('article');
  article.className = `record ${record.categoryRecentLowCount >= 2 ? 'priority-high' : 'priority-medium'}`;
  const question = document.createElement('div'); question.className = 'record-question'; question.textContent = record.question;
  const meta = document.createElement('div'); meta.className = 'record-meta';
  for (const text of [record.category, record.score === null ? '未評価' : `${record.score}点`, `復習${record.reviewCount}回`]) {
    const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = text; meta.append(badge);
  }
  if (record.categoryRecentLowCount >= 2) { const badge = document.createElement('span'); badge.className = 'badge danger'; badge.textContent = '同分野で反復失敗'; meta.append(badge); }
  const time = document.createElement('p'); time.className = 'muted'; time.textContent = formatDateTime(record.createdAt);
  const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = '履歴詳細';
  const output = document.createElement('pre'); output.className = 'result-output'; output.textContent = record.output || record.finalAnswer || '出力なし'; details.append(summary, output);
  const actions = document.createElement('div'); actions.className = 'button-row';
  const retry = document.createElement('button'); retry.className = 'button primary'; retry.type = 'button'; retry.textContent = 'もう一度解く';
  retry.addEventListener('click', async () => { await setPendingQuestion({ question: record.question, parentHistoryId: record.id }); location.href = 'popup.html'; });
  const complete = document.createElement('button'); complete.className = 'button'; complete.type = 'button'; complete.textContent = '復習完了';
  complete.addEventListener('click', async () => { await updateHistory(record.id, { needsReview: false }); message.className = 'notice success'; message.textContent = '復習完了として記録しました。'; await load(); });
  actions.append(retry, complete); article.append(question, meta, time, details, actions); return article;
}

async function load() {
  const records = await getReviewItems({ preferOlder: preferOldest.checked });
  count.textContent = `${records.length}件`; list.replaceChildren(...records.map(renderItem)); empty.hidden = records.length !== 0;
}
preferOldest.addEventListener('change', () => load().catch(showError));
function showError(error) { message.className = 'notice error'; message.textContent = `復習一覧を読み込めません: ${error.message}`; }
load().catch(showError);

