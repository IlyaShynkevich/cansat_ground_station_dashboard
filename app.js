const elements = {
  fileInput: document.getElementById("csvFileInput"),
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
  gpsAltVal: document.getElementById("gpsAltVal"),
  gpsVal: document.getElementById("gpsVal"),
  rollVal: document.getElementById("rollVal"),
  pitchVal: document.getElementById("pitchVal"),
  yawVal: document.getElementById("yawVal"),
  mapCoords: document.getElementById("mapCoords"),
  mapLink: document.getElementById("mapLink"),
  cmdEcho: document.getElementById("cmdEcho"),
  playPauseBtn: document.getElementById("playPauseBtn"),
  speedSelect: document.getElementById("speedSelect"),
  timeline: document.getElementById("timeline"),
  checkLink: document.getElementById("checkLink"),
  checkLog: document.getElementById("checkLog"),
  checkSim: document.getElementById("checkSim"),
  checkBattery: document.getElementById("checkBattery"),
};

const plots = {
  alt: document.getElementById("plotAlt"),
  bat: document.getElementById("plotBat"),
  imu: document.getElementById("plotIMU"),
};

let data = [];
let index = 0;
let isPlaying = true;
let intervalMs = Number(elements.speedSelect.value);
let loopId = null;
let cube = null;

const tailSize = 80;

function toNumber(value) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseCsvLine(line) {
  return line.split(",").map((x) => x.trim());
}

function parseTelemetryCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row = Object.fromEntries(headers.map((h, j) => [h, cols[j] ?? ""]));
    if (!row.PACKET_COUNT) continue;
    rows.push(row);
  }
  return rows;
}

function formatNum(value, digits = 2) {
  return value == null ? "--" : value.toFixed(digits);
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
  });
}

function updateQuickChecks(row) {
  setDot(elements.checkLink, "dot--ok");
  setDot(elements.checkLog, "dot--ok");
  setDot(elements.checkSim, row.MODE?.toUpperCase().includes("S") ? "dot--warn" : "dot--ok");
  const v = toNumber(row.VOLTAGE);
  setDot(elements.checkBattery, v != null && v >= 3.5 ? "dot--ok" : "dot--bad");
}

function rowAt(i) {
  return data[Math.max(0, Math.min(i, data.length - 1))];
}

function updateUi() {
  const row = rowAt(index);
  if (!row) return;

  const packet = toNumber(row.PACKET_COUNT) ?? index;
  const received = index + 1;
  const firstPacket = toNumber(data[0]?.PACKET_COUNT) ?? 0;
  const lost = Math.max(0, packet - firstPacket + 1 - received);

  elements.missionTime.textContent = row.MISSION_TIME || "--";
  elements.modeBadge.textContent = (row.MODE || "--").trim();
  elements.stateBadge.textContent = (row.STATE || "--").trim();
  elements.packetsReceived.textContent = String(received);
  elements.packetsLost.textContent = String(lost);
  elements.gpsSats.textContent = row.GPS_SATS || "--";

  const alt = toNumber(row.ALTITUDE);
  const temp = toNumber(row.TEMPERATURE);
  const pressure = toNumber(row.PRESSURE);
  const volt = toNumber(row.VOLTAGE);
  const gpsAlt = toNumber(row.GPS_ALTITUDE);
  const lat = toNumber(row.GPS_LATITUDE);
  const lon = toNumber(row.GPS_LONGITUDE);
  const roll = toNumber(row.GYRO_R);
  const pitch = toNumber(row.GYRO_P);
  const yaw = toNumber(row.GYRO_Y);

  elements.altitudeVal.textContent = formatNum(alt, 1);
  elements.tempVal.textContent = formatNum(temp, 1);
  elements.pressureVal.textContent = formatNum(pressure, 1);
  elements.voltageVal.textContent = formatNum(volt, 2);
  elements.gpsAltVal.textContent = formatNum(gpsAlt, 1);
  elements.gpsVal.textContent = lat == null || lon == null ? "Lat -- / Lon --" : `Lat ${lat.toFixed(5)} / Lon ${lon.toFixed(5)}`;

  elements.rollVal.textContent = formatNum(roll, 2);
  elements.pitchVal.textContent = formatNum(pitch, 2);
  elements.yawVal.textContent = formatNum(yaw, 2);
  if (cube) cube.rotation.set((pitch || 0) * 0.03, (yaw || 0) * 0.03, (roll || 0) * 0.03);

  if (lat != null && lon != null) {
    elements.mapCoords.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    elements.mapLink.href = `https://www.google.com/maps?q=${lat},${lon}`;
    elements.mapLink.textContent = "Open in Google Maps";
  } else {
    elements.mapCoords.textContent = "No GPS fix yet";
    elements.mapLink.removeAttribute("href");
    elements.mapLink.textContent = "No map target";
  }

  if (row.CMD_ECHO && row.CMD_ECHO !== "No command send yet") {
    elements.cmdEcho.textContent = row.CMD_ECHO;
  }

  updateQuickChecks(row);
  elements.timeline.value = String(index);

  const start = Math.max(0, index - tailSize + 1);
  const windowRows = data.slice(start, index + 1);
  renderSeries(plots.alt, [{
    points: windowRows.map((r) => ({ x: toNumber(r.PACKET_COUNT) ?? 0, y: toNumber(r.ALTITUDE) ?? 0 })),
    color: "#0f6a9e",
    width: 3,
  }]);
  renderSeries(plots.bat, [{
    points: windowRows.map((r) => ({ x: toNumber(r.PACKET_COUNT) ?? 0, y: toNumber(r.VOLTAGE) ?? 0 })),
    color: "#0f9d58",
    width: 3,
  }]);
  renderSeries(plots.imu, [
    {
      points: windowRows.map((r) => ({ x: toNumber(r.PACKET_COUNT) ?? 0, y: toNumber(r.ACCEL_R) ?? 0 })),
      color: "#15202b",
      width: 3,
    },
    {
      points: windowRows.map((r) => ({ x: toNumber(r.PACKET_COUNT) ?? 0, y: toNumber(r.GYRO_R) ?? 0 })),
      color: "#c62828",
      width: 2,
      dashed: true,
    },
  ], true);
}

