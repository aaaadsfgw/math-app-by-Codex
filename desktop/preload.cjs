const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mathStudyLog", {
  getState: () => ipcRenderer.invoke("desktop:state"),
  solve: (text) => ipcRenderer.invoke("desktop:solve", text),
  copy: (id) => ipcRenderer.invoke("desktop:copy", id),
  setKeepInTray: (enabled) => ipcRenderer.invoke("desktop:keep-in-tray", enabled),
  setShortcutKey: (key) => ipcRenderer.invoke("desktop:shortcut-key", key),
  onState: (listener) => {
    ipcRenderer.on("desktop:state-changed", (_event, state) => listener(state));
  },
});
