const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopOcrHost", {
  onRequest(handler) {
    ipcRenderer.once("desktop:ocr-host:recognize", (_event, request) => handler(request));
  },
  reply(id, response) {
    ipcRenderer.send("desktop:ocr-host:result", id, response);
  },
});
