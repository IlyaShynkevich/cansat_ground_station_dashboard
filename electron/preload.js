const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronSerial", {
  listPorts() {
    return ipcRenderer.invoke("serial:list");
  },
  connect(portPath, baudRate) {
    return ipcRenderer.invoke("serial:connect", portPath, baudRate);
  },
  disconnect() {
    return ipcRenderer.invoke("serial:disconnect");
  },
  write(payload) {
    return ipcRenderer.invoke("serial:write", payload);
  },
  onData(listener) {
    ipcRenderer.on("serial:data", (_, payload) => listener(payload));
  },
  onClose(listener) {
    ipcRenderer.on("serial:close", (_, portPath) => listener(portPath));
  },
  onError(listener) {
    ipcRenderer.on("serial:error", (_, message) => listener(message));
  },
});

contextBridge.exposeInMainWorld("electronMonitor", {
  getInfo() {
    return ipcRenderer.invoke("monitor:get-info");
  },
  publishSnapshot(snapshot) {
    ipcRenderer.send("monitor:publish", snapshot);
  },
});

contextBridge.exposeInMainWorld("electronApp", {
  quit() {
    return ipcRenderer.invoke("app:quit");
  },
});
