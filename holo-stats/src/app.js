import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ─── Constants ───
const RING_CIRCUMFERENCE = 2 * Math.PI * 30; // r=30 in SVG viewBox

// ─── Background Scene (multi-layer particles + wireframe shapes + grid + scan beam) ───
class BackgroundScene {
  constructor() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.clock = new THREE.Clock();
    this.shapes = [];
    this.particleLayers = [];
    this.intensity = 0; // driven by system load (0-1)

    this.scene = new THREE.Scene();
    const aspect = this.width / this.height;
    this.camera = new THREE.PerspectiveCamera(35, aspect, 1, 3000);
    this.camera.position.set(0, 80, 600);
    this.camera.lookAt(0, 30, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    document.getElementById('canvas-container').appendChild(this.renderer.domElement);

    this.createStarField();
    this.createGeometricShapes();
    this.createGrid();
    this.createScanBeam();
    this.initPostProcessing();

    window.addEventListener('resize', () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
      this.composer.setSize(this.width, this.height);
    });

    this.animate();
  }

  createStarField() {
    const configs = [
      { count: 500, color: 0x00f0ff, size: 0.6, opacity: 0.3,  spread: { x: 1800, y: 900, z: 600 }, speed: 0.08 },
      { count: 150, color: 0x4488ff, size: 1.5, opacity: 0.2,  spread: { x: 1600, y: 800, z: 500 }, speed: 0.12 },
      { count: 40,  color: 0xff00ff, size: 3.0, opacity: 0.15, spread: { x: 1400, y: 700, z: 400 }, speed: 0.05 },
    ];

    configs.forEach(cfg => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(cfg.count * 3);
      const velocities = [];
      for (let i = 0; i < cfg.count; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * cfg.spread.x;
        pos[i * 3 + 1] = (Math.random() - 0.5) * cfg.spread.y;
        pos[i * 3 + 2] = (Math.random() - 0.5) * cfg.spread.z - 100;
        velocities.push({
          x: (Math.random() - 0.5) * cfg.speed,
          y: (Math.random() - 0.5) * cfg.speed * 0.5,
        });
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: cfg.color, size: cfg.size, transparent: true, opacity: cfg.opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      });
      const points = new THREE.Points(geo, mat);
      this.scene.add(points);
      this.particleLayers.push({ points, velocities, config: cfg });
    });
  }

  createGeometricShapes() {
    const shapeConfigs = [
      { type: 'octa', radius: 15, pos: [-300, 120, -200],  rotSpeed: [0.003, 0.005, 0.002], color: 0x00f0ff },
      { type: 'ico',  radius: 20, pos: [400, 80, -150],    rotSpeed: [0.004, 0.002, 0.003], color: 0x4488ff },
      { type: 'octa', radius: 10, pos: [-150, 200, -300],   rotSpeed: [0.002, 0.006, 0.001], color: 0xff00ff },
      { type: 'ico',  radius: 25, pos: [200, -50, -250],    rotSpeed: [0.005, 0.003, 0.004], color: 0x00ff88 },
      { type: 'octa', radius: 12, pos: [-400, -30, -180],   rotSpeed: [0.003, 0.004, 0.005], color: 0xff0066 },
      { type: 'ico',  radius: 18, pos: [350, 180, -350],    rotSpeed: [0.001, 0.003, 0.002], color: 0x00f0ff },
      { type: 'octa', radius: 8,  pos: [100, 250, -200],    rotSpeed: [0.006, 0.002, 0.004], color: 0xaa44ff },
      { type: 'ico',  radius: 14, pos: [-250, -80, -280],   rotSpeed: [0.002, 0.005, 0.003], color: 0x4488ff },
    ];

    shapeConfigs.forEach(cfg => {
      const geo = cfg.type === 'octa'
        ? new THREE.OctahedronGeometry(cfg.radius, 0)
        : new THREE.IcosahedronGeometry(cfg.radius, 0);
      const mat = new THREE.MeshBasicMaterial({
        color: cfg.color, wireframe: true, transparent: true, opacity: 0.12,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...cfg.pos);
      this.scene.add(mesh);
      this.shapes.push({
        mesh,
        rotSpeed: cfg.rotSpeed,
        baseY: cfg.pos[1],
        driftPhase: Math.random() * Math.PI * 2,
      });
    });
  }

  createGrid() {
    const size = 2400, div = 40;
    const positions = [];
    for (let i = -div / 2; i <= div / 2; i++) {
      const p = (i / div) * size;
      positions.push(-size / 2, -150, p, size / 2, -150, p);
      positions.push(p, -150, -size / 2, p, -150, size / 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x00f0ff, transparent: true, opacity: 0.025, depthWrite: false,
    });
    this.grid = new THREE.LineSegments(geo, mat);
    this.scene.add(this.grid);
  }

  createScanBeam() {
    const geo = new THREE.PlaneGeometry(2000, 2, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.scanBeam = new THREE.Mesh(geo, mat);
    this.scanBeam.rotation.x = Math.PI / 2;
    this.scene.add(this.scanBeam);
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.clearAlpha = 0;
    this.composer.addPass(renderPass);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height), 1.2, 0.8, 0.3
    );
    this.composer.addPass(this.bloomPass);
  }

  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const t = this.clock.getElapsedTime();
    const intensity = this.intensity;

    // Animate particle layers (faster under load)
    this.particleLayers.forEach(layer => {
      const pos = layer.points.geometry.attributes.position.array;
      const halfX = layer.config.spread.x / 2;
      const halfY = layer.config.spread.y / 2;
      const speedMult = 1 + intensity * 2;
      for (let i = 0; i < layer.velocities.length; i++) {
        pos[i * 3]     += layer.velocities[i].x * speedMult;
        pos[i * 3 + 1] += layer.velocities[i].y * speedMult;
        if (pos[i * 3] > halfX)  pos[i * 3] = -halfX;
        if (pos[i * 3] < -halfX) pos[i * 3] = halfX;
        if (pos[i * 3 + 1] > halfY)  pos[i * 3 + 1] = -halfY;
        if (pos[i * 3 + 1] < -halfY) pos[i * 3 + 1] = halfY;
      }
      layer.points.geometry.attributes.position.needsUpdate = true;
      layer.points.material.opacity = layer.config.opacity * (0.7 + Math.sin(t * 0.3 + layer.config.size) * 0.3);
    });

    // Floating shapes rotate faster under load
    const shapeMult = 1 + intensity * 4;
    this.shapes.forEach(s => {
      s.mesh.rotation.x += s.rotSpeed[0] * shapeMult;
      s.mesh.rotation.y += s.rotSpeed[1] * shapeMult;
      s.mesh.rotation.z += s.rotSpeed[2] * shapeMult;
      s.mesh.position.y = s.baseY + Math.sin(t * 0.3 + s.driftPhase) * 20;
      s.mesh.material.opacity = 0.08 + intensity * 0.08 + Math.sin(t * 0.5 + s.driftPhase) * 0.04;
    });

    // Grid pulse
    this.grid.material.opacity = 0.02 + Math.sin(t * 0.4) * 0.01 + intensity * 0.01;

    // Scan beam sweep through 3D space
    const scanY = -150 + ((t * 25) % 500) - 50;
    this.scanBeam.position.y = scanY;
    this.scanBeam.material.opacity = 0.06 + Math.sin(t * 2) * 0.04 + intensity * 0.04;

    // Dynamic bloom intensifies under load
    this.bloomPass.strength = 1.0 + intensity * 0.6;

    // Camera drift (more sway under load)
    const sway = 1 + intensity * 1.5;
    this.camera.position.x = Math.sin(t * 0.08) * 15 * sway;
    this.camera.position.y = 80 + Math.sin(t * 0.12) * 8 * sway;
    this.camera.position.z = 600 + Math.sin(t * 0.06) * 20;
    this.camera.lookAt(0, 30, 0);

    this.composer.render();
  }
}

