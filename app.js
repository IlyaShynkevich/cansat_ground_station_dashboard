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
  mapTrail: document.getElementById("mapTrail"),
  mapStatus: document.getElementById("mapStatus"),
  mapLink: document.getElementById("mapLink"),
  mapPointA: document.getElementById("mapPointA"),
  mapPointB: document.getElementById("mapPointB"),
  cmdSent: document.getElementById("cmdSent"),
  cmdEcho: document.getElementById("cmdEcho"),
  simPressureInput: document.getElementById("simPressureInput"),
  simPressureBtn: document.getElementById("simPressureBtn"),
  checkLink: document.getElementById("checkLink"),
  checkLog: document.getElementById("checkLog"),
  checkSim: document.getElementById("checkSim"),
  checkBattery: document.getElementById("checkBattery"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  baudSelect: document.getElementById("baudSelect"),
  portSelect: document.getElementById("portSelect"),
  refreshPortsBtn: document.getElementById("refreshPortsBtn"),
  loadDefaultSimBtn: document.getElementById("loadDefaultSimBtn"),
  linkPort: document.getElementById("linkPort"),
  linkBridge: document.getElementById("linkBridge"),
  phoneMonitorStatus: document.getElementById("phoneMonitorStatus"),
  phoneMonitorUrl: document.getElementById("phoneMonitorUrl"),
  phoneMonitorHint: document.getElementById("phoneMonitorHint"),
  phoneMonitorQr: document.getElementById("phoneMonitorQr"),
  phoneMonitorQrCode: document.getElementById("phoneMonitorQrCode"),
  phoneMonitorQrLabel: document.getElementById("phoneMonitorQrLabel"),
  fullTelemetry: document.getElementById("fullTelemetry"),
  exportLogBtn: document.getElementById("exportLogBtn"),
  simCsvInput: document.getElementById("simCsvInput"),
  serialDebugStatus: document.getElementById("serialDebugStatus"),
  serialDebugPreview: document.getElementById("serialDebugPreview"),
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
const serialHeaderAliasMap = Object.freeze({
  TEAM: "TEAM_ID",
  TEAMID: "TEAM_ID",
  MISSIONTIME: "MISSION_TIME",
  MISSION_CLOCK: "MISSION_TIME",
  PACKETNUMBER: "PACKET_COUNT",
  PACKETNO: "PACKET_COUNT",
  PACKETCOUNT: "PACKET_COUNT",
  TEMP: "TEMPERATURE",
  TEMPC: "TEMPERATURE",
  TEMPERATUREC: "TEMPERATURE",
  PRESS: "PRESSURE",
  PRESSUREPA: "PRESSURE",
  PRESSUREKPA: "PRESSURE",
  VOLTS: "VOLTAGE",
  BATTERY: "VOLTAGE",
  BATTERYVOLTAGE: "VOLTAGE",
  CURRENTA: "CURRENT",
  GYROX: "GYRO_R",
  GYROY: "GYRO_P",
  GYROZ: "GYRO_Y",
  ACCELX: "ACCEL_R",
  ACCELY: "ACCEL_P",
  ACCELZ: "ACCEL_Y",
  GPSTIMEUTC: "GPS_TIME",
  GPSALT: "GPS_ALTITUDE",
  GPSALTITUDEM: "GPS_ALTITUDE",
  GPSLAT: "GPS_LATITUDE",
  GPSLON: "GPS_LONGITUDE",
  GPSLONG: "GPS_LONGITUDE",
  GPSSAT: "GPS_SATS",
  GPSSATELLITES: "GPS_SATS",
  CMDECHO: "CMD_ECHO",
  CMDARGUMENT: "CMD_ARG",
});
const outboundCommandMap = Object.freeze({
  "CX ON": "CX ON",
  "CX OFF": "CX OFF",
});
const defaultCommandTeamId = "1049";
const serialFixedTelemetryFieldCount = serialDefaultHeaders.length - 1;

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
let serialByteCount = 0;
let serialValidLineCount = 0;
let serialInvalidLineCount = 0;
let serialBinaryChunkCount = 0;
let serialPreviewEntries = [];
let serialDebugHint = "No serial traffic yet.";
let scheduledUiUpdateTimer = null;
let scheduledUiUpdatePending = false;
let availablePorts = [];
let suppressCloseEvent = false;
let lastSentCommand = "--";
let lastMapEmbedUrl = "";
let currentBaudRate = 115200;
let lastKnownTeamId = defaultCommandTeamId;

const tailSize = 80;
const defaultBaudRate = 115200;
const simulationFallbackDelayMs = 1000;
const simulationMinDelayMs = 150;
const simulationMaxDelayMs = 2000;
const defaultSimulationProfileName = "cansat_2023_simp.txt";
const defaultSimulationProfilePath = "./docs/cansat_2023_simp.txt";
const liveTelemetryUiIntervalMs = 1000;
const serialPreviewLimit = 8;
const serialPreviewTextLimit = 140;
const mapTrailLimit = 48;
const mapLaunchViewWidthMeters = 1000;
const mapLaunchViewHeightMeters = 800;
const mapLaunchAnchorLeftRatio = 0.18;
const mapLaunchAnchorBottomRatio = 0.22;
const mapLaunchViewPadRatio = 0.08;
const serialApi = window.electronSerial || null;
const monitorApi = window.electronMonitor || null;
const qrCodeMinVersion = 1;
const qrCodeMaxVersion = 40;
const qrCodePenaltyRun = 3;
const qrCodePenaltyBlock = 3;
const qrCodePenaltyFinder = 40;
const qrCodePenaltyBalance = 10;
const qrCodeFinderPatternA = Object.freeze([true, false, true, true, true, false, true, false, false, false, false]);
const qrCodeFinderPatternB = Object.freeze([false, false, false, false, true, false, true, true, true, false, true]);
const qrCodeLowEccCodewordsPerBlock = Object.freeze([
  -1,
  7, 10, 15, 20, 26, 18, 20, 24, 30, 18,
  20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
  28, 28, 30, 30, 26, 28, 30, 30, 30, 30,
  30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
]);
const qrCodeLowEccBlockCounts = Object.freeze([
  -1,
  1, 1, 1, 1, 1, 2, 2, 2, 2, 4,
  4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
  8, 9, 9, 10, 12, 12, 12, 13, 14, 15,
  16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
]);

function setPhoneMonitorQrState(url = "") {
  if (!elements.phoneMonitorQrCode || !elements.phoneMonitorQrLabel || !elements.phoneMonitorQr) return;

  elements.phoneMonitorQrCode.textContent = "QR";
  elements.phoneMonitorQrCode.setAttribute("data-state", "idle");
  elements.phoneMonitorQrLabel.textContent = "QR appears when phone URL is ready.";

  if (!url) return;

  try {
    const svg = createPhoneMonitorQrSvg(url);
    elements.phoneMonitorQrCode.replaceChildren(svg);
    elements.phoneMonitorQrCode.setAttribute("data-state", "ready");
    elements.phoneMonitorQrLabel.textContent = "Scan to open the phone monitor.";
  } catch (error) {
    console.error(error);
    elements.phoneMonitorQrCode.textContent = "QR";
    elements.phoneMonitorQrCode.setAttribute("data-state", "error");
    elements.phoneMonitorQrLabel.textContent = "QR could not be generated for this link.";
  }
}

function createPhoneMonitorQrSvg(text) {
  const modules = createQrCodeMatrix(text);
  const border = 4;
  const viewSize = modules.length + border * 2;
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  const bg = document.createElementNS(svgNs, "rect");
  const path = document.createElementNS(svgNs, "path");
  const commands = [];

  svg.setAttribute("viewBox", `0 0 ${viewSize} ${viewSize}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("shape-rendering", "crispEdges");

  bg.setAttribute("width", String(viewSize));
  bg.setAttribute("height", String(viewSize));
  bg.setAttribute("fill", "#ffffff");

  for (let y = 0; y < modules.length; y += 1) {
    for (let x = 0; x < modules.length; x += 1) {
      if (!modules[y][x]) continue;
      commands.push(`M${x + border} ${y + border}h1v1h-1z`);
    }
  }

  path.setAttribute("d", commands.join(""));
  path.setAttribute("fill", "#000000");

  svg.append(bg, path);
  return svg;
}

function createQrCodeMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = chooseQrCodeVersion(bytes.length);
  const size = version * 4 + 17;
  const modules = createQrGrid(size);
  const isFunction = createQrGrid(size);
  const dataCodewords = buildQrCodeData(bytes, version);
  const allCodewords = addQrCodeEccAndInterleave(dataCodewords, version);
  let bestModules = null;
  let bestPenalty = Number.POSITIVE_INFINITY;

  drawQrFunctionPatterns(modules, isFunction, version);
  drawQrCodewords(modules, isFunction, allCodewords);

  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = cloneQrGrid(modules);
    applyQrMask(candidate, isFunction, mask);
    drawQrFormatBits(candidate, isFunction, mask);
    const penalty = getQrPenaltyScore(candidate);

    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestModules = candidate;
    }
  }

  if (!bestModules) {
    throw new Error("QR code mask selection failed.");
  }

  return bestModules;
}

function createQrGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(false));
}

function cloneQrGrid(grid) {
  return grid.map((row) => row.slice());
}

function appendQrBits(value, length, bits) {
  if (length < 0 || length > 31 || (length !== 0 && value >>> length !== 0)) {
    throw new RangeError("QR bit buffer value out of range.");
  }

  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >>> i) & 1);
  }
}

function getQrBit(value, index) {
  return ((value >>> index) & 1) !== 0;
}

function getQrCharacterCountBits(version) {
  return version < 10 ? 8 : 16;
}

function chooseQrCodeVersion(byteLength) {
  for (let version = qrCodeMinVersion; version <= qrCodeMaxVersion; version += 1) {
    const capacityBits = getQrNumDataCodewords(version) * 8;
    const requiredBits = 4 + getQrCharacterCountBits(version) + byteLength * 8;

    if (requiredBits <= capacityBits) {
      return version;
    }
  }

  throw new RangeError("Phone monitor link is too long for the QR renderer.");
}

function getQrNumRawDataModules(version) {
  if (version < qrCodeMinVersion || version > qrCodeMaxVersion) {
    throw new RangeError("QR version out of range.");
  }

  let result = (16 * version + 128) * version + 64;

  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;

    if (version >= 7) {
      result -= 36;
    }
  }

  return result;
}

function getQrNumDataCodewords(version) {
  return (
    Math.floor(getQrNumRawDataModules(version) / 8) -
    qrCodeLowEccCodewordsPerBlock[version] * qrCodeLowEccBlockCounts[version]
  );
}

function buildQrCodeData(bytes, version) {
  const bits = [];
  const capacityBits = getQrNumDataCodewords(version) * 8;
  const codewords = [];

  appendQrBits(0b0100, 4, bits);
  appendQrBits(bytes.length, getQrCharacterCountBits(version), bits);
  bytes.forEach((value) => appendQrBits(value, 8, bits));

  appendQrBits(0, Math.min(4, capacityBits - bits.length), bits);
  appendQrBits(0, (8 - bits.length % 8) % 8, bits);

  while (codewords.length * 8 < bits.length) {
    codewords.push(0);
  }

  bits.forEach((bit, index) => {
    codewords[index >>> 3] |= bit << (7 - (index & 7));
  });

  for (let padByte = 0xec; codewords.length < getQrNumDataCodewords(version); padByte ^= 0xec ^ 0x11) {
    codewords.push(padByte);
  }

  return codewords;
}

function reedSolomonMultiply(x, y) {
  if (x >>> 8 !== 0 || y >>> 8 !== 0) {
    throw new RangeError("QR Reed-Solomon byte out of range.");
  }

  let result = 0;

  for (let i = 7; i >= 0; i -= 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((y >>> i) & 1) * x;
  }

  return result;
}

function reedSolomonComputeDivisor(degree) {
  if (degree < 1 || degree > 255) {
    throw new RangeError("QR divisor degree out of range.");
  }

  const result = Array(Math.max(0, degree - 1)).fill(0);
  result.push(1);

  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < result.length) {
        result[j] ^= result[j + 1];
      }
    }
    root = reedSolomonMultiply(root, 0x02);
  }

  return result;
}

function reedSolomonComputeRemainder(data, divisor) {
  const result = divisor.map(() => 0);

  data.forEach((value) => {
    const factor = value ^ result.shift();
    result.push(0);
    divisor.forEach((coef, index) => {
      result[index] ^= reedSolomonMultiply(coef, factor);
    });
  });

  return result;
}

function addQrCodeEccAndInterleave(dataCodewords, version) {
  const numBlocks = qrCodeLowEccBlockCounts[version];
  const blockEccLen = qrCodeLowEccCodewordsPerBlock[version];
  const rawCodewords = Math.floor(getQrNumRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - rawCodewords % numBlocks;
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = reedSolomonComputeDivisor(blockEccLen);
  const blocks = [];
  let dataIndex = 0;

  for (let block = 0; block < numBlocks; block += 1) {
    const dataLength = shortBlockLen - blockEccLen + (block < numShortBlocks ? 0 : 1);
    const dataPart = dataCodewords.slice(dataIndex, dataIndex + dataLength);
    const eccPart = reedSolomonComputeRemainder(dataPart, divisor);
    dataIndex += dataLength;

    if (block < numShortBlocks) {
      dataPart.push(0);
    }

    blocks.push(dataPart.concat(eccPart));
  }

  const result = [];

  for (let index = 0; index < blocks[0].length; index += 1) {
    blocks.forEach((block, blockIndex) => {
      if (index !== shortBlockLen - blockEccLen || blockIndex >= numShortBlocks) {
        result.push(block[index]);
      }
    });
  }

  return result;
}

function drawQrFunctionPatterns(modules, isFunction, version) {
  const size = modules.length;

  for (let i = 0; i < size; i += 1) {
    setQrFunctionModule(modules, isFunction, 6, i, i % 2 === 0);
    setQrFunctionModule(modules, isFunction, i, 6, i % 2 === 0);
  }

  drawQrFinderPattern(modules, isFunction, 3, 3);
  drawQrFinderPattern(modules, isFunction, size - 4, 3);
  drawQrFinderPattern(modules, isFunction, 3, size - 4);

  const alignPositions = getQrAlignmentPatternPositions(version);
  const lastIndex = alignPositions.length - 1;

  for (let i = 0; i < alignPositions.length; i += 1) {
    for (let j = 0; j < alignPositions.length; j += 1) {
      const isFinderCorner =
        (i === 0 && j === 0) ||
        (i === 0 && j === lastIndex) ||
        (i === lastIndex && j === 0);

      if (!isFinderCorner) {
        drawQrAlignmentPattern(modules, isFunction, alignPositions[i], alignPositions[j]);
      }
    }
  }

  drawQrFormatBits(modules, isFunction, 0);
  drawQrVersionBits(modules, isFunction, version);
}

function drawQrFormatBits(modules, isFunction, mask) {
  const size = modules.length;
  const data = (1 << 3) | mask;
  let remainder = data;

  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }

  const bits = ((data << 10) | remainder) ^ 0x5412;

  for (let i = 0; i <= 5; i += 1) {
    setQrFunctionModule(modules, isFunction, 8, i, getQrBit(bits, i));
  }
  setQrFunctionModule(modules, isFunction, 8, 7, getQrBit(bits, 6));
  setQrFunctionModule(modules, isFunction, 8, 8, getQrBit(bits, 7));
  setQrFunctionModule(modules, isFunction, 7, 8, getQrBit(bits, 8));
  for (let i = 9; i < 15; i += 1) {
    setQrFunctionModule(modules, isFunction, 14 - i, 8, getQrBit(bits, i));
  }

  for (let i = 0; i < 8; i += 1) {
    setQrFunctionModule(modules, isFunction, size - 1 - i, 8, getQrBit(bits, i));
  }
  for (let i = 8; i < 15; i += 1) {
    setQrFunctionModule(modules, isFunction, 8, size - 15 + i, getQrBit(bits, i));
  }
  setQrFunctionModule(modules, isFunction, 8, size - 8, true);
}

function drawQrVersionBits(modules, isFunction, version) {
  if (version < 7) return;

  const size = modules.length;
  let remainder = version;

  for (let i = 0; i < 12; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }

  const bits = (version << 12) | remainder;

  for (let i = 0; i < 18; i += 1) {
    const color = getQrBit(bits, i);
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setQrFunctionModule(modules, isFunction, a, b, color);
    setQrFunctionModule(modules, isFunction, b, a, color);
  }
}

function drawQrFinderPattern(modules, isFunction, x, y) {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      const xx = x + dx;
      const yy = y + dy;

      if (0 <= xx && xx < modules.length && 0 <= yy && yy < modules.length) {
        setQrFunctionModule(modules, isFunction, xx, yy, distance !== 2 && distance !== 4);
      }
    }
  }
}

function drawQrAlignmentPattern(modules, isFunction, x, y) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setQrFunctionModule(
        modules,
        isFunction,
        x + dx,
        y + dy,
        Math.max(Math.abs(dx), Math.abs(dy)) !== 1
      );
    }
  }
}

function setQrFunctionModule(modules, isFunction, x, y, isDark) {
  modules[y][x] = isDark;
  isFunction[y][x] = true;
}

function getQrAlignmentPatternPositions(version) {
  if (version === 1) return [];

  const numAlign = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];

  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }

  return result;
}

function drawQrCodewords(modules, isFunction, codewords) {
  const size = modules.length;
  let bitIndex = 0;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }

    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;

        if (!isFunction[y][x] && bitIndex < codewords.length * 8) {
          modules[y][x] = getQrBit(codewords[bitIndex >>> 3], 7 - (bitIndex & 7));
          bitIndex += 1;
        }
      }
    }
  }
}

function applyQrMask(modules, isFunction, mask) {
  for (let y = 0; y < modules.length; y += 1) {
    for (let x = 0; x < modules.length; x += 1) {
      let invert = false;

      switch (mask) {
        case 0:
          invert = (x + y) % 2 === 0;
          break;
        case 1:
          invert = y % 2 === 0;
          break;
        case 2:
          invert = x % 3 === 0;
          break;
        case 3:
          invert = (x + y) % 3 === 0;
          break;
        case 4:
          invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
          break;
        case 5:
          invert = x * y % 2 + x * y % 3 === 0;
          break;
        case 6:
          invert = (x * y % 2 + x * y % 3) % 2 === 0;
          break;
        case 7:
          invert = ((x + y) % 2 + x * y % 3) % 2 === 0;
          break;
        default:
          throw new RangeError("QR mask out of range.");
      }

      if (!isFunction[y][x] && invert) {
        modules[y][x] = !modules[y][x];
      }
    }
  }
}

function getQrPenaltyScore(modules) {
  let result = 0;
  let darkModules = 0;

  for (let y = 0; y < modules.length; y += 1) {
    result += getQrLinePenalty(modules[y]);
    modules[y].forEach((value) => {
      if (value) darkModules += 1;
    });
  }

  for (let x = 0; x < modules.length; x += 1) {
    const column = [];
    for (let y = 0; y < modules.length; y += 1) {
      column.push(modules[y][x]);
    }
    result += getQrLinePenalty(column);
  }

  for (let y = 0; y < modules.length - 1; y += 1) {
    for (let x = 0; x < modules.length - 1; x += 1) {
      const color = modules[y][x];
      if (
        color === modules[y][x + 1] &&
        color === modules[y + 1][x] &&
        color === modules[y + 1][x + 1]
      ) {
        result += qrCodePenaltyBlock;
      }
    }
  }

  const totalModules = modules.length * modules.length;
  const balancePenalty = Math.ceil(Math.abs(darkModules * 20 - totalModules * 10) / totalModules) - 1;
  result += Math.max(0, balancePenalty) * qrCodePenaltyBalance;

  return result;
}

function getQrLinePenalty(line) {
  let result = 0;
  let runColor = line[0];
  let runLength = 1;

  for (let i = 1; i < line.length; i += 1) {
    if (line[i] === runColor) {
      runLength += 1;
      continue;
    }

    if (runLength >= 5) {
      result += qrCodePenaltyRun + (runLength - 5);
    }

    runColor = line[i];
    runLength = 1;
  }

  if (runLength >= 5) {
    result += qrCodePenaltyRun + (runLength - 5);
  }

  for (let index = 0; index <= line.length - 11; index += 1) {
    let matchesPatternA = true;
    let matchesPatternB = true;

    for (let offset = 0; offset < 11; offset += 1) {
      if (line[index + offset] !== qrCodeFinderPatternA[offset]) {
        matchesPatternA = false;
      }
      if (line[index + offset] !== qrCodeFinderPatternB[offset]) {
        matchesPatternB = false;
      }
      if (!matchesPatternA && !matchesPatternB) {
        break;
      }
    }

    if (matchesPatternA || matchesPatternB) {
      result += qrCodePenaltyFinder;
    }
  }

  return result;
}

function setPhoneMonitorState(status, url = "", hint = "") {
  if (!elements.phoneMonitorStatus || !elements.phoneMonitorUrl || !elements.phoneMonitorHint) return;
  elements.phoneMonitorStatus.textContent = status;
  elements.phoneMonitorHint.textContent = hint;

  if (url) {
    elements.phoneMonitorUrl.textContent = url;
    elements.phoneMonitorUrl.href = url;
    elements.phoneMonitorUrl.removeAttribute("aria-disabled");
    setPhoneMonitorQrState(url);
    return;
  }

  elements.phoneMonitorUrl.textContent = "Waiting for phone URL";
  elements.phoneMonitorUrl.removeAttribute("href");
  elements.phoneMonitorUrl.setAttribute("aria-disabled", "true");
  setPhoneMonitorQrState("");
}

function toNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const n = Number(text);
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

function canonicalHeader(name) {
  const normalized = normalizeHeader(name);
  return serialHeaderAliasMap[normalized] || normalized;
}

function isTimeToken(value) {
  return /^\d{2}:\d{2}:\d{2}$/.test(String(value ?? "").trim());
}

function looksLikeTelemetryCols(cols) {
  if (cols.length < serialFixedTelemetryFieldCount) return false;
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

function isMostlyPrintableBytes(bytes) {
  if (!Array.isArray(bytes) || !bytes.length) return false;
  let printable = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const c = bytes[i];
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126)) printable += 1;
  }
  return printable / bytes.length >= 0.92;
}

function bytesToHex(bytes, limit = 24) {
  if (!Array.isArray(bytes) || !bytes.length) return "--";
  const slice = bytes.slice(0, limit);
  const hex = slice.map((value) => value.toString(16).padStart(2, "0")).join(" ");
  return bytes.length > limit ? `${hex} ...` : hex;
}

function sanitizePreviewText(text, limit = serialPreviewTextLimit) {
  const visible = String(text ?? "")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/[^\x20-\x7E]/g, (ch) => `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`);
  return visible.length > limit ? `${visible.slice(0, limit)}...` : visible;
}

function updateSerialDebugPanel() {
  if (!elements.serialDebugStatus || !elements.serialDebugPreview) return;
  const binaryPart = serialBinaryChunkCount ? ` | ${serialBinaryChunkCount} binary chunk${serialBinaryChunkCount === 1 ? "" : "s"}` : "";
  elements.serialDebugStatus.textContent = `${serialByteCount} bytes | ${serialValidLineCount} valid rows | ${serialInvalidLineCount} invalid rows | ${currentBaudRate} baud${binaryPart} | ${serialDebugHint}`;
  elements.serialDebugPreview.textContent = serialPreviewEntries.length
    ? serialPreviewEntries.join("\n")
    : "Waiting for serial data...";
}

function setSerialDebugHint(hint) {
  serialDebugHint = hint;
  updateSerialDebugPanel();
}

function pushSerialPreview(prefix, text) {
  const entry = `${prefix} ${text}`.trim();
  if (!entry) return;
  if (serialPreviewEntries[serialPreviewEntries.length - 1] === entry) {
    updateSerialDebugPanel();
    return;
  }
  serialPreviewEntries.push(entry);
  while (serialPreviewEntries.length > serialPreviewLimit) serialPreviewEntries.shift();
  updateSerialDebugPanel();
}

function resetSerialDiagnostics() {
  serialBuffer = "";
  serialByteCount = 0;
  serialValidLineCount = 0;
  serialInvalidLineCount = 0;
  serialBinaryChunkCount = 0;
  serialPreviewEntries = [];
  serialDebugHint = "No serial traffic yet.";
  updateSerialDebugPanel();
}

function getSelectedBaudRate() {
  const baud = Number(elements.baudSelect?.value || defaultBaudRate);
  return Number.isFinite(baud) && baud > 0 ? baud : defaultBaudRate;
}

function describeSerialConnectFailure(error, portPath, baudRate) {
  const rawMessage = String(error?.message || error || "Unknown error")
    .replace(/^Error invoking remote method 'serial:connect':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();

  if (/access denied|permission denied/i.test(rawMessage)) {
    return {
      sourceLabel: `Source: ${portPath} busy or blocked`,
      cmdEcho: `Link error: ${rawMessage}. Close XCTU, Arduino Serial Monitor, or any other serial tool using ${portPath}, then unplug/replug the adapter and retry.`,
      debugHint: `Windows denied access to ${portPath}. Another app may still own the port.`,
    };
  }

  if (/busy|resource busy/i.test(rawMessage)) {
    return {
      sourceLabel: `Source: ${portPath} already in use`,
      cmdEcho: `Link error: ${rawMessage}. Another process is already using ${portPath}. Close the other connection and retry.`,
      debugHint: `${portPath} is already open in another app or terminal.`,
    };
  }

  if (/not found|cannot find|does not exist|no such file/i.test(rawMessage)) {
    return {
      sourceLabel: `Source: ${portPath} is no longer available`,
      cmdEcho: `Link error: ${rawMessage}. Refresh the COM list and reconnect after checking the USB adapter.`,
      debugHint: `${portPath} disappeared while trying to open it.`,
    };
  }

  return {
    sourceLabel: `Source: Link connection failed (${rawMessage})`,
    cmdEcho: `Link error: ${rawMessage}`,
    debugHint: `Could not open ${portPath} at ${baudRate} baud.`,
  };
}

function normalizeSerialPayload(payload) {
  if (typeof payload === "string") {
    return {
      text: payload,
      bytes: [],
      byteLength: payload.length,
    };
  }

  if (payload && typeof payload === "object") {
    return {
      text: typeof payload.text === "string" ? payload.text : "",
      bytes: Array.isArray(payload.bytes) ? payload.bytes : [],
      byteLength: Number.isFinite(payload.byteLength) ? payload.byteLength : (Array.isArray(payload.bytes) ? payload.bytes.length : 0),
    };
  }

  return { text: "", bytes: [], byteLength: 0 };
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

function getRowPlotTimeSeconds(row, fallbackSeconds = 0) {
  const missionSeconds = parseClockTime(row?.MISSION_TIME);
  if (missionSeconds != null) return missionSeconds;
  const sequenceSeconds = toNumber(row?._SEQ);
  return sequenceSeconds != null ? sequenceSeconds : fallbackSeconds;
}

function formatPlotSecondLabel(value) {
  if (!Number.isFinite(value)) return "--";
  return `${Math.round(value)}s`;
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

function parseSimulationPressureInput(value) {
  const numeric = toNumber(value);
  if (numeric == null || numeric <= 0) return null;
  if (numeric >= 2000 && numeric <= 150000) {
    return { pa: Math.round(numeric), kpa: numeric / 1000 };
  }
  if (numeric >= 10 && numeric <= 150) {
    return { pa: Math.round(numeric * 1000), kpa: numeric };
  }
  return null;
}

function altitudeFromPressure(pressureKpa, referencePressureKpa = 101.325, referenceAltitude = 0) {
  if (pressureKpa == null || referencePressureKpa == null || referencePressureKpa <= 0) return null;
  const ratio = pressureKpa / referencePressureKpa;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return referenceAltitude + (44330 * (1 - Math.pow(ratio, 0.1903)));
}

function deriveSimulationState(referenceAltitude, nextAltitude) {
  if (referenceAltitude == null || nextAltitude == null) return "SIMULATION";
  const delta = nextAltitude - referenceAltitude;
  if (delta > 8) return "SIM ASCENT";
  if (delta < -8) return "SIM DESCENT";
  return "SIM HOLD";
}

function getReferenceSimulationRow() {
  for (let i = data.length - 1; i >= 0; i -= 1) {
    const row = data[i];
    if (normalizePressure(row?.PRESSURE) != null) return row;
  }
  return null;
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

function isSimulationTelemetryRow(row) {
  const mode = String(row?.MODE || "").trim().toUpperCase();
  if (mode.startsWith("S")) return true;

  const state = String(row?.STATE || "").trim().toUpperCase();
  return state.includes("SIM");
}

function getSimulationQuickCheckStatus(row) {
  return isSimulationModeOn() || isSimulationTelemetryRow(row) ? "ok" : "bad";
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

function buildSimulationRowFromPressure(pressure, rowIndex, options = {}) {
  const row = buildSimulationRowFromColumns(["PRESSURE"], [String(pressure)], rowIndex);
  const referencePressureKpa = normalizePressure(options.referencePressure ?? pressure);
  const pressureKpa = normalizePressure(pressure);
  const altitude = altitudeFromPressure(pressureKpa, referencePressureKpa, 0);
  row.MODE = "S";
  row.STATE = "SIMULATION";
  if (altitude != null) {
    row.ALTITUDE = altitude.toFixed(1);
  }
  return row;
}

function stripSimulationProfileComment(line) {
  const commentIndex = line.indexOf("#");
  return commentIndex >= 0 ? line.slice(0, commentIndex) : line;
}

function parseSimulationSimpProfile(text) {
  const rows = [];
  let referencePressure = null;

  text.split(/\r?\n/).forEach((rawLine) => {
    const line = stripSimulationProfileComment(rawLine).trim();
    if (!line) return;

    const match = line.match(/^CMD\s*,\s*([^,]+)\s*,\s*SIMP\s*,\s*(\d+)\s*$/i);
    if (!match) return;

    const rawTeamId = match[1].trim();
    const pressure = Math.round(Number(match[2]));
    if (!Number.isFinite(pressure)) return;
    if (referencePressure == null) referencePressure = pressure;

    const teamId = rawTeamId === "$" ? getCommandTeamId() : rawTeamId;
    const row = buildSimulationRowFromPressure(pressure, rows.length, { referencePressure });
    row.TEAM_ID = teamId;
    row.CMD_ECHO = `CMD,${teamId},SIMP,${pressure}`;
    row.CMD_ARG = String(pressure);
    rows.push(row);
  });

  return rows;
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

function getNextMissionTimeValue() {
  const latestRow = data[data.length - 1] || null;
  const seconds = parseClockTime(latestRow?.MISSION_TIME);
  if (seconds == null) return formatClockTime(data.length);
  return formatClockTime(seconds + 1);
}

function buildLocalSimulationPressureRow(pressureInput) {
  const latestRow = data[data.length - 1] || null;
  const referenceRow = getReferenceSimulationRow() || latestRow;
  const referencePressure = normalizePressure(referenceRow?.PRESSURE) ?? 101.325;
  const referenceAltitude = toNumber(referenceRow?.ALTITUDE) ?? 0;
  const nextAltitude = altitudeFromPressure(pressureInput.kpa, referencePressure, referenceAltitude);
  const packetCount = (toNumber(latestRow?.PACKET_COUNT) ?? data.length) + 1;
  const teamId = getCommandTeamId();
  const row = Object.fromEntries(serialDefaultHeaders.map((key) => [key, latestRow?.[key] ?? ""]));
  const commandEcho = `CMD,${teamId},SIMP,${pressureInput.pa}`;

  row.TEAM_ID = teamId;
  row.MISSION_TIME = getNextMissionTimeValue();
  row.GPS_TIME = row.MISSION_TIME;
  row.PACKET_COUNT = String(packetCount);
  row.MODE = "S";
  row.STATE = deriveSimulationState(referenceAltitude, nextAltitude);
  row.PRESSURE = String(pressureInput.pa);
  row.CMD_ECHO = commandEcho;
  row.CMD_ARG = String(pressureInput.pa);

  if (nextAltitude != null) {
    row.ALTITUDE = nextAltitude.toFixed(1);
    if (!row.GPS_ALTITUDE) row.GPS_ALTITUDE = row.ALTITUDE;
  }

  return row;
}

function applyLocalSimulationPressure(pressureInput) {
  stopSimulationPlayback();
  const row = buildLocalSimulationPressureRow(pressureInput);
  row._SEQ = String(data.length);
  data.push(row);
  index = data.length - 1;
  lastSentCommand = `SIMP ${pressureInput.pa}`;
  elements.sourceLabel.textContent = "Source: SIM manual";
  elements.cmdSent.textContent = lastSentCommand;
  elements.cmdEcho.textContent = `Applied ${pressureInput.pa} Pa locally`;
  updateUi();
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
    setCommandFeedback("SIM ENABLE", "Load a simulation profile first");
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
    setCommandFeedback("SIM ACTIVATE", "Load a simulation profile first");
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
  const visibleRows = getVisibleDataRows();
  const packet = toNumber(row?.PACKET_COUNT);
  const received = visibleRows.length;
  const firstPacket = toNumber(visibleRows[0]?.PACKET_COUNT);
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
  const mapState = buildMapState(lat, lon);
  const gpsFix = lat != null && lon != null;
  const gpsPoints = findRecentGpsPoints().map((point, pointIndex) => ({
    label: pointIndex === 0 ? "Point A" : "Point B",
    value: `${formatLatLon(point.lat, point.lon)} | ${point.time}`,
  }));
  const displayLat = lat ?? mapState.pointB?.lat ?? null;
  const displayLon = lon ?? mapState.pointB?.lon ?? null;

  return {
    updatedAt: new Date().toISOString(),
    hasData: Boolean(row),
    sourceLabel: elements.sourceLabel.textContent || "Source: Demo",
    connection: {
      connected: Boolean(serialPort),
      portPath: serialPort?.path || null,
      selectedPort: elements.linkPort.textContent || "Not selected",
      bridge: elements.linkBridge.textContent || "Scanning COM ports",
      baudRate: serialPort ? currentBaudRate : null,
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
      simulationMode: getSimulationQuickCheckStatus(row),
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
      display: displayLat != null && displayLon != null
        ? `${formatLatLon(displayLat, displayLon)}${gpsFix ? "" : " (last known)"}`
        : "Waiting for GPS fix",
      mapUrl: mapState.mapUrl,
      embedUrl: mapState.embedUrl,
      trailMarkup: mapState.trailMarkup,
      status: mapState.status,
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

function cancelScheduledUiUpdate() {
  scheduledUiUpdatePending = false;
  if (scheduledUiUpdateTimer == null) return;
  window.clearTimeout(scheduledUiUpdateTimer);
  scheduledUiUpdateTimer = null;
}

function scheduleUiUpdate() {
  scheduledUiUpdatePending = true;
  if (scheduledUiUpdateTimer != null) return;

  // Batch serial bursts into a single dashboard refresh once per second.
  scheduledUiUpdateTimer = window.setTimeout(() => {
    scheduledUiUpdateTimer = null;
    if (!scheduledUiUpdatePending) return;
    scheduledUiUpdatePending = false;
    updateUi();
  }, liveTelemetryUiIntervalMs);
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
      const hint = info.usingFallbackPort
        ? `Private token link active. Port ${info.preferredPort} is busy, using this temporary link.`
        : `Private token link on static port ${info.preferredPort}. Same Wi-Fi or hotspot.`;
      setPhoneMonitorState("Phone ready", info.primaryUrl, hint);
    } else {
      setPhoneMonitorState(
        "Waiting for network",
        "",
        info.preferredPort
          ? `Connect laptop to Wi-Fi or hotspot. Private phone link will stay on port ${info.preferredPort}.`
          : "Connect laptop to Wi-Fi or hotspot."
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
  const { wide = false, yAxisLabel = "", xAxisLabel = "Time (s)" } = options;
  const width = wide ? 1100 : 540;
  const left = 46;
  const top = 22;
  const bottom = 188;
  const right = wide ? 1072 : 516;
  const axisCenterX = left + ((right - left) / 2);
  const yAxisText = yAxisLabel
    ? `<text x="18" y="105" text-anchor="middle" dominant-baseline="middle" fill="#5d6a75" font-size="12" font-weight="700" transform="rotate(-90 18 105)">${yAxisLabel}</text>`
    : "";
  const xAxisText = xAxisLabel
    ? `<text x="${axisCenterX}" y="217" text-anchor="middle" fill="#5d6a75" font-size="12" font-weight="700">${xAxisLabel}</text>`
    : "";
  svg.innerHTML = `
    <rect x="0" y="0" width="${width}" height="225" fill="#fff"></rect>
    <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#15202b" stroke-width="2"></line>
    <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#15202b" stroke-width="2"></line>
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
    const x = wide ? 550 : 270;
    svg.insertAdjacentHTML(
      "beforeend",
      `<text x="${x}" y="113" text-anchor="middle" fill="#5d6a75" font-size="15" font-weight="700">No data</text>`
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
    ? { left: 46, top: 22, right: 1072, bottom: 188 }
    : { left: 46, top: 22, right: 516, bottom: 188 };

  svg.insertAdjacentHTML(
    "beforeend",
    `<text x="${rect.left + 8}" y="${rect.top + 14}" fill="#5d6a75" font-size="12" font-weight="700">${formatPlotValue(yMaxRaw, digits, unit)}</text>` +
    `<text x="${rect.left + 8}" y="${rect.bottom - 7}" fill="#5d6a75" font-size="12" font-weight="700">${formatPlotValue(yMinRaw, digits, unit)}</text>`
  );

  const allX = series.flatMap((s) => s.points.map((p) => p.x)).filter((value) => Number.isFinite(value));
  if (allX.length) {
    const xMinRaw = Math.min(...allX);
    const xMaxRaw = Math.max(...allX);
    const xMidRaw = xMinRaw + ((xMaxRaw - xMinRaw) / 2);
    const ticks = xMaxRaw > xMinRaw
      ? [
          { x: rect.left, label: formatPlotSecondLabel(xMinRaw), anchor: "start" },
          { x: (rect.left + rect.right) / 2, label: formatPlotSecondLabel(xMidRaw), anchor: "middle" },
          { x: rect.right, label: formatPlotSecondLabel(xMaxRaw), anchor: "end" },
        ]
      : [
          { x: (rect.left + rect.right) / 2, label: formatPlotSecondLabel(xMinRaw), anchor: "middle" },
        ];

    svg.insertAdjacentHTML(
      "beforeend",
      ticks.map((tick) => (
        `<line x1="${tick.x.toFixed(1)}" y1="${rect.bottom}" x2="${tick.x.toFixed(1)}" y2="${(rect.bottom + 5).toFixed(1)}" stroke="#5d6a75" stroke-width="1.5"></line>` +
        `<text x="${tick.x.toFixed(1)}" y="${(rect.bottom + 18).toFixed(1)}" text-anchor="${tick.anchor}" fill="#5d6a75" font-size="11" font-weight="700">${tick.label}</text>`
      )).join("")
    );
  }

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
      const labelX = Math.min(rect.right - 8, sx(last.x) + 10);
      const labelY = Math.max(rect.top + 14, sy(last.y) - 10);
      svg.insertAdjacentHTML(
        "beforeend",
        `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" fill="${s.color}" font-size="13" font-weight="700">${formatPlotValue(last.y, digits, unit)}</text>`
      );
    }
  });
}

