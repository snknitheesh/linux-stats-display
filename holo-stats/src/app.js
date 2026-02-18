import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ─── Seeded random for deterministic layouts ───
function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ─── Background Scene: Deep space panorama ───
class BackgroundScene {
  constructor() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.clock = new THREE.Clock();
    this.intensity = 0;
    this.starLayers = [];

    this.scene = new THREE.Scene();
    const aspect = this.width / this.height;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 1, 5000);
    this.camera.position.set(0, 60, 500);
    this.camera.lookAt(0, 20, -200);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    document.getElementById('canvas-container').appendChild(this.renderer.domElement);

    this.createStarField();
    this.createNebulae();
    this.createGalaxy();
    this.createAsteroids();
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
      { count: 800, color: 0xccddff, size: 0.4, opacity: 0.5, spread: 2500 },
      { count: 300, color: 0x88bbff, size: 1.0, opacity: 0.35, spread: 2000 },
      { count: 200, color: 0xffcc88, size: 0.6, opacity: 0.3, spread: 2200 },
      { count: 80, color: 0xffffff, size: 2.2, opacity: 0.3, spread: 1600 },
      { count: 40, color: 0xffd700, size: 1.5, opacity: 0.25, spread: 1800 },
    ];
    configs.forEach(cfg => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(cfg.count * 3);
      for (let i = 0; i < cfg.count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * cfg.spread;
        pos[i * 3 + 1] = (Math.random() - 0.5) * cfg.spread * 0.6;
        pos[i * 3 + 2] = -Math.random() * cfg.spread * 0.8 - 100;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: cfg.color, size: cfg.size, transparent: true, opacity: cfg.opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      });
      const points = new THREE.Points(geo, mat);
      this.scene.add(points);
      this.starLayers.push({ points, config: cfg, phase: Math.random() * Math.PI * 2 });
    });
  }

  createNebulae() {
    this.nebulae = [];
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.3)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);

    const cfgs = [
      { pos: [-450, 180, -900], color: 0x6B2FA0, scale: 500, opacity: 0.06 },
      { pos: [380, 220, -1000], color: 0x2E4A8A, scale: 450, opacity: 0.05 },
      { pos: [-200, -120, -800], color: 0x4B3D8F, scale: 400, opacity: 0.04 },
      { pos: [200, -60, -700], color: 0x1A3A6A, scale: 350, opacity: 0.04 },
    ];
    cfgs.forEach(cfg => {
      const mat = new THREE.SpriteMaterial({
        map: tex, color: cfg.color, transparent: true, opacity: cfg.opacity,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(...cfg.pos);
      sprite.scale.set(cfg.scale, cfg.scale, 1);
      this.scene.add(sprite);
      this.nebulae.push({ sprite, baseOpacity: cfg.opacity, phase: Math.random() * Math.PI * 2 });
    });
  }

  createGalaxy() {
    const count = 1000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const arms = 3;
    const armColors = [[0.6, 0.3, 1.0], [0.2, 0.5, 1.0], [1.0, 0.4, 0.7]];
    for (let i = 0; i < count; i++) {
      const arm = i % arms;
      const dist = (i / count) * 180;
      const spiralAngle = (arm / arms) * Math.PI * 2 + dist * 0.04;
      const scatter = (Math.random() - 0.5) * (8 + dist * 0.12);
      pos[i * 3] = Math.cos(spiralAngle) * dist + scatter;
      pos[i * 3 + 1] = (Math.random() - 0.5) * (2 + dist * 0.015);
      pos[i * 3 + 2] = Math.sin(spiralAngle) * dist + scatter;
      const c = armColors[arm];
      const mix = Math.min(1, (i / count) * 2);
      colors[i * 3] = c[0] * mix + (1 - mix);
      colors[i * 3 + 1] = c[1] * mix + (1 - mix) * 0.9;
      colors[i * 3 + 2] = c[2] * mix + (1 - mix);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.8, transparent: true, opacity: 0.25, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.galaxy = new THREE.Points(geo, mat);
    this.galaxy.position.set(-250, -220, -900);
    this.galaxy.rotation.x = 0.8;
    this.scene.add(this.galaxy);
  }

  createAsteroids() {
    const count = 40;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.asteroidVels = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2000;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 1000;
      pos[i * 3 + 2] = -200 - Math.random() * 800;
      this.asteroidVels.push({ x: 0.08 + Math.random() * 0.06, y: -0.02 - Math.random() * 0.02 });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x667788, size: 1.2, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.asteroids = new THREE.Points(geo, mat);
    this.scene.add(this.asteroids);
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.clearAlpha = 0;
    this.composer.addPass(renderPass);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height), 1.3, 0.9, 0.3
    );
    this.composer.addPass(this.bloomPass);
  }

  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }

  animate() {
    requestAnimationFrame(() => this.animate());
    const t = this.clock.getElapsedTime();
    // Stars twinkle
    this.starLayers.forEach(l => {
      l.points.material.opacity = l.config.opacity * (0.7 + Math.sin(t * 0.4 + l.phase) * 0.3);
    });
    // Nebulae breathe
    this.nebulae.forEach(n => {
      n.sprite.material.opacity = n.baseOpacity * (0.8 + Math.sin(t * 0.15 + n.phase) * 0.2);
    });
    // Galaxy rotates
    this.galaxy.rotation.y += 0.0005;
    // Asteroids drift
    const aPos = this.asteroids.geometry.attributes.position.array;
    for (let i = 0; i < this.asteroidVels.length; i++) {
      aPos[i * 3] += this.asteroidVels[i].x;
      aPos[i * 3 + 1] += this.asteroidVels[i].y;
      if (aPos[i * 3] > 1000) aPos[i * 3] = -1000;
    }
    this.asteroids.geometry.attributes.position.needsUpdate = true;
    // Bloom reacts to load
    this.bloomPass.strength = 1.1 + this.intensity * 0.5;
    this.composer.render();
  }
}