function tick() {
  if (!isPlaying || data.length === 0) return;
  index = Math.min(index + 1, data.length - 1);
  updateUi();
  if (index >= data.length - 1) isPlaying = false;
  elements.playPauseBtn.textContent = isPlaying ? "Pause" : "Play";
}

function restartLoop() {
  if (loopId) clearInterval(loopId);
  loopId = setInterval(tick, intervalMs);
}

function seedDemoData() {
  const rows = [];
  let altitude = 0;
  let voltage = 4.2;
  for (let i = 0; i < 260; i += 1) {
    altitude += i < 120 ? 2.3 : -1.6;
    voltage -= 0.0018;
    rows.push({
      TEAM_ID: "3134",
      MISSION_TIME: `00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`,
      PACKET_COUNT: String(2800 + i),
      MODE: "F",
      STATE: i < 20 ? "ASCENT" : i < 170 ? "DESCENT" : "LANDED",
      ALTITUDE: altitude.toFixed(2),
      TEMPERATURE: (24 - i * 0.01).toFixed(2),
      PRESSURE: (100.2 - altitude * 0.002).toFixed(2),
      VOLTAGE: Math.max(3.35, voltage).toFixed(2),
      GYRO_R: (Math.sin(i / 10) * 1.4).toFixed(2),
      GYRO_P: (Math.cos(i / 9) * 1.7).toFixed(2),
      GYRO_Y: (Math.sin(i / 12) * 2.4).toFixed(2),
      ACCEL_R: (Math.sin(i / 7) * 0.7).toFixed(2),
      ACCEL_P: (Math.cos(i / 8) * 0.9).toFixed(2),
      ACCEL_Y: "1.00",
      GPS_TIME: "",
      GPS_ALTITUDE: altitude.toFixed(2),
      GPS_LATITUDE: (52.5729 + i * 0.00002).toFixed(6),
      GPS_LONGITUDE: (13.4590 + i * 0.000015).toFixed(6),
      GPS_SATS: String(7 + (i % 4)),
      CMD_ECHO: i % 45 === 0 ? "CAL" : "No command send yet",
    });
  }
  return rows;
}

elements.fileInput.addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseTelemetryCsv(text);
  if (rows.length === 0) {
    elements.sourceLabel.textContent = "Source: invalid file";
    return;
  }
  data = rows;
  index = 0;
  isPlaying = true;
  elements.sourceLabel.textContent = `Source: ${file.name}`;
  elements.timeline.max = String(Math.max(0, data.length - 1));
  updateUi();
});

elements.playPauseBtn.addEventListener("click", () => {
  isPlaying = !isPlaying;
  elements.playPauseBtn.textContent = isPlaying ? "Pause" : "Play";
});

elements.speedSelect.addEventListener("change", () => {
  intervalMs = Number(elements.speedSelect.value);
  restartLoop();
});

elements.timeline.addEventListener("input", () => {
  index = Number(elements.timeline.value);
  updateUi();
});

document.querySelectorAll("[data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => {
    elements.cmdEcho.textContent = btn.getAttribute("data-cmd") || "--";
  });
});

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

data = seedDemoData();
elements.timeline.max = String(data.length - 1);
updateUi();
restartLoop();
init3D();
