// UI-only command echo
const cmdEcho = document.getElementById("cmdEcho");
document.querySelectorAll("[data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => {
    cmdEcho.textContent = btn.getAttribute("data-cmd") ?? "—";
  });
});

// 3D: stable imports via importmap (Edge-friendly)
(async function init3D() {
  const canvas = document.getElementById("threeCanvas");
  const wrap = canvas?.closest(".three-wrap");
  if (!canvas || !wrap) return;

  // fallback overlay (hidden by default)
  const fallback = document.createElement("div");
  fallback.className = "three-fallback";
  fallback.textContent = "3D init failed (check console)";
  fallback.style.display = "none";
  wrap.appendChild(fallback);

  try {
    const THREE = await import("three");
    const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(2.2, 1.6, 2.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(3, 4, 2);
    scene.add(dir);

    // Simple rotating object (cube)
    const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const material = new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.65 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // Outline
    const edges = new THREE.EdgesGeometry(geometry);
    cube.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x111111 })));

    // Helpers (optional)
    const grid = new THREE.GridHelper(10, 10, 0xaaaaaa, 0xdddddd);
    grid.position.y = -0.8;
    scene.add(grid);

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
      cube.rotation.y += 0.01;
      cube.rotation.x += 0.004;
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();

  } catch (e) {
    console.error("3D init failed:", e);
    fallback.style.display = "grid";
  }
})();


function buildPath(points, xMin, xMax, yMin, yMax, rect) {
  const { left, top, right, bottom } = rect;
  const w = right - left;
  const h = bottom - top;

  const sx = (x) => left + ((x - xMin) / (xMax - xMin || 1)) * w;
  const sy = (y) => bottom - ((y - yMin) / (yMax - yMin || 1)) * h;

  let d = "";
  for (let i = 0; i < points.length; i++) {
    const { x, y } = points[i];
    const X = sx(x);
    const Y = sy(y);
    d += (i === 0 ? "M" : " L") + X.toFixed(2) + " " + Y.toFixed(2);
  }
  return d;
}

function renderPlot(svg, seriesList, opts = {}) {
  const nodata = svg.querySelector(".nodata");

  // Собираем все точки для авто-масштаба
  const all = [];
  for (const s of seriesList) {
    if (Array.isArray(s.data) && s.data.length) all.push(...s.data);
  }

  const hasData = all.length >= 2; // линия = минимум 2 точки

  if (!hasData) {
    for (const s of seriesList) {
      const path = svg.querySelector(s.selector);
      if (path) {
        path.setAttribute("d", "");
        path.style.display = "none";
      }
    }
    if (nodata) nodata.style.display = "block";
    return;
  }

  if (nodata) nodata.style.display = "none";

  const xMin = opts.xMin ?? Math.min(...all.map(p => p.x));
  const xMax = opts.xMax ?? Math.max(...all.map(p => p.x));

  let yMin = opts.yMin ?? Math.min(...all.map(p => p.y));
  let yMax = opts.yMax ?? Math.max(...all.map(p => p.y));

  // небольшой отступ по Y
  const pad = (yMax - yMin) * 0.06 || 1;
  yMin -= pad;
  yMax += pad;

  const rect = opts.rect ?? { left: 40, top: 20, right: 500, bottom: 180 };

  for (const s of seriesList) {
    const path = svg.querySelector(s.selector);
    if (!path) continue;

    if (!Array.isArray(s.data) || s.data.length < 2) {
      path.setAttribute("d", "");
      path.style.display = "none";
      continue;
    }

    path.setAttribute("d", buildPath(s.data, xMin, xMax, yMin, yMax, rect));
    path.style.display = "block";
  }
}

function updateAltitudePlot(points) {
  const svg = document.getElementById("plotAlt");
  if (!svg) return;
  renderPlot(svg, [{ selector: ".trace", data: points }], {
    rect: { left: 40, top: 20, right: 500, bottom: 180 }
  });
}

function updateBatteryPlot(points) {
  const svg = document.getElementById("plotBat");
  if (!svg) return;
  renderPlot(svg, [{ selector: ".trace", data: points }], {
    rect: { left: 40, top: 20, right: 500, bottom: 180 }
  });
}

function updateImuPlot(accPoints, gyroPoints) {
  const svg = document.getElementById("plotIMU");
  if (!svg) return;
  renderPlot(svg, [
    { selector: ".trace-a", data: accPoints },
    { selector: ".trace-b", data: gyroPoints },
  ], {
    rect: { left: 40, top: 20, right: 1040, bottom: 180 }
  });
}

setTimeout(() => {
  updateAltitudePlot([
    { x: 0, y: 0 }, { x: 1, y: 6 }, { x: 2, y: 18 }, { x: 3, y: 35 },
    { x: 4, y: 60 }, { x: 5, y: 72 }, { x: 6, y: 66 }, { x: 7, y: 40 },
  ]);

  updateBatteryPlot([
    { x: 0, y: 4.20 }, { x: 1, y: 4.18 }, { x: 2, y: 4.16 }, { x: 3, y: 4.12 },
    { x: 4, y: 4.06 }, { x: 5, y: 3.98 }, { x: 6, y: 3.90 },
  ]);

  updateImuPlot(
    [ {x:0,y:0.2},{x:1,y:0.35},{x:2,y:0.1},{x:3,y:0.5},{x:4,y:0.22},{x:5,y:0.4} ],
    [ {x:0,y:-0.1},{x:1,y:0.05},{x:2,y:-0.15},{x:3,y:0.12},{x:4,y:-0.08},{x:5,y:0.06} ],
  );
}, 1200);


