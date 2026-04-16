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
  mapPointA: document.getElementById("mapPointA"),
  mapPointB: document.getElementById("mapPointB"),
  cmdSent: document.getElementById("cmdSent"),
  cmdEcho: document.getElementById("cmdEcho"),
  checkLink: document.getElementById("checkLink"),
  checkLog: document.getElementById("checkLog"),
  checkSim: document.getElementById("checkSim"),
  checkBattery: document.getElementById("checkBattery"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  portSelect: document.getElementById("portSelect"),
  refreshPortsBtn: document.getElementById("refreshPortsBtn"),
  linkPort: document.getElementById("linkPort"),
  linkBridge: document.getElementById("linkBridge"),
  phoneMonitorStatus: document.getElementById("phoneMonitorStatus"),
  phoneMonitorUrl: document.getElementById("phoneMonitorUrl"),
  phoneMonitorHint: document.getElementById("phoneMonitorHint"),
  fullTelemetry: document.getElementById("fullTelemetry"),
  exportLogBtn: document.getElementById("exportLogBtn"),
  simCsvInput: document.getElementById("simCsvInput"),
};

const plots = {
  alt: document.getElementById("plotAlt"),
  bat: document.getElementById("plotBat"),
  current: document.getElementById("plotCurrent"),
  pressure: document.getElementById("plotPressure"),
  temp: document.getElementById("plotTemp"),
};

