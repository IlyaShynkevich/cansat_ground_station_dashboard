const elements = {
  transportStatus: document.getElementById("transportStatus"),
  sourceLabel: document.getElementById("sourceLabel"),
  liveBadge: document.getElementById("liveBadge"),
  lastUpdate: document.getElementById("lastUpdate"),
  metricGrid: document.getElementById("metricGrid"),
  plotGrid: document.getElementById("plotGrid"),
  accel3dCanvas: document.getElementById("accel3dCanvas"),
  gyro3dCanvas: document.getElementById("gyro3dCanvas"),
  accel3dVector: document.getElementById("accel3dVector"),
  gyro3dVector: document.getElementById("gyro3dVector"),
  teamIdVal: document.getElementById("teamIdVal"),
  missionTime: document.getElementById("missionTime"),
  modeVal: document.getElementById("modeVal"),
  stateVal: document.getElementById("stateVal"),
  packetsReceivedVal: document.getElementById("packetsReceivedVal"),
  packetsLostVal: document.getElementById("packetsLostVal"),
  gpsSatsVal: document.getElementById("gpsSatsVal"),
  quickChecks: document.getElementById("quickChecks"),
  linkPort: document.getElementById("linkPort"),
  linkBridge: document.getElementById("linkBridge"),
  mapFrame: document.getElementById("mapFrame"),
  mapTrail: document.getElementById("mapTrail"),
  mapStatus: document.getElementById("mapStatus"),
  gpsDisplay: document.getElementById("gpsDisplay"),
  mapLink: document.getElementById("mapLink"),
  gpsPoints: document.getElementById("gpsPoints"),
  cmdSent: document.getElementById("cmdSent"),
  cmdEcho: document.getElementById("cmdEcho"),
  telemetryGrid: document.getElementById("telemetryGrid"),
};
const monitorAuthToken = new URLSearchParams(window.location.search).get("token") || "";

const metricDefinitions = [
  { key: "altitude", label: "Altitude", unit: "m" },
  { key: "temperature", label: "Temperature", unit: "C" },
  { key: "pressure", label: "Pressure", unit: "kPa" },
  { key: "voltage", label: "Voltage", unit: "V" },
  { key: "current", label: "Current", unit: "A" },
  { key: "gpsAltitude", label: "GPS Alt", unit: "m" },
];

const metricPlotDefinitions = [
  { key: "altitude", label: "Altitude (m) vs Time (s)", color: "#0f6a9e", unit: "m" },
  { key: "voltage", label: "Voltage (V) vs Time (s)", color: "#0f9d58", unit: "V" },
  { key: "current", label: "Current (A) vs Time (s)", color: "#c57f00", unit: "A" },
  { key: "pressure", label: "Pressure (kPa) vs Time (s)", color: "#7a4a13", unit: "kPa" },
  { key: "temperature", label: "Temperature (C) vs Time (s)", color: "#d9480f", unit: "C", wide: true },
];

const plotDefinitions = metricPlotDefinitions;

function withMonitorToken(path) {
  if (!monitorAuthToken) return path;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("token", monitorAuthToken);
  return `${url.pathname}${url.search}`;
}

const quickCheckDefinitions = [
  { key: "telemetryLink", label: "Telemetry Link" },
  { key: "loggingReady", label: "Logging Ready" },
  { key: "simulationMode", label: "Simulation Mode" },
  { key: "batteryOk", label: "Battery OK" },
];

const plotHistoryLimit = 40;
const plotHistory = Object.fromEntries(plotDefinitions.map(({ key }) => [key, []]));
let historyContextKey = "";
let lastHistoryPacket = null;
let lastHistoryTimeSeconds = null;
let lastMapEmbedUrl = "";
let imu3dScenes = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toneClass(status) {
  if (status === "ok") return "chip chip--ok";
  if (status === "bad") return "chip chip--bad";
  return "chip chip--warn";
}

function toNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseClockTime(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{2}:\d{2}:\d{2}$/.test(text)) return null;
  const [hours, minutes, seconds] = text.split(":").map(Number);
  return (hours * 3600) + (minutes * 60) + seconds;
}

