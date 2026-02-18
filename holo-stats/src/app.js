import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ─── Background Scene: Hex grid + data streams + circuit traces ───
class BackgroundScene {
  constructor() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.clock = new THREE.Clock();
    this.intensity = 0;

    this.scene = new THREE.Scene();
    const aspect = this.width / this.height;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 1, 5000);
    this.camera.position.set(0, 0, 500);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    document.getElementById('canvas-container').appendChild(this.renderer.domElement);

    this.createHexGrid();
    this.createDataStreams();
    this.createCircuitTraces();
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

  createHexGrid() {
    const positions = [];
    const hexSize = 30;
    const cols = 32;
    const rows = 22;
    const xStep = hexSize * 1.5;
    const yStep = hexSize * Math.sqrt(3);
    const offsetX = -(cols * xStep) / 2;
    const offsetY = -(rows * yStep) / 2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = offsetX + col * xStep;
        const cy = offsetY + row * yStep + (col % 2 === 1 ? yStep / 2 : 0);
        for (let i = 0; i < 6; i++) {
          const a1 = (Math.PI / 3) * i;
          const a2 = (Math.PI / 3) * ((i + 1) % 6);
          positions.push(
            cx + hexSize * 0.5 * Math.cos(a1), cy + hexSize * 0.5 * Math.sin(a1), -200,
            cx + hexSize * 0.5 * Math.cos(a2), cy + hexSize * 0.5 * Math.sin(a2), -200
          );
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x00F0FF,
      transparent: true,
      opacity: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.hexGrid = new THREE.LineSegments(geo, mat);
    this.scene.add(this.hexGrid);
  }

  createDataStreams() {
    this.streams = [];
    const streamCount = 5;
    const pointsPerStream = 100;

    for (let s = 0; s < streamCount; s++) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(pointsPerStream * 3);
      const baseX = (s - (streamCount - 1) / 2) * 180;
      const baseZ = -100 - Math.random() * 100;

      for (let i = 0; i < pointsPerStream; i++) {
        pos[i * 3] = baseX + (Math.random() - 0.5) * 40;
        pos[i * 3 + 1] = (i / pointsPerStream - 0.5) * 800;
        pos[i * 3 + 2] = baseZ + (Math.random() - 0.5) * 30;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

      const hue = 0.5 + s * 0.02;
      const color = new THREE.Color().setHSL(hue, 0.8, 0.5);
      const mat = new THREE.PointsMaterial({
        color,
        size: 1.2,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });

      const points = new THREE.Points(geo, mat);
      this.scene.add(points);
      this.streams.push({ points, speed: 0.8 + Math.random() * 0.4, baseX });
    }
  }

  createCircuitTraces() {
    this.circuits = [];
    const traceCount = 8;

    for (let t = 0; t < traceCount; t++) {
      const segCount = 6 + Math.floor(Math.random() * 6);
      const positions = [];
      let x = (Math.random() - 0.5) * 600;
      let y = (Math.random() - 0.5) * 400;
      const z = -150 + Math.random() * 50;

      positions.push(x, y, z);
      for (let s = 0; s < segCount; s++) {
        // Circuit traces go in axis-aligned segments
        if (Math.random() > 0.5) {
          x += (Math.random() > 0.5 ? 1 : -1) * (30 + Math.random() * 60);
        } else {
          y += (Math.random() > 0.5 ? 1 : -1) * (30 + Math.random() * 60);
        }
        positions.push(x, y, z);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0x00F0FF,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      this.scene.add(line);

      // Traveling pulse - a single bright point that moves along the trace
      const pulseGeo = new THREE.BufferGeometry();
      pulseGeo.setAttribute('position', new THREE.Float32BufferAttribute([x, y, z], 3));
      const pulseMat = new THREE.PointsMaterial({
        color: 0x00F0FF,
        size: 4,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });
      const pulse = new THREE.Points(pulseGeo, pulseMat);
      this.scene.add(pulse);

      this.circuits.push({
        line,
        pulse,
        vertices: positions,
        segCount: segCount + 1,
        progress: Math.random(),
        speed: 0.003 + Math.random() * 0.004,
      });
    }
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
    const I = this.intensity;

    // Hex grid subtle breathe
    this.hexGrid.material.opacity = 0.03 + Math.sin(t * 0.3) * 0.01 + I * 0.02;

    // Data stream particles fall downward
    this.streams.forEach(stream => {
      const pos = stream.points.geometry.attributes.position.array;
      const count = pos.length / 3;
      for (let i = 0; i < count; i++) {
        pos[i * 3 + 1] -= stream.speed * (1 + I * 0.5);
        if (pos[i * 3 + 1] < -400) {
          pos[i * 3 + 1] = 400;
          pos[i * 3] = stream.baseX + (Math.random() - 0.5) * 40;
        }
      }
      stream.points.geometry.attributes.position.needsUpdate = true;
      stream.points.material.opacity = 0.15 + I * 0.1 + Math.sin(t * 0.5 + stream.speed * 5) * 0.05;
    });

    // Circuit trace pulses travel along paths
    this.circuits.forEach(c => {
      c.progress += c.speed * (1 + I);
      if (c.progress > 1) c.progress -= 1;

      const totalSegs = c.segCount - 1;
      const segFloat = c.progress * totalSegs;
      const segIdx = Math.floor(segFloat);
      const segFrac = segFloat - segIdx;
      const i0 = Math.min(segIdx, totalSegs - 1);
      const i1 = Math.min(i0 + 1, totalSegs);

      const x = c.vertices[i0 * 3] + (c.vertices[i1 * 3] - c.vertices[i0 * 3]) * segFrac;
      const y = c.vertices[i0 * 3 + 1] + (c.vertices[i1 * 3 + 1] - c.vertices[i0 * 3 + 1]) * segFrac;
      const z = c.vertices[i0 * 3 + 2] + (c.vertices[i1 * 3 + 2] - c.vertices[i0 * 3 + 2]) * segFrac;

      const pPos = c.pulse.geometry.attributes.position.array;
      pPos[0] = x; pPos[1] = y; pPos[2] = z;
      c.pulse.geometry.attributes.position.needsUpdate = true;
      c.pulse.material.opacity = 0.4 + Math.sin(t * 4 + c.progress * 10) * 0.2;
    });

    // Bloom reacts to load
    this.bloomPass.strength = 1.0 + I * 0.5;

    this.composer.render();
  }
}

// ─── Color Interpolation (cyan -> amber -> magenta) ───
function valueToColor(t) {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.5) {
    const p = t / 0.5;
    // Cyan (#00F0FF) -> Amber (#FFB800)
    const r = Math.round(0 + p * 255);
    const g = Math.round(240 - p * 56);
    const b = Math.round(255 - p * 255);
    return `rgb(${r},${g},${b})`;
  } else {
    const p = (t - 0.5) / 0.5;
    // Amber (#FFB800) -> Magenta (#FF2D6A)
    const r = 255;
    const g = Math.round(184 - p * 139);
    const b = Math.round(0 + p * 106);
    return `rgb(${r},${g},${b})`;
  }
}

