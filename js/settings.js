import { DEFAULT_SETTINGS, clearAllData, getSettings, resetSettings, saveSettings } from './storage.js';

const form = document.querySelector('#settingsForm');
const message = document.querySelector('#settingsMessage');
const fields = Object.fromEntries([...form.querySelectorAll('input[id], select[id]')].map((element) => [element.id, element]));
const supportedUrl = /^http:\/\/(localhost|127\.0\.0\.1):11434\/api\/chat$/;

function fill(settings) {
  for (const [key, input] of Object.entries(fields)) {
    if (!(key in settings)) continue;
    if (input.type === 'checkbox') input.checked = Boolean(settings[key]);
    else input.value = settings[key];
  }
}
function show(text, kind = 'success') { message.className = `notice ${kind}`; message.textContent = text; }

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const apiUrl = fields.apiUrl.value.trim().replace(/\/$/, '');
  if (!supportedUrl.test(apiUrl)) { show('正式対応URLは http://localhost:11434/api/chat または http://127.0.0.1:11434/api/chat です。', 'error'); fields.apiUrl.focus(); return; }
  try {
    const settings = await saveSettings({ apiUrl, modelName: fields.modelName.value.trim(), defaultMode: fields.defaultMode.value,
      timeoutSeconds: Number(fields.timeoutSeconds.value), maxHistory: Number(fields.maxHistory.value), saveHistory: fields.saveHistory.checked,
      demoMode: fields.demoMode.checked, allowUnverifiedAiAnswer: fields.allowUnverifiedAiAnswer.checked });
    fill(settings); show('設定を保存しました。');
  } catch (error) { show(`設定を保存できません: ${error.message}`, 'error'); }
});
document.querySelector('#resetSettingsButton').addEventListener('click', async () => { if (!confirm('設定を初期値へ戻しますか？')) return; fill(await resetSettings()); show('設定を初期化しました。'); });
document.querySelector('#clearAllDataButton').addEventListener('click', async () => { if (!confirm('履歴・設定・図形下書きを含む全データを削除しますか？この操作は取り消せません。')) return; await clearAllData(); fill(DEFAULT_SETTINGS); show('全データを削除し、設定を初期値へ戻しました。'); });
getSettings().then(fill).catch((error) => show(`設定を読み込めません: ${error.message}`, 'error'));

