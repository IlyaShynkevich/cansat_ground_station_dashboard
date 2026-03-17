const elements = {
  sourceLabel: document.getElementById("sourceLabel"),
  missionTime: document.getElementById("missionTime"),
  modeBadge: document.getElementById("modeBadge"),
  stateBadge: document.getElementById("stateBadge"),
  packetsReceived: document.getElementById("packetsReceived"),
  packetsLost: document.getElementById("packetsLost"),
  gpsSats: document.getElementById("gpsSats"),
  altitudeVal: document.getElementById("altitudeVal"),
  tempVal: document.getElementById("tempVal"),
  pressureVal: document.getElementById("pressureVal"),
  voltageVal: document.getElementById("voltageVal"),
  currentVal: document.getElementById("currentVal"),
  gpsAltVal: document.getElementById("gpsAltVal"),
  gpsFixVal: document.getElementById("gpsFixVal"),
  accelVector: document.getElementById("accelVector"),
  gyroVector: document.getElementById("gyroVector"),
  mapFrame: document.getElementById("mapFrame"),
  mapStatus: document.getElementById("mapStatus"),
  mapLink: document.getElementById("mapLink"),
  cmdEcho: document.getElementById("cmdEcho"),
  checkLink: document.getElementById("checkLink"),
  checkLog: document.getElementById("checkLog"),
  checkSim: document.getElementById("checkSim"),
  checkBattery: document.getElementById("checkBattery"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  portSelect: document.getElementById("portSelect"),
  refreshPortsBtn: document.getElementById("refreshPortsBtn"),
  fullTelemetry: document.getElementById("fullTelemetry"),
  exportLogBtn: document.getElementById("exportLogBtn"),
  simCsvInput: document.getElementById("simCsvInput"),
};

const plots = {
  alt: document.getElementById("plotAlt"),
  bat: document.getElementById("plotBat"),
  current: document.getElementById("plotCurrent"),
  imu: document.getElementById("plotIMU"),
};

const serialDefaultHeaders = [
  "TEAM_ID",
  "MISSION_TIME",
  "PACKET_COUNT",
  "MODE",
  "STATE",
  "ALTITUDE",
  "TEMPERATURE",
  "PRESSURE",
  "VOLTAGE",
  "CURRENT",
  "GYRO_R",
  "GYRO_P",
  "GYRO_Y",
  "ACCEL_R",
  "ACCEL_P",
  "ACCEL_Y",
  "GPS_TIME",
  "GPS_ALTITUDE",
  "GPS_LATITUDE",
  "GPS_LONGITUDE",
  "GPS_SATS",
  "CMD_ECHO",
  "CMD_ARG",
];

let data = [];
let index = 0;
let imuScenes = null;
let serialPort = null;
let serialHeaders = null;
let badLineStreak = 0;
let simulationPressureRows = [];
let serialBuffer = "";
let availablePorts = [];
let suppressCloseEvent = false;

const tailSize = 80;
const fixedBaudRate = 115200;
const serialApi = window.electronSerial || null;

function toNumber(value) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseCsvLine(line) {
  if (line.includes(",")) {
    return line.split(",").map((x) => x.trim());
  }
  return line.trim().split(/\s+/).filter(Boolean);
}

function normalizeHeader(name) {
  return String(name ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
}

function isTimeToken(value) {
  return /^\d{2}:\d{2}:\d{2}$/.test(String(value ?? "").trim());
}

function looksLikeTelemetryCols(cols) {
  if (cols.length < serialDefaultHeaders.length) return false;
  return (
    toNumber(cols[0]) != null &&
    isTimeToken(cols[1]) &&
    toNumber(cols[2]) != null &&
    /^[A-Z]$/i.test(cols[3] ?? "") &&
    Boolean(cols[4]) &&
    toNumber(cols[5]) != null &&
    toNumber(cols[6]) != null &&
    toNumber(cols[7]) != null &&
    toNumber(cols[8]) != null &&
    toNumber(cols[9]) != null &&
    toNumber(cols[10]) != null &&
    toNumber(cols[11]) != null &&
    toNumber(cols[12]) != null &&
    toNumber(cols[13]) != null &&
    toNumber(cols[14]) != null &&
    toNumber(cols[15]) != null &&
    isTimeToken(cols[16]) &&
    toNumber(cols[17]) != null &&
    toNumber(cols[18]) != null &&
    toNumber(cols[19]) != null &&
    toNumber(cols[20]) != null
  );
}

function isMostlyPrintableAscii(text) {
  if (!text) return false;
  let printable = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126)) printable += 1;
  }
  return printable / text.length >= 0.92;
}