function rowAt(i) {
  return data[Math.max(0, Math.min(i, data.length - 1))];
}

function getVisibleDataRows() {
  if (!data.length) return [];
  const visibleCount = Math.max(1, Math.min(index + 1, data.length));
  return data.slice(0, visibleCount);
}

function updateQuickChecks(row) {
  setDot(elements.checkLink, serialPort ? "dot--ok" : "dot--bad");
  setDot(elements.checkLog, data.length > 0 ? "dot--ok" : "dot--warn");
  setDot(elements.checkSim, getSimulationQuickCheckStatus(row) === "ok" ? "dot--ok" : "dot--bad");
  setDot(elements.checkBattery, normalizeVoltage(row.VOLTAGE) != null ? "dot--ok" : "dot--warn");
}

function findMapPathPoints() {
  const visibleRows = getVisibleDataRows();
  const points = [];
  let previousKey = "";

  for (let i = 0; i < visibleRows.length; i += 1) {
    const row = visibleRows[i];
    const lat = toNumber(row?.GPS_LATITUDE);
    const lon = toNumber(row?.GPS_LONGITUDE);
    if (lat == null || lon == null) continue;

    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (key === previousKey) continue;
    previousKey = key;

    points.push({ lat, lon, time: row.MISSION_TIME || "--" });
  }

  return points;
}

