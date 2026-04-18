const elements = {
  transportStatus: document.getElementById("transportStatus"),
  sourceLabel: document.getElementById("sourceLabel"),
  liveBadge: document.getElementById("liveBadge"),
  lastUpdate: document.getElementById("lastUpdate"),
  metricGrid: document.getElementById("metricGrid"),
  plotGrid: document.getElementById("plotGrid"),
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

const plotDefinitions = [
  { key: "altitude", label: "Altitude (m) vs Time", color: "#0f6a9e", unit: "m" },
  { key: "voltage", label: "Voltage (V) vs Time", color: "#0f9d58", unit: "V" },
  { key: "current", label: "Current (A) vs Time", color: "#c57f00", unit: "A" },
  { key: "pressure", label: "Pressure (kPa) vs Time", color: "#7a4a13", unit: "kPa" },
  { key: "temperature", label: "Temperature (C) vs Time", color: "#d9480f", unit: "C", wide: true },
];

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
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : null;
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

function renderPlotCard({ key, label, color, unit, wide = false }, metrics) {
  const history = plotHistory[key] || [];
  const currentValue = metrics[key] ?? "--";
  const width = 320;
  const height = 140;
  const rect = { left: 34, top: 14, right: 306, bottom: 114 };

  let svg = `
    <svg class="plot-card__svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(label)} plot">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#fff"></rect>
      <line x1="${rect.left}" y1="${rect.top}" x2="${rect.left}" y2="${rect.bottom}" stroke="#15202b" stroke-width="1.5"></line>
      <line x1="${rect.left}" y1="${rect.bottom}" x2="${rect.right}" y2="${rect.bottom}" stroke="#15202b" stroke-width="1.5"></line>
      <text x="${(rect.left + rect.right) / 2}" y="131" text-anchor="middle" fill="#61717d" font-size="10" font-weight="700">Packets</text>
    `;

  if (history.length > 1) {
    const allY = history.map((point) => point.y);
    const yMinRaw = Math.min(...allY);
    const yMaxRaw = Math.max(...allY);
    const pad = (yMaxRaw - yMinRaw) * 0.1 || 1;
    const yMin = yMinRaw - pad;
    const yMax = yMaxRaw + pad;
    const d = buildPath(history, rect, yMin, yMax);
    const lastPoint = history[history.length - 1];
    const xMin = history[0].x;
    const xMax = history[history.length - 1].x;
    const sx = (x) => rect.left + ((x - xMin) / (xMax - xMin || 1)) * (rect.right - rect.left);
    const sy = (y) => rect.bottom - ((y - yMin) / (yMax - yMin || 1)) * (rect.bottom - rect.top);
    const labelX = Math.min(rect.right - 6, sx(lastPoint.x) + 6);
    const labelY = Math.max(rect.top + 12, sy(lastPoint.y) - 6);

    svg += `
      <text x="${rect.left + 4}" y="${rect.top + 10}" fill="#61717d" font-size="10" font-weight="700">${escapeHtml(formatPlotValue(yMaxRaw.toFixed(1), unit))}</text>
      <text x="${rect.left + 4}" y="${rect.bottom - 4}" fill="#61717d" font-size="10" font-weight="700">${escapeHtml(formatPlotValue(yMinRaw.toFixed(1), unit))}</text>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2.5"></path>
      <circle cx="${sx(lastPoint.x).toFixed(1)}" cy="${sy(lastPoint.y).toFixed(1)}" r="3.5" fill="${color}"></circle>
      <text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" fill="${color}" font-size="11" font-weight="700">${escapeHtml(formatPlotValue(lastPoint.y.toFixed(1), unit))}</text>
    `;
  } else {
    svg += `<text x="170" y="72" text-anchor="middle" fill="#61717d" font-size="12" font-weight="700">Waiting for history</text>`;
  }

  svg += "</svg>";

  return `
    <article class="plot-card${wide ? " plot-card--wide" : ""}">
      <div class="plot-card__title">${escapeHtml(label)}</div>
      <div class="plot-card__value">${escapeHtml(formatPlotValue(currentValue, unit))}</div>
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
  const isSimReady = /^Source:\s*SIM (ready|CSV)\b/i.test(sourceLabel);
  const isSimulation = snapshot?.quickChecks?.simulationMode === "warn";

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
    elements.mapStatus.textContent = gps.fix ? "GPS lock active" : "Waiting for GPS fix";
    elements.mapFrame.src = `${gps.mapUrl}&z=16&output=embed`;
    elements.mapLink.textContent = "Open in Google Maps";
    elements.mapLink.href = gps.mapUrl;
    elements.mapLink.removeAttribute("aria-disabled");
  } else {
    elements.mapStatus.textContent = "Waiting for GPS fix";
    elements.mapFrame.removeAttribute("src");
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
}

function updatePlotHistory(snapshot) {
  const mission = snapshot?.mission || {};
  const metrics = snapshot?.metrics || {};
  const packet = toNumber(mission.packetsReceived);
  const source = String(snapshot?.sourceLabel || "");
  const contextKey = [
    source,
    snapshot?.connection?.portPath || snapshot?.connection?.selectedPort || "",
  ].join("|");

  if (contextKey !== historyContextKey) {
    historyContextKey = contextKey;
    resetPlotHistory();
  }

  if (!snapshot?.hasData || packet == null) return;
  if (lastHistoryPacket != null && packet <= lastHistoryPacket) return;
  lastHistoryPacket = packet;

  plotDefinitions.forEach(({ key }) => {
    const value = toNumber(metrics[key]);
    if (value == null) return;
    plotHistory[key].push({ x: packet, y: value });
    while (plotHistory[key].length > plotHistoryLimit) plotHistory[key].shift();
  });
}

function renderPlots(snapshot) {
  const metrics = snapshot?.metrics || {};
  elements.plotGrid.innerHTML = plotDefinitions
    .map((definition) => renderPlotCard(definition, metrics))
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

loadSnapshot().catch((error) => {
  console.error(error);
  elements.transportStatus.textContent = "Waiting for desktop ground station";
});

liveFeed = connectLiveFeed();

window.addEventListener("beforeunload", () => {
  liveFeed?.close();
});
