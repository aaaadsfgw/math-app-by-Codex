import { DEFAULT_SETTINGS, clearAllData, getSettings, resetSettings, saveSettings } from './storage.js';
import { OCR_FOUNDATION_CONFIG } from './ocr/ocr-config.js';

const form = document.querySelector('#settingsForm');
const message = document.querySelector('#settingsMessage');
const fields = Object.fromEntries([...form.querySelectorAll('input[id], select[id]')].map((element) => [element.id, element]));
const resetButton = document.querySelector('#resetSettingsButton');
const clearButton = document.querySelector('#clearAllDataButton');

function fill(settings) {
  for (const [key, input] of Object.entries(fields)) {
    if (!(key in settings)) continue;
    if (input.type === 'checkbox') input.checked = Boolean(settings[key]);
    else input.value = settings[key];
  }
}
function show(text, kind = 'success') { message.className = `notice ${kind}`; message.textContent = text; }

function safeErrorMessage(error) {
  return error instanceof Error && error.message ? error.message : '詳細不明のエラー';
}

function setBusy(busy) {
  form.setAttribute('aria-busy', String(busy));
  for (const control of form.querySelectorAll('button, input, select')) control.disabled = busy;
}

function fillOcrInformation() {
  const { availability, backend, licenseGate, model, providers } = OCR_FOUNDATION_CONFIG;
  document.querySelector('#ocrAvailabilityInfo').textContent = availability.available
    ? '利用可能'
    : `現在は利用できません（${licenseGate.reason}）`;
  document.querySelector('#ocrBackendInfo').textContent = `${backend.name}（暫定候補）`;
  document.querySelector('#ocrModelInfo').textContent = `${model.family}、公開資産 約${model.publishedAssetSizeMb} MB。モデル重みは${model.assetsBundled ? '同梱済み' : '未同梱'}です。`;
  const providerLabels = { webgpu: 'WebGPU', wasm: 'WASM' };
  document.querySelector('#ocrProviderInfo').textContent = `${providers.map((provider) => providerLabels[provider] ?? provider).join(' → ')} の順で試行します。WebGPUとWASMは同梱モデルで実測済みです。`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setBusy(true);
  try {
    const settings = await saveSettings({
      defaultMode: fields.defaultMode.value,
      learningMode: fields.learningMode.value,
      shortcutAction: fields.shortcutAction.value,
      maxHistory: Number(fields.maxHistory.value),
      saveHistory: fields.saveHistory.checked,
    });
    fill(settings); show('設定を保存しました。');
  } catch (error) { show(`設定を保存できません: ${safeErrorMessage(error)}`, 'error'); }
  finally { setBusy(false); }
});

resetButton.addEventListener('click', async () => {
  if (!confirm('設定を初期値へ戻しますか？')) return;
  setBusy(true);
  try {
    fill(await resetSettings());
    show('設定を初期化しました。');
  } catch (error) {
    show(`設定を初期化できません: ${safeErrorMessage(error)}`, 'error');
  } finally {
    setBusy(false);
  }
});

clearButton.addEventListener('click', async () => {
  if (!confirm('履歴・設定を含む全データを削除しますか？この操作は取り消せません。')) return;
  setBusy(true);
  try {
    await clearAllData();
    fill(DEFAULT_SETTINGS);
    show('全データを削除し、設定を初期値へ戻しました。');
  } catch (error) {
    show(`全データを削除できません: ${safeErrorMessage(error)}`, 'error');
  } finally {
    setBusy(false);
  }
});

async function initialize() {
  setBusy(true);
  try {
    fillOcrInformation();
    fill(await getSettings());
  } catch (error) {
    show(`設定を読み込めません: ${safeErrorMessage(error)}`, 'error');
  } finally {
    setBusy(false);
  }
}

initialize();
