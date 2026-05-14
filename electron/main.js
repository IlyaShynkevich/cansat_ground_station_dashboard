const { app, BrowserWindow, ipcMain, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { SerialPort } = require("serialport");

// This app does not require GPU acceleration, and some lab/VM laptops crash
// Electron's Chromium GPU process during startup. Force a software path.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");

const projectRoot = path.resolve(__dirname, "..");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const preferredMonitorPort = 63668;
const telemetryArchivePath = path.join(projectRoot, "logs", "telemetry-archive.csv");

let localOrigin = "";
let staticPort = 0;
let staticServer = null;
let monitorUsesFallbackPort = false;
let remoteMonitorToken = "";
let mainWindow = null;
let activeSerialPort = null;
let monitorSnapshot = buildDefaultMonitorSnapshot();
const monitorClients = new Set();
let isQuitting = false;
let didCleanupBeforeQuit = false;
let cleanupPromise = null;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const remoteMonitorAssets = new Set([
  "phone.html",
  "phone.css",
  "phone.js",
  "SkyBound/SkyBound_Logo.png",
  "node_modules/three/build/three.module.js",
  "node_modules/three/examples/jsm/controls/OrbitControls.js",
]);

if (!hasSingleInstanceLock) {
  app.quit();
}

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

function scoreNetworkInterface(entry) {
  const name = String(entry.name || "").toLowerCase();
  const address = String(entry.address || "");

  let score = 0;
  if (/wi-?fi|wlan|wireless|ethernet|lan/.test(name)) score += 40;
  if (/virtual|vmware|vbox|virtualbox|hyper-v|docker|wsl|loopback|bluetooth/.test(name)) score -= 80;
  if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(address)) score += 30;
  if (/^169\.254\./.test(address)) score -= 60;

  return score;
}

function getLanPhoneUrls(port) {
  if (!port) return [];
  const urls = new Map();
  const interfaces = os.networkInterfaces();

  Object.entries(interfaces).forEach(([name, entries]) => {
    (entries || []).forEach((entry) => {
      if (!entry || entry.family !== "IPv4" || entry.internal) return;
      const interfaceInfo = { ...entry, name };
      const url = `http://${entry.address}:${port}/phone.html`;
      urls.set(url, Math.max(urls.get(url) ?? -Infinity, scoreNetworkInterface(interfaceInfo)));
    });
  });

  return [...urls.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([url]) => url);
}

function getMonitorTokenFile() {
  return path.join(app.getPath("userData"), "phone-monitor-auth.json");
}

function loadOrCreateMonitorToken() {
  const tokenFile = getMonitorTokenFile();

  try {
    const raw = fs.readFileSync(tokenFile, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token === "string" && parsed.token.length >= 24) {
      return parsed.token;
    }
  } catch {}

  const token = crypto.randomBytes(24).toString("hex");

  try {
    fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
    fs.writeFileSync(tokenFile, JSON.stringify({ token }, null, 2), "utf8");
  } catch (error) {
    console.warn("Could not persist phone monitor token:", error.message);
  }

  return token;
}

function appendMonitorToken(url) {
  if (!url || !remoteMonitorToken) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(remoteMonitorToken)}`;
}

function isAuthorizedRemoteRequest(requestUrl, isLoopbackRequest) {
  if (isLoopbackRequest) return true;
  if (!remoteMonitorToken) return false;
  return requestUrl.searchParams.get("token") === remoteMonitorToken;
}

function getMonitorInfo() {
  const urls = getLanPhoneUrls(staticPort).map((url) => appendMonitorToken(url));
  return {
    port: staticPort,
    preferredPort: preferredMonitorPort,
    primaryUrl: urls[0] || "",
    urls,
    fallbackUrl: staticPort ? appendMonitorToken(`http://127.0.0.1:${staticPort}/phone.html`) : "",
    usingFallbackPort: monitorUsesFallbackPort,
    livePath: appendMonitorToken("/api/live"),
    snapshotPath: appendMonitorToken("/api/snapshot"),
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

function handleStaticRequest(request, response) {
  const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
  const remoteAddress = request.socket.remoteAddress || "";
  const isLoopbackRequest = /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(remoteAddress);
  const needsRemoteAuth = !isLoopbackRequest && (
    requestUrl.pathname === "/" ||
    requestUrl.pathname === "/phone.html" ||
    requestUrl.pathname === "/api/snapshot" ||
    requestUrl.pathname === "/api/live"
  );

  if (needsRemoteAuth && !isAuthorizedRemoteRequest(requestUrl, isLoopbackRequest)) {
    response.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Phone monitor token required");
    return;
  }

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
}