function findGpsTrailPoints(limit = mapTrailLimit) {
  if (limit <= 0) return [];
  const points = findMapPathPoints();
  return points.slice(-limit);
}

function findRecentGpsPoints() {
  const trailPoints = findGpsTrailPoints(2);
  return trailPoints.length ? trailPoints : [];
}

function clampMapLatitude(lat) {
  return Math.max(-85, Math.min(85, lat));
}

function mercatorY(lat) {
  const radians = clampMapLatitude(lat) * (Math.PI / 180);
  return Math.log(Math.tan((Math.PI / 4) + (radians / 2)));
}

function metersToLatitudeDelta(meters) {
  return meters / 111320;
}

function metersToLongitudeDelta(meters, latitude) {
  const radians = clampMapLatitude(latitude) * (Math.PI / 180);
  const metersPerDegree = 111320 * Math.max(0.2, Math.abs(Math.cos(radians)));
  return meters / metersPerDegree;
}

function buildMapState(lat, lon) {
  const pathPoints = findMapPathPoints();
  const lastTrailPoint = pathPoints[pathPoints.length - 1] || null;
  const focusPoint = lat != null && lon != null
    ? { lat, lon, time: rowAt(index)?.MISSION_TIME || "--" }
    : lastTrailPoint;

  if (!focusPoint) {
    return {
      embedUrl: "",
      mapUrl: "",
      trailMarkup: "",
      pointA: null,
      pointB: null,
      hasFix: false,
      status: "Waiting for GPS fix",
    };
  }

  const points = pathPoints.length ? [...pathPoints] : [focusPoint];
  const focusKey = `${focusPoint.lat.toFixed(5)},${focusPoint.lon.toFixed(5)}`;
  if (!points.some((point) => `${point.lat.toFixed(5)},${point.lon.toFixed(5)}` === focusKey)) {
    points.push(focusPoint);
  }

  const launchPoint = points[0];
  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  const baseLatSpan = metersToLatitudeDelta(mapLaunchViewHeightMeters);
  const baseLonSpan = metersToLongitudeDelta(mapLaunchViewWidthMeters, launchPoint.lat);
  const latPad = baseLatSpan * mapLaunchViewPadRatio;
  const lonPad = baseLonSpan * mapLaunchViewPadRatio;
  let minLat = launchPoint.lat - (baseLatSpan * mapLaunchAnchorBottomRatio);
  let maxLat = launchPoint.lat + (baseLatSpan * (1 - mapLaunchAnchorBottomRatio));
  let minLon = launchPoint.lon - (baseLonSpan * mapLaunchAnchorLeftRatio);
  let maxLon = launchPoint.lon + (baseLonSpan * (1 - mapLaunchAnchorLeftRatio));
  minLat = clampMapLatitude(Math.min(minLat, Math.min(...lats) - latPad));
  maxLat = clampMapLatitude(Math.max(maxLat, Math.max(...lats) + latPad));
  minLon = Math.min(minLon, Math.min(...lons) - lonPad);
  maxLon = Math.max(maxLon, Math.max(...lons) + lonPad);

  const bbox = [minLon, minLat, maxLon, maxLat]
    .map((value) => value.toFixed(6))
    .join(",");
  const marker = `${focusPoint.lat.toFixed(6)},${focusPoint.lon.toFixed(6)}`;
  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(marker)}`;
  const mapUrl = `https://www.openstreetmap.org/?mlat=${focusPoint.lat.toFixed(6)}&mlon=${focusPoint.lon.toFixed(6)}#map=16/${focusPoint.lat.toFixed(6)}/${focusPoint.lon.toFixed(6)}`;

  const minY = mercatorY(minLat);
  const maxY = mercatorY(maxLat);
  const projected = points.map((point) => {
    const x = ((point.lon - minLon) / (maxLon - minLon || 1)) * 520;
    const y = (1 - ((mercatorY(point.lat) - minY) / (maxY - minY || 1))) * 260;
    return {
      ...point,
      x: Math.max(10, Math.min(510, x)),
      y: Math.max(10, Math.min(250, y)),
    };
  });
  const polylinePoints = projected.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const startPoint = projected[0];
  const currentPoint = projected[projected.length - 1];
  const recentPoints = points.slice(-2);
  const pointA = recentPoints[0] || focusPoint;
  const pointB = recentPoints[1] || pointA;
  const status = lat != null && lon != null
    ? (projected.length > 1 ? `GPS lock active | Trail ${projected.length} pts` : "GPS lock active")
    : "GPS temporarily unavailable | Showing last route";

  const trailMarkup = projected.length
    ? `
      <defs>
        <linearGradient id="mapTrailGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f6a9e"></stop>
          <stop offset="100%" stop-color="#d9480f"></stop>
        </linearGradient>
      </defs>
      ${projected.length > 1 ? `<polyline points="${polylinePoints}" fill="none" stroke="url(#mapTrailGradient)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"></polyline>` : ""}
      <circle cx="${startPoint.x.toFixed(1)}" cy="${startPoint.y.toFixed(1)}" r="6" fill="#ffffff" stroke="#0f6a9e" stroke-width="3"></circle>
      <circle cx="${currentPoint.x.toFixed(1)}" cy="${currentPoint.y.toFixed(1)}" r="8" fill="#d9480f" stroke="#ffffff" stroke-width="3"></circle>
    `
    : "";

  return {
    embedUrl,
    mapUrl,
    trailMarkup,
    pointA,
    pointB,
    hasFix: lat != null && lon != null,
    status,
  };
}