// ─── Planet Gauge Row: 7 canvas planet orbitals ───
const PLANET_CONFIGS = [
  { name: 'mars',    body: ['#D4854A', '#6B3410'], ring: '#D4854A', type: 'craters' },
  { name: 'giant',   body: ['#4A6FA5', '#5B4B8A'], ring: '#7B6BAE', type: 'bands' },
  { name: 'saturn',  body: ['#2BBCB3', '#186B66'], ring: '#2BBCB3', type: 'ringed' },
  { name: 'lava',    body: ['#8B4513', '#FF4500'], ring: '#FF6347', type: 'lava' },
  { name: 'ice',     body: ['#B0E0E6', '#4682B4'], ring: '#87CEEB', type: 'ice' },
  { name: 'sun',     body: ['#FFF8DC', '#FF8C00'], ring: '#FFD700', type: 'sun' },
  { name: 'binary',  body: ['#FFF0E0', '#FFA07A'], ring: '#FFA07A', type: 'binary' },
];

class PlanetGaugeRow {
  constructor() {
    this.gauges = [];
    this.time = 0;
    for (let i = 0; i < 7; i++) {
      const canvas = document.getElementById(`planet-${i}`);
      const ctx = canvas.getContext('2d');
      this.gauges.push({ canvas, ctx, config: PLANET_CONFIGS[i], value: 0 });
    }
    this._animate();
  }

  setValue(index, value01) {
    if (this.gauges[index]) this.gauges[index].value = Math.max(0, Math.min(1, value01));
  }

  setDisplay(index, text) {
    const el = document.getElementById(`pv-${index}`);
    if (!el) return;
    const old = el.textContent;
    el.textContent = text;
    if (old !== text && old !== '--') {
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 300);
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.time += 0.016;
    this.gauges.forEach(g => this._drawGauge(g));
  }

  _drawGauge(g) {
    const { ctx, canvas, config, value } = g;
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2 - 8;
    const r = 28;
    ctx.clearRect(0, 0, w, h);

    // Draw planet body
    this._drawPlanet(ctx, cx, cy, r, config, value);

    // Draw orbital ring
    this._drawOrbitalRing(ctx, cx, cy + 6, 52, 15, value, config.ring);
  }

