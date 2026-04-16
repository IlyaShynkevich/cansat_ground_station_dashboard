const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
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
let staticPort = 0;
let staticServer = null;
let mainWindow = null;
let activeSerialPort = null;
let monitorSnapshot = buildDefaultMonitorSnapshot();
const monitorClients = new Set();
const remoteMonitorAssets = new Set(["phone.html", "phone.css", "phone.js"]);

function buildDefaultMonitorSnapshot() {
  return {
    updatedAt: new Date().toISOString(),
    hasData: false,
    sourceLabel: "Source: Demo",
    connection: {
      connected: false,
      portPath: null,
      selectedPort: "Not selected",
      bridge: "Scanning COM ports",
      baudRate: null,
    },
    mission: {
      time: "--",
      mode: "--",
      state: "--",
      packetsReceived: 0,
      packetsLost: 0,
      gpsSats: "--",
    },
    quickChecks: {
      telemetryLink: "bad",
      loggingReady: "warn",
      simulationMode: "ok",
      batteryOk: "warn",
    },
    metrics: {
      altitude: "--",
      temperature: "--",
      pressure: "--",
      voltage: "--",
      current: "--",
      gpsAltitude: "--",
      gpsFix: "No Fix",
    },
    gps: {
      fix: false,
      latitude: null,
      longitude: null,
      display: "Waiting for GPS fix",
      mapUrl: "",
      points: [],
    },
    commands: {
      lastSent: "--",
      echo: "--",
    },
    telemetry: [],
  };
}

function sanitizeMonitorSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return buildDefaultMonitorSnapshot();
  }

  const fallback = buildDefaultMonitorSnapshot();
  return {
    ...fallback,
    ...snapshot,
    updatedAt: typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : new Date().toISOString(),
    connection: { ...fallback.connection, ...(snapshot.connection || {}) },
    mission: { ...fallback.mission, ...(snapshot.mission || {}) },
    quickChecks: { ...fallback.quickChecks, ...(snapshot.quickChecks || {}) },
    metrics: { ...fallback.metrics, ...(snapshot.metrics || {}) },
    gps: {
      ...fallback.gps,
      ...(snapshot.gps || {}),
      points: Array.isArray(snapshot.gps?.points) ? snapshot.gps.points : fallback.gps.points,
    },
    commands: { ...fallback.commands, ...(snapshot.commands || {}) },
    telemetry: Array.isArray(snapshot.telemetry) ? snapshot.telemetry : fallback.telemetry,
  };
}

function getLanPhoneUrls(port) {
  if (!port) return [];
  const urls = new Set();
  const interfaces = os.networkInterfaces();

  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (!entry || entry.family !== "IPv4" || entry.internal) return;
      urls.add(`http://${entry.address}:${port}/phone.html`);
    });
  });

  return [...urls];
}

function getMonitorInfo() {
  const urls = getLanPhoneUrls(staticPort);
  return {
    port: staticPort,
    primaryUrl: urls[0] || "",
    urls,
    fallbackUrl: staticPort ? `http://127.0.0.1:${staticPort}/phone.html` : "",
    livePath: "/api/live",
    snapshotPath: "/api/snapshot",
  };
}

function broadcastMonitorSnapshot() {
  for (const response of monitorClients) {
    if (response.destroyed) {
      monitorClients.delete(response);
      continue;
    }
    response.write(`event: snapshot\ndata: ${JSON.stringify({
      snapshot: monitorSnapshot,
      monitor: getMonitorInfo(),
    })}\n\n`);
  }
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function closeMonitorClients() {
  for (const response of monitorClients) {
    if (!response.destroyed) response.end();
  }
  monitorClients.clear();
}

function resolveAssetPath(requestUrl, defaultFile = "dashboard.html") {
  const cleanPath = decodeURIComponent(requestUrl.split("?")[0]);
  const relativePath = cleanPath === "/" ? defaultFile : cleanPath.replace(/^\/+/, "");
  const filePath = path.resolve(projectRoot, relativePath);

  if (!filePath.startsWith(projectRoot)) {
    return null;
  }
  return filePath;
}

function createStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const remoteAddress = request.socket.remoteAddress || "";
      const isLoopbackRequest = /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(remoteAddress);

      if (requestUrl.pathname === "/api/snapshot") {
        writeJson(response, 200, {
          snapshot: monitorSnapshot,
          monitor: getMonitorInfo(),
        });
        return;
      }

      if (requestUrl.pathname === "/api/live") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        response.write("retry: 2000\n\n");
        monitorClients.add(response);
        response.write(`event: snapshot\ndata: ${JSON.stringify({
          snapshot: monitorSnapshot,
          monitor: getMonitorInfo(),
        })}\n\n`);

        request.on("close", () => {
          monitorClients.delete(response);
        });
        return;
      }

      const filePath = resolveAssetPath(
        requestUrl.pathname,
        isLoopbackRequest ? "dashboard.html" : "phone.html"
      );
      if (!filePath) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const relativeAssetPath = path.relative(projectRoot, filePath).replace(/\\/g, "/");
      if (!isLoopbackRequest && !remoteMonitorAssets.has(relativeAssetPath)) {
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Forbidden");
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
    server.listen(0, "0.0.0.0", () => {
      staticServer = server;
      const address = server.address();
      staticPort = address.port;
      localOrigin = `http://127.0.0.1:${staticPort}`;
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
  closeMonitorClients();
  staticServer?.close();
});

ipcMain.handle("serial:list", async () => {
  const ports = await SerialPort.list();
  return ports.map((port) => ({
    path: port.path,
    displayName: port.friendlyName || port.manufacturer || port.path,
    manufacturer: port.manufacturer || "",
    serialNumber: port.serialNumber || "",
    vendorId: port.vendorId || "",
    productId: port.productId || "",
    pnpId: port.pnpId || "",
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
    throw new Error("No serial link");
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

ipcMain.handle("monitor:get-info", async () => getMonitorInfo());

ipcMain.on("monitor:publish", (_, snapshot) => {
  monitorSnapshot = sanitizeMonitorSnapshot(snapshot);
  broadcastMonitorSnapshot();
});