function updateMap(lat, lon) {
  const mapState = buildMapState(lat, lon);

  if (mapState.embedUrl) {
    if (lastMapEmbedUrl !== mapState.embedUrl) {
      elements.mapFrame.src = mapState.embedUrl;
      lastMapEmbedUrl = mapState.embedUrl;
    }
    elements.mapTrail.innerHTML = mapState.trailMarkup;
    elements.mapStatus.textContent = mapState.status;
    elements.mapLink.href = mapState.mapUrl;
    elements.mapLink.textContent = "Open full map";
    elements.gpsFixVal.textContent = mapState.hasFix ? "Locked" : "No Fix";
    elements.mapPointA.textContent = mapState.pointA
      ? `${formatLatLon(mapState.pointA.lat, mapState.pointA.lon)} | ${mapState.pointA.time}`
      : "Waiting for GPS fix";
    elements.mapPointB.textContent = mapState.pointB
      ? `${formatLatLon(mapState.pointB.lat, mapState.pointB.lon)} | ${mapState.pointB.time}`
      : "Waiting for next point";
    return;
  }

  elements.mapFrame.removeAttribute("src");
  elements.mapTrail.innerHTML = "";
  lastMapEmbedUrl = "";
  elements.mapStatus.textContent = "Waiting for GPS fix";
  elements.mapLink.removeAttribute("href");
  elements.mapLink.textContent = "No map target";
  elements.gpsFixVal.textContent = "No Fix";
  elements.mapPointA.textContent = "Waiting for GPS fix";
  elements.mapPointB.textContent = "Waiting for next point";
}