  _drawPlanet(ctx, cx, cy, r, cfg, value) {
    ctx.save();
    // Planet shadow/atmosphere
    const atmo = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.4);
    atmo.addColorStop(0, 'rgba(0,0,0,0)');
    atmo.addColorStop(0.7, `${cfg.body[1]}22`);
    atmo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = atmo;
    ctx.fillRect(cx - r * 1.5, cy - r * 1.5, r * 3, r * 3);

    // Clip to circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // Base body gradient (light from upper-left)
    let bodyColor0 = cfg.body[0], bodyColor1 = cfg.body[1];
    if (cfg.type === 'lava') {
      const t = value;
      const r1 = Math.round(139 + t * 116), g1 = Math.round(69 + t * 0), b1 = Math.round(19 + t * 50);
      bodyColor0 = `rgb(${r1},${g1},${b1})`;
    }
    if (cfg.type === 'ice') {
      const t = value;
      const r1 = Math.round(176 + t * 45), g1 = Math.round(224 - t * 60), b1 = Math.round(230 - t * 80);
      bodyColor0 = `rgb(${r1},${g1},${b1})`;
    }

    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    grad.addColorStop(0, bodyColor0);
    grad.addColorStop(1, bodyColor1);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // Type-specific features
    const rand = seededRandom(42 + PLANET_CONFIGS.indexOf(cfg) * 100);
    if (cfg.type === 'craters') {
      for (let i = 0; i < 12; i++) {
        const ox = (rand() - 0.5) * r * 1.6, oy = (rand() - 0.5) * r * 1.6;
        const cr = 1.5 + rand() * 3;
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, cr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(60, 30, 10, ${0.2 + rand() * 0.2})`;
        ctx.fill();
      }
    }
    if (cfg.type === 'bands') {
      for (let y = -r; y < r; y += 6) {
        const bandAlpha = 0.08 + Math.abs(Math.sin(y * 0.15)) * 0.1;
        ctx.fillStyle = `rgba(90, 70, 140, ${bandAlpha})`;
        ctx.fillRect(cx - r, cy + y, r * 2, 3);
      }
    }
    if (cfg.type === 'lava') {
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + (rand() - 0.5) * r, cy + (rand() - 0.5) * r);
        ctx.lineTo(cx + (rand() - 0.5) * r, cy + (rand() - 0.5) * r);
        ctx.strokeStyle = `rgba(255, ${150 + rand() * 100}, 0, ${0.3 + value * 0.4})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    if (cfg.type === 'ice') {
      for (let i = 0; i < 8; i++) {
        const ox = (rand() - 0.5) * r * 1.4, oy = (rand() - 0.5) * r * 1.4;
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, 2 + rand() * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + rand() * 0.15})`;
        ctx.fill();
      }
    }
    if (cfg.type === 'sun') {
      // Corona rays
      const coronaScale = 0.5 + value * 0.5;
      for (let a = 0; a < Math.PI * 2; a += 0.3) {
        const rayLen = r * (0.3 + rand() * 0.4) * coronaScale;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a + this.time * 0.2) * r * 0.7, cy + Math.sin(a + this.time * 0.2) * r * 0.7);
        ctx.lineTo(cx + Math.cos(a + this.time * 0.2) * (r + rayLen), cy + Math.sin(a + this.time * 0.2) * (r + rayLen));
        ctx.strokeStyle = `rgba(255, 220, 100, ${0.15 * coronaScale})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.restore();

    // Saturn decorative ring (separate from progress ring)
    if (cfg.type === 'ringed') {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.5, r * 0.25, -0.15, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(43, 188, 179, 0.25)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    // Binary star: draw second star
    if (cfg.type === 'binary') {
      ctx.save();
      const offset = 12;
      const r2 = r * 0.65;
      const grad2 = ctx.createRadialGradient(cx + offset, cy - 4, r2 * 0.2, cx + offset, cy - 4, r2);
      grad2.addColorStop(0, '#FFF8F0');
      grad2.addColorStop(0.5, '#FFD090');
      grad2.addColorStop(1, 'rgba(255,160,100,0)');
      ctx.beginPath();
      ctx.arc(cx + offset, cy - 4, r2, 0, Math.PI * 2);
      ctx.fillStyle = grad2;
      ctx.fill();
      ctx.restore();
    }

    // Sun/binary: outer glow
    if (cfg.type === 'sun' || cfg.type === 'binary') {
      const glowR = r * (1.6 + value * 0.4);
      const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, glowR);
      glow.addColorStop(0, `rgba(255, 215, 0, ${0.1 + value * 0.1})`);
      glow.addColorStop(0.5, `rgba(255, 180, 60, ${0.04 + value * 0.04})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawOrbitalRing(ctx, cx, cy, a, b, value01, color) {
    // Background ring (dim)
    ctx.beginPath();
    ctx.ellipse(cx, cy, a, b, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Filled arc
    if (value01 > 0.001) {
      const angle = value01 * Math.PI * 2;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, a, b, 0, -Math.PI / 2, -Math.PI / 2 + angle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.stroke();
      // Bright tip
      const tipAngle = -Math.PI / 2 + angle;
      const tipX = cx + a * Math.cos(tipAngle);
      const tipY = cy + b * Math.sin(tipAngle);
      ctx.beginPath();
      ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();
    }
  }
}

// ─── Constellation Grid (CPU Cores) ───
class ConstellationGrid {
  constructor(canvasId, coreCount) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.coreCount = coreCount;
    this.coreLoads = new Array(coreCount).fill(0);
    const rand = seededRandom(777);
    const cols = 8, rows = Math.ceil(coreCount / cols);
    const xStep = this.canvas.width / (cols + 1);
    const yStep = this.canvas.height / (rows + 1);
    this.nodes = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.nodes.length >= coreCount) break;
        this.nodes.push({
          x: (c + 1) * xStep + (rand() - 0.5) * xStep * 0.35,
          y: (r + 1) * yStep + (rand() - 0.5) * yStep * 0.3,
        });
      }
    }
    // Generate constellation connections (sparse)
    this.connections = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx >= coreCount) break;
        if (c < cols - 1 && idx + 1 < coreCount && rand() > 0.25)
          this.connections.push([idx, idx + 1]);
        if (r < rows - 1 && idx + cols < coreCount && rand() > 0.45)
          this.connections.push([idx, idx + cols]);
      }
    }
  }

  update(usagePercent) {
    const base = usagePercent / 100;
    for (let i = 0; i < this.coreCount; i++) {
      this.coreLoads[i] = Math.min(1, Math.max(0, base + (Math.random() - 0.5) * 0.3));
    }
    this.draw();
  }

  draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Constellation lines
    ctx.lineWidth = 0.8;
    this.connections.forEach(([a, b]) => {
      const avgLoad = (this.coreLoads[a] + this.coreLoads[b]) / 2;
      ctx.beginPath();
      ctx.moveTo(this.nodes[a].x, this.nodes[a].y);
      ctx.lineTo(this.nodes[b].x, this.nodes[b].y);
      ctx.strokeStyle = `rgba(200, 210, 230, ${0.05 + avgLoad * 0.12})`;
      ctx.stroke();
    });

    // Star nodes
    this.nodes.forEach((node, i) => {
      const load = this.coreLoads[i];
      const radius = 2 + load * 4;
      let color;
      if (load < 0.25) color = '#C8D0E0'; // white dwarf
      else if (load < 0.5) color = '#FFD700'; // main sequence yellow
      else if (load < 0.75) color = '#4169E1'; // blue giant
      else color = '#FF4500'; // red supergiant

      ctx.save();
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.4 + load * 0.6;
      ctx.shadowColor = color;
      ctx.shadowBlur = radius * 3;
      ctx.fill();
      ctx.restore();
    });
  }
}

// ─── Planetary Ring Viz (Memory) ───
class PlanetaryRingViz {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.data = { percent: 0, swapPercent: 0, loadavg: [0, 0, 0] };
  }

  update(memData) {
    this.data.percent = memData.percent / 100;
    this.data.swapPercent = (memData.swapTotal > 0 ? memData.swapUsed / memData.swapTotal : 0);
    const loads = (memData.loadavg || '0 0 0').split(' ').map(Number);
    this.data.loadavg = loads;
    this.draw();
  }

  draw() {
    const { ctx, canvas, data } = this;
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    // Planet body (small)
    const planetR = 14;
    const grad = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, planetR);
    grad.addColorStop(0, '#6B5B95');
    grad.addColorStop(1, '#3A2D5C');
    ctx.beginPath();
    ctx.arc(cx, cy, planetR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Main ring (RAM) — top-down ellipse
    const ringA = 70, ringB = 18;
    // Background ring
    ctx.beginPath();
    ctx.ellipse(cx, cy, ringA, ringB, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(139, 107, 174, 0.1)';
    ctx.lineWidth = 8;
    ctx.stroke();
    // Used portion (bright)
    const usedAngle = data.percent * Math.PI * 2;
    if (usedAngle > 0.01) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, ringA, ringB, 0, -Math.PI / 2, -Math.PI / 2 + usedAngle);
      ctx.strokeStyle = '#8B6BAE';
      ctx.lineWidth = 8;
      ctx.shadowColor = '#8B6BAE';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Swap ring (inner, smaller)
    const swapA = 45, swapB = 11;
    ctx.beginPath();
    ctx.ellipse(cx, cy, swapA, swapB, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.08)';
    ctx.lineWidth = 4;
    ctx.stroke();
    const swapAngle = data.swapPercent * Math.PI * 2;
    if (swapAngle > 0.01) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, swapA, swapB, 0, -Math.PI / 2, -Math.PI / 2 + swapAngle);
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Load average moons (3 dots at varying distances)
    const moonAngles = [-0.8, 0.3, 1.4];
    const moonDists = [90, 82, 96];
    data.loadavg.forEach((load, i) => {
      const mx = cx + Math.cos(moonAngles[i]) * moonDists[i];
      const my = cy + Math.sin(moonAngles[i]) * (moonDists[i] * 0.25);
      const mr = 3 + Math.min(load, 10) * 0.3;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 210, 230, ${0.4 + Math.min(load / 10, 1) * 0.5})`;
      ctx.shadowColor = '#C8D0E0';
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.shadowBlur = 0;
      // Label
      ctx.fillStyle = `rgba(200, 210, 230, 0.5)`;
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(load.toFixed(1), mx, my + mr + 9);
    });
  }
}

// ─── Accretion Disk (GPU VRAM) ───
class AccretionDisk {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.value = 0;
    this.rotation = 0;
  }