function listenStaticServer(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handleStaticRequest);
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => resolve(server));
  });
}

async function createStaticServer() {
  try {
    staticServer = await listenStaticServer(preferredMonitorPort);
    monitorUsesFallbackPort = false;
  } catch (error) {
    if (error?.code !== "EADDRINUSE") {
      throw error;
    }

    staticServer = await listenStaticServer(0);
    monitorUsesFallbackPort = true;
  }

  const address = staticServer.address();
  staticPort = typeof address === "object" && address ? address.port : preferredMonitorPort;
  localOrigin = `http://127.0.0.1:${staticPort}`;
  return localOrigin;
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

    const timeout = setTimeout(resolve, 1500);
    port.close(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function ensureTelemetryArchive(headers) {
  fs.mkdirSync(path.dirname(telemetryArchivePath), { recursive: true });
  if (fs.existsSync(telemetryArchivePath) && fs.statSync(telemetryArchivePath).size > 0) {
    return;
  }
  fs.appendFileSync(telemetryArchivePath, `${headers.map(csvEscape).join(",")}\n`, "utf8");
}

function appendTelemetryArchiveRows(headers, rows) {
  const safeHeaders = Array.isArray(headers) ? headers.map((header) => String(header)) : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeHeaders.length || !safeRows.length) return { path: telemetryArchivePath, rowsWritten: 0 };

  ensureTelemetryArchive(safeHeaders);
  const lines = safeRows.map((row) => (
    safeHeaders.map((header) => csvEscape(row?.[header] ?? "")).join(",")
  ));
  fs.appendFileSync(telemetryArchivePath, `${lines.join("\n")}\n`, "utf8");
  return { path: telemetryArchivePath, rowsWritten: safeRows.length };
}

async function closeActiveSerialPort() {
  const port = activeSerialPort;
  activeSerialPort = null;
  await closePort(port);
}

function closeStaticServer() {
  return new Promise((resolve) => {
    if (!staticServer) {
      resolve();
      return;
    }

    const server = staticServer;
    staticServer = null;
    const timeout = setTimeout(resolve, 1500);
    server.close(() => {
      clearTimeout(timeout);
      resolve();
    });
    server.closeAllConnections?.();
  });
}

function cleanupBeforeQuit() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = Promise.allSettled([
    closeActiveSerialPort(),
    closeStaticServer(),
    Promise.resolve().then(closeMonitorClients),
  ]);
  return cleanupPromise;
}

function quitAfterCleanup() {
  if (isQuitting) return;
  isQuitting = true;
  app.quit();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#f4f6f8",
    autoHideMenuBar: true,
    fullscreen: true,
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

    if (process.platform !== "darwin") {
      quitAfterCleanup();
    }
  });
}

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    remoteMonitorToken = loadOrCreateMonitorToken();
    await createStaticServer();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    quitAfterCleanup();
  }
});

app.on("before-quit", (event) => {
  isQuitting = true;
  if (didCleanupBeforeQuit) return;

  event.preventDefault();
  cleanupBeforeQuit().finally(() => {
    didCleanupBeforeQuit = true;
    app.exit(0);
  });
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

ipcMain.handle("serial:connect", async (_, portPath, baudRate) => {
  if (!portPath) {
    throw new Error("No COM port selected");
  }

  const selectedBaudRate = Number(baudRate);
  if (!Number.isFinite(selectedBaudRate) || selectedBaudRate <= 0) {
    throw new Error("Invalid baud rate");
  }

  await closeActiveSerialPort();

  const port = new SerialPort({
    path: portPath,
    baudRate: selectedBaudRate,
    autoOpen: false,
  });

  await new Promise((resolve, reject) => {
    port.open((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  port.on("data", (chunk) => {
    const buffer = Buffer.from(chunk);
    emitToRenderer("serial:data", {
      text: buffer.toString("latin1"),
      byteLength: buffer.length,
      bytes: Array.from(buffer),
    });
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
  return { path: portPath, baudRate: selectedBaudRate };
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

ipcMain.handle("telemetry-log:append-row", async (_, headers, row) => (
  appendTelemetryArchiveRows(headers, [row])
));

ipcMain.handle("telemetry-log:save-snapshot", async (_, headers, rows) => (
  appendTelemetryArchiveRows(headers, rows)
));

ipcMain.handle("app:quit", async () => {
  isQuitting = true;
  await cleanupBeforeQuit();
  didCleanupBeforeQuit = true;
  app.exit(0);
  return true;
});

ipcMain.on("monitor:publish", (_, snapshot) => {
  monitorSnapshot = sanitizeMonitorSnapshot(snapshot);
  broadcastMonitorSnapshot();
});