function formatPlotSecondLabel(value) {
  if (!Number.isFinite(value)) return "--";
  return `${Math.round(value)}s`;
}

function findTelemetryField(snapshot, key) {
  return Array.isArray(snapshot?.telemetry)
    ? snapshot.telemetry.find((field) => field?.key === key) || null
    : null;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function formatPlotValue(value, unit = "") {
  if (value == null) return "--";
  return unit ? `${value}${unit ? ` ${unit}` : ""}` : String(value);
}

function getPlotValue(snapshot, definition) {
  if (definition.source === "telemetry") {
    return toNumber(findTelemetryField(snapshot, definition.key)?.value);
  }
  return toNumber(snapshot?.metrics?.[definition.key]);
}

function getTelemetryNumber(snapshot, key) {
  return toNumber(findTelemetryField(snapshot, key)?.value);
}

function getPlotDisplayValue(snapshot, definition) {
  const value = getPlotValue(snapshot, definition);
  if (value == null) return "--";
  if (definition.source === "telemetry") return value.toFixed(2);
  return snapshot?.metrics?.[definition.key] ?? value.toFixed(2);
}

function formatVectorPart(label, value) {
  return `${label} ${value == null ? "--" : value.toFixed(2)}`;
}

function makePhoneImuFallbackScene(canvas, color) {
  const ctx = canvas.getContext("2d");
  const history = [];
  let vector = { x: 0, y: 0, z: 0 };
  let rotationX = -0.55;
  let rotationY = 0.72;
  let zoom = 1;
  let activePointerId = null;
  let lastPointer = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rotatePoint(point) {
    const cosY = Math.cos(rotationY);
    const sinY = Math.sin(rotationY);
    const yawed = {
      x: (point.x * cosY) + (point.z * sinY),
      y: point.y,
      z: (-point.x * sinY) + (point.z * cosY),
    };
    const cosX = Math.cos(rotationX);
    const sinX = Math.sin(rotationX);
    return {
      x: yawed.x,
      y: (yawed.y * cosX) - (yawed.z * sinX),
      z: (yawed.y * sinX) + (yawed.z * cosX),
    };
  }

  function project(point, centerX, centerY, scale) {
    const rotated = rotatePoint(point);
    const depth = 1 / (1 + ((rotated.z + 2.2) * 0.09));
    return {
      x: centerX + (rotated.x * scale * depth),
      y: centerY - (rotated.y * scale * depth),
    };
  }

  function drawLine(from, to, centerX, centerY, scale, stroke, width = 1.4) {
    const a = project(from, centerX, centerY, scale);
    const b = project(to, centerX, centerY, scale);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
    return b;
  }

  function drawLabel(text, point, centerX, centerY, scale, fill) {
    const p = project(point, centerX, centerY, scale);
    ctx.fillStyle = fill;
    ctx.font = "800 11px Segoe UI, sans-serif";
    ctx.fillText(text, p.x + 5, p.y - 5);
  }

  function drawArrowHead(tip, dir, centerX, centerY, scale) {
    const end = project(tip, centerX, centerY, scale);
    const base = project({
      x: tip.x - dir.x * 0.18,
      y: tip.y - dir.y * 0.18,
      z: tip.z - dir.z * 0.18,
    }, centerX, centerY, scale);
    const angle = Math.atan2(end.y - base.y, end.x - base.x);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - Math.cos(angle - 0.46) * 9, end.y - Math.sin(angle - 0.46) * 9);
    ctx.lineTo(end.x - Math.cos(angle + 0.46) * 9, end.y - Math.sin(angle + 0.46) * 9);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function render() {
    resize();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const inset = 16;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const scale = Math.min(width, height) * 0.2 * zoom;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f9fbfd";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(inset, inset, width - (inset * 2), height - (inset * 2));
    ctx.clip();

    for (let i = -2; i <= 2; i += 1) {
      drawLine({ x: -2, y: 0, z: i }, { x: 2, y: 0, z: i }, centerX, centerY, scale, "rgba(97,113,125,0.14)");
      drawLine({ x: i, y: 0, z: -2 }, { x: i, y: 0, z: 2 }, centerX, centerY, scale, "rgba(97,113,125,0.14)");
    }

    drawLine({ x: 0, y: 0, z: 0 }, { x: 1.75, y: 0, z: 0 }, centerX, centerY, scale, "#536575", 1.6);
    drawLine({ x: 0, y: 0, z: 0 }, { x: 0, y: 1.75, z: 0 }, centerX, centerY, scale, "#6a7b87", 1.6);
    drawLine({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1.75 }, centerX, centerY, scale, "#83919b", 1.6);
    drawLabel("X", { x: 1.9, y: 0, z: 0 }, centerX, centerY, scale, "#536575");
    drawLabel("Y", { x: 0, y: 1.9, z: 0 }, centerX, centerY, scale, "#6a7b87");
    drawLabel("Z", { x: 0, y: 0, z: 1.9 }, centerX, centerY, scale, "#83919b");

    if (history.length > 1) {
      ctx.beginPath();
      history.forEach((point, index) => {
        const p = project(point, centerX, centerY, scale);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = `${color}99`;
      ctx.lineWidth = 1.7;
      ctx.stroke();
    }

    const length = Math.hypot(vector.x, vector.y, vector.z);
    const dir = length > 0.0001
      ? { x: vector.x / length, y: vector.y / length, z: vector.z / length }
      : { x: 1, y: 0, z: 0 };
    const scaledLength = Math.min(1.9, Math.max(0.28, length * 0.42));
    const tip = { x: dir.x * scaledLength, y: dir.y * scaledLength, z: dir.z * scaledLength };
    drawLine({ x: 0, y: 0, z: 0 }, tip, centerX, centerY, scale, color, 2.8);
    drawArrowHead(tip, dir, centerX, centerY, scale);

    const p = project(tip, centerX, centerY, scale);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = "#f9fbfd";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  function update(x, y, z) {
    vector = { x: x || 0, y: y || 0, z: z || 0 };
    const length = Math.hypot(vector.x, vector.y, vector.z);
    const dir = length > 0.0001
      ? { x: vector.x / length, y: vector.y / length, z: vector.z / length }
      : { x: 1, y: 0, z: 0 };
    const scaledLength = Math.min(1.9, Math.max(0.28, length * 0.42));
    history.push({ x: dir.x * scaledLength, y: dir.y * scaledLength, z: dir.z * scaledLength });
    while (history.length > 34) history.shift();
    render();
  }

  canvas.addEventListener("pointerdown", (event) => {
    activePointerId = event.pointerId;
    lastPointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(activePointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (activePointerId !== event.pointerId || !lastPointer) return;
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };
    rotationY += dx * 0.012;
    rotationX = Math.max(-1.25, Math.min(1.15, rotationX + (dy * 0.012)));
    render();
  });

  canvas.addEventListener("pointerup", (event) => {
    if (activePointerId !== event.pointerId) return;
    activePointerId = null;
    lastPointer = null;
  });

  canvas.addEventListener("pointercancel", () => {
    activePointerId = null;
    lastPointer = null;
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoom = Math.max(0.65, Math.min(1.45, zoom + (event.deltaY < 0 ? 0.08 : -0.08)));
    render();
  }, { passive: false });

  window.addEventListener("resize", render);
  update(0, 0, 0);
  return { update, render };
}

function makePhoneImuThreeScene(THREE, OrbitControls, canvas, color) {
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

  function makeAxis(to, axisColor) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      to,
    ]);
    const material = new THREE.LineBasicMaterial({ color: axisColor, transparent: true, opacity: 0.78 });
    return new THREE.Line(geometry, material);
  }

  scene.add(makeAxis(new THREE.Vector3(2.1, 0, 0), 0x536575));
  scene.add(makeAxis(new THREE.Vector3(0, 2.1, 0), 0x6a7b87));
  scene.add(makeAxis(new THREE.Vector3(0, 0, 2.1), 0x83919b));

  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 18, 18),
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

  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, color, 0.22, 0.1);
  scene.add(arrow);

  const point = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 18, 18),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.05, roughness: 0.5 })
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
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function update(x, y, z) {
    const vector = new THREE.Vector3(x || 0, y || 0, z || 0);
    const length = vector.length();
    const dir = length > 0.0001 ? vector.clone().normalize() : new THREE.Vector3(1, 0, 0);
    const scaledLength = Math.min(2.35, Math.max(0.26, length * 0.6));
    arrow.setDirection(dir);
    arrow.setLength(scaledLength, 0.22, 0.1);

    const endpoint = dir.clone().multiplyScalar(scaledLength);
    point.position.copy(endpoint);

    historyPoints.push(endpoint.clone());
    while (historyPoints.length > 36) historyPoints.shift();
    historyGeometry.setFromPoints(historyPoints);
  }

  resize();
  window.addEventListener("resize", resize);
  update(0, 0, 0);
  return { renderer, scene, camera, controls, update };
}