// ─── HexArcMeter: SVG hex path with stroke-dashoffset + tick marks ───
class HexArcMeter {
  constructor() {
    this.gauges = [];
    document.querySelectorAll('.hex-gauge').forEach((el, i) => {
      const svg = el.querySelector('.hex-svg');
      const size = 100;
      const cx = size / 2, cy = size / 2, r = 38;

      // Build hex path
      const pts = [];
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k - Math.PI / 2;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      const pathD = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ') + ' Z';

      // Calculate total path length
      let totalLen = 0;
      for (let k = 0; k < 6; k++) {
        const p0 = pts[k], p1 = pts[(k + 1) % 6];
        totalLen += Math.sqrt((p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2);
      }

      // Background hex
      const bgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      bgPath.setAttribute('d', pathD);
      bgPath.setAttribute('fill', 'none');
      bgPath.setAttribute('stroke', 'rgba(0,240,255,0.3)');
      bgPath.setAttribute('stroke-width', '2.5');
      svg.appendChild(bgPath);

      // Tick marks at each hex vertex
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k - Math.PI / 2;
        const inner = r - 4, outer = r + 4;
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', (cx + inner * Math.cos(a)).toFixed(2));
        tick.setAttribute('y1', (cy + inner * Math.sin(a)).toFixed(2));
        tick.setAttribute('x2', (cx + outer * Math.cos(a)).toFixed(2));
        tick.setAttribute('y2', (cy + outer * Math.sin(a)).toFixed(2));
        tick.setAttribute('stroke', 'rgba(0,240,255,0.5)');
        tick.setAttribute('stroke-width', '1.5');
        svg.appendChild(tick);
      }

      // Fill hex path
      const fillPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      fillPath.setAttribute('d', pathD);
      fillPath.setAttribute('fill', 'none');
      fillPath.setAttribute('stroke', '#00F0FF');
      fillPath.setAttribute('stroke-width', '3');
      fillPath.setAttribute('stroke-linecap', 'butt');
      fillPath.setAttribute('stroke-dasharray', `0 ${totalLen}`);
      fillPath.style.transition = 'stroke-dasharray 0.6s ease, stroke 0.6s ease, filter 0.6s ease';
      fillPath.style.filter = 'drop-shadow(0 0 6px #00F0FF) drop-shadow(0 0 12px #00F0FF)';
      svg.appendChild(fillPath);

      this.gauges.push({ el, svg, fillPath, totalLen });
    });
  }

