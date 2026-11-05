const api = window.mathStudyLog;
const byId = (id) => document.getElementById(id);
const question = byId("question");
const solve = byId("solve");
const copy = byId("copy");
const shortcutKey = byId("shortcut-key");
const saveShortcut = byId("save-shortcut");
const keepInTray = byId("keep-in-tray");
let resultId;
let savedKey;
let saving = false;
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

function render({ calculation, preferences, activeKey, settingsError }) {
  const { phase, message, result } = calculation;
  const busy = phase === "starting" || phase === "working";
  resultId = result?.id;
  solve.disabled = busy;
  copy.disabled = busy || !result;
  byId("status").textContent = phase === "error" ? "操作を完了できませんでした。" : message;
  showError(byId("error"), phase === "error" ? message : "");
  byId("result").hidden = !result;
  byId("answer").textContent = result?.answer ?? "";
  byId("result-kind").textContent = resultKinds[result?.kind] ?? "検証済み";
  const conditions = byId("conditions");
  conditions.replaceChildren(...(result?.conditions ?? []).map((condition) => {
    const item = document.createElement("li");
    item.textContent = condition;
    return item;
  }));
  conditions.hidden = !conditions.childElementCount;

  if (savedKey !== preferences.shortcutKey || saving) shortcutKey.value = preferences.shortcutKey;
  savedKey = preferences.shortcutKey;
  keepInTray.checked = preferences.keepInTray;
  shortcutKey.disabled = saving;
  saveShortcut.disabled = saving;
  keepInTray.disabled = saving;
  byId("shortcut-status").textContent = activeKey
    ? `Ctrl+Shift+${activeKey} · クリップボードの数式を計算`
    : `Ctrl+Shift+${savedKey} · 未登録`;
  showError(byId("settings-error"), settingsError);
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
  shortcutKey.disabled = saveShortcut.disabled = keepInTray.disabled = true;
  try {
    const state = await action();
    if (state.settingsError) shortcutKey.value = state.preferences.shortcutKey;
    saving = false;
    render(state);
  } catch {
    saving = false;
    shortcutKey.disabled = saveShortcut.disabled = keepInTray.disabled = false;
    showError(byId("settings-error"), "設定を送信できませんでした。");
  }
}

byId("solve-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void invoke(() => api.solve(question.value), byId("error"));
});
copy.addEventListener("click", () => void invoke(() => api.copy(resultId), byId("error")));
byId("shortcut-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void save(() => api.setShortcutKey(shortcutKey.value));
});
keepInTray.addEventListener("change", () => void save(() => api.setKeepInTray(keepInTray.checked)));

api.onState(render);
void invoke(api.getState, byId("error"));
