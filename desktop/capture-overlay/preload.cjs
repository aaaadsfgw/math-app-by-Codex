const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("screenSelection", {
  select: (x, y, width, height) => ipcRenderer.send("desktop:capture-select", { x, y, width, height }),
  cancel: () => ipcRenderer.send("desktop:capture-cancel"),
});