  update(used, total) {
    this.value = total > 0 ? used / total : 0;
    this.draw();
  }

  draw() {
    const { ctx, canvas, value } = this;
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    this.rotation += 0.01;

    // Event horizon glow
    const ehGlow = ctx.createRadialGradient(cx, cy, 8, cx, cy, 55);
    ehGlow.addColorStop(0, 'rgba(0, 0, 0, 0)');
    ehGlow.addColorStop(0.3, `rgba(255, 150, 50, ${0.08 + value * 0.12})`);
    ehGlow.addColorStop(0.6, `rgba(255, 100, 30, ${0.04 + value * 0.06})`);
    ehGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ehGlow;
    ctx.fillRect(0, 0, w, h);

    // Accretion ring background
    const ringA = 48, ringB = 14;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ringA, ringB, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 150, 80, 0.08)';
    ctx.lineWidth = 10;
    ctx.stroke();

    // Filled accretion ring
    const angle = value * Math.PI * 2;
    if (angle > 0.01) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, ringA, ringB, 0, -Math.PI / 2 + this.rotation, -Math.PI / 2 + this.rotation + angle);
      const ringGrad = ctx.createLinearGradient(cx - ringA, cy, cx + ringA, cy);
      ringGrad.addColorStop(0, '#FF8C00');
      ringGrad.addColorStop(0.5, '#FFF0D0');
      ringGrad.addColorStop(1, '#FF6347');
      ctx.strokeStyle = ringGrad;
      ctx.lineWidth = 10;
      ctx.shadowColor = '#FF8C00';
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.restore();
    }

    // Dark void center
    const voidGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
    voidGrad.addColorStop(0, 'rgba(0, 0, 5, 0.95)');
    voidGrad.addColorStop(0.6, 'rgba(0, 0, 10, 0.6)');
    voidGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fillStyle = voidGrad;
    ctx.fill();
  }
}