function formatNum(value, digits = 2) {
  return value == null ? "--" : value.toFixed(digits);
}

function formatFieldLabel(key) {
  return key.replace(/^_+/, "").replace(/_/g, " ");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function setDot(dot, cls) {
  dot.classList.remove("dot--ok", "dot--warn", "dot--bad");
  dot.classList.add(cls);
}

function buildBaseGrid(svg, wide = false) {
  const width = wide ? 1060 : 520;
  const right = wide ? 1040 : 500;
  svg.innerHTML = `
    <rect x="0" y="0" width="${width}" height="210" fill="#fff"></rect>
    <line x1="40" y1="20" x2="40" y2="180" stroke="#15202b" stroke-width="2"></line>
    <line x1="40" y1="180" x2="${right}" y2="180" stroke="#15202b" stroke-width="2"></line>
  `;
}

function buildPath(points, rect, yMin, yMax) {
  if (points.length < 2) return "";
  const xMin = points[0].x;
  const xMax = points[points.length - 1].x;
  const sx = (x) => rect.left + ((x - xMin) / (xMax - xMin || 1)) * (rect.right - rect.left);
  const sy = (y) => rect.bottom - ((y - yMin) / (yMax - yMin || 1)) * (rect.bottom - rect.top);
  let d = "";
  for (let i = 0; i < points.length; i += 1) {
    d += `${i === 0 ? "M" : " L"}${sx(points[i].x).toFixed(1)} ${sy(points[i].y).toFixed(1)}`;
  }
  return d;
}

function renderSeries(svg, series, wide = false) {
  buildBaseGrid(svg, wide);
  if (!series.length || !series.some((s) => s.points.length > 1)) {
    const x = wide ? 530 : 260;
    svg.insertAdjacentHTML(
      "beforeend",
      `<text x="${x}" y="110" text-anchor="middle" fill="#5d6a75" font-size="14">No data</text>`
    );
    return;
  }

  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  const yMinRaw = Math.min(...allY);
  const yMaxRaw = Math.max(...allY);
  const pad = (yMaxRaw - yMinRaw) * 0.08 || 1;
  const yMin = yMinRaw - pad;
  const yMax = yMaxRaw + pad;
  const rect = wide
    ? { left: 40, top: 20, right: 1040, bottom: 180 }
    : { left: 40, top: 20, right: 500, bottom: 180 };

  series.forEach((s) => {
    const d = buildPath(s.points, rect, yMin, yMax);
    if (!d) return;
    const dash = s.dashed ? ' stroke-dasharray="7 6"' : "";
    svg.insertAdjacentHTML(
      "beforeend",
      `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width}"${dash}></path>`
    );

    const first = s.points[0];
    const last = s.points[s.points.length - 1];
    const xMin = s.points[0].x;
    const xMax = s.points[s.points.length - 1].x;
    const sx = (x) => rect.left + ((x - xMin) / (xMax - xMin || 1)) * (rect.right - rect.left);
    const sy = (y) => rect.bottom - ((y - yMin) / (yMax - yMin || 1)) * (rect.bottom - rect.top);
    const firstX = sx(first.x).toFixed(1);
    const firstY = sy(first.y).toFixed(1);
    const lastX = sx(last.x).toFixed(1);
    const lastY = sy(last.y).toFixed(1);

    svg.insertAdjacentHTML(
      "beforeend",
      `<circle cx="${firstX}" cy="${firstY}" r="3.5" fill="${s.color}"></circle>` +
      `<circle cx="${lastX}" cy="${lastY}" r="4.5" fill="${s.color}"></circle>`
    );

    if (last.y != null) {
      const labelX = Math.min(rect.right - 6, sx(last.x) + 8);
      const labelY = Math.max(rect.top + 12, sy(last.y) - 8);
      svg.insertAdjacentHTML(
        "beforeend",
        `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" fill="${s.color}" font-size="12" font-weight="700">${last.y.toFixed(2)}</text>`
      );
    }
  });
}

function rowAt(i) {
  return data[Math.max(0, Math.min(i, data.length - 1))];
}

function updateQuickChecks(row) {
  setDot(elements.checkLink, serialPort ? "dot--ok" : "dot--bad");
  setDot(elements.checkLog, data.length > 0 ? "dot--ok" : "dot--warn");
  setDot(elements.checkSim, row.MODE?.toUpperCase().includes("S") ? "dot--warn" : "dot--ok");
  setDot(elements.checkBattery, toNumber(row.VOLTAGE) != null ? "dot--ok" : "dot--warn");
}

function updateMap(lat, lon) {
  if (lat != null && lon != null) {
    const url = `https://www.google.com/maps?q=${lat},${lon}`;
    elements.mapFrame.src = `${url}&z=16&output=embed`;
    elements.mapStatus.textContent = "GPS lock active";
    elements.mapLink.href = url;
    elements.mapLink.textContent = "Open in Google Maps";
    elements.gpsFixVal.textContent = "Locked";
  } else {
    elements.mapFrame.removeAttribute("src");
    elements.mapStatus.textContent = "Waiting for GPS fix";
    elements.mapLink.removeAttribute("href");
    elements.mapLink.textContent = "No map target";
    elements.gpsFixVal.textContent = "No Fix";
  }
}

function clearUi() {
  elements.missionTime.textContent = "--";
  elements.modeBadge.textContent = "--";
  elements.stateBadge.textContent = "--";
  elements.packetsReceived.textContent = "0";
  elements.packetsLost.textContent = "0";
  elements.gpsSats.textContent = "--";

  elements.altitudeVal.textContent = "--";
  elements.tempVal.textContent = "--";
  elements.pressureVal.textContent = "--";
  elements.voltageVal.textContent = "--";
  elements.currentVal.textContent = "--";
  elements.gpsAltVal.textContent = "--";
  elements.accelVector.textContent = "X -- | Y -- | Z --";
  elements.gyroVector.textContent = "X -- | Y -- | Z --";
  elements.cmdEcho.textContent = "--";

  updateMap(null, null);
  updateQuickChecks({});
  renderFullTelemetry(null);
  renderSeries(plots.alt, []);
  renderSeries(plots.bat, []);
  renderSeries(plots.current, []);
  renderSeries(plots.imu, [], true);
}

function renderFullTelemetry(row) {
  const keys = [...serialDefaultHeaders];
  const source = row || {};
  const extraKeys = Object.keys(source).filter((key) => !keys.includes(key) && !key.startsWith("_"));
  const allKeys = [...keys, ...extraKeys];

  elements.fullTelemetry.innerHTML = allKeys.map((key) => {
    const value = source[key];
    const display = value == null || value === "" ? "--" : String(value);
    return `
      <div class="telemetry-cell">
        <div class="telemetry-cell__k">${formatFieldLabel(key)}</div>
        <div class="telemetry-cell__v" title="${display}">${display}</div>
      </div>
    `;
  }).join("");
}

function updateUi() {
  const row = rowAt(index);
  if (!row) {
    clearUi();
    return;
  }

  const packet = toNumber(row.PACKET_COUNT) ?? index + 1;
  const received = data.length;
  const firstPacket = toNumber(data[0]?.PACKET_COUNT) ?? packet;
  const lost = Math.max(0, packet - firstPacket + 1 - received);

  elements.missionTime.textContent = row.MISSION_TIME || "--";
  elements.modeBadge.textContent = (row.MODE || "--").trim();
  elements.stateBadge.textContent = (row.STATE || "--").trim();
  elements.packetsReceived.textContent = String(received);
  elements.packetsLost.textContent = String(lost);
  elements.gpsSats.textContent = row.GPS_SATS || "--";

  const alt = toNumber(row.ALTITUDE);
  const temp = toNumber(row.TEMPERATURE);
  const pressureRaw = toNumber(row.PRESSURE);
  const volt = toNumber(row.VOLTAGE);
  const current = toNumber(row.CURRENT);
  const gpsAlt = toNumber(row.GPS_ALTITUDE);
  const lat = toNumber(row.GPS_LATITUDE);
  const lon = toNumber(row.GPS_LONGITUDE);
  const accelX = toNumber(row.ACCEL_R);
  const accelY = toNumber(row.ACCEL_P);
  const accelZ = toNumber(row.ACCEL_Y);
  const gyroX = toNumber(row.GYRO_R);
  const gyroY = toNumber(row.GYRO_P);
  const gyroZ = toNumber(row.GYRO_Y);

  let pressure = pressureRaw;
  if (pressure != null && pressure > 2000) pressure = pressure / 1000;
  if (pressure != null && pressure > 0 && pressure <= 2) pressure = pressure * 100;
  if (pressure != null && (pressure < 10 || pressure > 150)) pressure = null;

  elements.altitudeVal.textContent = formatNum(alt, 1);
  elements.tempVal.textContent = formatNum(temp, 1);
  elements.pressureVal.textContent = formatNum(pressure, 1);
  elements.voltageVal.textContent = formatNum(volt, 2);
  elements.currentVal.textContent = formatNum(current, 2);
  elements.gpsAltVal.textContent = formatNum(gpsAlt, 1);
  elements.accelVector.textContent = `X ${formatNum(accelX, 2)} | Y ${formatNum(accelY, 2)} | Z ${formatNum(accelZ, 2)}`;
  elements.gyroVector.textContent = `X ${formatNum(gyroX, 2)} | Y ${formatNum(gyroY, 2)} | Z ${formatNum(gyroZ, 2)}`;

  updateMap(lat, lon);

  if (imuScenes) {
    imuScenes.accel.update(accelX, accelY, accelZ);
    imuScenes.gyro.update(gyroX, gyroY, gyroZ);
  }

  if (row.CMD_ECHO && row.CMD_ECHO !== "No command send yet") {
    elements.cmdEcho.textContent = row.CMD_ECHO;
  }

  updateQuickChecks(row);
  renderFullTelemetry(row);

  const start = Math.max(0, data.length - tailSize);
  const windowRows = data.slice(start);
  renderSeries(plots.alt, [{
    points: windowRows.map((r) => ({ x: toNumber(r._SEQ) ?? 0, y: toNumber(r.ALTITUDE) ?? 0 })),
    color: "#0f6a9e",
    width: 3,
  }]);
  renderSeries(plots.bat, [{
    points: windowRows
      .map((r) => ({ x: toNumber(r._SEQ) ?? 0, y: toNumber(r.VOLTAGE) }))
      .filter((p) => p.y != null),
    color: "#0f9d58",
    width: 3,
  }]);
  renderSeries(plots.current, [{
    points: windowRows
      .map((r) => ({ x: toNumber(r._SEQ) ?? 0, y: toNumber(r.CURRENT) }))
      .filter((p) => p.y != null),
    color: "#c57f00",
    width: 3,
  }]);
  renderSeries(plots.imu, [
    {
      points: windowRows.map((r) => ({ x: toNumber(r._SEQ) ?? 0, y: toNumber(r.ACCEL_R) ?? 0 })),
      color: "#15202b",
      width: 3,
    },
    {
      points: windowRows.map((r) => ({ x: toNumber(r._SEQ) ?? 0, y: toNumber(r.GYRO_R) ?? 0 })),
      color: "#c62828",
      width: 2,
      dashed: true,
    },
  ], true);
}

function coerceRow(headers, cols) {
  const row = Object.fromEntries(headers.map((h, j) => [h, cols[j] ?? ""]));
  if (!row.PACKET_COUNT) {
    row.PACKET_COUNT = String(data.length + 1);
  }
  return row;
}

function isValidTelemetryRow(row) {
  const packet = toNumber(row.PACKET_COUNT);
  if (packet == null || packet < 0) return false;

  const numericFields = [
    "ALTITUDE",
    "TEMPERATURE",
    "PRESSURE",
    "VOLTAGE",
    "GYRO_R",
    "GYRO_P",
    "GYRO_Y",
    "ACCEL_R",
    "ACCEL_P",
    "ACCEL_Y",
    "GPS_ALTITUDE",
  ];

  let numericHits = 0;
  for (const key of numericFields) {
    if (row[key] != null && row[key] !== "" && toNumber(row[key]) != null) {
      numericHits += 1;
    }
  }
  return numericHits >= 4;
}

function parseSerialRow(line) {
  if (!isMostlyPrintableAscii(line)) return null;

  const cols = parseCsvLine(line);
  if (cols.length < 8) return null;

  const maybeHeader = cols.map(normalizeHeader);
  if (maybeHeader.includes("PACKET_COUNT") && maybeHeader.includes("MISSION_TIME")) {
    serialHeaders = serialDefaultHeaders;
    return null;
  }

  if (looksLikeTelemetryCols(cols)) {
    const row = coerceRow(serialDefaultHeaders, cols);
    return isValidTelemetryRow(row) ? row : null;
  }

  if (!serialHeaders) return null;

  const row = coerceRow(serialHeaders, cols);
  return isValidTelemetryRow(row) ? row : null;
}

function handleSerialLine(line) {
  const clean = line.trim();
  if (!clean) return;
  const row = parseSerialRow(clean);
  if (!row) {
    badLineStreak += 1;
    if (badLineStreak === 25) {
      elements.sourceLabel.textContent = "Source: USB data invalid";
    }
    return;
  }
  badLineStreak = 0;
  row._SEQ = String(data.length);
  data.push(row);
  index = data.length - 1;
  if (data.length === 1) {
    elements.sourceLabel.textContent = `Source: ${serialPort?.path || "USB"} @ ${fixedBaudRate}`;
  }
  updateUi();
}

function handleSerialChunk(chunk) {
  serialBuffer += chunk;
  const lines = serialBuffer.split(/\r?\n/);
  serialBuffer = lines.pop() ?? "";
  lines.forEach(handleSerialLine);
}

function renderPortOptions() {
  const previous = elements.portSelect.value;
  const options = ['<option value="">Select COM port</option>']
    .concat(availablePorts.map((port) => {
      const label = port.displayName && port.displayName !== port.path
        ? `${port.path} - ${port.displayName}`
        : port.path;
      return `<option value="${port.path}">${label}</option>`;
    }));

  elements.portSelect.innerHTML = options.join("");
  if (availablePorts.some((port) => port.path === previous)) {
    elements.portSelect.value = previous;
  }
}

async function refreshPorts() {
  if (!serialApi) {
    elements.sourceLabel.textContent = "Source: Electron serial bridge unavailable";
    return;
  }

  try {
    availablePorts = await serialApi.listPorts();
    renderPortOptions();
    if (!availablePorts.length) {
      elements.sourceLabel.textContent = "Source: No COM ports detected";
    }
  } catch (error) {
    console.error(error);
    elements.sourceLabel.textContent = "Source: COM port scan failed";
  }
}

async function disconnectSerial(updateSource = true) {
  const hadConnection = Boolean(serialPort);
  serialPort = null;
  serialBuffer = "";

  if (serialApi && hadConnection) {
    suppressCloseEvent = true;
    try {
      await serialApi.disconnect();
    } catch (error) {
      console.warn(error);
    } finally {
      suppressCloseEvent = false;
    }
  }
  elements.connectBtn.disabled = false;
  elements.disconnectBtn.disabled = true;
  elements.portSelect.disabled = false;
  elements.refreshPortsBtn.disabled = false;
  if (updateSource) elements.sourceLabel.textContent = "Source: Demo";
  refreshPorts();
}

async function connectSerial() {
  if (!serialApi) {
    elements.sourceLabel.textContent = "Source: Electron serial bridge unavailable";
    return;
  }

  try {
    const selectedPath = elements.portSelect.value;
    if (!selectedPath) {
      elements.sourceLabel.textContent = "Source: Select a COM port";
      return;
    }

    const connection = await serialApi.connect(selectedPath);
    serialPort = { path: connection.path };
    serialHeaders = null;
    badLineStreak = 0;
    serialBuffer = "";
    data = [];
    index = 0;
    clearUi();

    elements.connectBtn.disabled = true;
    elements.disconnectBtn.disabled = false;
    elements.portSelect.disabled = true;
    elements.refreshPortsBtn.disabled = true;
    elements.sourceLabel.textContent = `Source: ${connection.path} @ ${fixedBaudRate} (waiting data)`;
    updateQuickChecks(rowAt(index) || {});
  } catch (error) {
    console.error(error);
    const message = String(error?.message || error || "Unknown error");
    elements.sourceLabel.textContent = `Source: USB connection failed (${message})`;
    elements.cmdEcho.textContent = `USB error: ${message}`;
    await disconnectSerial(false);
  }
}

async function sendCommand(cmd) {
  if (!serialApi || !serialPort) {
    elements.cmdEcho.textContent = `${cmd} (not sent: no USB)`;
    return;
  }

  try {
    await serialApi.write(`${cmd}\n`);
    elements.cmdEcho.textContent = cmd;
  } catch (error) {
    console.error(error);
    elements.cmdEcho.textContent = `${cmd} (send failed)`;
  }
}

function exportTelemetryLog() {
  const headers = serialDefaultHeaders;
  const lines = [headers.join(",")];
  data.forEach((row) => {
    lines.push(headers.map((key) => csvEscape(row[key] ?? "")).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `ground-station-log-${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseSimulationCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(normalizeHeader);
  const pressureIndex = headers.findIndex((name) => name === "PRESSURE");
  const pressureColumnIndex = pressureIndex >= 0 ? pressureIndex : 0;

  return lines.slice(1)
    .map((line) => line.split(",").map((part) => part.trim()))
    .map((cols) => toNumber(cols[pressureColumnIndex]))
    .filter((value) => value != null);
}

elements.connectBtn.addEventListener("click", connectSerial);
elements.disconnectBtn.addEventListener("click", () => disconnectSerial());
elements.refreshPortsBtn.addEventListener("click", refreshPorts);
elements.exportLogBtn.addEventListener("click", exportTelemetryLog);
elements.simCsvInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  simulationPressureRows = parseSimulationCsv(text);
  elements.sourceLabel.textContent = simulationPressureRows.length > 0
    ? `Source: SIM CSV ${file.name}`
    : "Source: SIM CSV invalid";
});

document.querySelectorAll("[data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const cmd = btn.getAttribute("data-cmd") || "--";
    sendCommand(cmd);
    if (cmd === "SIM ACTIVATE" && simulationPressureRows.length > 0) {
      elements.cmdEcho.textContent = `${cmd} (${simulationPressureRows.length} pressure samples loaded)`;
    }
  });
});

if (serialApi) {
  serialApi.onData(handleSerialChunk);
  serialApi.onClose(async () => {
    if (suppressCloseEvent) return;
    await disconnectSerial(false);
    elements.sourceLabel.textContent = data.length > 0 ? "Source: USB disconnected" : "Source: Demo";
  });
  serialApi.onError((message) => {
    elements.sourceLabel.textContent = `Source: USB error (${message})`;
    elements.cmdEcho.textContent = `USB error: ${message}`;
  });
}

async function initImu3D() {
  const accelCanvas = document.getElementById("accelCanvas");
  const gyroCanvas = document.getElementById("gyroCanvas");
  if (!accelCanvas || !gyroCanvas) return;

  try {
    const THREE = await import("three");

    function makeImuScene(canvas, color) {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(3.2, 2.3, 3.6);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.AmbientLight(0xffffff, 0.95));
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
      keyLight.position.set(2, 3, 3);
      scene.add(keyLight);
      scene.add(new THREE.GridHelper(6, 6, 0xb7c4cf, 0xd9e1e7));

      const axes = new THREE.AxesHelper(1.85);
      scene.add(axes);

      const origin = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 18, 18),
        new THREE.MeshStandardMaterial({ color: 0x15202b, roughness: 0.45 })
      );
      scene.add(origin);

      const historyPoints = Array.from({ length: 32 }, (_, i) => new THREE.Vector3(i * 0.04, 0, 0));
      const historyGeometry = new THREE.BufferGeometry().setFromPoints(historyPoints);
      const historyLine = new THREE.Line(
        historyGeometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 })
      );
      scene.add(historyLine);

      const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, color, 0.28, 0.16);
      scene.add(arrow);

      const point = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 18, 18),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12, roughness: 0.35 })
      );
      scene.add(point);

      function resize() {
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }

      function update(x, y, z) {
        const vector = new THREE.Vector3(x || 0, y || 0, z || 0);
        const length = vector.length();
        const dir = length > 0.0001 ? vector.clone().normalize() : new THREE.Vector3(1, 0, 0);
        const scaledLength = Math.min(2.15, Math.max(0.18, length * 0.4));
        arrow.setDirection(dir);
        arrow.setLength(scaledLength, 0.28, 0.16);

        const endpoint = dir.clone().multiplyScalar(scaledLength);
        point.position.copy(endpoint);

        historyPoints.push(endpoint.clone());
        while (historyPoints.length > 32) historyPoints.shift();
        historyGeometry.setFromPoints(historyPoints);
      }

      resize();
      window.addEventListener("resize", resize);

      return { renderer, scene, camera, update };
    }

    imuScenes = {
      accel: makeImuScene(accelCanvas, 0x0f6a9e),
      gyro: makeImuScene(gyroCanvas, 0xc62828),
    };

    function animate() {
      if (!imuScenes) return;
      imuScenes.accel.renderer.render(imuScenes.accel.scene, imuScenes.accel.camera);
      imuScenes.gyro.renderer.render(imuScenes.gyro.scene, imuScenes.gyro.camera);
      requestAnimationFrame(animate);
    }

    imuScenes.accel.update(0, 0, 0);
    imuScenes.gyro.update(0, 0, 0);
    animate();
  } catch (error) {
    console.error(error);
  }
}

clearUi();
refreshPorts();
initImu3D();