// ─── Color Interpolation (green -> orange -> red) ───
function valueToColor(t) {
  t = Math.max(0, Math.min(1, t));
  let r, g, b;
  if (t < 0.5) {
    const p = t / 0.5;
    r = Math.round(0 + p * 255);
    g = Math.round(255 - p * 119);
    b = Math.round(136 - p * 136);
  } else {
    const p = (t - 0.5) / 0.5;
    r = 255;
    g = Math.round(136 - p * 136);
    b = Math.round(0 + p * 68);
  }
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// ─── SVG Ring Updates ───
function setRingValue(index, value01) {
  const fill = document.querySelector(`circle[data-ring="${index}"]`);
  if (!fill) return;
  const v = Math.max(0, Math.min(1, value01));
  const filled = RING_CIRCUMFERENCE * v;
  const gap = RING_CIRCUMFERENCE - filled;
  fill.style.strokeDasharray = `${filled} ${gap}`;

  const color = valueToColor(v);
  const cell = fill.closest('.ring-cell');
  if (cell) cell.style.setProperty('--ring-color', color);
}

// ─── Main App ───
class HoloStatsApp {
  constructor() {
    this.bg = new BackgroundScene();
    this.stats = null;
    this.glitchEl = document.getElementById('glitch-flash');

    this.overlayElements = {
      time: document.getElementById('time-display'),
      date: document.getElementById('date-display'),
      uptime: document.getElementById('stat-uptime'),
      cpuModel: document.getElementById('stat-cpu-model'),
      cpuLoad: document.getElementById('stat-cpu-load'),
      cpuTemp: document.getElementById('stat-cpu-temp'),
      cpuCores: document.getElementById('stat-cpu-cores'),
      topProcs: document.getElementById('stat-top-procs'),
      ramLine: document.getElementById('stat-ram'),
      ramFree: document.getElementById('stat-ram-free'),
      swapLine: document.getElementById('stat-swap'),
      storageRoot: document.getElementById('stat-storage-root'),
      storageHome: document.getElementById('stat-storage-home'),
      storageCave: document.getElementById('stat-storage-cave'),
      gpuModel: document.getElementById('stat-gpu-model'),
      gpuDriver: document.getElementById('stat-gpu-driver'),
      gpuUsage: document.getElementById('stat-gpu-usage'),
      gpuTemp: document.getElementById('stat-gpu-temp'),
      gpuVram: document.getElementById('stat-gpu-vram'),
      gpuMemClk: document.getElementById('stat-gpu-memclk'),
      gpuFan: document.getElementById('stat-gpu-fan'),
      gpuPower: document.getElementById('stat-gpu-power'),
      netIp: document.getElementById('stat-net-ip'),
      netType: document.getElementById('stat-net-type'),
      netDown: document.getElementById('stat-net-down'),
      netUp: document.getElementById('stat-net-up'),
      dockerActive: document.getElementById('stat-docker-active'),
      dockerNames: document.getElementById('stat-docker-names'),
    };

    // Stats injection from Python backend
    window.updateStats = (jsonStr) => {
      try {
        const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        this.stats = data;
        this.updateRings(data);
        this.updateOverlay(data);
        // Drive background intensity from average CPU+GPU load
        const avgLoad = ((data.cpu.usage || 0) + (data.gpu.usage || 0)) / 200;
        this.bg.setIntensity(avgLoad);
      } catch (e) {
        console.error('Stats parse error:', e);
      }
    };

    // Time updates independently
    this.updateTime();
    setInterval(() => this.updateTime(), 1000);

    // Periodic glitch flash effect
    this.scheduleGlitch();
  }

  scheduleGlitch() {
    const delay = 5000 + Math.random() * 12000; // 5-17s random interval
    setTimeout(() => {
      if (this.glitchEl) {
        this.glitchEl.classList.add('active');
        setTimeout(() => this.glitchEl.classList.remove('active'), 200);
      }
      this.scheduleGlitch();
    }, delay);
  }

  updateTime() {
    const el = this.overlayElements;
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    if (el.time) el.time.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
    if (el.date) el.date.textContent = `${days[now.getDay()]}, ${String(now.getDate()).padStart(2, '0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
  }

  updateRings(s) {
    const cpuTempNum = parseFloat(String(s.cpu.temp).replace(/[^0-9.]/g, '')) || 0;
    const cpuPwrLimit = s.cpu.powerLimit || 170;
    const gpuPwrLimit = s.gpu.powerLimit || 600;

    // Ring order: CPU, RAM, GPU, CPU TMP, GPU TMP, CPU PWR, GPU PWR
    const values = [
      s.cpu.usage / 100,
      s.memory.percent / 100,
      s.gpu.usage / 100,
      cpuTempNum / 100,
      s.gpu.temp / 100,
      s.cpu.power / cpuPwrLimit,
      s.gpu.power / gpuPwrLimit,
    ];
    const displays = [
      `${s.cpu.usage}`, `${s.memory.percent}`,
      `${s.gpu.usage}`,
      `${Math.round(cpuTempNum)}`, `${s.gpu.temp}`,
      `${s.cpu.power}`, `${s.gpu.power.toFixed(0)}`,
    ];
    values.forEach((v, i) => {
      setRingValue(i, v);
      const el = document.getElementById(`rv-${i}`);
      if (el) {
        const oldVal = el.textContent;
        el.textContent = displays[i];
        // Flash on value change
        if (oldVal !== displays[i] && oldVal !== '--') {
          el.classList.add('flash');
          setTimeout(() => el.classList.remove('flash'), 250);
        }
      }
    });
  }

  updateOverlay(s) {
    if (!s) return;
    const el = this.overlayElements;
    const fmt = (bytes) => {
      if (bytes > 1e12) return (bytes / 1e12).toFixed(1) + ' TiB';
      if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GiB';
      if (bytes > 1e6) return (bytes / 1e6).toFixed(0) + ' MiB';
      return (bytes / 1024).toFixed(0) + ' KiB';
    };

    if (el.uptime) el.uptime.innerHTML = `<span class="label">UPTIME</span><span class="val-white">${s.system.uptime}</span>`;
    if (el.cpuModel) el.cpuModel.innerHTML = `<span class="label">MODEL</span><span class="val-white">${s.cpu.model}</span>`;
    if (el.cpuLoad) el.cpuLoad.innerHTML = `<span class="label">LOAD</span><span class="val-green">${s.cpu.usage}%</span>`;
    if (el.cpuTemp) el.cpuTemp.innerHTML = `<span class="label">TEMP</span><span class="val-pink">${s.cpu.temp}</span>`;
    if (el.cpuCores) el.cpuCores.innerHTML = `<span class="label">CORES</span><span class="val-white">${s.cpu.cores} / ${s.cpu.freq} GHz</span>`;
    if (el.topProcs) {
      el.topProcs.innerHTML = s.cpu.top.map(p =>
        p.name ? `<span class="val-orange">${p.name}</span><span class="val-white">${p.cpu}%</span>` : ''
      ).filter(Boolean).join('');
    }
    if (el.ramLine) el.ramLine.innerHTML = `<span class="label">RAM</span><span><span class="val-white">${fmt(s.memory.used)} / ${fmt(s.memory.total)}</span> <span class="val-magenta">${s.memory.percent}%</span></span>`;
    if (el.ramFree) el.ramFree.innerHTML = `<span class="label">FREE</span><span class="val-green">${fmt(s.memory.free)}</span>`;
    if (el.swapLine) el.swapLine.innerHTML = `<span class="label">SWAP</span><span><span class="val-white">${fmt(s.memory.swapUsed)} / ${fmt(s.memory.swapTotal)}</span> <span class="val-purple">${s.memory.swapPercent}%</span></span>`;
    if (el.storageRoot) el.storageRoot.innerHTML = `<span class="label">/</span><span><span class="val-white">${fmt(s.storage.root.used)} / ${fmt(s.storage.root.total)}</span> <span class="val-blue">${s.storage.root.percent}%</span></span>`;
    if (el.storageHome) el.storageHome.innerHTML = `<span class="label">/home</span><span><span class="val-white">${fmt(s.storage.home.used)} / ${fmt(s.storage.home.total)}</span> <span class="val-blue">${s.storage.home.percent}%</span></span>`;
    if (el.storageCave) el.storageCave.innerHTML = `<span class="label">/cave</span><span><span class="val-white">${fmt(s.storage.cave.used)} / ${fmt(s.storage.cave.total)}</span> <span class="val-blue">${s.storage.cave.percent}%</span></span>`;
    if (el.gpuModel) el.gpuModel.innerHTML = `<span class="label">MODEL</span><span class="val-white">${s.gpu.name}</span>`;
    if (el.gpuDriver) el.gpuDriver.innerHTML = `<span class="label">DRIVER</span><span class="val-white">${s.gpu.driver}</span>`;
    if (el.gpuUsage) el.gpuUsage.innerHTML = `<span class="label">USAGE</span><span class="val-green">${s.gpu.usage}%</span>`;
    if (el.gpuTemp) el.gpuTemp.innerHTML = `<span class="label">TEMP</span><span class="val-pink">${s.gpu.temp}°C</span>`;
    if (el.gpuVram) el.gpuVram.innerHTML = `<span class="label">VRAM</span><span class="val-white">${s.gpu.vramUsed} / ${s.gpu.vramTotal} MiB</span>`;
    if (el.gpuMemClk) el.gpuMemClk.innerHTML = `<span class="label">MEMCLK</span><span class="val-white">${s.gpu.memClk} MHz</span>`;
    if (el.gpuFan) el.gpuFan.innerHTML = `<span class="label">FAN</span><span class="val-white">${s.gpu.fan}%</span>`;
    if (el.gpuPower) el.gpuPower.innerHTML = `<span class="label">POWER</span><span class="val-orange">${s.gpu.power.toFixed(1)} W</span>`;
    if (el.netIp) el.netIp.innerHTML = `<span class="label">IP</span><span class="val-white">${s.network.ip}</span>`;
    if (el.netType) el.netType.innerHTML = `<span class="label">TYPE</span><span class="val-white">${s.network.type}</span>`;
    if (el.netDown) el.netDown.innerHTML = `<span class="label">DOWN</span><span class="val-green">${s.network.down} KiB/s</span>`;
    if (el.netUp) el.netUp.innerHTML = `<span class="label">UP</span><span class="val-magenta">${s.network.up} KiB/s</span>`;
    if (el.dockerActive) el.dockerActive.innerHTML = `<span class="label">ACTIVE</span><span><span class="val-green">${s.docker.count}</span> <span class="label">containers</span></span>`;
    if (el.dockerNames) el.dockerNames.innerHTML = s.docker.names.map(n => `<span></span><span class="val-orange">${n}</span>`).join('');
  }
}

document.addEventListener('DOMContentLoaded', () => new HoloStatsApp());