  setValue(index, value01) {
    const g = this.gauges[index];
    if (!g) return;
    const v = Math.max(0, Math.min(1, value01));
    const filled = g.totalLen * v;
    const gap = g.totalLen - filled;
    g.fillPath.setAttribute('stroke-dasharray', `${filled} ${gap}`);

    const color = valueToColor(v);
    g.fillPath.setAttribute('stroke', color);
    g.fillPath.style.filter = `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color})`;

    const numEl = document.getElementById(`hv-${index}`);
    if (numEl) {
      numEl.style.color = color;
      numEl.style.textShadow = `0 0 8px ${color}, 0 0 16px ${color}`;
    }
  }

  setDisplay(index, text) {
    const el = document.getElementById(`hv-${index}`);
    if (!el) return;
    const old = el.textContent;
    el.textContent = text;
    if (old !== text && old !== '--') {
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 300);
    }
  }
}

// ─── CpuCoreGrid ───
class CpuCoreGrid {
  constructor(containerId, coreCount = 16) {
    this.container = document.getElementById(containerId);
    this.cells = [];
    for (let i = 0; i < coreCount; i++) {
      const cell = document.createElement('div');
      cell.className = 'core-cell';
      this.container.appendChild(cell);
      this.cells.push(cell);
    }
  }

  update(usagePercent) {
    // Simulate per-core load based on overall usage
    const usage = usagePercent / 100;
    this.cells.forEach((cell, i) => {
      const coreLoad = Math.min(1, Math.max(0, usage + (Math.random() - 0.5) * 0.3));
      const color = valueToColor(coreLoad);
      const alpha = 0.1 + coreLoad * 0.7;
      cell.style.background = color;
      cell.style.opacity = alpha;
      cell.style.boxShadow = coreLoad > 0.5 ? `0 0 4px ${color}` : 'none';
    });
  }
}

// ─── FuelBar (VRAM) ───
class FuelBar {
  constructor(containerId, segCount = 20) {
    this.container = document.getElementById(containerId);
    this.segments = [];
    for (let i = 0; i < segCount; i++) {
      const seg = document.createElement('div');
      seg.className = 'fuel-seg';
      this.container.appendChild(seg);
      this.segments.push(seg);
    }
  }

