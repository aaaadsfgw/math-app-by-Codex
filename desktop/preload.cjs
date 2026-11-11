const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mathStudyLog", {
  getState: () => ipcRenderer.invoke("desktop:state"),
  solve: (text) => ipcRenderer.invoke("desktop:solve", text),
  copy: (id) => ipcRenderer.invoke("desktop:copy", id),
  copyOcr: (id, text) => ipcRenderer.invoke("desktop:ocr-copy", id, text),
  retryOcr: (id) => ipcRenderer.invoke("desktop:ocr-retry", id),
  cancelOcr: () => ipcRenderer.invoke("desktop:ocr-cancel"),
  setKeepInTray: (enabled) => ipcRenderer.invoke("desktop:keep-in-tray", enabled),
  setShortcutKey: (key) => ipcRenderer.invoke("desktop:shortcut-key", key),
  onState: (listener) => {
    ipcRenderer.on("desktop:state-changed", (_event, state) => listener(state));
  },
});
