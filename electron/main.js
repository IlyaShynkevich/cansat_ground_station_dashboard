const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { SerialPort } = require("serialport");

const projectRoot = path.resolve(__dirname, "..");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

let localOrigin = "";
let staticServer = null;
let mainWindow = null;
let activeSerialPort = null;

function resolveAssetPath(requestUrl) {
  const cleanPath = decodeURIComponent(requestUrl.split("?")[0]);
  const relativePath = cleanPath === "/" ? "dashboard.html" : cleanPath.replace(/^\/+/, "");
  const filePath = path.resolve(projectRoot, relativePath);

  if (!filePath.startsWith(projectRoot)) {
    return null;
  }
  return filePath;
}

function createStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const filePath = resolveAssetPath(request.url || "/");
      if (!filePath) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      fs.readFile(filePath, (error, content) => {
        if (error) {
          const status = error.code === "ENOENT" ? 404 : 500;
          response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
          response.end(status === 404 ? "Not found" : "Internal server error");
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        response.writeHead(200, {
          "Content-Type": mimeTypes[ext] || "application/octet-stream",
          "Cache-Control": "no-store",
        });
        response.end(content);
      });
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      staticServer = server;
      const address = server.address();
      localOrigin = `http://127.0.0.1:${address.port}`;
      resolve(localOrigin);
    });
  });
}

function emitToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function closePort(port) {
  return new Promise((resolve) => {
    if (!port || !port.isOpen) {
      resolve();
      return;
    }

    port.close(() => resolve());
  });
}

async function closeActiveSerialPort() {
  const port = activeSerialPort;
  activeSerialPort = null;
  await closePort(port);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#f4f6f8",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(`${localOrigin}/dashboard.html`);
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
}

app.whenReady().then(async () => {
  await createStaticServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  closeActiveSerialPort().catch(() => {});
  staticServer?.close();
});

ipcMain.handle("serial:list", async () => {
  const ports = await SerialPort.list();
  return ports.map((port) => ({
    path: port.path,
    displayName: port.friendlyName || port.manufacturer || port.path,
    manufacturer: port.manufacturer || "",
    serialNumber: port.serialNumber || "",
  }));
});

ipcMain.handle("serial:connect", async (_, portPath) => {
  if (!portPath) {
    throw new Error("No COM port selected");
  }

  await closeActiveSerialPort();

  const port = new SerialPort({
    path: portPath,
    baudRate: 115200,
    autoOpen: false,
  });

  await new Promise((resolve, reject) => {
    port.open((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  port.on("data", (chunk) => {
    emitToRenderer("serial:data", Buffer.from(chunk).toString("utf8"));
  });

  port.on("error", (error) => {
    emitToRenderer("serial:error", error?.message || String(error));
  });

  port.on("close", () => {
    if (activeSerialPort === port) {
      activeSerialPort = null;
    }
    emitToRenderer("serial:close", portPath);
  });

  activeSerialPort = port;
  return { path: portPath, baudRate: 115200 };
});

ipcMain.handle("serial:disconnect", async () => {
  await closeActiveSerialPort();
  return true;
});

ipcMain.handle("serial:write", async (_, payload) => {
  if (!activeSerialPort?.isOpen) {
    throw new Error("No USB connection");
  }

  await new Promise((resolve, reject) => {
    activeSerialPort.write(payload, (error) => {
      if (error) {
        reject(error);
        return;
      }
      activeSerialPort.drain((drainError) => {
        if (drainError) reject(drainError);
        else resolve();
      });
    });
  });

  return true;
});
