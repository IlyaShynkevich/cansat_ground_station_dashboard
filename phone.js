const elements = {
  transportStatus: document.getElementById("transportStatus"),
  sourceLabel: document.getElementById("sourceLabel"),
  liveBadge: document.getElementById("liveBadge"),
  lastUpdate: document.getElementById("lastUpdate"),
  metricGrid: document.getElementById("metricGrid"),
  missionTime: document.getElementById("missionTime"),
  modeVal: document.getElementById("modeVal"),
  stateVal: document.getElementById("stateVal"),
  packetsReceivedVal: document.getElementById("packetsReceivedVal"),
  packetsLostVal: document.getElementById("packetsLostVal"),
  gpsSatsVal: document.getElementById("gpsSatsVal"),
  quickChecks: document.getElementById("quickChecks"),
  linkPort: document.getElementById("linkPort"),
  linkBridge: document.getElementById("linkBridge"),
  gpsDisplay: document.getElementById("gpsDisplay"),
  mapLink: document.getElementById("mapLink"),
  gpsPoints: document.getElementById("gpsPoints"),
  cmdSent: document.getElementById("cmdSent"),
  cmdEcho: document.getElementById("cmdEcho"),
  telemetryGrid: document.getElementById("telemetryGrid"),
};

const metricDefinitions = [
  { key: "altitude", label: "Altitude", unit: "m" },
  { key: "temperature", label: "Temperature", unit: "C" },
  { key: "pressure", label: "Pressure", unit: "kPa" },
  { key: "voltage", label: "Voltage", unit: "V" },
  { key: "current", label: "Current", unit: "A" },
  { key: "gpsAltitude", label: "GPS Alt", unit: "m" },
];

const quickCheckDefinitions = [
  { key: "telemetryLink", label: "Telemetry Link" },
  { key: "loggingReady", label: "Logging Ready" },
  { key: "simulationMode", label: "Simulation Mode" },
  { key: "batteryOk", label: "Battery OK" },
];

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
    elements.mapLink.textContent = "Open in Google Maps";
    elements.mapLink.href = gps.mapUrl;
    elements.mapLink.removeAttribute("aria-disabled");
  } else {
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
    ? snapshot.telemetry.filter((field) => field?.key !== "TEAM_ID")
    : [];
  elements.telemetryGrid.innerHTML = telemetry.map((field) => `
    <div class="telemetry-cell">
      <div class="telemetry-cell__label">${escapeHtml(field.label || field.key || "--")}</div>
      <div class="telemetry-cell__value">${escapeHtml(field.value ?? "--")}</div>
    </div>
  `).join("");
}

function applyPayload(payload) {
  const snapshot = payload?.snapshot || payload || {};
  const mission = snapshot.mission || {};
  const commands = snapshot.commands || {};
  const connection = snapshot.connection || {};
  const state = getSnapshotState(snapshot);

  elements.transportStatus.textContent = state.transport;
  elements.sourceLabel.textContent = snapshot.sourceLabel || "Source: Demo";
  elements.lastUpdate.textContent = formatTimeStamp(snapshot.updatedAt);
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

  setLiveState(snapshot);
  renderMetrics(snapshot);
  renderQuickChecks(snapshot);
  renderGps(snapshot);
  renderTelemetry(snapshot);
}

async function loadSnapshot() {
  const response = await fetch("/api/snapshot", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Snapshot request failed (${response.status})`);
  }
  applyPayload(await response.json());
}

function connectLiveFeed() {
  const feed = new EventSource("/api/live");

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