  update(used, total) {
    const pct = total > 0 ? used / total : 0;
    const litCount = Math.round(pct * this.segments.length);
    this.segments.forEach((seg, i) => {
      seg.className = 'fuel-seg';
      if (i < litCount) {
        if (pct > 0.85) seg.classList.add('crit');
        else if (pct > 0.65) seg.classList.add('warn');
        else seg.classList.add('lit');
      }
    });
  }
}

// ─── ThermalStrip ───
class ThermalStrip {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.fill = this.container.querySelector('.thermal-fill');
  }

  update(temp, maxTemp = 90) {
    const pct = Math.min(1, Math.max(0, temp / maxTemp));
    // The dark mask covers the unlit portion (right side)
    this.fill.style.width = `${(1 - pct) * 100}%`;
  }
}

// ─── NetworkWaveform: Canvas 2D oscilloscope ───
class NetworkWaveform {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.historyDown = new Array(170).fill(0);
    this.historyUp = new Array(170).fill(0);
    this.maxVal = 100;
  }

  push(down, up) {
    this.historyDown.push(down);
    this.historyUp.push(up);
    if (this.historyDown.length > 170) this.historyDown.shift();
    if (this.historyUp.length > 170) this.historyUp.shift();
    // Auto-scale
    const allMax = Math.max(...this.historyDown, ...this.historyUp, 10);
    this.maxVal = allMax * 1.2;
    this.draw();
  }

  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(0,240,255,0.04)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 15) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Download trace (cyan)
    this.drawTrace(this.historyDown, 'rgba(0,240,255,0.7)', 'rgba(0,240,255,0.08)');
    // Upload trace (magenta)
    this.drawTrace(this.historyUp, 'rgba(255,45,106,0.6)', 'rgba(255,45,106,0.05)');
  }

  drawTrace(data, strokeColor, fillColor) {
    const { ctx, canvas, maxVal } = this;
    const w = canvas.width;
    const h = canvas.height;
    const step = w / (data.length - 1);

    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach((v, i) => {
      const x = i * step;
      const y = h - (v / maxVal) * (h - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    // Stroke
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Fill below
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
}

// ─── ProcessFeed ───
class ProcessFeed {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  update(procs) {
    this.container.innerHTML = procs.map(p =>
      p.name ? `<div class="proc-line"><span class="proc-name">${p.name}</span><span class="proc-cpu">${p.cpu}%</span></div>` : ''
    ).filter(Boolean).join('');
  }
}

// ─── DockerManifest ───
class DockerManifest {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  update(names) {
    this.container.innerHTML = names.map(n =>
      `<div class="dock-entry"><span class="dock-dot"></span><span class="dock-name">${n}</span></div>`
    ).join('');
  }
}

// ─── Uptime to MET format ───
function uptimeToMET(uptimeStr) {
  if (!uptimeStr || uptimeStr === 'N/A') return 'T+00:00:00';
  // Parse "X days, Y hours, Z minutes" style strings
  let days = 0, hours = 0, minutes = 0;
  const dayMatch = uptimeStr.match(/(\d+)\s*day/);
  const hourMatch = uptimeStr.match(/(\d+)\s*hour/);
  const minMatch = uptimeStr.match(/(\d+)\s*minute/);
  if (dayMatch) days = parseInt(dayMatch[1]);
  if (hourMatch) hours = parseInt(hourMatch[1]);
  if (minMatch) minutes = parseInt(minMatch[1]);

  const totalHours = days * 24 + hours;
  return `T+${String(totalHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

// ─── Main App ───
class HoloStatsApp {
  constructor() {
    this.bg = new BackgroundScene();
    this.stats = null;
    this.glitchEl = document.getElementById('glitch-flash');

    // Initialize widgets
    this.hexMeter = new HexArcMeter();
    this.coreGrid = new CpuCoreGrid('cpu-core-grid', 32);
    this.fuelBar = new FuelBar('vram-fuel-bar', 20);
    this.thermalStrip = new ThermalStrip('gpu-thermal-strip');
    this.waveform = new NetworkWaveform('net-waveform');
    this.processFeed = new ProcessFeed('process-feed');
    this.dockerManifest = new DockerManifest('docker-manifest');

    // Cache DOM elements
    this.el = {
      time: document.getElementById('time-display'),
      date: document.getElementById('date-display'),
      met: document.getElementById('met-display'),
      netStatus: document.getElementById('net-status'),
      cpuModel: document.getElementById('stat-cpu-model'),
      cpuLoad: document.getElementById('stat-cpu-load'),
      cpuFreq: document.getElementById('stat-cpu-freq'),
      cpuTemp: document.getElementById('stat-cpu-temp'),
      ram: document.getElementById('stat-ram'),
      ramPct: document.getElementById('stat-ram-pct'),
      ramFree: document.getElementById('stat-ram-free'),
      swap: document.getElementById('stat-swap'),
      loadavg: document.getElementById('stat-loadavg'),
      procs: document.getElementById('stat-procs'),
      storageRoot: document.getElementById('stat-storage-root'),
      storageHome: document.getElementById('stat-storage-home'),
      storageCave: document.getElementById('stat-storage-cave'),
      diskRead: document.getElementById('stat-disk-read'),
      diskWrite: document.getElementById('stat-disk-write'),
      gpuModel: document.getElementById('stat-gpu-model'),
      gpuDriver: document.getElementById('stat-gpu-driver'),
      gpuUsage: document.getElementById('stat-gpu-usage'),
      gpuTemp: document.getElementById('stat-gpu-temp'),
      gpuFan: document.getElementById('stat-gpu-fan'),
      vramText: document.getElementById('vram-text'),
      netIp: document.getElementById('stat-net-ip'),
      netType: document.getElementById('stat-net-type'),
      netDown: document.getElementById('stat-net-down'),
      netUp: document.getElementById('stat-net-up'),
      dockerActive: document.getElementById('stat-docker-active'),
    };

    // Stats injection from Python backend
    window.updateStats = (jsonStr) => {
      try {
        const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        this.stats = data;
        this.updateGauges(data);
        this.updatePanels(data);
        this.updateWidgets(data);
        // Drive background intensity from average CPU+GPU load
        const avgLoad = ((data.cpu.usage || 0) + (data.gpu.usage || 0)) / 200;
        this.bg.setIntensity(avgLoad);
      } catch (e) {
        console.error('Stats parse error:', e);
      }
    };

    this.updateTime();
    setInterval(() => this.updateTime(), 1000);
    this.scheduleGlitch();
  }

  scheduleGlitch() {
    const delay = 5000 + Math.random() * 12000;
    setTimeout(() => {
      if (this.glitchEl) {
        this.glitchEl.classList.add('active');
        setTimeout(() => this.glitchEl.classList.remove('active'), 200);
      }
      this.scheduleGlitch();
    }, delay);
  }

  updateTime() {
    const now = new Date();
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    if (this.el.time) this.el.time.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
    if (this.el.date) this.el.date.textContent = `${days[now.getDay()]} ${String(now.getDate()).padStart(2, '0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
  }

  updateGauges(s) {
    const cpuTempNum = parseFloat(String(s.cpu.temp).replace(/[^0-9.]/g, '')) || 0;
    const cpuPwrLimit = s.cpu.powerLimit || 170;
    const gpuPwrLimit = s.gpu.powerLimit || 600;

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
      this.hexMeter.setValue(i, v);
      this.hexMeter.setDisplay(i, displays[i]);
    });
  }

  updatePanels(s) {
    const el = this.el;
    const fmt = (bytes) => {
      if (bytes > 1e12) return (bytes / 1e12).toFixed(1) + ' TiB';
      if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GiB';
      if (bytes > 1e6) return (bytes / 1e6).toFixed(0) + ' MiB';
      return (bytes / 1e6).toFixed(2) + ' MiB';
    };

    const setRow = (elem, label, val, cls) => {
      if (!elem) return;
      elem.innerHTML = `<span class="lbl">${label}</span><span class="val ${cls || ''}">${val}</span>`;
    };

    // CPU Panel
    setRow(el.cpuModel, 'MODEL', s.cpu.model);
    setRow(el.cpuLoad, 'LOAD', `${s.cpu.usage}%`, 'val-cyan');
    setRow(el.cpuFreq, 'FREQ', `${s.cpu.freq} GHz`);
    setRow(el.cpuTemp, 'TEMP', s.cpu.temp, 'val-amber');

    // Memory Panel
    setRow(el.ram, 'RAM', `${fmt(s.memory.used)} / ${fmt(s.memory.total)}`);
    setRow(el.ramPct, 'USED', `${s.memory.percent}%`, 'val-cyan');
    setRow(el.ramFree, 'FREE', fmt(s.memory.free), 'val-green');
    setRow(el.swap, 'SWAP', `${fmt(s.memory.swapUsed)} / ${fmt(s.memory.swapTotal)}`);
    setRow(el.loadavg, 'LOAD', s.system.loadavg);
    setRow(el.procs, 'PROCS', `${s.system.totalProcs} / ${s.system.runningProcs} run`);

    // Storage Panel
    setRow(el.storageRoot, '/', `${fmt(s.storage.root.used)} / ${fmt(s.storage.root.total)}  ${s.storage.root.percent}%`);
    setRow(el.storageHome, '/home', `${fmt(s.storage.home.used)} / ${fmt(s.storage.home.total)}  ${s.storage.home.percent}%`);
    setRow(el.storageCave, '/cave', `${fmt(s.storage.cave.used)} / ${fmt(s.storage.cave.total)}  ${s.storage.cave.percent}%`);
    if (s.diskIO) {
      setRow(el.diskRead, 'READ', `${(s.diskIO.read / 1024).toFixed(2)} MiB/s`, 'val-green');
      setRow(el.diskWrite, 'WRITE', `${(s.diskIO.write / 1024).toFixed(2)} MiB/s`, 'val-magenta');
    }

    // GPU Panel
    setRow(el.gpuModel, 'MODEL', s.gpu.name);
    setRow(el.gpuDriver, 'DRIVER', s.gpu.driver);
    setRow(el.gpuUsage, 'USAGE', `${s.gpu.usage}%`, 'val-cyan');
    setRow(el.gpuTemp, 'TEMP', `${s.gpu.temp}°C`, 'val-amber');
    setRow(el.gpuFan, 'FAN', `${s.gpu.fan}%`);
    if (el.vramText) el.vramText.textContent = `${s.gpu.vramUsed} / ${s.gpu.vramTotal} MiB`;

    // Network Panel
    setRow(el.netIp, 'IP', s.network.ip);
    setRow(el.netType, 'TYPE', s.network.type);
    setRow(el.netDown, 'DOWN', `${(s.network.down / 1024).toFixed(2)} MiB/s`, 'val-green');
    setRow(el.netUp, 'UP', `${(s.network.up / 1024).toFixed(2)} MiB/s`, 'val-magenta');

    // Docker Panel
    const dockCount = document.getElementById('docker-count');
    if (dockCount) { dockCount.textContent = s.docker.count; }

    // Top bar
    if (el.met) el.met.textContent = uptimeToMET(s.system.uptime);
    if (el.netStatus) {
      el.netStatus.textContent = s.network.type;
      el.netStatus.style.color = s.network.type === 'Disconnected' ? '#FF2D6A' : '#00FF88';
    }
  }

  updateWidgets(s) {
    this.coreGrid.update(s.cpu.usage);
    this.fuelBar.update(s.gpu.vramUsed, s.gpu.vramTotal);
    this.thermalStrip.update(s.gpu.temp);
    this.waveform.push(s.network.down, s.network.up);
    this.processFeed.update(s.cpu.top || []);
    this.dockerManifest.update(s.docker.names || []);
  }
}

document.addEventListener('DOMContentLoaded', () => new HoloStatsApp());
