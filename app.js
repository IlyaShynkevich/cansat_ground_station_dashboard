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
  rollVal: document.getElementById("rollVal"),
  pitchVal: document.getElementById("pitchVal"),
  yawVal: document.getElementById("yawVal"),
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
  baudSelect: document.getElementById("baudSelect"),
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
let cube = null;
let serialPort = null;
let serialReader = null;
let serialHeaders = null;
let serialReadActive = false;
let badLineStreak = 0;
let activeBaudRate = 115200;
let simulationPressureRows = [];

const tailSize = 80;
const encoder = new TextEncoder();

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
  elements.rollVal.textContent = "--";
  elements.pitchVal.textContent = "--";
  elements.yawVal.textContent = "--";
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
  const roll = toNumber(row.GYRO_R);
  const pitch = toNumber(row.GYRO_P);
  const yaw = toNumber(row.GYRO_Y);

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
  elements.rollVal.textContent = formatNum(roll, 2);
  elements.pitchVal.textContent = formatNum(pitch, 2);
  elements.yawVal.textContent = formatNum(yaw, 2);

  updateMap(lat, lon);

  if (cube) {
    cube.rotation.set((pitch || 0) * 0.03, (yaw || 0) * 0.03, (roll || 0) * 0.03);
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
      elements.sourceLabel.textContent = "Source: USB data invalid (check baud)";
    }
    return;
  }
  badLineStreak = 0;
  row._SEQ = String(data.length);
  data.push(row);
  index = data.length - 1;
  if (data.length === 1) {
    elements.sourceLabel.textContent = `Source: USB @ ${activeBaudRate}`;
  }
  updateUi();
}

async function disconnectSerial(updateSource = true) {
  serialReadActive = false;

  if (serialReader) {
    try {
      await serialReader.cancel();
    } catch (error) {
      console.warn(error);
    }
    serialReader.releaseLock();
    serialReader = null;
  }

  if (serialPort) {
    try {
      await serialPort.close();
    } catch (error) {
      console.warn(error);
    }
    serialPort = null;
  }

  elements.connectBtn.disabled = false;
  elements.disconnectBtn.disabled = true;
  elements.baudSelect.disabled = false;
  if (updateSource) elements.sourceLabel.textContent = "Source: Demo";
}

async function readSerialLoop() {
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (serialReadActive && serialReader) {
      const { value, done } = await serialReader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      lines.forEach(handleSerialLine);
    }
  } catch (error) {
    console.error(error);
    elements.sourceLabel.textContent = "Source: USB read error";
  } finally {
    await disconnectSerial(false);
    if (!serialPort) {
      elements.sourceLabel.textContent = data.length > 0 ? "Source: USB disconnected" : "Source: Demo";
    }
  }
}

async function connectSerial() {
  if (!("serial" in navigator)) {
    elements.sourceLabel.textContent = "Source: Web Serial not supported";
    return;
  }

  try {
    const baudRate = Number(elements.baudSelect.value) || 115200;
    activeBaudRate = baudRate;
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate });

    serialPort = port;
    serialReader = port.readable?.getReader() || null;
    serialReadActive = true;
    serialHeaders = null;
    badLineStreak = 0;
    data = [];
    index = 0;
    clearUi();

    elements.connectBtn.disabled = true;
    elements.disconnectBtn.disabled = false;
    elements.baudSelect.disabled = true;
    elements.sourceLabel.textContent = `Source: USB @ ${baudRate} (waiting data)`;
    updateQuickChecks(rowAt(index) || {});

    if (serialReader) readSerialLoop();
  } catch (error) {
    console.error(error);
    elements.sourceLabel.textContent = "Source: USB connection failed";
    await disconnectSerial(false);
  }
}

async function sendCommand(cmd) {
  if (!serialPort?.writable) {
    elements.cmdEcho.textContent = `${cmd} (not sent: no USB)`;
    return;
  }

  const writer = serialPort.writable.getWriter();
  try {
    await writer.write(encoder.encode(`${cmd}\n`));
    elements.cmdEcho.textContent = cmd;
  } catch (error) {
    console.error(error);
    elements.cmdEcho.textContent = `${cmd} (send failed)`;
  } finally {
    writer.releaseLock();
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
  const index = pressureIndex >= 0 ? pressureIndex : 0;

  return lines.slice(1)
    .map((line) => line.split(",").map((part) => part.trim()))
    .map((cols) => toNumber(cols[index]))
    .filter((value) => value != null);
}

elements.connectBtn.addEventListener("click", connectSerial);
elements.disconnectBtn.addEventListener("click", () => disconnectSerial());
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

if ("serial" in navigator) {
  navigator.serial.addEventListener("disconnect", async (event) => {
    if (event.target === serialPort) {
      await disconnectSerial();
    }
  });
}

async function init3D() {
  const canvas = document.getElementById("threeCanvas");
  const wrap = canvas.closest(".three-wrap");
  const fallback = document.createElement("div");
  fallback.className = "three-fallback";
  fallback.textContent = "3D init failed";
  fallback.style.display = "none";
  wrap.appendChild(fallback);
  try {
    const THREE = await import("three");
    const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(2.2, 1.5, 2.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(2, 4, 2);
    scene.add(keyLight);

    const geometry = new THREE.BoxGeometry(1, 0.55, 0.45);
    const material = new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.6 });
    cube = new THREE.Mesh(geometry, material);
    scene.add(cube);
    const edges = new THREE.EdgesGeometry(geometry);
    cube.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x15202b })));
    scene.add(new THREE.GridHelper(8, 8, 0xb0bac4, 0xd6dde3));

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    resize();

    function animate() {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();
  } catch (error) {
    console.error(error);
    fallback.style.display = "grid";
  }
}

clearUi();
init3D();
