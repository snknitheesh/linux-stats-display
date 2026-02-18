import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ─── Seeded random for deterministic layouts ───
function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ─── Day/Night cycle: returns 0 (midnight) → 0.5 (noon) → 1 (midnight) ───
function getDayPhase() {
  const now = new Date();
  return (now.getHours() * 60 + now.getMinutes()) / 1440;
}

function dayNightColor(phase) {
  // 0=midnight(dark blue-green), 0.25=dawn(amber), 0.5=noon(warm green), 0.75=dusk(purple)
  const angle = phase * Math.PI * 2;
  const dayLight = Math.max(0, Math.sin(angle - Math.PI * 0.5)); // 0 at midnight, 1 at noon
  const r = 0.04 + dayLight * 0.08;
  const g = 0.08 + dayLight * 0.12;
  const b = 0.04 + dayLight * 0.04;
  return { r, g, b, dayLight };
}

// ─── Background Scene: Forest canopy with fireflies, pollen, god-rays ───
class BackgroundScene {
  constructor() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.clock = new THREE.Clock();
    this.intensity = 0;

    this.scene = new THREE.Scene();
    const aspect = this.width / this.height;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 1, 5000);
    this.camera.position.set(0, 30, 400);
    this.camera.lookAt(0, 0, -100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    document.getElementById('canvas-container').appendChild(this.renderer.domElement);

    this.createFireflies();
    this.createPollen();
    this.createLeaves();
    this.createGodRays();
    this.createMossGround();
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

  createFireflies() {
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.fireflyData = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 800;
      pos[i * 3 + 1] = Math.random() * 300 - 50;
      pos[i * 3 + 2] = -Math.random() * 600 - 50;
      this.fireflyData.push({
        baseX: pos[i * 3], baseY: pos[i * 3 + 1], baseZ: pos[i * 3 + 2],
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.8,
        radius: 5 + Math.random() * 20,
        blinkSpeed: 0.5 + Math.random() * 2,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xCCFF44, size: 3.0, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.fireflies = new THREE.Points(geo, mat);
    this.scene.add(this.fireflies);
  }

  createPollen() {
    const count = 200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.pollenData = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1200;
      pos[i * 3 + 1] = Math.random() * 400 - 100;
      pos[i * 3 + 2] = -Math.random() * 800;
      this.pollenData.push({
        vy: -0.02 - Math.random() * 0.05,
        vx: (Math.random() - 0.5) * 0.1,
        phase: Math.random() * Math.PI * 2,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xFFEEAA, size: 1.2, transparent: true, opacity: 0.25,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.pollen = new THREE.Points(geo, mat);
    this.scene.add(this.pollen);
  }

  createLeaves() {
    const count = 60;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this.leafData = [];
    const leafColors = [[0.3, 0.6, 0.2], [0.5, 0.7, 0.15], [0.7, 0.5, 0.1], [0.8, 0.3, 0.1]];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1000;
      pos[i * 3 + 1] = 200 + Math.random() * 200;
      pos[i * 3 + 2] = -100 - Math.random() * 500;
      const c = leafColors[i % leafColors.length];
      colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
      this.leafData.push({
        vy: -0.15 - Math.random() * 0.2,
        vx: (Math.random() - 0.5) * 0.3,
        spin: Math.random() * 0.02,
        phase: Math.random() * Math.PI * 2,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 3.5, transparent: true, opacity: 0.2, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.leaves = new THREE.Points(geo, mat);
    this.scene.add(this.leaves);
  }

  createGodRays() {
    this.godRays = [];
    const rayTex = (() => {
      const c = document.createElement('canvas');
      c.width = 32; c.height = 256;
      const ctx = c.getContext('2d');
      const grad = ctx.createLinearGradient(16, 0, 16, 256);
      grad.addColorStop(0, 'rgba(255, 240, 180, 0.15)');
      grad.addColorStop(0.5, 'rgba(255, 240, 180, 0.04)');
      grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 256);
      return new THREE.CanvasTexture(c);
    })();

    for (let i = 0; i < 5; i++) {
      const mat = new THREE.SpriteMaterial({
        map: rayTex, transparent: true, opacity: 0.06,
        blending: THREE.AdditiveBlending, depthWrite: false,
        rotation: -0.15 + (Math.random() - 0.5) * 0.3,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(-300 + i * 150 + (Math.random() - 0.5) * 60, 250, -200 - Math.random() * 300);
      sprite.scale.set(40 + Math.random() * 30, 500, 1);
      this.scene.add(sprite);
      this.godRays.push({ sprite, baseOpacity: 0.04 + Math.random() * 0.04, phase: Math.random() * Math.PI * 2 });
    }
  }

  createMossGround() {
    // Ground plane particles (forest floor)
    const count = 300;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1200;
      pos[i * 3 + 1] = -80 + Math.random() * 20;
      pos[i * 3 + 2] = -Math.random() * 600 - 50;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x2A4A2A, size: 4, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.ground = new THREE.Points(geo, mat);
    this.scene.add(this.ground);
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.clearAlpha = 0;
    this.composer.addPass(renderPass);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height), 1.0, 1.2, 0.4
    );
    this.composer.addPass(this.bloomPass);
  }

  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }

  animate() {
    requestAnimationFrame(() => this.animate());
    const t = this.clock.getElapsedTime();
    const dayColor = dayNightColor(getDayPhase());

    // Fireflies drift and blink
    const ffPos = this.fireflies.geometry.attributes.position.array;
    this.fireflyData.forEach((fd, i) => {
      ffPos[i * 3] = fd.baseX + Math.sin(t * fd.speed + fd.phase) * fd.radius;
      ffPos[i * 3 + 1] = fd.baseY + Math.cos(t * fd.speed * 0.7 + fd.phase) * fd.radius * 0.6;
      ffPos[i * 3 + 2] = fd.baseZ + Math.sin(t * fd.speed * 0.5 + fd.phase * 2) * fd.radius * 0.3;
    });
    this.fireflies.geometry.attributes.position.needsUpdate = true;
    // Fireflies glow more at night
    const nightFactor = 1 - dayColor.dayLight;
    this.fireflies.material.opacity = 0.15 + nightFactor * 0.6;
    this.fireflies.material.size = 2 + nightFactor * 2.5;

    // Pollen drifts
    const pPos = this.pollen.geometry.attributes.position.array;
    this.pollenData.forEach((pd, i) => {
      pPos[i * 3] += pd.vx + Math.sin(t * 0.3 + pd.phase) * 0.02;
      pPos[i * 3 + 1] += pd.vy;
      if (pPos[i * 3 + 1] < -100) { pPos[i * 3 + 1] = 350; pPos[i * 3] = (Math.random() - 0.5) * 1200; }
    });
    this.pollen.geometry.attributes.position.needsUpdate = true;
    this.pollen.material.opacity = 0.1 + dayColor.dayLight * 0.2;

    // Leaves fall
    const lPos = this.leaves.geometry.attributes.position.array;
    this.leafData.forEach((ld, i) => {
      lPos[i * 3] += ld.vx + Math.sin(t + ld.phase) * 0.15;
      lPos[i * 3 + 1] += ld.vy;
      if (lPos[i * 3 + 1] < -100) { lPos[i * 3 + 1] = 300 + Math.random() * 100; lPos[i * 3] = (Math.random() - 0.5) * 1000; }
    });
    this.leaves.geometry.attributes.position.needsUpdate = true;

    // God rays breathe and shift with day/night
    this.godRays.forEach(ray => {
      ray.sprite.material.opacity = ray.baseOpacity * dayColor.dayLight * (0.6 + Math.sin(t * 0.2 + ray.phase) * 0.4);
    });

    // Bloom responds to system load + day phase
    this.bloomPass.strength = 0.8 + this.intensity * 0.4 + dayColor.dayLight * 0.3;
    this.composer.render();
  }
}

// ─── Tree Canopy Gauges: 7 tree types ───
const TREE_CONFIGS = [
  { name: 'oak',       trunk: '#5c3d2e', canopy: ['#2d5a2d', '#4a8a3a'], ring: '#6abf4b', type: 'oak' },
  { name: 'willow',    trunk: '#4a3828', canopy: ['#3a6830', '#7aaa50'], ring: '#7aaa50', type: 'willow' },
  { name: 'cherry',    trunk: '#6b4535', canopy: ['#c06080', '#ffaacc'], ring: '#ff88aa', type: 'cherry' },
  { name: 'maple',     trunk: '#5a3525', canopy: ['#cc4400', '#ff8800'], ring: '#ff6600', type: 'maple' },
  { name: 'birch',     trunk: '#d4ccc0', canopy: ['#88bb44', '#ccdd88'], ring: '#aacc55', type: 'birch' },
  { name: 'sunflower', trunk: '#5a6a30', canopy: ['#ffcc00', '#ff9900'], ring: '#FFD700', type: 'sunflower' },
  { name: 'mushroom',  trunk: '#8a7a6a', canopy: ['#6644aa', '#aa66ff'], ring: '#bb88ff', type: 'mushroom' },
];

class TreeGaugeRow {
  constructor() {
    this.gauges = [];
    this.time = 0;
    for (let i = 0; i < 7; i++) {
      const canvas = document.getElementById(`tree-${i}`);
      const ctx = canvas.getContext('2d');
      this.gauges.push({ canvas, ctx, config: TREE_CONFIGS[i], value: 0 });
    }
    this._animate();
  }

  setValue(index, value01) {
    if (this.gauges[index]) this.gauges[index].value = Math.max(0, Math.min(1, value01));
  }

  setDisplay(index, text) {
    const el = document.getElementById(`tv-${index}`);
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
    ctx.clearRect(0, 0, w, h);

    // Draw tree
    this._drawTree(ctx, cx, cy, config, value);

    // Draw vine progress ring
    this._drawVineRing(ctx, cx, cy + 6, 52, 15, value, config.ring);
  }

  _drawTree(ctx, cx, cy, cfg, value) {
    const rand = seededRandom(42 + TREE_CONFIGS.indexOf(cfg) * 100);
    ctx.save();

    // Trunk
    const trunkW = cfg.type === 'birch' ? 6 : (cfg.type === 'sunflower' ? 4 : 8);
    const trunkH = cfg.type === 'sunflower' ? 30 : 25;
    const trunkGrad = ctx.createLinearGradient(cx, cy + 20, cx, cy - 5);
    trunkGrad.addColorStop(0, cfg.trunk);
    trunkGrad.addColorStop(1, cfg.type === 'birch' ? '#eee8e0' : cfg.trunk);
    ctx.fillStyle = trunkGrad;
    ctx.fillRect(cx - trunkW / 2, cy - 5, trunkW, trunkH);

    // Birch markings
    if (cfg.type === 'birch') {
      for (let i = 0; i < 4; i++) {
        const my = cy + rand() * 20;
        ctx.fillStyle = 'rgba(60, 50, 40, 0.3)';
        ctx.fillRect(cx - 2, my, 4, 1.5);
      }
    }

    // Canopy/crown
    const canopyR = cfg.type === 'sunflower' ? 18 : (cfg.type === 'mushroom' ? 20 : 22);
    const canopyY = cy - 12;

    if (cfg.type === 'mushroom') {
      // Mushroom cap: dome shape
      const capGrad = ctx.createRadialGradient(cx - 3, canopyY - 5, 2, cx, canopyY, canopyR);
      capGrad.addColorStop(0, cfg.canopy[1]);
      capGrad.addColorStop(1, cfg.canopy[0]);
      ctx.beginPath();
      ctx.ellipse(cx, canopyY + 2, canopyR, canopyR * 0.7, 0, Math.PI, 0);
      ctx.fillStyle = capGrad;
      ctx.fill();
      // Bioluminescent spots
      const spotGlow = 0.3 + value * 0.7;
      for (let i = 0; i < 6; i++) {
        const sx = cx + (rand() - 0.5) * canopyR * 1.4;
        const sy = canopyY - rand() * canopyR * 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 2 + rand() * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 180, 255, ${spotGlow * (0.3 + rand() * 0.4)})`;
        ctx.shadowColor = '#bb88ff';
        ctx.shadowBlur = 6 * spotGlow;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    } else if (cfg.type === 'sunflower') {
      // Sunflower: center disc + petals
      const petalCount = 12;
      const petalLen = 14 + value * 4;
      for (let i = 0; i < petalCount; i++) {
        const a = (i / petalCount) * Math.PI * 2 + this.time * 0.1;
        const px = cx + Math.cos(a) * petalLen;
        const py = canopyY + Math.sin(a) * petalLen;
        ctx.beginPath();
        ctx.ellipse(px, py, 5, 3, a, 0, Math.PI * 2);
        ctx.fillStyle = cfg.canopy[0];
        ctx.fill();
      }
      // Center disc
      ctx.beginPath();
      ctx.arc(cx, canopyY, 8, 0, Math.PI * 2);
      const discGrad = ctx.createRadialGradient(cx, canopyY, 1, cx, canopyY, 8);
      discGrad.addColorStop(0, '#5a3a10');
      discGrad.addColorStop(1, '#3a2510');
      ctx.fillStyle = discGrad;
      ctx.fill();
    } else if (cfg.type === 'cherry') {
      // Cherry blossom: cluster of small blossoms
      for (let i = 0; i < 18; i++) {
        const bx = cx + (rand() - 0.5) * canopyR * 1.8;
        const by = canopyY + (rand() - 0.5) * canopyR * 1.2;
        const br = 2 + rand() * 3;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        const blossomAlpha = 0.25 + value * 0.3;
        ctx.fillStyle = `rgba(255, ${150 + rand() * 60}, ${180 + rand() * 40}, ${blossomAlpha})`;
        ctx.fill();
      }
    } else if (cfg.type === 'willow') {
      // Willow: drooping branches
      const branchCount = 8;
      for (let i = 0; i < branchCount; i++) {
        const startX = cx + (rand() - 0.5) * canopyR;
        const startY = canopyY - rand() * 8;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        const endX = startX + (rand() - 0.5) * 15;
        const endY = startY + 20 + rand() * 15;
        ctx.quadraticCurveTo(startX + (rand() - 0.5) * 10, startY + 15, endX, endY);
        ctx.strokeStyle = `rgba(90, 160, 60, ${0.2 + value * 0.2})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // Canopy base
      const canopyGrad = ctx.createRadialGradient(cx, canopyY, 3, cx, canopyY, canopyR);
      canopyGrad.addColorStop(0, cfg.canopy[1] + '88');
      canopyGrad.addColorStop(1, cfg.canopy[0] + '22');
      ctx.beginPath();
      ctx.arc(cx, canopyY, canopyR * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = canopyGrad;
      ctx.fill();
    } else {
      // Oak / Maple / Birch: round canopy
      const canopyGrad = ctx.createRadialGradient(cx - 3, canopyY - 3, 3, cx, canopyY, canopyR);
      canopyGrad.addColorStop(0, cfg.canopy[1]);
      canopyGrad.addColorStop(1, cfg.canopy[0]);
      ctx.beginPath();
      ctx.arc(cx, canopyY, canopyR, 0, Math.PI * 2);
      ctx.fillStyle = canopyGrad;
      ctx.globalAlpha = 0.5 + value * 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Leaf detail dots
      for (let i = 0; i < 10; i++) {
        const lx = cx + (rand() - 0.5) * canopyR * 1.5;
        const ly = canopyY + (rand() - 0.5) * canopyR * 1.2;
        ctx.beginPath();
        ctx.arc(lx, ly, 1.5 + rand() * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cfg.type === 'maple' ? '255, 100, 20' : '100, 200, 60'}, ${0.15 + rand() * 0.2})`;
        ctx.fill();
      }
    }

    ctx.restore();

    // Value-dependent glow halo
    if (value > 0.3) {
      const glow = ctx.createRadialGradient(cx, canopyY, canopyR * 0.3, cx, canopyY, canopyR * 1.8);
      glow.addColorStop(0, `${cfg.ring}${Math.round(value * 25).toString(16).padStart(2, '0')}`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, canopyY, canopyR * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawVineRing(ctx, cx, cy, a, b, value01, color) {
    // Background ring (dim)
    ctx.beginPath();
    ctx.ellipse(cx, cy, a, b, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100, 180, 60, 0.06)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Filled vine arc
    if (value01 > 0.001) {
      const angle = value01 * Math.PI * 2;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, a, b, 0, -Math.PI / 2, -Math.PI / 2 + angle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.stroke();
      // Leaf tip
      const tipAngle = -Math.PI / 2 + angle;
      const tipX = cx + a * Math.cos(tipAngle);
      const tipY = cy + b * Math.sin(tipAngle);
      ctx.beginPath();
      ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ddffa0';
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.restore();
    }
  }
}

// ─── Garden Grid (CPU Cores) ───
class GardenGrid {
  constructor(canvasId, coreCount) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.coreCount = coreCount;
    this.coreLoads = new Array(coreCount).fill(0);
    const rand = seededRandom(777);
    const cols = 8, rows = Math.ceil(coreCount / cols);
    const xStep = this.canvas.width / (cols + 1);
    const yStep = this.canvas.height / (rows + 1);
    this.plots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.plots.length >= coreCount) break;
        this.plots.push({
          x: (c + 1) * xStep,
          y: (r + 1) * yStep,
          w: xStep * 0.7,
          h: yStep * 0.65,
          plantPhase: rand() * Math.PI * 2,
        });
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

    // Draw garden plots
    this.plots.forEach((plot, i) => {
      const load = this.coreLoads[i];
      const px = plot.x - plot.w / 2, py = plot.y - plot.h / 2;

      // Soil plot background
      ctx.fillStyle = `rgba(62, 39, 35, ${0.15 + load * 0.15})`;
      ctx.fillRect(px, py, plot.w, plot.h);
      ctx.strokeStyle = `rgba(106, 191, 75, ${0.08 + load * 0.12})`;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px, py, plot.w, plot.h);

      // Plant sprout that grows with load
      const plantHeight = load * plot.h * 0.8;
      if (plantHeight > 1) {
        const plantX = plot.x;
        const plantBase = py + plot.h;
        // Stem
        ctx.beginPath();
        ctx.moveTo(plantX, plantBase);
        ctx.lineTo(plantX, plantBase - plantHeight);
        ctx.strokeStyle = `rgba(60, 140, 40, ${0.4 + load * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Leaves/bloom at top
        let color;
        if (load < 0.25) color = 'rgba(100, 180, 60, 0.5)';       // small sprout
        else if (load < 0.5) color = 'rgba(106, 191, 75, 0.6)';    // growing
        else if (load < 0.75) color = 'rgba(255, 200, 50, 0.7)';   // flowering
        else color = 'rgba(255, 80, 60, 0.8)';                      // overheated

        ctx.beginPath();
        ctx.arc(plantX, plantBase - plantHeight, 2 + load * 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = load * 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });
  }
}

// ─── Lake Viz (Memory) ───
class LakeViz {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.data = { percent: 0, swapPercent: 0, loadavg: [0, 0, 0] };
    this.time = 0;
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
    ctx.clearRect(0, 0, w, h);
    this.time += 0.03;

    // Lake basin outline
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.65, w * 0.42, h * 0.3, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(74, 103, 65, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Water level fill (RAM usage)
    const waterLevel = data.percent;
    const waterH = h * 0.55 * waterLevel;
    const waterY = h * 0.65 + h * 0.25 - waterH;

    if (waterLevel > 0.01) {
      ctx.save();
      // Clip to lake shape
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.65, w * 0.41, h * 0.29, 0, 0, Math.PI * 2);
      ctx.clip();

      // Water body
      const waterGrad = ctx.createLinearGradient(0, waterY, 0, h);
      let waterColor1, waterColor2;
      if (waterLevel < 0.5) {
        waterColor1 = 'rgba(60, 184, 160, 0.25)';
        waterColor2 = 'rgba(74, 144, 184, 0.35)';
      } else if (waterLevel < 0.8) {
        waterColor1 = 'rgba(74, 144, 184, 0.35)';
        waterColor2 = 'rgba(100, 120, 180, 0.4)';
      } else {
        waterColor1 = 'rgba(160, 80, 80, 0.35)';
        waterColor2 = 'rgba(180, 60, 60, 0.45)';
      }
      waterGrad.addColorStop(0, waterColor1);
      waterGrad.addColorStop(1, waterColor2);
      ctx.fillStyle = waterGrad;
      ctx.fillRect(0, waterY, w, h);

      // Ripple waves on surface
      ctx.beginPath();
      for (let x = 0; x < w; x += 2) {
        const ripple = Math.sin(x * 0.05 + this.time) * 2 + Math.sin(x * 0.08 + this.time * 1.5) * 1;
        if (x === 0) ctx.moveTo(x, waterY + ripple);
        else ctx.lineTo(x, waterY + ripple);
      }
      ctx.strokeStyle = 'rgba(200, 240, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Swap level indicator (smaller pool / spring)
    if (data.swapPercent > 0.01) {
      const springX = w * 0.15, springY = h * 0.3;
      const springR = 18;
      ctx.beginPath();
      ctx.arc(springX, springY, springR, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(212, 168, 67, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Swap fill
      const swapFill = ctx.createRadialGradient(springX, springY, 0, springX, springY, springR);
      swapFill.addColorStop(0, `rgba(212, 168, 67, ${0.1 + data.swapPercent * 0.25})`);
      swapFill.addColorStop(1, 'rgba(212, 168, 67, 0)');
      ctx.fillStyle = swapFill;
      ctx.beginPath();
      ctx.arc(springX, springY, springR * data.swapPercent, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(212, 168, 67, 0.5)';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SPRING', springX, springY + springR + 10);
    }

    // Load average as lily pads
    const lilyPositions = [[w * 0.7, h * 0.25], [w * 0.82, h * 0.4], [w * 0.88, h * 0.2]];
    data.loadavg.forEach((load, i) => {
      const [lx, ly] = lilyPositions[i];
      const lr = 6 + Math.min(load, 10) * 0.8;
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(80, 140, 60, ${0.2 + Math.min(load / 10, 1) * 0.4})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(106, 191, 75, ${0.15 + Math.min(load / 10, 1) * 0.3})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(212, 222, 200, 0.5)';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(load.toFixed(1), lx, ly + lr + 9);
    });
  }
}

// ─── Trunk Viz (GPU VRAM) ───
class TrunkViz {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.value = 0;
    this.time = 0;
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
    this.time += 0.01;

    // Tree trunk cross-section (rings visible)
    const maxR = Math.min(w, h) * 0.42;
    const ringCount = 8;

    // Bark outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(92, 61, 46, 0.4)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Growth rings
    for (let i = ringCount; i > 0; i--) {
      const ringR = (i / ringCount) * maxR * 0.9;
      const fillFraction = i / ringCount;
      const isUsed = fillFraction <= value;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      if (isUsed) {
        let ringColor;
        if (value < 0.5) ringColor = `rgba(92, 61, 46, ${0.15 + fillFraction * 0.2})`;
        else if (value < 0.8) ringColor = `rgba(140, 100, 50, ${0.15 + fillFraction * 0.2})`;
        else ringColor = `rgba(180, 70, 40, ${0.15 + fillFraction * 0.25})`;
        ctx.fillStyle = ringColor;
        ctx.fill();
      }
      ctx.strokeStyle = `rgba(139, 107, 74, ${0.08 + (isUsed ? 0.12 : 0)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Heart glow (center)
    const heartGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.3);
    heartGlow.addColorStop(0, `rgba(212, 168, 67, ${0.15 + value * 0.2})`);
    heartGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = heartGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Percentage arc overlay
    if (value > 0.01) {
      const angle = value * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR + 3, -Math.PI / 2, -Math.PI / 2 + angle);
      let arcColor = '#6abf4b';
      if (value > 0.8) arcColor = '#C04040';
      else if (value > 0.6) arcColor = '#D4A843';
      ctx.strokeStyle = arcColor;
      ctx.lineWidth = 3;
      ctx.shadowColor = arcColor;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }
}

// ─── Vine Graph (Network) ───
class VineGraph {
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
    ctx.clearRect(0, 0, w, h);
    this.time += 0.02;

    // Background: subtle vine trellis
    const rand = seededRandom(42);
    for (let i = 0; i < 6; i++) {
      const x = rand() * w;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.quadraticCurveTo(x + (rand() - 0.5) * 40, h * 0.5, x + (rand() - 0.5) * 60, 0);
      ctx.strokeStyle = 'rgba(74, 103, 65, 0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Download vine (green-teal)
    this._drawVine(this.historyDown, 'rgba(60, 184, 160, 0.65)', 'rgba(60, 184, 160, 0.06)');
    // Upload vine (amber)
    this._drawVine(this.historyUp, 'rgba(212, 168, 67, 0.55)', 'rgba(212, 168, 67, 0.04)');

    // Flowing sap particles
    const t = this.time;
    const lastDown = this.historyDown[this.historyDown.length - 1] || 0;
    const lastUp = this.historyUp[this.historyUp.length - 1] || 0;
    const numDown = Math.min(8, Math.ceil(lastDown / (this.maxVal * 0.1)));
    for (let i = 0; i < numDown; i++) {
      const px = ((t * 60 + i * 35) % w);
      const py = h / 2 + Math.sin(t * 1.5 + i) * 8;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(60, 184, 160, 0.4)';
      ctx.fill();
    }
    const numUp = Math.min(5, Math.ceil(lastUp / (this.maxVal * 0.1)));
    for (let i = 0; i < numUp; i++) {
      const px = w - ((t * 50 + i * 30) % w);
      const py = h / 2 + Math.sin(t * 2 + i + 3) * 6;
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(212, 168, 67, 0.35)';
      ctx.fill();
    }
  }

  _drawVine(data, strokeColor, fillColor) {
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

// ─── Honeycomb (Docker) ───
class HoneycombViz {
  constructor(containerId) { this.container = document.getElementById(containerId); }
  update(names) {
    this.container.innerHTML = names.map(n =>
      `<div class="hive-cell"><span class="hive-dot"></span><span class="hive-name">${n}</span></div>`
    ).join('');
  }
}

// ─── Ecosystem (Processes) ───
class EcosystemViz {
  constructor(containerId) { this.container = document.getElementById(containerId); }
  update(procs) {
    this.container.innerHTML = procs.map(p => {
      if (!p.name) return '';
      const pct = parseFloat(p.cpu) || 0;
      const width = Math.min(100, pct * 5);
      return `<div class="eco-entry">
        <span class="eco-name">${p.name}</span>
        <div class="eco-bar"><div class="eco-bar-fill" style="width:${width}%"></div></div>
        <span class="eco-pct">${p.cpu}%</span>
      </div>`;
    }).filter(Boolean).join('');
  }
}

// ─── Uptime to Growth Timer format ───
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
    this.treeGauges = new TreeGaugeRow();
    this.gardenGrid = new GardenGrid('garden-grid', 32);
    this.lakeViz = new LakeViz('lake-viz');
    this.trunkViz = new TrunkViz('trunk-viz');
    this.vineGraph = new VineGraph('vine-graph');
    this.honeycomb = new HoneycombViz('honeycomb');
    this.ecosystem = new EcosystemViz('ecosystem');

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
    this.scheduleNatureFlash();
  }

  scheduleNatureFlash() {
    setTimeout(() => {
      if (this.glitchEl) {
        this.glitchEl.classList.add('active');
        setTimeout(() => this.glitchEl.classList.remove('active'), 250);
      }
      this.scheduleNatureFlash();
    }, 8000 + Math.random() * 20000);
  }

  updateTime() {
    const now = new Date();
    const seasons = ['WINTER', 'WINTER', 'SPRING', 'SPRING', 'SPRING', 'SUMMER',
                     'SUMMER', 'SUMMER', 'AUTUMN', 'AUTUMN', 'AUTUMN', 'WINTER'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const season = seasons[now.getMonth()];
    if (this.el.time) this.el.time.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
    if (this.el.date) this.el.date.textContent = `${season} ${days[now.getDay()]} ${String(now.getDate()).padStart(2, '0')}.${months[now.getMonth()]}.${now.getFullYear()}`;
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
      this.treeGauges.setValue(i, v);
      this.treeGauges.setDisplay(i, displays[i]);
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
    setRow(el.cpuModel, 'SPECIES', s.cpu.model);
    setRow(el.cpuLoad, 'VIGOR', `${s.cpu.usage}%`, 'val-green');
    setRow(el.cpuFreq, 'PULSE', `${s.cpu.freq} GHz`, 'val-amber');
    setRow(el.cpuTemp, 'WARMTH', s.cpu.temp, 'val-berry');

    // Memory
    setRow(el.ram, 'WATER', `${fmt(s.memory.used)} / ${fmt(s.memory.total)}`);
    setRow(el.ramPct, 'LEVEL', `${s.memory.percent}%`, 'val-teal');
    setRow(el.ramFree, 'FLOW', fmt(s.memory.free), 'val-green');
    setRow(el.swap, 'SPRING', `${fmt(s.memory.swapUsed)} / ${fmt(s.memory.swapTotal)}`);
    setRow(el.loadavg, 'CURRENT', s.system.loadavg);

    // Storage burrow bars
    const updateBurrow = (id, data) => {
      const el = document.getElementById(id);
      if (!el) return;
      const fill = el.querySelector('.burrow-fill');
      const text = el.querySelector('.burrow-text');
      if (fill) fill.style.width = `${data.percent}%`;
      if (text) text.textContent = `${data.percent}%`;
      if (fill && data.percent > 80) {
        fill.style.background = `linear-gradient(90deg, #C04040, #D4A843)`;
      } else if (fill && data.percent > 60) {
        fill.style.background = `linear-gradient(90deg, #D4A843, #6abf4b)`;
      }
    };
    updateBurrow('burrow-root', s.storage.root);
    updateBurrow('burrow-home', s.storage.home);
    updateBurrow('burrow-cave', s.storage.cave);

    // Root trails for disk I/O
    if (s.diskIO) {
      const maxIO = 50000;
      const readEl = document.querySelector('#stat-disk-read');
      const writeEl = document.querySelector('#stat-disk-write');
      if (readEl) {
        const head = readEl.querySelector('.root-head');
        const val = readEl.querySelector('.val');
        if (head) head.style.width = `${Math.min(100, (s.diskIO.read / maxIO) * 100)}%`;
        if (val) { val.textContent = `${s.diskIO.read} KiB/s`; val.className = 'val val-teal'; }
      }
      if (writeEl) {
        const head = writeEl.querySelector('.root-head');
        const val = writeEl.querySelector('.val');
        if (head) head.style.width = `${Math.min(100, (s.diskIO.write / maxIO) * 100)}%`;
        if (val) { val.textContent = `${s.diskIO.write} KiB/s`; val.className = 'val val-amber'; }
      }
    }

    // GPU
    setRow(el.gpuRegistry, 'GROVE', `${s.gpu.name} // ${s.gpu.driver}`);
    setRow(el.gpuUsage, 'GROWTH', `${s.gpu.usage}%`, 'val-green');
    setRow(el.gpuTemp, 'WARMTH', `${s.gpu.temp}°C`, 'val-berry');
    setRow(el.gpuFan, 'BREEZE', `${s.gpu.fan}%`);
    if (el.vramText) el.vramText.textContent = `VRAM: ${s.gpu.vramUsed} / ${s.gpu.vramTotal} MiB`;

    // Network
    setRow(el.netIp, 'CLEARING', s.network.ip);
    setRow(el.netType, 'MYCELIUM', s.network.type);
    setRow(el.netDown, 'RAINFALL', `${s.network.down} KiB/s`, 'val-teal');
    setRow(el.netUp, 'RISING SAP', `${s.network.up} KiB/s`, 'val-amber');

    // Docker
    setRow(el.dockerActive, 'HIVE', `${s.docker.count} colonies`, 'val-green');

    // Top bar
    if (el.met) el.met.textContent = uptimeToMET(s.system.uptime);
    if (el.netStatus) {
      el.netStatus.textContent = s.network.type;
      el.netStatus.style.color = s.network.type === 'Disconnected' ? '#C04040' : '#00DD66';
    }
  }

  updateWidgets(s) {
    this.gardenGrid.update(s.cpu.usage);
    this.lakeViz.update({ ...s.memory, loadavg: s.system.loadavg });
    this.trunkViz.update(s.gpu.vramUsed, s.gpu.vramTotal);
    this.vineGraph.push(s.network.down, s.network.up);
    this.honeycomb.update(s.docker.names || []);
    this.ecosystem.update(s.cpu.top || []);
  }
}

document.addEventListener('DOMContentLoaded', () => new HoloStatsApp());
