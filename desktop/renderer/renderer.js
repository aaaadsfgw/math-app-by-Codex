const api = window.mathStudyLog;
const byId = (id) => document.getElementById(id);
const question = byId("question");
const solve = byId("solve");
const copy = byId("copy");
const shortcutKey = byId("shortcut-key");
const saveShortcut = byId("save-shortcut");
const keepInTray = byId("keep-in-tray");
const ocrForm = byId("ocr-form");
const ocrImage = byId("ocr-image");
const ocrDraft = byId("ocr-draft");
const ocrOriginal = byId("ocr-original");
const ocrRecalculate = byId("ocr-recalculate");
const ocrCopyAnswer = byId("ocr-copy-answer");
const ocrCopy = byId("ocr-copy");
const ocrRetry = byId("ocr-retry");
const ocrCancel = byId("ocr-cancel");
const ocrError = byId("ocr-error");
const ocrModel = byId("ocr-model");
let resultId;
let savedKey;
let saving = false;
let previewId;
let previewText = "";
let previewImage = "";
let canActOnPreview = false;
const resultKinds = {
  exact: "検証済み",
  approximate: "検証済み · 近似値",
  conditional: "検証済み · 条件付き",
};

for (const key of "ABCDEFGHIJKLMNOPQRSTUVWYZ") {
  shortcutKey.add(new Option(key, key));
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

function renderList(element, entries) {
  element.replaceChildren(...(entries ?? []).map((entry) => {
    const item = document.createElement("li");
    item.textContent = entry;
    return item;
  }));
  element.hidden = !element.childElementCount;
}

function updateOcrDraftButtons() {
  const disabled = !canActOnPreview || !ocrDraft.value.trim();
  ocrRecalculate.disabled = disabled;
  ocrCopy.disabled = disabled;
  ocrCopyAnswer.disabled = !canActOnPreview || ocrCopyAnswer.hidden || ocrDraft.value !== previewText;
}

function renderOcr(ocr, mathBusy, blocked) {
  const { phase, message, preview } = ocr;
  const processing = phase === "selecting" || phase === "recognizing" || phase === "calculating";
  const nextText = preview?.text ?? "";
  if (previewId !== preview?.id) {
    ocrDraft.value = nextText;
    ocrOriginal.open = false;
  } else if (nextText !== previewText && ocrDraft.value === previewText) {
    ocrDraft.value = nextText;
  }
  previewId = preview?.id;
  previewText = nextText;

  const imageUrl = preview?.imageUrl?.startsWith("data:image/png;base64,") ? preview.imageUrl : "";
  if (imageUrl !== previewImage) {
    if (imageUrl) ocrImage.src = imageUrl;
    else ocrImage.removeAttribute("src");
    previewImage = imageUrl;
  }
  ocrImage.hidden = !imageUrl;

  const modelName = preview?.model === "pix2text" ? "Pix2Text MFR 1.5" : "IBEM";
  byId("ocr-model-used").textContent = preview?.model ? modelName : "";
  byId("ocr-model-used").hidden = !preview?.model;
  byId("ocr-fields").hidden = !preview?.model;
  byId("ocr-label").textContent = preview?.label || "—";
  byId("ocr-instruction").textContent = preview?.instruction || "—";
  byId("ocr-formula").textContent = preview?.formula || "—";
  renderList(byId("ocr-warnings"), preview?.warnings);
  const rawText = preview?.rawFormula ?? "";
  ocrOriginal.hidden = !rawText;
  byId("ocr-raw-title").textContent = preview?.model === "pix2text" ? "認識したLaTeX" : "認識したTypst";
  byId("ocr-raw").textContent = rawText;

  const result = preview?.result;
  byId("ocr-result").hidden = !result;
  byId("ocr-answer").textContent = result?.answer ?? "";
  byId("ocr-result-kind").textContent = result ? (resultKinds[result.kind] ?? "検証済み") : "";
  renderList(byId("ocr-conditions"), result?.conditions);
  byId("ocr-submission").hidden = !preview?.submittedText;
  byId("ocr-submitted").textContent = preview?.submittedText ?? "";

  ocrForm.hidden = !preview;
  canActOnPreview = !!preview && !processing && !mathBusy && !blocked;
  ocrDraft.disabled = processing;
  ocrCopyAnswer.hidden = !result;
  updateOcrDraftButtons();
  ocrRetry.disabled = !canActOnPreview || !imageUrl;
  ocrCancel.hidden = !processing && !preview;
  ocrCancel.textContent = processing || phase === "review" ? "キャンセル" : "閉じる";
  const status = byId("ocr-status");
  const failed = phase === "error" || phase === "calculation-error";
  status.textContent = failed ? "" : message;
  status.hidden = !status.textContent;
  showError(ocrError, failed ? message : "");
}

function render({ calculation, preferences, activeKey, settingsError,
  ocr, ocrShortcutActive, ocrShortcutError, calculationBlocked, pix2textAvailable }) {
  const { phase, message, result } = calculation;
  const busy = phase === "starting" || phase === "working";
  resultId = result?.id;
  solve.disabled = busy || calculationBlocked;
  copy.disabled = busy || calculationBlocked || !result;
  byId("status").textContent = phase === "error" ? "操作を完了できませんでした。" : message;
  showError(byId("error"), phase === "error" ? message : "");
  byId("result").hidden = !result;
  byId("answer").textContent = result?.answer ?? "";
  byId("result-kind").textContent = resultKinds[result?.kind] ?? "検証済み";
  renderList(byId("conditions"), result?.conditions);

  if (savedKey !== preferences.shortcutKey || saving) shortcutKey.value = preferences.shortcutKey;
  savedKey = preferences.shortcutKey;
  keepInTray.checked = preferences.keepInTray;
  shortcutKey.disabled = saving;
  saveShortcut.disabled = saving;
  keepInTray.disabled = saving;
  ocrModel.value = preferences.ocrModel;
  ocrModel.options[0].textContent = pix2textAvailable ? "自動（Pix2Text）" : "自動（IBEM）";
  ocrModel.disabled = saving || calculationBlocked;
  byId("ocr-model-hint").hidden = pix2textAvailable;
  byId("shortcut-status").textContent = activeKey
    ? `Ctrl+Shift+${activeKey} · クリップボードの数式を計算`
    : `Ctrl+Shift+${savedKey} · 未登録`;
  showError(byId("settings-error"), settingsError);
  byId("ocr-shortcut-hint").hidden = !ocrShortcutActive;
  showError(byId("ocr-shortcut-error"), ocrShortcutError);
  renderOcr(ocr, busy, calculationBlocked);
}

async function invoke(action, errorElement) {
  try {
    render(await action());
  } catch {
    showError(errorElement, "操作を送信できませんでした。");
  }
}

async function save(action) {
  saving = true;
  shortcutKey.disabled = saveShortcut.disabled = keepInTray.disabled = ocrModel.disabled = true;
  try {
    const state = await action();
    if (state.settingsError) shortcutKey.value = state.preferences.shortcutKey;
    saving = false;
    render(state);
  } catch {
    saving = false;
    shortcutKey.disabled = saveShortcut.disabled = keepInTray.disabled = ocrModel.disabled = false;
    showError(byId("settings-error"), "設定を送信できませんでした。");
  }
}

byId("solve-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void invoke(() => api.solve(question.value), byId("error"));
});
copy.addEventListener("click", () => void invoke(() => api.copy(resultId), byId("error")));
ocrDraft.addEventListener("input", updateOcrDraftButtons);
ocrForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!ocrRecalculate.disabled) void invoke(() => api.recalculateOcr(previewId, ocrDraft.value), ocrError);
});
ocrCopyAnswer.addEventListener("click", () => void invoke(() => api.copyOcrAnswer(previewId), ocrError));
ocrCopy.addEventListener("click", () => void invoke(() => api.copyOcr(previewId, ocrDraft.value), ocrError));
ocrRetry.addEventListener("click", () => void invoke(() => api.retryOcr(previewId), ocrError));
ocrCancel.addEventListener("click", () => void invoke(api.cancelOcr, ocrError));
byId("shortcut-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void save(() => api.setShortcutKey(shortcutKey.value));
});
keepInTray.addEventListener("change", () => void save(() => api.setKeepInTray(keepInTray.checked)));
ocrModel.addEventListener("change", () => void save(() => api.setOcrModel(ocrModel.value)));

api.onState(render);
void invoke(api.getState, byId("error"));
