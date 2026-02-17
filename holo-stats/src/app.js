import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ─── Constants ───
const RING_CIRCUMFERENCE = 2 * Math.PI * 30; // r=30 in SVG viewBox

// ─── Background Scene (particles + grid only) ───
class BackgroundScene {
  constructor() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.clock = new THREE.Clock();

    this.scene = new THREE.Scene();
    const aspect = this.width / this.height;
    this.camera = new THREE.PerspectiveCamera(30, aspect, 1, 2000);
    this.camera.position.set(0, 100, 500);
    this.camera.lookAt(0, 50, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    document.getElementById('canvas-container').appendChild(this.renderer.domElement);

    this.createParticles();
    this.createGrid();
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

  createParticles() {
    const count = 150;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.velocities = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1400;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 700;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 400 - 100;
      this.velocities.push({
        x: (Math.random() - 0.5) * 0.15,
        y: (Math.random() - 0.5) * 0.1,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x00f0ff, size: 1.2, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  createGrid() {
    const size = 1800, div = 30;
    const positions = [];
    for (let i = -div / 2; i <= div / 2; i++) {
      const p = (i / div) * size;
      positions.push(-size / 2, -150, p, size / 2, -150, p);
      positions.push(p, -150, -size / 2, p, -150, size / 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x00f0ff, transparent: true, opacity: 0.02, depthWrite: false,
    });
    this.grid = new THREE.LineSegments(geo, mat);
    this.scene.add(this.grid);
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.clearAlpha = 0;
    this.composer.addPass(renderPass);
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height), 0.8, 0.6, 0.4
    );
    this.composer.addPass(bloom);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const t = this.clock.getElapsedTime();

    // Move particles
    const pos = this.particles.geometry.attributes.position.array;
    for (let i = 0; i < this.velocities.length; i++) {
      pos[i * 3] += this.velocities[i].x;
      pos[i * 3 + 1] += this.velocities[i].y;
      if (pos[i * 3] > 700) pos[i * 3] = -700;
      if (pos[i * 3] < -700) pos[i * 3] = 700;
      if (pos[i * 3 + 1] > 350) pos[i * 3 + 1] = -350;
      if (pos[i * 3 + 1] < -350) pos[i * 3 + 1] = 350;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.material.opacity = 0.15 + Math.sin(t * 0.5) * 0.05;

    this.grid.material.opacity = 0.015 + Math.sin(t * 0.3) * 0.005;

    this.camera.position.x = Math.sin(t * 0.1) * 5;
    this.camera.position.y = 100 + Math.sin(t * 0.15) * 3;
    this.camera.lookAt(0, 50, 0);

    this.composer.render();
  }
}

// ─── Color Interpolation (green → orange → red) ───
function valueToColor(t) {
  t = Math.max(0, Math.min(1, t));
  let r, g, b;
  if (t < 0.5) {
    // green (#00ff88) → orange (#ff8800)
    const p = t / 0.5;
    r = Math.round(0 + p * 255);
    g = Math.round(255 - p * 119);  // 255 → 136
    b = Math.round(136 - p * 136);  // 136 → 0
  } else {
    // orange (#ff8800) → red (#ff0044)
    const p = (t - 0.5) / 0.5;
    r = 255;
    g = Math.round(136 - p * 136);  // 136 → 0
    b = Math.round(0 + p * 68);     // 0 → 68
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

  // Update ring color based on value
  const color = valueToColor(v);
  const cell = fill.closest('.ring-cell');
  if (cell) cell.style.setProperty('--ring-color', color);
}

// ─── Main App ───
class HoloStatsApp {
  constructor() {
    this.bg = new BackgroundScene();
    this.stats = null;

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
      } catch (e) {
        console.error('Stats parse error:', e);
      }
    };

    // Time updates independently
    this.updateTime();
    setInterval(() => this.updateTime(), 1000);
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
    // Parse CPU temp number from string like "63.2°C"
    const cpuTempNum = parseFloat(String(s.cpu.temp).replace(/[^0-9.]/g, '')) || 0;
    const cpuPwrLimit = s.cpu.powerLimit || 170;
    const gpuPwrLimit = s.gpu.powerLimit || 600;

    // Ring order: CPU, GPU, CPU TMP, GPU TMP, RAM, CPU PWR, GPU PWR
    const values = [
      s.cpu.usage / 100,
      s.gpu.usage / 100,
      cpuTempNum / 100,
      s.gpu.temp / 100,
      s.memory.percent / 100,
      s.cpu.power / cpuPwrLimit,
      s.gpu.power / gpuPwrLimit,
    ];
    const displays = [
      `${s.cpu.usage}`, `${s.gpu.usage}`,
      `${Math.round(cpuTempNum)}`, `${s.gpu.temp}`,
      `${s.memory.percent}`,
      `${s.cpu.power}`, `${s.gpu.power.toFixed(0)}`,
    ];
    values.forEach((v, i) => {
      setRingValue(i, v);
      const el = document.getElementById(`rv-${i}`);
      if (el) el.textContent = displays[i];
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