// ─── Wormhole Viz (Network) ───
class WormholeViz {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.historyDown = new Array(100).fill(0);
    this.historyUp = new Array(100).fill(0);
    this.maxVal = 100;
    this.time = 0;
  }

  push(down, up) {
    this.historyDown.push(down);
    this.historyUp.push(up);
    if (this.historyDown.length > 100) this.historyDown.shift();
    if (this.historyUp.length > 100) this.historyUp.shift();
    this.maxVal = Math.max(...this.historyDown, ...this.historyUp, 10) * 1.2;
    this.draw();
  }

  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    this.time += 0.02;

    // Wormhole concentric rings (background)
    for (let i = 5; i > 0; i--) {
      const scale = 0.15 + (i / 5) * 0.85;
      const rX = (w / 2 - 10) * scale;
      const rY = (h / 2 - 5) * scale;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rX, rY, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(77, 201, 246, ${0.02 + (1 - scale) * 0.06})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Star field dots in background
    const rand = seededRandom(99);
    for (let i = 0; i < 30; i++) {
      ctx.beginPath();
      ctx.arc(rand() * w, rand() * h, 0.5 + rand(), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 210, 230, ${0.1 + rand() * 0.15})`;
      ctx.fill();
    }

    // Download trace (blue-cyan)
    this._drawTrace(this.historyDown, 'rgba(77, 201, 246, 0.7)', 'rgba(77, 201, 246, 0.06)');
    // Upload trace (purple-gold)
    this._drawTrace(this.historyUp, 'rgba(139, 107, 174, 0.6)', 'rgba(139, 107, 174, 0.04)');

    // Flowing particles along the traces
    const t = this.time;
    const lastDown = this.historyDown[this.historyDown.length - 1] || 0;
    const lastUp = this.historyUp[this.historyUp.length - 1] || 0;
    const numParticles = Math.min(8, Math.ceil(lastDown / (this.maxVal * 0.1)));
    for (let i = 0; i < numParticles; i++) {
      const px = ((t * 80 + i * 40) % w);
      const py = cy + Math.sin(t * 2 + i) * 8;
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(77, 201, 246, 0.5)';
      ctx.fill();
    }
    const numUp = Math.min(5, Math.ceil(lastUp / (this.maxVal * 0.1)));
    for (let i = 0; i < numUp; i++) {
      const px = w - ((t * 60 + i * 35) % w);
      const py = cy + Math.sin(t * 2.5 + i + 3) * 6;
      ctx.beginPath();
      ctx.arc(px, py, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(139, 107, 174, 0.4)';
      ctx.fill();
    }
  }

  _drawTrace(data, strokeColor, fillColor) {
    const { ctx, canvas, maxVal } = this;
    const w = canvas.width, h = canvas.height;
    const step = w / (data.length - 1);
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * step;
      const y = h - (v / maxVal) * (h - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
}

// ─── Docker Fleet ───
class DockerFleet {
  constructor(containerId) { this.container = document.getElementById(containerId); }
  update(names) {
    this.container.innerHTML = names.map(n =>
      `<div class="fleet-ship"><span class="ship-light"></span><span class="ship-callsign">${n}</span></div>`
    ).join('');
  }
}

// ─── Crew Manifest (Processes) ───
class CrewManifest {
  constructor(containerId) { this.container = document.getElementById(containerId); }
  update(procs) {
    this.container.innerHTML = procs.map(p => {
      if (!p.name) return '';
      const pct = parseFloat(p.cpu) || 0;
      const width = Math.min(100, pct * 5);
      return `<div class="crew-entry">
        <span class="crew-name">${p.name}</span>
        <div class="crew-thrust"><div class="crew-thrust-fill" style="width:${width}%"></div></div>
        <span class="crew-pct">${p.cpu}%</span>
      </div>`;
    }).filter(Boolean).join('');
  }
}

// ─── Uptime to MET format ───
function uptimeToMET(str) {
  if (!str || str === 'N/A') return 'T+00:00:00';
  let d = 0, h = 0, m = 0;
  const dm = str.match(/(\d+)\s*day/);
  const hm = str.match(/(\d+)\s*hour/);
  const mm = str.match(/(\d+)\s*minute/);
  if (dm) d = parseInt(dm[1]);
  if (hm) h = parseInt(hm[1]);
  if (mm) m = parseInt(mm[1]);
  return `T+${String(d * 24 + h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

// ─── Main App ───
class HoloStatsApp {
  constructor() {
    this.bg = new BackgroundScene();
    this.glitchEl = document.getElementById('glitch-flash');
    this.planetGauges = new PlanetGaugeRow();
    this.constellation = new ConstellationGrid('constellation-grid', 32);
    this.ringViz = new PlanetaryRingViz('ring-viz');
    this.accretionDisk = new AccretionDisk('accretion-disk');
    this.wormhole = new WormholeViz('wormhole-viz');
    this.fleet = new DockerFleet('docker-fleet');
    this.manifest = new CrewManifest('crew-manifest');

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
      diskRead: document.getElementById('stat-disk-read'),
      diskWrite: document.getElementById('stat-disk-write'),
      gpuRegistry: document.getElementById('stat-gpu-registry'),
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

    window.updateStats = (jsonStr) => {
      try {
        const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        this.updateGauges(data);
        this.updatePanels(data);
        this.updateWidgets(data);
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
    setTimeout(() => {
      if (this.glitchEl) {
        this.glitchEl.classList.add('active');
        setTimeout(() => this.glitchEl.classList.remove('active'), 180);
      }
      this.scheduleGlitch();
    }, 6000 + Math.random() * 15000);
  }

  updateTime() {
    const now = new Date();
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    if (this.el.time) this.el.time.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
    if (this.el.date) this.el.date.textContent = `STARDATE ${days[now.getDay()]} ${String(now.getDate()).padStart(2, '0')}.${months[now.getMonth()]}.${now.getFullYear()}`;
  }

  updateGauges(s) {
    const cpuTempNum = parseFloat(String(s.cpu.temp).replace(/[^0-9.]/g, '')) || 0;
    const cpuPwrLimit = s.cpu.powerLimit || 170;
    const gpuPwrLimit = s.gpu.powerLimit || 600;
    const values = [
      s.cpu.usage / 100, s.memory.percent / 100, s.gpu.usage / 100,
      cpuTempNum / 100, s.gpu.temp / 100,
      s.cpu.power / cpuPwrLimit, s.gpu.power / gpuPwrLimit,
    ];
    const displays = [
      `${s.cpu.usage}`, `${s.memory.percent}`, `${s.gpu.usage}`,
      `${Math.round(cpuTempNum)}`, `${s.gpu.temp}`,
      `${s.cpu.power}`, `${s.gpu.power.toFixed(0)}`,
    ];
    values.forEach((v, i) => {
      this.planetGauges.setValue(i, v);
      this.planetGauges.setDisplay(i, displays[i]);
    });
  }

  updatePanels(s) {
    const el = this.el;
    const fmt = (bytes) => {
      if (bytes > 1e12) return (bytes / 1e12).toFixed(1) + ' TiB';
      if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GiB';
      if (bytes > 1e6) return (bytes / 1e6).toFixed(0) + ' MiB';
      return (bytes / 1024).toFixed(0) + ' KiB';
    };
    const setRow = (elem, label, val, cls) => {
      if (!elem) return;
      elem.innerHTML = `<span class="lbl">${label}</span><span class="val ${cls || ''}">${val}</span>`;
    };

    // CPU
    setRow(el.cpuModel, 'MODEL', s.cpu.model);
    setRow(el.cpuLoad, 'LOAD', `${s.cpu.usage}%`, 'val-cyan');
    setRow(el.cpuFreq, 'IMPULSE', `${s.cpu.freq} GHz`, 'val-gold');
    setRow(el.cpuTemp, 'THERMAL', s.cpu.temp, 'val-orange');

    // Memory
    setRow(el.ram, 'RAM', `${fmt(s.memory.used)} / ${fmt(s.memory.total)}`);
    setRow(el.ramPct, 'USED', `${s.memory.percent}%`, 'val-purple');
    setRow(el.ramFree, 'FREE', fmt(s.memory.free), 'val-cyan');
    setRow(el.swap, 'SWAP', `${fmt(s.memory.swapUsed)} / ${fmt(s.memory.swapTotal)}`);
    setRow(el.loadavg, 'LOAD', s.system.loadavg);

    // Storage cargo bays
    const updateCargo = (id, data) => {
      const el = document.getElementById(id);
      if (!el) return;
      const fill = el.querySelector('.cargo-fill');
      const text = el.querySelector('.cargo-text');
      if (fill) fill.style.width = `${data.percent}%`;
      if (text) text.textContent = `${data.percent}%`;
      // Color shift at high usage
      if (fill && data.percent > 80) {
        fill.style.background = `linear-gradient(90deg, #FF6347, #FF8C00)`;
      } else if (fill && data.percent > 60) {
        fill.style.background = `linear-gradient(90deg, #FFD700, #FFA07A)`;
      }
    };
    updateCargo('cargo-root', s.storage.root);
    updateCargo('cargo-home', s.storage.home);
    updateCargo('cargo-cave', s.storage.cave);

    // Comet trails for disk I/O
    if (s.diskIO) {
      const maxIO = 50000;
      const readEl = document.querySelector('#stat-disk-read');
      const writeEl = document.querySelector('#stat-disk-write');
      if (readEl) {
        const head = readEl.querySelector('.comet-head');
        const val = readEl.querySelector('.val');
        if (head) head.style.width = `${Math.min(100, (s.diskIO.read / maxIO) * 100)}%`;
        if (val) { val.textContent = `${s.diskIO.read} KiB/s`; val.className = 'val val-cyan'; }
      }
      if (writeEl) {
        const head = writeEl.querySelector('.comet-head');
        const val = writeEl.querySelector('.val');
        if (head) head.style.width = `${Math.min(100, (s.diskIO.write / maxIO) * 100)}%`;
        if (val) { val.textContent = `${s.diskIO.write} KiB/s`; val.className = 'val val-orange'; }
      }
    }

    // GPU
    setRow(el.gpuRegistry, 'REGISTRY', `${s.gpu.name} // FW:${s.gpu.driver}`);
    setRow(el.gpuUsage, 'THROTTLE', `${s.gpu.usage}%`, 'val-cyan');
    setRow(el.gpuTemp, 'THERMAL', `${s.gpu.temp}°C`, 'val-orange');
    setRow(el.gpuFan, 'THRUSTER', `${s.gpu.fan}%`);
    if (el.vramText) el.vramText.textContent = `VRAM: ${s.gpu.vramUsed} / ${s.gpu.vramTotal} MiB`;

    // Network
    setRow(el.netIp, 'COORD', s.network.ip);
    setRow(el.netType, 'LINK', s.network.type);
    setRow(el.netDown, 'DOWNLINK', `${s.network.down} KiB/s`, 'val-cyan');
    setRow(el.netUp, 'UPLINK', `${s.network.up} KiB/s`, 'val-purple');

    // Docker
    setRow(el.dockerActive, 'FLEET', `${s.docker.count} vessels`, 'val-green');

    // Top bar
    if (el.met) el.met.textContent = uptimeToMET(s.system.uptime);
    if (el.netStatus) {
      el.netStatus.textContent = s.network.type;
      el.netStatus.style.color = s.network.type === 'Disconnected' ? '#FF6347' : '#00FF88';
    }
  }

  updateWidgets(s) {
    this.constellation.update(s.cpu.usage);
    this.ringViz.update({ ...s.memory, loadavg: s.system.loadavg });
    this.accretionDisk.update(s.gpu.vramUsed, s.gpu.vramTotal);
    this.wormhole.push(s.network.down, s.network.up);
    this.fleet.update(s.docker.names || []);
    this.manifest.update(s.cpu.top || []);
  }
}

document.addEventListener('DOMContentLoaded', () => new HoloStatsApp());
