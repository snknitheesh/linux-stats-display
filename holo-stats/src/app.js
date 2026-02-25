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
  if (t < 0.4) {
    const p = t / 0.4;
    // Green (#00FF88) -> Amber (#FFB800)
    const r = Math.round(0 + p * 255);
    const g = Math.round(255 - p * 71);
    const b = Math.round(136 - p * 136);
    return `rgb(${r},${g},${b})`;
  } else if (t < 0.7) {
    const p = (t - 0.4) / 0.3;
    // Amber (#FFB800) -> Orange (#FF5500)
    const r = 255;
    const g = Math.round(184 - p * 99);
    const b = Math.round(0);
    return `rgb(${r},${g},${b})`;
  } else {
    const p = (t - 0.7) / 0.3;
    // Orange (#FF5500) -> Red (#FF2233)
    const r = 255;
    const g = Math.round(85 - p * 51);
    const b = Math.round(0 + p * 51);
    return `rgb(${r},${g},${b})`;
  }
}

// ─── HexArcMeter: SVG hex path with stroke-dashoffset + tick marks ───
class HexArcMeter {
  constructor() {
    this.gauges = [];
    document.querySelectorAll('.hex-gauge').forEach((el, i) => {
      const svg = el.querySelector('.hex-svg');
      const size = 120;
      const cx = size / 2, cy = size / 2, r = 46;

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
      bgPath.setAttribute('stroke', 'rgba(0,240,255,0.7)');
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
        tick.setAttribute('stroke', 'rgba(0,240,255,0.9)');
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
      cell.style.background = color;
      cell.style.opacity = 0.5 + coreLoad * 0.5;
      cell.style.boxShadow = coreLoad > 0.2 ? `0 0 ${6 + coreLoad * 10}px ${color}` : 'none';
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
    ctx.strokeStyle = 'rgba(0,240,255,0.12)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 15) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Download trace (cyan)
    this.drawTrace(this.historyDown, 'rgba(0,240,255,1)', 'rgba(0,240,255,0.18)');
    // Upload trace (magenta)
    this.drawTrace(this.historyUp, 'rgba(255,51,85,1)', 'rgba(255,51,85,0.18)');
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

// ─── HistoryChart: Rolling usage chart (like NetworkWaveform but single-value) ───
class HistoryChart {
  constructor(canvasId, maxSamples = 120) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.history = new Array(maxSamples).fill(0);
    this.maxSamples = maxSamples;
  }

  push(value) {
    this.history.push(value);
    if (this.history.length > this.maxSamples) this.history.shift();
    this.draw();
  }

  draw() {
    const { ctx, canvas, history } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(0,240,255,0.12)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Draw usage trace
    const step = w / (history.length - 1);
    ctx.beginPath();
    history.forEach((v, i) => {
      const x = i * step;
      const y = h - (v / 100) * (h - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    // Glow stroke
    ctx.strokeStyle = 'rgba(0,240,255,1)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(0,240,255,0.9)';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Gradient fill
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,240,255,0.35)');
    grad.addColorStop(1, 'rgba(0,240,255,0.04)');
    ctx.fillStyle = grad;
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

// ─── PageNavigator ───
class PageNavigator {
  constructor() {
    this.track = document.getElementById('page-track');
    this.dots = document.querySelectorAll('.nav-dot');
    this.currentPage = 0;

    // Nav dot clicks
    this.dots.forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const page = parseInt(dot.dataset.page);
        this.goTo(page);
      });
    });

    // Arrow keys
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') this.goTo(Math.min(2, this.currentPage + 1));
      else if (e.key === 'ArrowLeft') this.goTo(Math.max(0, this.currentPage - 1));
    });

    // Scroll wheel (on document so it works through pointer-events: none)
    let wheelCooldown = false;
    document.addEventListener('wheel', (e) => {
      if (wheelCooldown) return;
      if (document.getElementById('expand-overlay') && !document.getElementById('expand-overlay').classList.contains('hidden')) return;
      if (e.deltaY > 0 || e.deltaX > 0) this.goTo(Math.min(2, this.currentPage + 1));
      else if (e.deltaY < 0 || e.deltaX < 0) this.goTo(Math.max(0, this.currentPage - 1));
      wheelCooldown = true;
      setTimeout(() => { wheelCooldown = false; }, 400);
    }, { passive: true });

    // Swipe gestures (on document)
    let startX = 0;
    let dragging = false;
    document.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.panel') || e.target.closest('.topic-card') || e.target.closest('.nav-dot') ||
          e.target.closest('#expand-overlay:not(.hidden)')) return;
      startX = e.clientX;
      dragging = true;
    });
    document.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      const dx = e.clientX - startX;
      if (dx < -60) this.goTo(Math.min(2, this.currentPage + 1));
      else if (dx > 60) this.goTo(Math.max(0, this.currentPage - 1));
    });
  }

  goTo(page) {
    this.currentPage = page;
    this.track.dataset.active = page;
    this.dots.forEach(d => d.classList.toggle('active', parseInt(d.dataset.page) === page));
  }
}

