const elements = {
  button: document.querySelector("#openPanelButton"),
  status: document.querySelector("#launcherStatus"),
  help: document.querySelector("#launcherHelp"),
};

function setLauncherError(message) {
  elements.status.textContent = message;
  elements.status.classList.add("danger-text");
  elements.help.hidden = false;
}

async function openWorkspace() {
  if (typeof chrome.sidePanel?.open !== "function") {
    setLauncherError("このChromeではSide Panelを利用できません。Chrome 114以降でお試しください。");
    return false;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Number.isSafeInteger(tab?.windowId)) {
    throw new Error("現在のブラウザウィンドウを取得できませんでした。");
  }
  await chrome.sidePanel.open({ windowId: tab.windowId });
  return true;
}

async function handleOpen() {
  elements.button.disabled = true;
  elements.status.textContent = "ワークスペースを開いています…";
  try {
    if (await openWorkspace()) globalThis.close();
  } catch (error) {
    elements.button.disabled = false;
    setLauncherError(error instanceof Error ? error.message : "Side Panelを開けませんでした。");
  }
}

elements.button.addEventListener("click", () => void handleOpen());
elements.help.hidden = false;