function clearUi() {
  cancelScheduledUiUpdate();
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
  cancelScheduledUiUpdate();
  const row = rowAt(index);
  if (!row) {
    clearUi();
    return;
  }

  const stats = computePacketStats(row);

  elements.missionTime.textContent = row.MISSION_TIME || "--";
  elements.modeBadge.textContent = (row.MODE || "--").trim();
  elements.stateBadge.textContent = (row.STATE || "--").trim();
  elements.packetsReceived.textContent = String(stats.received);
  elements.packetsLost.textContent = String(stats.lost);
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

  const visibleRows = getVisibleDataRows();
  const start = Math.max(0, visibleRows.length - tailSize);
  const windowRows = visibleRows.slice(start);
  renderSeries(plots.alt, [{
    points: windowRows.map((r, rowIndex) => ({ x: getRowPlotTimeSeconds(r, start + rowIndex), y: toNumber(r.ALTITUDE) ?? 0 })),
    color: "#0f6a9e",
    width: 3,
  }], plotOptions.alt);
  renderSeries(plots.bat, [{
    points: windowRows
      .map((r, rowIndex) => ({ x: getRowPlotTimeSeconds(r, start + rowIndex), y: normalizeVoltage(r.VOLTAGE) }))
      .filter((p) => p.y != null),
    color: "#0f9d58",
    width: 3,
  }], plotOptions.bat);
  renderSeries(plots.current, [{
    points: windowRows
      .map((r, rowIndex) => ({ x: getRowPlotTimeSeconds(r, start + rowIndex), y: toNumber(r.CURRENT) }))
      .filter((p) => p.y != null),
    color: "#c57f00",
    width: 3,
  }], plotOptions.current);
  renderSeries(plots.pressure, [{
    points: windowRows
      .map((r, rowIndex) => ({ x: getRowPlotTimeSeconds(r, start + rowIndex), y: normalizePressure(r.PRESSURE) }))
      .filter((p) => p.y != null),
    color: "#7a4a13",
    width: 3,
  }], plotOptions.pressure);
  renderSeries(plots.temp, [{
    points: windowRows
      .map((r, rowIndex) => ({ x: getRowPlotTimeSeconds(r, start + rowIndex), y: toNumber(r.TEMPERATURE) }))
      .filter((p) => p.y != null),
    color: "#d9480f",
    width: 3,
  }], plotOptions.temp);
  publishMonitorSnapshot();
}