// ─── PanelExpander ───
class PanelExpander {
  constructor() {
    this.overlay = document.getElementById('expand-overlay');
    this.inner = document.getElementById('expand-inner');
    this.closeBtn = document.getElementById('expand-close');
    this.isOpen = false;
    this.sourcePanel = null;
    this._refreshId = null;

    // Click panels to expand
    document.querySelectorAll('.panel').forEach(panel => {
      panel.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.isOpen) this.expand(panel);
      });
    });

    // Close on X button
    this.closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.collapse();
    });

    // Close on overlay background click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.collapse();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.collapse();
    });
  }

  _sync() {
    if (!this.sourcePanel || !this.isOpen) return;
    const header = this.sourcePanel.querySelector('.panel-header');
    const body = this.sourcePanel.querySelector('.panel-body');
    this.inner.innerHTML =
      (header ? `<div class="panel-header">${header.textContent}</div>` : '') +
      body.innerHTML;

    // Copy canvas pixel data (innerHTML creates blank canvases)
    const srcCanvases = body.querySelectorAll('canvas');
    const dstCanvases = this.inner.querySelectorAll('canvas');
    srcCanvases.forEach((src, i) => {
      if (dstCanvases[i]) {
        const dst = dstCanvases[i];
        dst.width = src.width;
        dst.height = src.height;
        const ctx = dst.getContext('2d');
        ctx.drawImage(src, 0, 0);
      }
    });
  }

  expand(panel) {
    this.sourcePanel = panel;
    this._sync();
    this.overlay.classList.remove('hidden');
    this.isOpen = true;
    // Live-refresh from source panel every 500ms
    this._refreshId = setInterval(() => this._sync(), 500);
  }

  collapse() {
    this.overlay.classList.add('hidden');
    this.isOpen = false;
    this.sourcePanel = null;
    if (this._refreshId) {
      clearInterval(this._refreshId);
      this._refreshId = null;
    }
    this.inner.innerHTML = '';
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

    // Initialize page 1 widgets
    this.hexMeter = new HexArcMeter();

    // Initialize page 2 widgets (Compute)
    this.coreGrid2 = new CpuCoreGrid('cpu-core-grid-2', 32);
    this.fuelBar2 = new FuelBar('vram-fuel-bar-2', 20);
    this.thermalStrip2 = new ThermalStrip('gpu-thermal-strip-2');
    this.cpuHistory = new HistoryChart('cpu-history-chart', 120);
    this.gpuHistory = new HistoryChart('gpu-history-chart', 120);

    // Initialize page 3 widgets (System)
    this.waveform2 = new NetworkWaveform('net-waveform-2');
    this.processFeed2 = new ProcessFeed('process-feed-2');
    this.dockerManifest2 = new DockerManifest('docker-manifest-2');

    // Initialize navigation and expander
    this.pageNav = new PageNavigator();
    this.panelExpander = new PanelExpander();

    // Cache DOM elements for top bar
    this.el = {
      time: document.getElementById('time-display'),
      date: document.getElementById('date-display'),
      met: document.getElementById('met-display'),
      netStatus: document.getElementById('net-status'),
    };


    // Cache DOM elements for page 2 (Compute)
    this.el2 = {
      cpuModel: document.getElementById('stat-cpu2-model'),
      cpuLoad: document.getElementById('stat-cpu2-load'),
      cpuFreq: document.getElementById('stat-cpu2-freq'),
      cpuTemp: document.getElementById('stat-cpu2-temp'),
      cpuPower: document.getElementById('stat-cpu2-power'),
      cpuCores: document.getElementById('stat-cpu2-cores'),
      gpuModel: document.getElementById('stat-gpu2-model'),
      gpuDriver: document.getElementById('stat-gpu2-driver'),
      gpuUsage: document.getElementById('stat-gpu2-usage'),
      gpuTemp: document.getElementById('stat-gpu2-temp'),
      gpuFan: document.getElementById('stat-gpu2-fan'),
      gpuMemClk: document.getElementById('stat-gpu2-memclk'),
      vramText: document.getElementById('vram-text-2'),
    };

    // Cache DOM elements for page 3 (System)
    this.el3 = {
      netIp: document.getElementById('stat-net2-ip'),
      netType: document.getElementById('stat-net2-type'),
      netDown: document.getElementById('stat-net2-down'),
      netUp: document.getElementById('stat-net2-up'),
      memRam: document.getElementById('stat-mem2-ram'),
      memPct: document.getElementById('stat-mem2-pct'),
      memFree: document.getElementById('stat-mem2-free'),
      memSwap: document.getElementById('stat-mem2-swap'),
      memLoadavg: document.getElementById('stat-mem2-loadavg'),
      memProcs: document.getElementById('stat-mem2-procs'),
      storageRoot: document.getElementById('stat-storage2-root'),
      storageHome: document.getElementById('stat-storage2-home'),
      storageCave: document.getElementById('stat-storage2-cave'),
      storageLake: document.getElementById('stat-storage2-lake'),
      diskRead: document.getElementById('stat-disk2-read'),
      diskWrite: document.getElementById('stat-disk2-write'),
      procsTotal: document.getElementById('stat-procs2-total'),
      procsRunning: document.getElementById('stat-procs2-running'),
      procsThreads: document.getElementById('stat-procs2-threads'),
      procsLoadavg: document.getElementById('stat-procs2-loadavg'),
    };

    // Stats injection from Python backend (GTK/WebKit)
    window.updateStats = (jsonStr) => {
      try {
        const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        this.onStatsUpdate(data);
      } catch (e) {
        console.error('Stats parse error:', e);
      }
    };

    // Electron IPC stats path
    if (window.statsAPI && window.statsAPI.onStats) {
      window.statsAPI.onStats((data) => {
        this.onStatsUpdate(data);
      });
    }

    // Topic card click → navigate to detail page
    document.querySelectorAll('.topic-card').forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const page = parseInt(card.dataset.target);
        this.pageNav.goTo(page);
      });
    });

    // Mouse-event forwarding for Electron (transparent pass-through)
    this.setupMouseForwarding();

    this.updateTime();
    setInterval(() => this.updateTime(), 1000);
    this.scheduleGlitch();
  }

  setupMouseForwarding() {
    if (!window.statsAPI || !window.statsAPI.setIgnoreMouse) return;

    document.addEventListener('mousemove', (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const isInteractive = el && (
        el.closest('.panel') ||
        el.closest('.topic-card') ||
        el.closest('.nav-dot') ||
        el.closest('#expand-overlay:not(.hidden)') ||
        el.closest('#expand-close')
      );
      window.statsAPI.setIgnoreMouse(!isInteractive);
    });
  }

  onStatsUpdate(data) {
    this.stats = data;
    this.updateGauges(data);
    this.updateDetailPages(data);

    // Top bar
    const el = this.el;
    if (el.met) el.met.textContent = uptimeToMET(data.system.uptime);
    if (el.netStatus) {
      el.netStatus.textContent = data.network.type;
      el.netStatus.style.color = data.network.type === 'Disconnected' ? '#FF2D6A' : '#00FF88';
    }

    // Drive background intensity from average CPU+GPU load
    const avgLoad = ((data.cpu.usage || 0) + (data.gpu.usage || 0)) / 200;
    this.bg.setIntensity(avgLoad);
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
      s.gpu.power / gpuPwrLimit,
    ];
    const displays = [
      `${s.cpu.usage}`, `${s.memory.percent}`,
      `${s.gpu.usage}`,
      `${Math.round(cpuTempNum)}`, `${s.gpu.temp}`,
      `${s.gpu.power.toFixed(0)}`,
    ];

    values.forEach((v, i) => {
      this.hexMeter.setValue(i, v);
      this.hexMeter.setDisplay(i, displays[i]);
    });
  }

  updateDetailPages(s) {
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

    // ── Page 2: Compute ──
    const e2 = this.el2;
    setRow(e2.cpuModel, 'MODEL', s.cpu.model);
    setRow(e2.cpuLoad, 'LOAD', `${s.cpu.usage}%`, 'val-cyan');
    setRow(e2.cpuFreq, 'FREQ', `${s.cpu.freq} GHz`);
    setRow(e2.cpuTemp, 'TEMP', s.cpu.temp, 'val-amber');
    setRow(e2.cpuPower, 'POWER', `${s.cpu.power} W`, 'val-amber');
    setRow(e2.cpuCores, 'CORES', s.cpu.cores);

    setRow(e2.gpuModel, 'MODEL', s.gpu.name);
    setRow(e2.gpuDriver, 'DRIVER', s.gpu.driver);
    setRow(e2.gpuUsage, 'USAGE', `${s.gpu.usage}%`, 'val-cyan');
    setRow(e2.gpuTemp, 'TEMP', `${s.gpu.temp}°C`, 'val-amber');
    setRow(e2.gpuFan, 'FAN', `${s.gpu.fan}%`);
    setRow(e2.gpuMemClk, 'MEM CLK', `${s.gpu.memClk} MHz`);
    if (e2.vramText) e2.vramText.textContent = `${s.gpu.vramUsed} / ${s.gpu.vramTotal} MiB`;

    this.coreGrid2.update(s.cpu.usage);
    this.fuelBar2.update(s.gpu.vramUsed, s.gpu.vramTotal);
    this.thermalStrip2.update(s.gpu.temp);
    this.cpuHistory.push(s.cpu.usage);
    this.gpuHistory.push(s.gpu.usage);

    // ── Page 3: System ──
    const e3 = this.el3;
    setRow(e3.netIp, 'IP', s.network.ip);
    setRow(e3.netType, 'TYPE', s.network.type);
    setRow(e3.netDown, 'DOWN', `${(s.network.down / 1024).toFixed(2)} MiB/s`, 'val-green');
    setRow(e3.netUp, 'UP', `${(s.network.up / 1024).toFixed(2)} MiB/s`, 'val-magenta');

    setRow(e3.memRam, 'RAM', `${fmt(s.memory.used)} / ${fmt(s.memory.total)}`);
    setRow(e3.memPct, 'USED', `${s.memory.percent}%`, 'val-cyan');
    setRow(e3.memFree, 'FREE', fmt(s.memory.free), 'val-green');
    setRow(e3.memSwap, 'SWAP', `${fmt(s.memory.swapUsed)} / ${fmt(s.memory.swapTotal)}`);
    setRow(e3.memLoadavg, 'LOAD', s.system.loadavg);
    setRow(e3.memProcs, 'PROCS', `${s.system.totalProcs} / ${s.system.runningProcs} run`);

    setRow(e3.storageRoot, '/', `${fmt(s.storage.root.used)} / ${fmt(s.storage.root.total)}  ${s.storage.root.percent}%`);
    setRow(e3.storageHome, '/home', `${fmt(s.storage.home.used)} / ${fmt(s.storage.home.total)}  ${s.storage.home.percent}%`);
    setRow(e3.storageCave, '/cave', `${fmt(s.storage.cave.used)} / ${fmt(s.storage.cave.total)}  ${s.storage.cave.percent}%`);
    setRow(e3.storageLake, '/lake', `${fmt(s.storage.lake.used)} / ${fmt(s.storage.lake.total)}  ${s.storage.lake.percent}%`);
    if (s.diskIO) {
      setRow(e3.diskRead, 'READ', `${(s.diskIO.read / 1024).toFixed(2)} MiB/s`, 'val-green');
      setRow(e3.diskWrite, 'WRITE', `${(s.diskIO.write / 1024).toFixed(2)} MiB/s`, 'val-magenta');
    }

    setRow(e3.procsTotal, 'TOTAL', s.system.totalProcs);
    setRow(e3.procsRunning, 'RUNNING', s.system.runningProcs, 'val-green');
    setRow(e3.procsThreads, 'THREADS', s.system.threads);
    setRow(e3.procsLoadavg, 'LOAD AVG', s.system.loadavg);

    const dockCount2 = document.getElementById('docker-count-2');
    if (dockCount2) dockCount2.textContent = s.docker.count;

    this.waveform2.push(s.network.down, s.network.up);
    this.processFeed2.update(s.cpu.top || []);
    this.dockerManifest2.update(s.docker.names || []);
  }
}

document.addEventListener('DOMContentLoaded', () => new HoloStatsApp());