function initPhoneImuFallback() {
  if (!elements.accel3dCanvas || !elements.gyro3dCanvas) return;
  imu3dScenes = {
    accel: makePhoneImuFallbackScene(elements.accel3dCanvas, "#0f6a9e"),
    gyro: makePhoneImuFallbackScene(elements.gyro3dCanvas, "#c62828"),
  };
}

async function initPhoneImu3d() {
  if (!elements.accel3dCanvas || !elements.gyro3dCanvas) return;

  try {
    const THREE = await import("three");
    const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");

    imu3dScenes = {
      accel: makePhoneImuThreeScene(THREE, OrbitControls, elements.accel3dCanvas, 0x0f6a9e),
      gyro: makePhoneImuThreeScene(THREE, OrbitControls, elements.gyro3dCanvas, 0xc62828),
    };

    function animate() {
      if (!imu3dScenes?.accel?.renderer || !imu3dScenes?.gyro?.renderer) return;
      imu3dScenes.accel.controls.update();
      imu3dScenes.gyro.controls.update();
      imu3dScenes.accel.renderer.render(imu3dScenes.accel.scene, imu3dScenes.accel.camera);
      imu3dScenes.gyro.renderer.render(imu3dScenes.gyro.scene, imu3dScenes.gyro.camera);
      requestAnimationFrame(animate);
    }

    animate();
  } catch (error) {
    console.warn("Phone 3D IMU renderer unavailable, using fallback renderer.", error);
    initPhoneImuFallback();
  }
}