function coerceRow(headers, cols) {
  const row = Object.fromEntries(serialDefaultHeaders.map((key) => [key, ""]));
  headers.forEach((header, indexValue) => {
    const key = canonicalHeader(header);
    if (!serialHeaderSet.has(key)) return;
    row[key] = cols[indexValue] ?? "";
  });
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

function splitPacketTokens(line) {
  if (line.includes(",")) {
    return line.split(",").map((token) => token.trim()).filter(Boolean);
  }
  if (line.includes(";")) {
    return line.split(";").map((token) => token.trim()).filter(Boolean);
  }
  return [];
}

function parseIndexedSerialRow(line) {
  const tokens = splitPacketTokens(line);
  if (tokens.length < 6) return null;

  const pairs = [];
  for (const token of tokens) {
    const match = token.match(/^(\d{1,2})\s*[:=]\s*(.*)$/);
    if (!match) return null;
    pairs.push({
      indexValue: Number(match[1]),
      value: match[2].trim(),
    });
  }

  const usesZeroBased = pairs.some((pair) => pair.indexValue === 0);
  const offset = usesZeroBased ? 0 : 1;
  const cols = [];
  pairs.forEach((pair) => {
    const targetIndex = pair.indexValue - offset;
    if (targetIndex < 0 || targetIndex >= serialDefaultHeaders.length) return;
    cols[targetIndex] = pair.value;
  });

  const row = coerceRow(serialDefaultHeaders, cols);
  return isValidTelemetryRow(row) ? row : null;
}

function parseNamedSerialRow(line) {
  const tokens = splitPacketTokens(line);
  if (tokens.length < 4) return null;

  const row = Object.fromEntries(serialDefaultHeaders.map((key) => [key, ""]));
  let matchedFields = 0;

  for (const token of tokens) {
    const match = token.match(/^([A-Za-z][A-Za-z0-9_ \-]*)\s*[:=]\s*(.*)$/);
    if (!match) return null;
    const key = canonicalHeader(match[1]);
    if (!serialHeaderSet.has(key)) continue;
    row[key] = match[2].trim();
    matchedFields += 1;
  }

  if (!matchedFields) return null;
  if (!row.PACKET_COUNT) row.PACKET_COUNT = String(data.length + 1);
  return isValidTelemetryRow(row) ? row : null;
}

function parseAckPacket(line) {
  const cols = parseCsvLine(line);
  if (cols.length < 3) return null;

  const kind = String(cols[0] ?? "").trim().toUpperCase();
  if (!["ACK", "NACK", "ERR", "ERROR"].includes(kind)) return null;

  return {
    kind,
    teamId: String(cols[1] ?? "").trim(),
    message: cols.slice(2).join(",").trim(),
  };
}

function handleAckPacket(line) {
  const ack = parseAckPacket(line);
  if (!ack) return false;

  if (ack.teamId) lastKnownTeamId = ack.teamId;
  const label = [ack.kind, ack.teamId, ack.message].filter(Boolean).join(" ");
  elements.cmdEcho.textContent = label || ack.kind;
  pushSerialPreview(`${ack.kind}>`, sanitizePreviewText(line));
  if (/INVALIDCOMMAND/i.test(ack.message)) {
    setSerialDebugHint("Device rejected the command. Check the exact command spelling.");
  } else {
    setSerialDebugHint("Device command response received.");
  }
  publishMonitorSnapshot();
  return true;
}

function takeInlineAckPacket(buffer) {
  const match = buffer.match(/^(ACK|NACK|ERR|ERROR),([^,\r\n]+),([^,\r\n]+?)(?=(ACK|NACK|ERR|ERROR),|\d+,\d{2}:\d{2}:\d{2},\d+,|$)/i);
  return match ? match[0] : null;
}

function takeInlineTelemetryPacket(buffer) {
  const num = "-?\\d+(?:\\.\\d+)?";
  const time = "\\d{2}:\\d{2}:\\d{2}";
  const text = "[^,\\r\\n]+";
  const finalText = "[^,\\r\\n]+?";
  const pattern = new RegExp(
    `^(\\d+,${time},\\d+,${text},${text},${num},${num},${num},${num},${num},${num},${num},${num},${num},${num},${num},${time},${num},${num},${num},${num},${finalText}(?:,${text})?)(?=(?:ACK|NACK|ERR|ERROR|BOOT),|\\d+,${time},\\d+,|$)`,
    "i"
  );
  const match = buffer.match(pattern);
  return match ? match[1] : null;
}

function consumeInlineStructuredPackets() {
  let consumedAny = false;

  while (serialBuffer) {
    const trimmed = serialBuffer.replace(/^\s+/, "");
    if (trimmed !== serialBuffer) {
      serialBuffer = trimmed;
      continue;
    }

    const ackPacket = takeInlineAckPacket(serialBuffer);
    if (ackPacket) {
      handleAckPacket(ackPacket);
      serialBuffer = serialBuffer.slice(ackPacket.length);
      consumedAny = true;
      continue;
    }

    const telemetryPacket = takeInlineTelemetryPacket(serialBuffer);
    if (telemetryPacket) {
      handleSerialLine(telemetryPacket);
      serialBuffer = serialBuffer.slice(telemetryPacket.length);
      consumedAny = true;
      continue;
    }

    break;
  }

  return consumedAny;
}

function getCommandTeamId() {
  const latestTelemetryTeamId = data.length ? String(data[data.length - 1]?.TEAM_ID || "").trim() : "";
  if (latestTelemetryTeamId) return latestTelemetryTeamId;
  return lastKnownTeamId || defaultCommandTeamId;
}

function buildOutboundCommand(cmd) {
  const normalized = outboundCommandMap[cmd] || cmd;
  const teamId = getCommandTeamId();
  const simPressureMatch = String(normalized).trim().match(/^SIMP\s+(\d+)$/i);

  if (normalized === "CX ON") {
    return { display: cmd, payload: `CMD,${teamId},CX,ON\r` };
  }
  if (normalized === "CX OFF") {
    return { display: cmd, payload: `CMD,${teamId},CX,OFF\r` };
  }
  if (normalized === "CAL") {
    return { display: cmd, payload: `CMD,${teamId},CAL\r` };
  }
  if (normalized === "SIM ENABLE") {
    return { display: cmd, payload: `CMD,${teamId},SIM,ENABLE\r` };
  }
  if (normalized === "SIM ACTIVATE") {
    return { display: cmd, payload: `CMD,${teamId},SIM,ACTIVATE\r` };
  }
  if (normalized === "SIM DISABLE") {
    return { display: cmd, payload: `CMD,${teamId},SIM,DISABLE\r` };
  }
  if (simPressureMatch) {
    const pressure = simPressureMatch[1];
    return { display: `SIMP ${pressure}`, payload: `CMD,${teamId},SIMP,${pressure}\r` };
  }

  return { display: cmd, payload: `${normalized}\r` };
}

function parseSerialRow(line) {
  if (!isMostlyPrintableAscii(line)) return null;

  const indexedRow = parseIndexedSerialRow(line);
  if (indexedRow) return indexedRow;

  const namedRow = parseNamedSerialRow(line);
  if (namedRow) return namedRow;

  const cols = parseCsvLine(line);
  if (cols.length < 8) return null;

  const maybeHeader = cols.map(canonicalHeader);
  if (maybeHeader.includes("PACKET_COUNT") && maybeHeader.includes("MISSION_TIME")) {
    serialHeaders = maybeHeader;
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
  if (handleAckPacket(clean)) return;
  const row = parseSerialRow(clean);
  if (!row) {
    serialInvalidLineCount += 1;
    pushSerialPreview("BAD>", sanitizePreviewText(clean));
    setSerialDebugHint("Text arrived but it did not match the expected telemetry format.");
    badLineStreak += 1;
    if (badLineStreak === 25) {
      elements.sourceLabel.textContent = `Source: ${serialPort?.path || "Link"} @ ${currentBaudRate} (invalid telemetry)`;
      publishMonitorSnapshot();
    }
    return;
  }
  badLineStreak = 0;
  serialValidLineCount += 1;
  pushSerialPreview("ROW>", sanitizePreviewText(clean));
  setSerialDebugHint("Valid telemetry rows received.");
  if (row.TEAM_ID) lastKnownTeamId = String(row.TEAM_ID).trim();
  row._SEQ = String(data.length);
  data.push(row);
  index = data.length - 1;
  if (data.length === 1) {
    elements.sourceLabel.textContent = `Source: ${serialPort?.path || "Link"} @ ${currentBaudRate}`;
  }
  scheduleUiUpdate();
}

function handleSerialChunk(payload) {
  const chunk = normalizeSerialPayload(payload);
  if (!chunk.text && !chunk.byteLength) return;

  serialByteCount += chunk.byteLength || chunk.text.length;

  if (chunk.bytes.length && !isMostlyPrintableBytes(chunk.bytes)) {
    serialBinaryChunkCount += 1;
    pushSerialPreview("HEX>", bytesToHex(chunk.bytes));
    setSerialDebugHint("Binary or API-style frames detected. Check XBee mode and baud.");
    if (data.length === 0) {
      elements.sourceLabel.textContent = `Source: ${serialPort?.path || "Link"} @ ${currentBaudRate} (binary data)`;
      publishMonitorSnapshot();
    }
  }

  serialBuffer += chunk.text;
  if (consumeInlineStructuredPackets()) {
    if (!serialBuffer) return;
  }

  if (data.length === 0 && serialByteCount > 0 && !/[\r\n]/.test(serialBuffer)) {
    pushSerialPreview("BUF>", sanitizePreviewText(serialBuffer));
    setSerialDebugHint("Receiving bytes but no line ending yet.");
    elements.sourceLabel.textContent = `Source: ${serialPort?.path || "Link"} @ ${currentBaudRate} (receiving bytes, waiting line end)`;
    publishMonitorSnapshot();
    return;
  }

  const lines = serialBuffer.split(/\r\n|\n|\r/);
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
  resetSerialDiagnostics();

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
  elements.baudSelect.disabled = false;
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

  const selectedPath = elements.portSelect.value;
  const selectedBaudRate = getSelectedBaudRate();

  try {
    if (!selectedPath) {
      elements.sourceLabel.textContent = "Source: Select a COM port";
      publishMonitorSnapshot();
      return;
    }

    const connection = await serialApi.connect(selectedPath, selectedBaudRate);
    stopSimulationPlayback();
    serialPort = availablePorts.find((port) => port.path === connection.path) || {
      path: connection.path,
      displayName: connection.path,
      manufacturer: "",
    };
    currentBaudRate = connection.baudRate || selectedBaudRate;
    serialHeaders = null;
    badLineStreak = 0;
    resetSerialDiagnostics();
    data = [];
    index = 0;
    clearUi();
    setSerialDebugHint("Listening for telemetry. If the link stays silent, try 9600 baud for XBee defaults.");

    elements.connectBtn.disabled = true;
    elements.disconnectBtn.disabled = false;
    elements.baudSelect.disabled = true;
    elements.portSelect.disabled = true;
    elements.refreshPortsBtn.disabled = true;
    elements.sourceLabel.textContent = `Source: ${connection.path} @ ${currentBaudRate} (waiting data)`;
    updateQuickChecks(rowAt(index) || {});
    publishMonitorSnapshot();
  } catch (error) {
    console.error(error);
    const failure = describeSerialConnectFailure(error, selectedPath || "COM port", selectedBaudRate);
    elements.sourceLabel.textContent = failure.sourceLabel;
    elements.cmdEcho.textContent = failure.cmdEcho;
    setSerialDebugHint(failure.debugHint);
    await disconnectSerial(false);
    publishMonitorSnapshot();
  }
}

async function sendCommand(cmd) {
  const outbound = buildOutboundCommand(cmd);
  if (!serialApi || !serialPort) {
    lastSentCommand = outbound.display;
    elements.cmdSent.textContent = outbound.display;
    elements.cmdEcho.textContent = `${outbound.payload.trim()} (not sent: no link)`;
    publishMonitorSnapshot();
    return;
  }

  try {
    await serialApi.write(outbound.payload);
    lastSentCommand = outbound.display;
    elements.cmdSent.textContent = outbound.display;
    elements.cmdEcho.textContent = outbound.payload.trim();
    publishMonitorSnapshot();
  } catch (error) {
    console.error(error);
    lastSentCommand = outbound.display;
    elements.cmdSent.textContent = outbound.display;
    elements.cmdEcho.textContent = `${outbound.payload.trim()} (send failed)`;
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

function handleManualSimulationPressure() {
  const pressureInput = parseSimulationPressureInput(elements.simPressureInput?.value);
  if (!pressureInput) {
    setCommandFeedback("SIMP", "Enter a pressure between 1000-150000 Pa or 10-150 kPa");
    elements.simPressureInput?.focus();
    return;
  }

  if (serialPort) {
    sendCommand(`SIMP ${pressureInput.pa}`);
    return;
  }

  applyLocalSimulationPressure(pressureInput);
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
  const pressureRows = lines.slice(1)
    .map((line) => parseCsvLine(line))
    .map((cols, rowIndex) => ({ pressure: toNumber(cols[pressureColumnIndex]), rowIndex }))
    .filter((entry) => entry.pressure != null);
  const referencePressure = pressureRows[0]?.pressure ?? null;

  return pressureRows
    .map((entry) => buildSimulationRowFromPressure(entry.pressure, entry.rowIndex, { referencePressure }));
}

function parseSimulationProfile(text) {
  const simpRows = parseSimulationSimpProfile(text);
  if (simpRows.length > 0) return simpRows;
  return parseSimulationCsv(text);
}

function applySimulationProfile(rows, profileName) {
  stopSimulationPlayback();
  simulationRows = rows;
  simulationFileName = profileName;
  simulationArmed = false;
  updateQuickChecks(rowAt(index) || {});
  elements.sourceLabel.textContent = simulationRows.length > 0
    ? `Source: SIM profile ${profileName}`
    : "Source: SIM profile invalid";
  elements.cmdEcho.textContent = simulationRows.length > 0
    ? `${simulationRows.length} simulation rows loaded. Run SIM ENABLE.`
    : `Could not parse ${profileName}`;
  publishMonitorSnapshot();
}

async function loadBundledSimulationProfile() {
  try {
    elements.cmdEcho.textContent = "Loading CanSat test profile...";
    publishMonitorSnapshot();

    const response = await fetch(defaultSimulationProfilePath, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const text = await response.text();
    applySimulationProfile(parseSimulationProfile(text), defaultSimulationProfileName);
  } catch (error) {
    console.error(error);
    stopSimulationPlayback();
    simulationRows = [];
    simulationFileName = defaultSimulationProfileName;
    simulationArmed = false;
    updateQuickChecks(rowAt(index) || {});
    elements.sourceLabel.textContent = "Source: CanSat test profile failed";
    elements.cmdEcho.textContent = "Could not load the built-in CanSat test profile";
    publishMonitorSnapshot();
  }
}

elements.connectBtn.addEventListener("click", connectSerial);
elements.disconnectBtn.addEventListener("click", () => disconnectSerial());
elements.baudSelect.addEventListener("change", () => {
  if (!serialPort) currentBaudRate = getSelectedBaudRate();
  updateSerialDebugPanel();
});
elements.refreshPortsBtn.addEventListener("click", refreshPorts);
elements.portSelect.addEventListener("change", updateLinkPrep);
elements.exportLogBtn.addEventListener("click", exportTelemetryLog);
elements.loadDefaultSimBtn?.addEventListener("click", () => {
  loadBundledSimulationProfile().catch((error) => {
    console.error(error);
  });
});
elements.simPressureBtn?.addEventListener("click", handleManualSimulationPressure);
elements.simPressureInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  handleManualSimulationPressure();
});
elements.simCsvInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  applySimulationProfile(parseSimulationProfile(text), file.name);
  event.target.value = "";
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

function projectImuPoint(x, y, z, width, height, scale) {
  return {
    x: (width / 2) + ((x - y) * scale * 0.78),
    y: (height / 2) - (z * scale) + ((x + y) * scale * 0.28),
  };
}

function makeImuFallbackScene(canvas, color) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { update() {} };
  }

  const history = [];
  let vector = { x: 0, y: 0, z: 0 };

  function drawLine3D(width, height, scale, from, to, stroke, lineWidth = 1.2) {
    const start = projectImuPoint(from.x, from.y, from.z, width, height, scale);
    const end = projectImuPoint(to.x, to.y, to.z, width, height, scale);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  function draw(recordHistory = false) {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const scale = Math.min(width, height) * 0.22;

    ctx.clearRect(0, 0, width, height);

    for (let step = -2; step <= 2; step += 1) {
      drawLine3D(width, height, scale, { x: -1.8, y: step * 0.45, z: 0 }, { x: 1.8, y: step * 0.45, z: 0 }, "rgba(180, 196, 210, 0.75)");
      drawLine3D(width, height, scale, { x: step * 0.45, y: -1.8, z: 0 }, { x: step * 0.45, y: 1.8, z: 0 }, "rgba(180, 196, 210, 0.75)");
    }

    drawLine3D(width, height, scale, { x: 0, y: 0, z: 0 }, { x: 1.8, y: 0, z: 0 }, "#0b74ff", 1.8);
    drawLine3D(width, height, scale, { x: 0, y: 0, z: 0 }, { x: 0, y: 1.8, z: 0 }, "#f3a000", 1.8);
    drawLine3D(width, height, scale, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1.8 }, "#69c73d", 1.8);

    const length = Math.hypot(vector.x, vector.y, vector.z);
    const gain = length > 0.0001 ? Math.min(1.7, Math.max(0.3, length * 0.7)) / length : 0;
    const endpoint = {
      x: vector.x * gain,
      y: vector.y * gain,
      z: vector.z * gain,
    };

    if (recordHistory) {
      history.push(endpoint);
      while (history.length > 28) history.shift();
    }

    if (history.length > 1) {
      ctx.beginPath();
      history.forEach((point, index) => {
        const projected = projectImuPoint(point.x, point.y, point.z, width, height, scale);
        if (index === 0) ctx.moveTo(projected.x, projected.y);
        else ctx.lineTo(projected.x, projected.y);
      });
      ctx.strokeStyle = `${color}88`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const origin = projectImuPoint(0, 0, 0, width, height, scale);
    const point = projectImuPoint(endpoint.x, endpoint.y, endpoint.z, width, height, scale);

    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(point.x, point.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#15202b";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.fillStyle = "#5d6a75";
    ctx.font = "700 11px Segoe UI";
    const labelX = projectImuPoint(1.9, 0, 0, width, height, scale);
    const labelY = projectImuPoint(0, 1.9, 0, width, height, scale);
    const labelZ = projectImuPoint(0, 0, 1.95, width, height, scale);
    ctx.fillText("X", labelX.x + 4, labelX.y);
    ctx.fillText("Y", labelY.x + 4, labelY.y);
    ctx.fillText("Z", labelZ.x + 4, labelZ.y);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(false);
  }

  window.addEventListener("resize", resize);
  resize();

  return {
    update(x, y, z) {
      vector = {
        x: x || 0,
        y: y || 0,
        z: z || 0,
      };
      draw(true);
    },
  };
}

function initImuCanvasFallback(accelCanvas, gyroCanvas) {
  imuScenes = {
    accel: makeImuFallbackScene(accelCanvas, "#0f6a9e"),
    gyro: makeImuFallbackScene(gyroCanvas, "#c62828"),
  };
  imuScenes.accel.update(0, 0, 0);
  imuScenes.gyro.update(0, 0, 0);
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
      if (!imuScenes?.accel?.renderer || !imuScenes?.gyro?.renderer) return;
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
    console.warn("3D IMU renderer unavailable, using fallback renderer.", error);
    initImuCanvasFallback(accelCanvas, gyroCanvas);
  }
}

currentBaudRate = getSelectedBaudRate();
resetSerialDiagnostics();
clearUi();
initPhoneMonitor();
refreshPorts();
initImu3D();