const plotOptions = {
  alt: { unit: "m", digits: 1, yAxisLabel: "Altitude (m)" },
  bat: { unit: "V", digits: 2, yAxisLabel: "Voltage (V)" },
  current: { unit: "A", digits: 2, yAxisLabel: "Current (A)" },
  pressure: { unit: "kPa", digits: 1, yAxisLabel: "Pressure (kPa)" },
  temp: { unit: "C", digits: 1, yAxisLabel: "Temperature (C)" },
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

const serialHeaderSet = new Set(serialDefaultHeaders);

let data = [];
let index = 0;
let imuScenes = null;
let serialPort = null;
let serialHeaders = null;
let badLineStreak = 0;
let simulationRows = [];
let simulationFileName = "";
let simulationArmed = false;
let simulationActive = false;
let simulationTimer = null;
let simulationUsesSyntheticGps = false;
let serialBuffer = "";
let availablePorts = [];
let suppressCloseEvent = false;
let lastSentCommand = "--";
let lastMapEmbedUrl = "";

const tailSize = 80;
const fixedBaudRate = 115200;
const simulationFallbackDelayMs = 1000;
const simulationMinDelayMs = 150;
const simulationMaxDelayMs = 2000;
const serialApi = window.electronSerial || null;
const monitorApi = window.electronMonitor || null;

function setPhoneMonitorState(status, url = "", hint = "") {
  if (!elements.phoneMonitorStatus || !elements.phoneMonitorUrl || !elements.phoneMonitorHint) return;
  elements.phoneMonitorStatus.textContent = status;
  elements.phoneMonitorHint.textContent = hint;

  if (url) {
    elements.phoneMonitorUrl.textContent = url;
    elements.phoneMonitorUrl.href = url;
    elements.phoneMonitorUrl.removeAttribute("aria-disabled");
    return;
  }

  elements.phoneMonitorUrl.textContent = "Waiting for phone URL";
  elements.phoneMonitorUrl.removeAttribute("href");
  elements.phoneMonitorUrl.setAttribute("aria-disabled", "true");
}

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

function formatClockTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

function parseClockTime(value) {
  if (!isTimeToken(value)) return null;
  const [hours, minutes, seconds] = String(value).split(":").map(Number);
  return (hours * 3600) + (minutes * 60) + seconds;
}

function formatLatLon(lat, lon) {
  if (lat == null || lon == null) return "Waiting for GPS fix";
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function normalizePressure(value) {
  let pressure = toNumber(value);
  if (pressure != null && pressure > 2000) pressure /= 1000;
  if (pressure != null && pressure > 0 && pressure <= 2) pressure *= 100;
  if (pressure != null && (pressure < 10 || pressure > 150)) pressure = null;
  return pressure;
}

function normalizeVoltage(value) {
  let voltage = toNumber(value);
  if (voltage == null) return null;
  if (voltage > 1000000) voltage /= 1000000;
  if (voltage > 1000) voltage /= 1000;
  if (voltage > 100) voltage /= 10;
  return voltage;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

const telemetryUnits = {
  ALTITUDE: "m",
  TEMPERATURE: "C",
  PRESSURE: "kPa",
  VOLTAGE: "V",
  CURRENT: "A",
  GPS_ALTITUDE: "m",
  GPS_LATITUDE: "deg",
  GPS_LONGITUDE: "deg",
};

function appendTelemetryUnit(key, value) {
  const unit = telemetryUnits[key];
  return unit ? `${value} ${unit}` : value;
}

function formatTelemetryValue(key, value) {
  if (value == null || value === "") return "--";
  if (key === "ALTITUDE") return appendTelemetryUnit(key, formatNum(toNumber(value), 1));
  if (key === "TEMPERATURE") return appendTelemetryUnit(key, formatNum(toNumber(value), 1));
  if (key === "PRESSURE") return appendTelemetryUnit(key, formatNum(normalizePressure(value), 1));
  if (key === "VOLTAGE") return appendTelemetryUnit(key, formatNum(normalizeVoltage(value), 2));
  if (key === "CURRENT") return appendTelemetryUnit(key, formatNum(toNumber(value), 2));
  if (key === "GPS_ALTITUDE") return appendTelemetryUnit(key, formatNum(toNumber(value), 1));
  if (key === "GPS_LATITUDE" || key === "GPS_LONGITUDE") return appendTelemetryUnit(key, String(value));
  return String(value);
}

function isSimulationModeOn() {
  return simulationArmed || simulationActive;
}

function setCommandFeedback(cmd, message) {
  lastSentCommand = cmd;
  elements.cmdSent.textContent = cmd;
  elements.cmdEcho.textContent = message;
  publishMonitorSnapshot();
}

function buildSimulationRowFromColumns(headers, cols, rowIndex) {
  const row = Object.fromEntries(serialDefaultHeaders.map((key) => [key, ""]));

  headers.forEach((header, columnIndex) => {
    if (!serialHeaderSet.has(header)) return;
    row[header] = cols[columnIndex] ?? "";
  });

  if (!row.PACKET_COUNT) row.PACKET_COUNT = String(rowIndex);
  if (!row.MISSION_TIME) row.MISSION_TIME = formatClockTime(rowIndex);
  if (!row.GPS_TIME) row.GPS_TIME = row.MISSION_TIME;
  if (!row.MODE) row.MODE = "S";
  if (!row.STATE) row.STATE = "SIMULATION";
  if (!row.CMD_ECHO) row.CMD_ECHO = "";
  if (!row.CMD_ARG) row.CMD_ARG = String(rowIndex);

  return row;
}

function buildSimulationRowFromPressure(pressure, rowIndex) {
  const row = buildSimulationRowFromColumns(["PRESSURE"], [String(pressure)], rowIndex);
  row.MODE = "S";
  row.STATE = "SIMULATION";
  return row;
}

function buildSimulationPlaybackRows(rows) {
  const gpsRows = rows
    .map((row, rowIndex) => ({
      row,
      rowIndex,
      lat: toNumber(row.GPS_LATITUDE),
      lon: toNumber(row.GPS_LONGITUDE),
    }))
    .filter((entry) => entry.lat != null && entry.lon != null);

  if (gpsRows.length < 2) {
    simulationUsesSyntheticGps = false;
    return rows.map((row) => ({ ...row }));
  }

  const uniqueCoords = new Set(
    gpsRows.map((entry) => `${entry.lat.toFixed(5)},${entry.lon.toFixed(5)}`)
  );

  if (uniqueCoords.size > 1) {
    simulationUsesSyntheticGps = false;
    return rows.map((row) => ({ ...row }));
  }

  const baseLat = gpsRows[0].lat;
  const baseLon = gpsRows[0].lon;
  const maxIndex = Math.max(1, rows.length - 1);
  simulationUsesSyntheticGps = true;

  return rows.map((row, rowIndex) => {
    const lat = toNumber(row.GPS_LATITUDE);
    const lon = toNumber(row.GPS_LONGITUDE);
    if (lat == null || lon == null) return { ...row };

    const progress = rowIndex / maxIndex;
    const latOffset = (Math.sin(progress * Math.PI * 0.8) * 0.00008) + (progress * 0.00005);
    const lonOffset = progress * 0.00026;

    return {
      ...row,
      GPS_LATITUDE: (baseLat + latOffset).toFixed(5),
      GPS_LONGITUDE: (baseLon + lonOffset).toFixed(5),
    };
  });
}

function stopSimulationPlayback(keepArmed = false) {
  if (simulationTimer != null) {
    window.clearTimeout(simulationTimer);
    simulationTimer = null;
  }
  simulationActive = false;
  if (!keepArmed) simulationArmed = false;
  simulationUsesSyntheticGps = false;
}

function getSimulationStepDelay(currentRow, nextRow) {
  const current = parseClockTime(currentRow?.MISSION_TIME);
  const next = parseClockTime(nextRow?.MISSION_TIME);
  if (current == null || next == null) return simulationFallbackDelayMs;

  const delay = (next - current) * 1000;
  if (!Number.isFinite(delay) || delay <= 0) return simulationFallbackDelayMs;
  return Math.max(simulationMinDelayMs, Math.min(simulationMaxDelayMs, delay));
}

function queueSimulationStep() {
  if (!simulationActive) return;

  if (index >= data.length - 1) {
    simulationActive = false;
    simulationArmed = false;
    simulationTimer = null;
    elements.cmdEcho.textContent = `SIM ACTIVATE complete (${data.length} samples)`;
    updateQuickChecks(rowAt(index) || {});
    publishMonitorSnapshot();
    return;
  }

  const delay = getSimulationStepDelay(data[index], data[index + 1]);
  simulationTimer = window.setTimeout(() => {
    simulationTimer = null;
    if (!simulationActive) return;
    index += 1;
    updateUi();
    queueSimulationStep();
  }, delay);
}

function armSimulationProfile() {
  if (!simulationRows.length) {
    setCommandFeedback("SIM ENABLE", "Load Simulation CSV first");
    return;
  }

  stopSimulationPlayback(true);
  simulationArmed = true;
  elements.sourceLabel.textContent = simulationFileName
    ? `Source: SIM ready ${simulationFileName}`
    : `Source: SIM ready (${simulationRows.length} samples)`;
  updateQuickChecks(rowAt(index) || {});
  setCommandFeedback("SIM ENABLE", `${simulationRows.length} simulation samples ready`);
}

function activateSimulationProfile() {
  if (!simulationRows.length) {
    setCommandFeedback("SIM ACTIVATE", "Load Simulation CSV first");
    return;
  }

  if (!simulationArmed) {
    setCommandFeedback("SIM ACTIVATE", "Run SIM ENABLE first");
    return;
  }

  stopSimulationPlayback(true);
  simulationArmed = false;
  simulationActive = true;
  data = buildSimulationPlaybackRows(simulationRows).map((row, rowIndex) => ({ ...row, _SEQ: String(rowIndex) }));
  index = 0;
  lastSentCommand = "SIM ACTIVATE";
  elements.sourceLabel.textContent = simulationFileName
    ? `Source: SIM playback ${simulationFileName}`
    : `Source: SIM playback (${data.length} samples)`;
  updateUi();
  elements.cmdSent.textContent = "SIM ACTIVATE";
  elements.cmdEcho.textContent = simulationUsesSyntheticGps
    ? `Playing ${data.length} simulation samples (dynamic GPS demo)`
    : `Playing ${data.length} simulation samples`;
  publishMonitorSnapshot();
  queueSimulationStep();
}

function portFingerprint(port) {
  return [
    port?.path,
    port?.displayName,
    port?.manufacturer,
    port?.serialNumber,
    port?.vendorId,
    port?.productId,
    port?.pnpId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function formatPortLabel(port) {
  if (!port?.path) return "Not selected";
  const label = port.displayName && port.displayName !== port.path
    ? `${port.path} - ${port.displayName}`
    : port.path;
  return port.manufacturer ? `${label} (${port.manufacturer})` : label;
}

function describeBridge(port) {
  const fingerprint = portFingerprint(port);
  if (!fingerprint) return "Scanning COM ports";
  if (/(digi|xbee|waveshare)/.test(fingerprint)) {
    return "Likely Digi XBee / Waveshare bridge";
  }
  if (/(ftdi|ft232|ch340|wch|cp210|silicon labs|usb serial|uart)/.test(fingerprint)) {
    return "USB serial bridge detected";
  }
  return "Serial device detected";
}

function findLikelyBridgePort() {
  const preferred = availablePorts.find((port) => /(digi|xbee|waveshare)/.test(portFingerprint(port)));
  if (preferred) return preferred;
  return availablePorts.find((port) => /(ftdi|ft232|ch340|wch|cp210|silicon labs|usb serial|uart)/.test(portFingerprint(port))) || null;
}

function getSelectedPortInfo() {
  const selectedPath = elements.portSelect.value;
  if (selectedPath) {
    return availablePorts.find((port) => port.path === selectedPath) || serialPort;
  }
  return serialPort;
}

function updateLinkPrep() {
  if (!elements.linkPort || !elements.linkBridge) return;
  const selected = getSelectedPortInfo();
  const likely = findLikelyBridgePort();
  elements.linkPort.textContent = selected ? formatPortLabel(selected) : "Not selected";

  if (selected) {
    elements.linkBridge.textContent = describeBridge(selected);
  } else if (likely) {
    elements.linkBridge.textContent = `${describeBridge(likely)} (${formatPortLabel(likely)})`;
  } else {
    elements.linkBridge.textContent = availablePorts.length
      ? "COM ports found, bridge not identified yet"
      : "No COM ports detected yet";
  }

  publishMonitorSnapshot();
}

function computePacketStats(row) {
  const packet = toNumber(row?.PACKET_COUNT);
  const received = data.length;
  const firstPacket = toNumber(data[0]?.PACKET_COUNT);
  const lost = packet != null && firstPacket != null
    ? Math.max(0, packet - firstPacket + 1 - received)
    : 0;

  return {
    packet,
    received,
    lost,
  };
}

function buildMonitorSnapshot() {
  const row = rowAt(index) || null;
  const stats = computePacketStats(row);
  const lat = toNumber(row?.GPS_LATITUDE);
  const lon = toNumber(row?.GPS_LONGITUDE);
  const gpsFix = lat != null && lon != null;
  const gpsPoints = findRecentGpsPoints().map((point, pointIndex) => ({
    label: pointIndex === 0 ? "Point A" : "Point B",
    value: `${formatLatLon(point.lat, point.lon)} | ${point.time}`,
  }));

  return {
    updatedAt: new Date().toISOString(),
    hasData: Boolean(row),
    sourceLabel: elements.sourceLabel.textContent || "Source: Demo",
    connection: {
      connected: Boolean(serialPort),
      portPath: serialPort?.path || null,
      selectedPort: elements.linkPort.textContent || "Not selected",
      bridge: elements.linkBridge.textContent || "Scanning COM ports",
      baudRate: serialPort ? fixedBaudRate : null,
    },
    mission: {
      time: row?.MISSION_TIME || "--",
      mode: (row?.MODE || "--").trim(),
      state: (row?.STATE || "--").trim(),
      packetsReceived: stats.received,
      packetsLost: stats.lost,
      gpsSats: row?.GPS_SATS || "--",
    },
    quickChecks: {
      telemetryLink: serialPort ? "ok" : "bad",
      loggingReady: data.length > 0 ? "ok" : "warn",
      simulationMode: isSimulationModeOn() || row?.MODE?.toUpperCase().includes("S") ? "warn" : "ok",
      batteryOk: normalizeVoltage(row?.VOLTAGE) != null ? "ok" : "warn",
    },
    metrics: {
      altitude: formatNum(toNumber(row?.ALTITUDE), 1),
      temperature: formatNum(toNumber(row?.TEMPERATURE), 1),
      pressure: formatNum(normalizePressure(row?.PRESSURE), 1),
      voltage: formatNum(normalizeVoltage(row?.VOLTAGE), 2),
      current: formatNum(toNumber(row?.CURRENT), 2),
      gpsAltitude: formatNum(toNumber(row?.GPS_ALTITUDE), 1),
      gpsFix: gpsFix ? "Locked" : "No Fix",
    },
    gps: {
      fix: gpsFix,
      latitude: lat,
      longitude: lon,
      display: formatLatLon(lat, lon),
      mapUrl: gpsFix ? `https://www.google.com/maps?q=${lat},${lon}` : "",
      points: gpsPoints,
    },
    commands: {
      lastSent: elements.cmdSent.textContent || lastSentCommand,
      echo: elements.cmdEcho.textContent || "--",
    },
    telemetry: serialDefaultHeaders.map((key) => ({
      key,
      label: formatFieldLabel(key),
      value: formatTelemetryValue(key, row?.[key]),
    })),
  };
}

function publishMonitorSnapshot() {
  if (!monitorApi?.publishSnapshot) return;
  monitorApi.publishSnapshot(buildMonitorSnapshot());
}

async function initPhoneMonitor() {
  if (!monitorApi?.getInfo) {
    setPhoneMonitorState(
      "Phone monitor unavailable",
      "",
      "This phone feed is exposed by the Electron app, so it will not appear in a normal browser preview."
    );
    return;
  }

  try {
    const info = await monitorApi.getInfo();
    if (info.primaryUrl) {
      setPhoneMonitorState("Phone ready", info.primaryUrl, "Same Wi-Fi or hotspot.");
    } else {
      setPhoneMonitorState(
        "Waiting for network",
        "",
        "Connect laptop to Wi-Fi or hotspot."
      );
    }
  } catch (error) {
    console.error(error);
    setPhoneMonitorState(
      "Phone feed error",
      "",
      "Could not build phone URL."
    );
  }

  publishMonitorSnapshot();
}

function setDot(dot, cls) {
  dot.classList.remove("dot--ok", "dot--warn", "dot--bad");
  dot.classList.add(cls);
}

function buildBaseGrid(svg, options = {}) {
  const { wide = false, yAxisLabel = "", xAxisLabel = "Time" } = options;
  const width = wide ? 1060 : 520;
  const right = wide ? 1040 : 500;
  const axisCenterX = 40 + ((right - 40) / 2);
  const yAxisText = yAxisLabel
    ? `<text x="16" y="100" text-anchor="middle" dominant-baseline="middle" fill="#5d6a75" font-size="11" font-weight="700" transform="rotate(-90 16 100)">${yAxisLabel}</text>`
    : "";
  const xAxisText = xAxisLabel
    ? `<text x="${axisCenterX}" y="202" text-anchor="middle" fill="#5d6a75" font-size="11" font-weight="700">${xAxisLabel}</text>`
    : "";
  svg.innerHTML = `
    <rect x="0" y="0" width="${width}" height="210" fill="#fff"></rect>
    <line x1="40" y1="20" x2="40" y2="180" stroke="#15202b" stroke-width="2"></line>
    <line x1="40" y1="180" x2="${right}" y2="180" stroke="#15202b" stroke-width="2"></line>
    ${yAxisText}
    ${xAxisText}
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

function formatPlotValue(value, digits = 2, unit = "") {
  if (value == null) return "--";
  const display = value.toFixed(digits);
  return unit ? `${display} ${unit}` : display;
}

function renderSeries(svg, series, options = {}) {
  const { wide = false, unit = "", digits = 2 } = options;
  buildBaseGrid(svg, options);
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

  svg.insertAdjacentHTML(
    "beforeend",
    `<text x="${rect.left + 6}" y="${rect.top + 12}" fill="#5d6a75" font-size="11" font-weight="700">${formatPlotValue(yMaxRaw, digits, unit)}</text>` +
    `<text x="${rect.left + 6}" y="${rect.bottom - 6}" fill="#5d6a75" font-size="11" font-weight="700">${formatPlotValue(yMinRaw, digits, unit)}</text>`
  );

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
        `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" fill="${s.color}" font-size="12" font-weight="700">${formatPlotValue(last.y, digits, unit)}</text>`
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
  setDot(elements.checkSim, isSimulationModeOn() || row.MODE?.toUpperCase().includes("S") ? "dot--warn" : "dot--ok");
  setDot(elements.checkBattery, normalizeVoltage(row.VOLTAGE) != null ? "dot--ok" : "dot--warn");
}

function findRecentGpsPoints() {
  const points = [];
  for (let i = data.length - 1; i >= 0; i -= 1) {
    const row = data[i];
    const lat = toNumber(row?.GPS_LATITUDE);
    const lon = toNumber(row?.GPS_LONGITUDE);
    if (lat == null || lon == null) continue;
    points.push({ lat, lon, time: row.MISSION_TIME || "--" });
    if (points.length === 2) break;
  }
  return points.reverse();
}

function updateMap(lat, lon) {
  const recentPoints = findRecentGpsPoints();
  const pointA = recentPoints[0] || null;
  const pointB = recentPoints[1] || recentPoints[0] || null;

  if (lat != null && lon != null) {
    const url = `https://www.google.com/maps?q=${lat},${lon}`;
    const embedUrl = `${url}&z=16&output=embed`;
    if (lastMapEmbedUrl !== embedUrl) {
      elements.mapFrame.src = embedUrl;
      lastMapEmbedUrl = embedUrl;
    }
    elements.mapStatus.textContent = "GPS lock active";
    elements.mapLink.href = url;
    elements.mapLink.textContent = "Open in Google Maps";
    elements.gpsFixVal.textContent = "Locked";
    elements.mapPointA.textContent = pointA
      ? `${formatLatLon(pointA.lat, pointA.lon)} | ${pointA.time}`
      : formatLatLon(lat, lon);
    elements.mapPointB.textContent = pointB
      ? `${formatLatLon(pointB.lat, pointB.lon)} | ${pointB.time}`
      : "Waiting for next point";
  } else {
    elements.mapFrame.removeAttribute("src");
    lastMapEmbedUrl = "";
    elements.mapStatus.textContent = "Waiting for GPS fix";
    elements.mapLink.removeAttribute("href");
    elements.mapLink.textContent = "No map target";
    elements.gpsFixVal.textContent = "No Fix";
    elements.mapPointA.textContent = "Waiting for GPS fix";
    elements.mapPointB.textContent = "Waiting for next point";
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
  elements.cmdSent.textContent = lastSentCommand;
  elements.cmdEcho.textContent = "--";

  updateMap(null, null);
  updateQuickChecks({});
  renderFullTelemetry(null);
  renderSeries(plots.alt, [], plotOptions.alt);
  renderSeries(plots.bat, [], plotOptions.bat);
  renderSeries(plots.current, [], plotOptions.current);
  renderSeries(plots.pressure, [], plotOptions.pressure);
  renderSeries(plots.temp, [], plotOptions.temp);
  updateLinkPrep();
  publishMonitorSnapshot();
}

function renderFullTelemetry(row) {
  const keys = [...serialDefaultHeaders];
  const source = row || {};
  elements.fullTelemetry.innerHTML = keys.map((key) => {
    const display = formatTelemetryValue(key, source[key]);
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
  const pressure = normalizePressure(row.PRESSURE);
  const volt = normalizeVoltage(row.VOLTAGE);
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

  if (!simulationActive && row.CMD_ECHO && row.CMD_ECHO !== "No command send yet") {
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
  }], plotOptions.alt);
  renderSeries(plots.bat, [{
    points: windowRows
      .map((r) => ({ x: toNumber(r._SEQ) ?? 0, y: normalizeVoltage(r.VOLTAGE) }))
      .filter((p) => p.y != null),
    color: "#0f9d58",
    width: 3,
  }], plotOptions.bat);
  renderSeries(plots.current, [{
    points: windowRows
      .map((r) => ({ x: toNumber(r._SEQ) ?? 0, y: toNumber(r.CURRENT) }))
      .filter((p) => p.y != null),
    color: "#c57f00",
    width: 3,
  }], plotOptions.current);
  renderSeries(plots.pressure, [{
    points: windowRows
      .map((r) => ({ x: toNumber(r._SEQ) ?? 0, y: normalizePressure(r.PRESSURE) }))
      .filter((p) => p.y != null),
    color: "#7a4a13",
    width: 3,
  }], plotOptions.pressure);
  renderSeries(plots.temp, [{
    points: windowRows
      .map((r) => ({ x: toNumber(r._SEQ) ?? 0, y: toNumber(r.TEMPERATURE) }))
      .filter((p) => p.y != null),
    color: "#d9480f",
    width: 3,
  }], plotOptions.temp);
  publishMonitorSnapshot();
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
      elements.sourceLabel.textContent = "Source: Serial link data invalid";
      publishMonitorSnapshot();
    }
    return;
  }
  badLineStreak = 0;
  row._SEQ = String(data.length);
  data.push(row);
  index = data.length - 1;
  if (data.length === 1) {
    elements.sourceLabel.textContent = `Source: ${serialPort?.path || "Link"} @ ${fixedBaudRate}`;
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
  updateLinkPrep();
}

async function refreshPorts() {
  if (!serialApi) {
    elements.sourceLabel.textContent = "Source: Electron serial link unavailable";
    updateLinkPrep();
    publishMonitorSnapshot();
    return;
  }

  try {
    availablePorts = await serialApi.listPorts();
    renderPortOptions();
    if (!availablePorts.length) {
      elements.sourceLabel.textContent = "Source: No COM ports detected";
      publishMonitorSnapshot();
    }
  } catch (error) {
    console.error(error);
    elements.sourceLabel.textContent = "Source: COM port scan failed";
    updateLinkPrep();
    publishMonitorSnapshot();
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
  updateLinkPrep();
  refreshPorts();
}

async function connectSerial() {
  if (!serialApi) {
    elements.sourceLabel.textContent = "Source: Electron serial link unavailable";
    publishMonitorSnapshot();
    return;
  }

  try {
    const selectedPath = elements.portSelect.value;
    if (!selectedPath) {
      elements.sourceLabel.textContent = "Source: Select a COM port";
      publishMonitorSnapshot();
      return;
    }

    const connection = await serialApi.connect(selectedPath);
    stopSimulationPlayback();
    serialPort = availablePorts.find((port) => port.path === connection.path) || {
      path: connection.path,
      displayName: connection.path,
      manufacturer: "",
    };
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
    publishMonitorSnapshot();
  } catch (error) {
    console.error(error);
    const message = String(error?.message || error || "Unknown error");
    elements.sourceLabel.textContent = `Source: Link connection failed (${message})`;
    elements.cmdEcho.textContent = `Link error: ${message}`;
    await disconnectSerial(false);
  }
}

async function sendCommand(cmd) {
  if (!serialApi || !serialPort) {
    lastSentCommand = cmd;
    elements.cmdSent.textContent = cmd;
    elements.cmdEcho.textContent = `${cmd} (not sent: no link)`;
    publishMonitorSnapshot();
    return;
  }

  try {
    await serialApi.write(`${cmd}\n`);
    lastSentCommand = cmd;
    elements.cmdSent.textContent = cmd;
    elements.cmdEcho.textContent = cmd;
    publishMonitorSnapshot();
  } catch (error) {
    console.error(error);
    lastSentCommand = cmd;
    elements.cmdSent.textContent = cmd;
    elements.cmdEcho.textContent = `${cmd} (send failed)`;
    publishMonitorSnapshot();
  }
}

function handleDashboardCommand(cmd) {
  if (!serialPort && cmd === "SIM ENABLE") {
    armSimulationProfile();
    return;
  }

  if (!serialPort && cmd === "SIM ACTIVATE") {
    activateSimulationProfile();
    return;
  }

  sendCommand(cmd);
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

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  if (!headers.length) return [];

  if (headers.some((header) => serialHeaderSet.has(header))) {
    return lines.slice(1)
      .map((line) => parseCsvLine(line))
      .filter((cols) => cols.some((value) => value !== ""))
      .map((cols, rowIndex) => buildSimulationRowFromColumns(headers, cols, rowIndex))
      .filter((row) => isValidTelemetryRow(row) || normalizePressure(row.PRESSURE) != null);
  }

  const pressureIndex = headers.findIndex((name) => name === "PRESSURE");
  const pressureColumnIndex = pressureIndex >= 0 ? pressureIndex : 0;

  return lines.slice(1)
    .map((line) => parseCsvLine(line))
    .map((cols, rowIndex) => ({ pressure: toNumber(cols[pressureColumnIndex]), rowIndex }))
    .filter((entry) => entry.pressure != null)
    .map((entry) => buildSimulationRowFromPressure(entry.pressure, entry.rowIndex));
}

elements.connectBtn.addEventListener("click", connectSerial);
elements.disconnectBtn.addEventListener("click", () => disconnectSerial());
elements.refreshPortsBtn.addEventListener("click", refreshPorts);
elements.portSelect.addEventListener("change", updateLinkPrep);
elements.exportLogBtn.addEventListener("click", exportTelemetryLog);
elements.simCsvInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  stopSimulationPlayback();
  simulationRows = parseSimulationCsv(text);
  simulationFileName = file.name;
  simulationArmed = false;
  updateQuickChecks(rowAt(index) || {});
  elements.sourceLabel.textContent = simulationRows.length > 0
    ? `Source: SIM CSV ${file.name}`
    : "Source: SIM CSV invalid";
  elements.cmdEcho.textContent = simulationRows.length > 0
    ? `${simulationRows.length} simulation rows loaded. Run SIM ENABLE.`
    : "Simulation CSV invalid";
  publishMonitorSnapshot();
});

document.querySelectorAll("[data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const cmd = btn.getAttribute("data-cmd") || "--";
    handleDashboardCommand(cmd);
  });
});

if (serialApi) {
  serialApi.onData(handleSerialChunk);
  serialApi.onClose(async () => {
    if (suppressCloseEvent) return;
    await disconnectSerial(false);
    elements.sourceLabel.textContent = data.length > 0 ? "Source: Link disconnected" : "Source: Demo";
    publishMonitorSnapshot();
  });
  serialApi.onError((message) => {
    elements.sourceLabel.textContent = `Source: Link error (${message})`;
    elements.cmdEcho.textContent = `Link error: ${message}`;
    publishMonitorSnapshot();
  });
}

async function initImu3D() {
  const accelCanvas = document.getElementById("accelCanvas");
  const gyroCanvas = document.getElementById("gyroCanvas");
  if (!accelCanvas || !gyroCanvas) return;

  try {
    const THREE = await import("three");
    const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");

    function makeImuScene(canvas, color) {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(1.7, 1.2, 1.85);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.AmbientLight(0xffffff, 0.95));
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
      keyLight.position.set(2, 3, 3);
      scene.add(keyLight);
      scene.add(new THREE.GridHelper(3.8, 6, 0xb7c4cf, 0xd9e1e7));

      const axes = new THREE.AxesHelper(2.15);
      scene.add(axes);

      const origin = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 18, 18),
        new THREE.MeshStandardMaterial({ color: 0x15202b, roughness: 0.45 })
      );
      scene.add(origin);

      const historyPoints = Array.from({ length: 36 }, (_, i) => new THREE.Vector3(i * 0.03, 0, 0));
      const historyGeometry = new THREE.BufferGeometry().setFromPoints(historyPoints);
      const historyLine = new THREE.Line(
        historyGeometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 })
      );
      scene.add(historyLine);

      const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, color, 0.28, 0.16);
      scene.add(arrow);

      const point = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 18, 18),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12, roughness: 0.35 })
      );
      scene.add(point);

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = true;
      controls.panSpeed = 0.75;
      controls.zoomSpeed = 0.9;
      controls.rotateSpeed = 0.8;
      controls.minDistance = 1.1;
      controls.maxDistance = 6;
      controls.minPolarAngle = 0.35;
      controls.maxPolarAngle = Math.PI * 0.48;
      controls.target.set(0, 0, 0);
      controls.update();

      function resize() {
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }

      function update(x, y, z) {
        const vector = new THREE.Vector3(x || 0, y || 0, z || 0);
        const length = vector.length();
        const dir = length > 0.0001 ? vector.clone().normalize() : new THREE.Vector3(1, 0, 0);
        const scaledLength = Math.min(2.35, Math.max(0.26, length * 0.6));
        arrow.setDirection(dir);
        arrow.setLength(scaledLength, 0.28, 0.16);

        const endpoint = dir.clone().multiplyScalar(scaledLength);
        point.position.copy(endpoint);

        historyPoints.push(endpoint.clone());
        while (historyPoints.length > 36) historyPoints.shift();
        historyGeometry.setFromPoints(historyPoints);
      }

      resize();
      window.addEventListener("resize", resize);

      return { renderer, scene, camera, controls, update };
    }

    imuScenes = {
      accel: makeImuScene(accelCanvas, 0x0f6a9e),
      gyro: makeImuScene(gyroCanvas, 0xc62828),
    };

    function animate() {
      if (!imuScenes) return;
      imuScenes.accel.controls.update();
      imuScenes.gyro.controls.update();
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
initPhoneMonitor();
refreshPorts();
initImu3D();