function renderImu3d(snapshot) {
  const accelX = getTelemetryNumber(snapshot, "ACCEL_R");
  const accelY = getTelemetryNumber(snapshot, "ACCEL_P");
  const accelZ = getTelemetryNumber(snapshot, "ACCEL_Y");
  const gyroX = getTelemetryNumber(snapshot, "GYRO_R");
  const gyroY = getTelemetryNumber(snapshot, "GYRO_P");
  const gyroZ = getTelemetryNumber(snapshot, "GYRO_Y");

  elements.accel3dVector.textContent = [
    formatVectorPart("X", accelX),
    formatVectorPart("Y", accelY),
    formatVectorPart("Z", accelZ),
  ].join(" | ");
  elements.gyro3dVector.textContent = [
    formatVectorPart("X", gyroX),
    formatVectorPart("Y", gyroY),
    formatVectorPart("Z", gyroZ),
  ].join(" | ");

  imu3dScenes?.accel?.update(accelX, accelY, accelZ);
  imu3dScenes?.gyro?.update(gyroX, gyroY, gyroZ);
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

function renderPlotCard(definition, snapshot) {
  const { key, label, color, unit, wide = false } = definition;
  const history = plotHistory[key] || [];
  const width = 320;
  const height = 140;
  const rect = { left: 36, top: 18, right: 306, bottom: 112 };
  const value = getPlotDisplayValue(snapshot, definition);

  let svg = `
    <svg class="plot-card__svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(label)} plot">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f9fbfd"></rect>
      <line x1="${rect.left}" y1="${rect.top}" x2="${rect.right}" y2="${rect.top}" stroke="#dce5ec" stroke-width="1"></line>
      <line x1="${rect.left}" y1="${((rect.top + rect.bottom) / 2).toFixed(1)}" x2="${rect.right}" y2="${((rect.top + rect.bottom) / 2).toFixed(1)}" stroke="#dce5ec" stroke-width="1"></line>
      <line x1="${rect.left}" y1="${rect.bottom}" x2="${rect.right}" y2="${rect.bottom}" stroke="#aebbc6" stroke-width="1.1"></line>
      <line x1="${rect.left}" y1="${rect.top}" x2="${rect.left}" y2="${rect.bottom}" stroke="#aebbc6" stroke-width="1.1"></line>
    `;

  if (history.length > 1) {
    const allY = history.map((point) => point.y);
    const yMinRaw = Math.min(...allY);
    const yMaxRaw = Math.max(...allY);
    const xMinRaw = history[0].x;
    const xMaxRaw = history[history.length - 1].x;
    const pad = (yMaxRaw - yMinRaw) * 0.1 || 1;
    const yMin = yMinRaw - pad;
    const yMax = yMaxRaw + pad;
    const d = buildPath(history, rect, yMin, yMax);
    const lastPoint = history[history.length - 1];
    const xMidRaw = xMinRaw + ((xMaxRaw - xMinRaw) / 2);
    const sx = (x) => rect.left + ((x - xMinRaw) / (xMaxRaw - xMinRaw || 1)) * (rect.right - rect.left);
    const sy = (y) => rect.bottom - ((y - yMin) / (yMax - yMin || 1)) * (rect.bottom - rect.top);
    const ticks = xMaxRaw > xMinRaw
      ? [
          { x: rect.left, label: formatPlotSecondLabel(xMinRaw), anchor: "start" },
          { x: (rect.left + rect.right) / 2, label: formatPlotSecondLabel(xMidRaw), anchor: "middle" },
          { x: rect.right, label: formatPlotSecondLabel(xMaxRaw), anchor: "end" },
        ]
      : [
          { x: (rect.left + rect.right) / 2, label: formatPlotSecondLabel(xMinRaw), anchor: "middle" },
        ];

    svg += `
      <text x="${rect.left - 5}" y="${rect.top + 4}" text-anchor="end" fill="#6f7f8a" font-size="9" font-weight="700">${escapeHtml(formatPlotValue(yMaxRaw.toFixed(1), unit))}</text>
      <text x="${rect.left - 5}" y="${rect.bottom + 3}" text-anchor="end" fill="#6f7f8a" font-size="9" font-weight="700">${escapeHtml(formatPlotValue(yMinRaw.toFixed(1), unit))}</text>
      ${ticks.map((tick) => `
        <line x1="${tick.x.toFixed(1)}" y1="${rect.bottom}" x2="${tick.x.toFixed(1)}" y2="${(rect.bottom + 4).toFixed(1)}" stroke="#8494a0" stroke-width="1"></line>
        <text x="${tick.x.toFixed(1)}" y="${(rect.bottom + 14).toFixed(1)}" text-anchor="${tick.anchor}" fill="#6f7f8a" font-size="9" font-weight="700">${escapeHtml(tick.label)}</text>
      `).join("")}
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path>
      <circle cx="${sx(lastPoint.x).toFixed(1)}" cy="${sy(lastPoint.y).toFixed(1)}" r="2.4" fill="#f9fbfd" stroke="${color}" stroke-width="1.7"></circle>
    `;
  } else {
    svg += `<text x="170" y="72" text-anchor="middle" fill="#61717d" font-size="11" font-weight="700">Waiting for telemetry history</text>`;
  }

  svg += "</svg>";

  return `
    <article class="plot-card${wide ? " plot-card--wide" : ""}">
      <div class="plot-card__header">
        <div class="plot-card__title">${escapeHtml(label)}</div>
        <div class="plot-card__value">${escapeHtml(formatPlotValue(value, unit))}</div>
      </div>
      ${svg}
    </article>
  `;
}

function formatTimeStamp(value) {
  if (!value) return "Waiting for telemetry";
  const stamp = new Date(value);
  if (Number.isNaN(stamp.getTime())) return `Updated ${value}`;
  return `Updated ${stamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function getSnapshotState(snapshot) {
  const isLive = Boolean(snapshot?.connection?.connected);
  const hasData = Boolean(snapshot?.hasData);
  const sourceLabel = String(snapshot?.sourceLabel || "");
  const isSimPlayback = /^Source:\s*SIM playback\b/i.test(sourceLabel);
  const isSimReady = /^Source:\s*SIM (ready|CSV|profile)\b/i.test(sourceLabel);
  const isSimulation = snapshot?.quickChecks?.simulationMode === "ok";

  if (isLive) {
    return {
      badge: "Live",
      tone: "ok",
      transport: "Live stream connected",
    };
  }

  if (isSimPlayback || (isSimulation && hasData)) {
    return {
      badge: "Simulation",
      tone: "warn",
      transport: "Simulation playback active",
    };
  }

  if (isSimReady) {
    return {
      badge: "Ready",
      tone: "warn",
      transport: "Simulation profile loaded",
    };
  }

  if (hasData) {
    return {
      badge: "Paused",
      tone: "warn",
      transport: "Telemetry snapshot paused",
    };
  }

  return {
    badge: "Waiting",
    tone: "bad",
    transport: "Watching for new telemetry",
  };
}

function setLiveState(snapshot) {
  const badge = elements.liveBadge;
  if (!badge) return;

  const state = getSnapshotState(snapshot);
  badge.className = toneClass(state.tone);
  badge.textContent = state.badge;
}

function renderMetrics(snapshot) {
  const metrics = snapshot?.metrics || {};
  elements.metricGrid.innerHTML = metricDefinitions.map(({ key, label, unit }) => `
    <article class="metric">
      <div class="metric__label">${escapeHtml(label)}</div>
      <div class="metric__value">
        ${escapeHtml(metrics[key] ?? "--")}
        ${unit ? `<span class="metric__unit">${escapeHtml(unit)}</span>` : ""}
      </div>
    </article>
  `).join("");
}

function renderQuickChecks(snapshot) {
  const checks = snapshot?.quickChecks || {};
  elements.quickChecks.innerHTML = quickCheckDefinitions.map(({ key, label }) => `
    <div class="${toneClass(checks[key])}">${escapeHtml(label)}</div>
  `).join("");
}

function renderGps(snapshot) {
  const gps = snapshot?.gps || {};
  elements.gpsDisplay.textContent = gps.display || "Waiting for GPS fix";

  if (gps.mapUrl) {
    elements.mapStatus.textContent = gps.status || (gps.fix ? "GPS lock active" : "Waiting for GPS fix");
    elements.mapFrame.classList.add("map-frame--active");
    lastMapEmbedUrl = "";
    elements.mapTrail.innerHTML = gps.trailMarkup || "";
    elements.mapLink.textContent = "Open full map";
    elements.mapLink.href = gps.mapUrl;
    elements.mapLink.removeAttribute("aria-disabled");
  } else {
    elements.mapStatus.textContent = "Waiting for GPS fix";
    elements.mapFrame.classList.remove("map-frame--active");
    lastMapEmbedUrl = "";
    elements.mapTrail.innerHTML = "";
    elements.mapLink.textContent = "Waiting for GPS fix";
    elements.mapLink.removeAttribute("href");
    elements.mapLink.setAttribute("aria-disabled", "true");
  }

  const points = Array.isArray(gps.points) ? gps.points : [];
  elements.gpsPoints.innerHTML = points.length
    ? points.map((point) => `
      <div class="list-item">
        <div class="list-item__label">${escapeHtml(point.label)}</div>
        <div class="list-item__value">${escapeHtml(point.value)}</div>
      </div>
    `).join("")
    : `
      <div class="list-item">
        <div class="list-item__label">Recent Points</div>
        <div class="list-item__value">No GPS points received yet.</div>
      </div>
    `;
}

function renderTelemetry(snapshot) {
  const telemetry = Array.isArray(snapshot?.telemetry)
    ? snapshot.telemetry
    : [];
  elements.telemetryGrid.innerHTML = telemetry.map((field) => `
    <div class="telemetry-cell">
      <div class="telemetry-cell__label">${escapeHtml(field.label || field.key || "--")}</div>
      <div class="telemetry-cell__value">${escapeHtml(field.value ?? "--")}</div>
    </div>
  `).join("");
}

function resetPlotHistory() {
  plotDefinitions.forEach(({ key }) => {
    plotHistory[key] = [];
  });
  lastHistoryPacket = null;
  lastHistoryTimeSeconds = null;
}

function updatePlotHistory(snapshot) {
  const mission = snapshot?.mission || {};
  const packet = toNumber(mission.packetsReceived);
  const timeSeconds = parseClockTime(mission.time);
  const source = String(snapshot?.sourceLabel || "");
  const contextKey = [
    source,
    snapshot?.connection?.portPath || snapshot?.connection?.selectedPort || "",
  ].join("|");

  if (contextKey !== historyContextKey) {
    historyContextKey = contextKey;
    resetPlotHistory();
  }

  if (!snapshot?.hasData || packet == null || timeSeconds == null) return;
  if ((lastHistoryPacket != null && packet < lastHistoryPacket) || (lastHistoryTimeSeconds != null && timeSeconds < lastHistoryTimeSeconds)) {
    resetPlotHistory();
  } else if ((lastHistoryPacket != null && packet === lastHistoryPacket) || (lastHistoryTimeSeconds != null && timeSeconds === lastHistoryTimeSeconds)) {
    return;
  }
  lastHistoryPacket = packet;
  lastHistoryTimeSeconds = timeSeconds;

  plotDefinitions.forEach((definition) => {
    const { key } = definition;
    const value = getPlotValue(snapshot, definition);
    if (value == null) return;
    plotHistory[key].push({ x: timeSeconds, y: value });
    while (plotHistory[key].length > plotHistoryLimit) plotHistory[key].shift();
  });
}

function renderPlots(snapshot) {
  elements.plotGrid.innerHTML = plotDefinitions
    .map((definition) => renderPlotCard(definition, snapshot))
    .join("");
}

function applyPayload(payload) {
  const snapshot = payload?.snapshot || payload || {};
  const mission = snapshot.mission || {};
  const commands = snapshot.commands || {};
  const connection = snapshot.connection || {};
  const state = getSnapshotState(snapshot);
  const teamId = findTelemetryField(snapshot, "TEAM_ID")?.value || "--";

  elements.transportStatus.textContent = state.transport;
  elements.sourceLabel.textContent = snapshot.sourceLabel || "Source: Demo";
  elements.lastUpdate.textContent = formatTimeStamp(snapshot.updatedAt);
  elements.teamIdVal.textContent = teamId;
  elements.missionTime.textContent = mission.time || "--";
  elements.modeVal.textContent = mission.mode || "--";
  elements.stateVal.textContent = mission.state || "--";
  elements.packetsReceivedVal.textContent = String(mission.packetsReceived ?? 0);
  elements.packetsLostVal.textContent = String(mission.packetsLost ?? 0);
  elements.gpsSatsVal.textContent = mission.gpsSats || "--";
  elements.linkPort.textContent = connection.selectedPort || "Not selected";
  elements.linkBridge.textContent = connection.bridge || "Scanning COM ports";
  elements.cmdSent.textContent = commands.lastSent || "--";
  elements.cmdEcho.textContent = commands.echo || "--";

  updatePlotHistory(snapshot);
  setLiveState(snapshot);
  renderMetrics(snapshot);
  renderPlots(snapshot);
  renderImu3d(snapshot);
  renderQuickChecks(snapshot);
  renderGps(snapshot);
  renderTelemetry(snapshot);
}

async function loadSnapshot() {
  const response = await fetch(withMonitorToken("/api/snapshot"), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Snapshot request failed (${response.status})`);
  }
  applyPayload(await response.json());
}

function connectLiveFeed() {
  const feed = new EventSource(withMonitorToken("/api/live"));

  feed.addEventListener("snapshot", (event) => {
    try {
      applyPayload(JSON.parse(event.data));
    } catch (error) {
      console.error(error);
    }
  });

  feed.onopen = () => {
    elements.transportStatus.textContent = "Live stream connected";
  };

  feed.onerror = () => {
    elements.transportStatus.textContent = "Reconnecting to ground station feed";
  };

  return feed;
}

let liveFeed = null;

initPhoneImu3d();

loadSnapshot().catch((error) => {
  console.error(error);
  elements.transportStatus.textContent = "Waiting for desktop ground station";
});

liveFeed = connectLiveFeed();

window.addEventListener("beforeunload", () => {
  liveFeed?.close();
});
