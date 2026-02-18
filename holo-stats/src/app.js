import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ─── Seeded random for deterministic layouts ───
function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ─── Background Scene: Racing garage at night ───
class BackgroundScene {
  constructor() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.clock = new THREE.Clock();
    this.intensity = 0;

    this.scene = new THREE.Scene();
    const aspect = this.width / this.height;
    this.camera = new THREE.PerspectiveCamera(35, aspect, 1, 5000);
    this.camera.position.set(0, 40, 350);
    this.camera.lookAt(0, 0, -100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    document.getElementById('canvas-container').appendChild(this.renderer.domElement);

    this.createBrakeDust();
    this.createRainStreaks();
    this.createLEDStrips();
    this.createGarageFloor();
    this.createAmbientGlow();
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

  createBrakeDust() {
    const count = 150;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.dustData = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 800;
      pos[i * 3 + 1] = Math.random() * 200 - 30;
      pos[i * 3 + 2] = -Math.random() * 500 - 50;
      this.dustData.push({
        vx: (Math.random() - 0.5) * 0.15,
        vy: -0.01 - Math.random() * 0.03,
        phase: Math.random() * Math.PI * 2,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x888890, size: 1.5, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
  }

  createRainStreaks() {
    const count = 80;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.rainData = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 600;
      pos[i * 3 + 1] = 300 + Math.random() * 200;
      pos[i * 3 + 2] = -200 - Math.random() * 400;
      this.rainData.push({
        speed: 2 + Math.random() * 3,
        resetY: 300 + Math.random() * 200,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x6688AA, size: 0.8, transparent: true, opacity: 0.08,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.rain = new THREE.Points(geo, mat);
    this.scene.add(this.rain);
  }

  createLEDStrips() {
    this.ledStrips = [];
    const stripTex = (() => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 8;
      const ctx = c.getContext('2d');
      const grad = ctx.createLinearGradient(0, 4, 256, 4);
      grad.addColorStop(0, 'rgba(200, 210, 230, 0)');
      grad.addColorStop(0.3, 'rgba(200, 210, 230, 0.12)');
      grad.addColorStop(0.5, 'rgba(200, 210, 230, 0.18)');
      grad.addColorStop(0.7, 'rgba(200, 210, 230, 0.12)');
      grad.addColorStop(1, 'rgba(200, 210, 230, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 8);
      return new THREE.CanvasTexture(c);
    })();

    for (let i = 0; i < 4; i++) {
      const mat = new THREE.SpriteMaterial({
        map: stripTex, transparent: true, opacity: 0.06,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(-200 + i * 130, 200, -300 - Math.random() * 100);
      sprite.scale.set(300, 3, 1);
      this.scene.add(sprite);
      this.ledStrips.push({ sprite, baseOpacity: 0.04 + Math.random() * 0.03, phase: Math.random() * Math.PI * 2 });
    }
  }

  createGarageFloor() {
    const count = 200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1000;
      pos[i * 3 + 1] = -60 + Math.random() * 5;
      pos[i * 3 + 2] = -Math.random() * 500 - 50;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x333340, size: 3, transparent: true, opacity: 0.06,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.floor = new THREE.Points(geo, mat);
    this.scene.add(this.floor);
  }

  createAmbientGlow() {
    // Distant track barrier glow (through garage door)
    const glowTex = (() => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const ctx = c.getContext('2d');
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(0, 136, 255, 0.15)');
      grad.addColorStop(0.5, 'rgba(0, 100, 200, 0.04)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();

    const positions = [[-350, 30, -500], [350, 30, -500], [0, 80, -600]];
    this.glows = [];
    positions.forEach(pos => {
      const mat = new THREE.SpriteMaterial({
        map: glowTex, transparent: true, opacity: 0.04,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(...pos);
      sprite.scale.set(200, 100, 1);
      this.scene.add(sprite);
      this.glows.push({ sprite, phase: Math.random() * Math.PI * 2 });
    });

    // Ferrari red accent glow
    const redTex = (() => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const ctx = c.getContext('2d');
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(220, 20, 60, 0.08)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const redSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: redTex, transparent: true, opacity: 0.03,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    redSprite.position.set(-200, -20, -300);
    redSprite.scale.set(300, 150, 1);
    this.scene.add(redSprite);
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.clearAlpha = 0;
    this.composer.addPass(renderPass);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height), 0.8, 1.0, 0.5
    );
    this.composer.addPass(this.bloomPass);
  }

  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }

  animate() {
    requestAnimationFrame(() => this.animate());
    const t = this.clock.getElapsedTime();

    // Brake dust drifts
    const dPos = this.dust.geometry.attributes.position.array;
    this.dustData.forEach((dd, i) => {
      dPos[i * 3] += dd.vx + Math.sin(t * 0.2 + dd.phase) * 0.03;
      dPos[i * 3 + 1] += dd.vy;
      if (dPos[i * 3 + 1] < -60) { dPos[i * 3 + 1] = 200; dPos[i * 3] = (Math.random() - 0.5) * 800; }
    });
    this.dust.geometry.attributes.position.needsUpdate = true;
    this.dust.material.opacity = 0.08 + this.intensity * 0.06;

    // Rain falls
    const rPos = this.rain.geometry.attributes.position.array;
    this.rainData.forEach((rd, i) => {
      rPos[i * 3 + 1] -= rd.speed;
      if (rPos[i * 3 + 1] < -80) {
        rPos[i * 3 + 1] = rd.resetY;
        rPos[i * 3] = (Math.random() - 0.5) * 600;
      }
    });
    this.rain.geometry.attributes.position.needsUpdate = true;

    // LED strips flicker subtly
    this.ledStrips.forEach(led => {
      led.sprite.material.opacity = led.baseOpacity * (0.7 + Math.sin(t * 0.5 + led.phase) * 0.3);
    });

    // Track barrier glows pulse
    this.glows.forEach(g => {
      g.sprite.material.opacity = 0.03 + Math.sin(t * 0.3 + g.phase) * 0.015;
    });

    // Bloom responds to load
    this.bloomPass.strength = 0.6 + this.intensity * 0.5;
    this.composer.render();
  }
}

// ─── Tachometer Gauge Row: 7 analog racing dials ───
const TACH_CONFIGS = [
  { name: 'cpu',     accent: '#DC143C', type: 'tach',    redline: 0.85 },
  { name: 'ram',     accent: '#0088FF', type: 'boost',   redline: 0.90 },
  { name: 'gpu',     accent: '#00BBDD', type: 'turbo',   redline: 0.85 },
  { name: 'cpuTmp',  accent: '#FF8000', type: 'coolant', redline: 0.80 },
  { name: 'gpuTmp',  accent: '#FF8000', type: 'oil',     redline: 0.80 },
  { name: 'cpuPwr',  accent: '#FFD700', type: 'hp',      redline: 0.90 },
  { name: 'gpuPwr',  accent: '#FFD700', type: 'torque',  redline: 0.90 },
];

class TachGaugeRow {
  constructor() {
    this.gauges = [];
    this.time = 0;
    for (let i = 0; i < 7; i++) {
      const canvas = document.getElementById(`tach-${i}`);
      const ctx = canvas.getContext('2d');
      this.gauges.push({ canvas, ctx, config: TACH_CONFIGS[i], value: 0, displayValue: 0 });
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
    this.gauges.forEach(g => {
      // Smooth needle movement with micro-oscillation
      const diff = g.value - g.displayValue;
      g.displayValue += diff * 0.12;
      // Micro-bounce like real analog gauge
      g.displayValue += Math.sin(this.time * 8 + g.config.redline * 10) * 0.002 * g.value;
      this._drawGauge(g);
    });
  }

  _drawGauge(g) {
    const { ctx, canvas, config, displayValue } = g;
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2 + 2;
    const r = 42;
    ctx.clearRect(0, 0, w, h);

    // Sweep from 7 o'clock (225°) to 5 o'clock (315° → -45° → wrapped to 315°)
    // Actually: 7 o'clock = ~225° = 5π/4, 5 o'clock = ~315° = 7π/4 (going clockwise through top)
    // Full sweep = 270° from 225° clockwise to 315° (passing through 0°/top)
    const startAngle = Math.PI * 0.75;  // 135° in standard math = 7 o'clock visually
    const endAngle = Math.PI * 2.25;    // 405° = 45° past full circle = 5 o'clock
    const sweepRange = endAngle - startAngle; // 270° = 1.5π

    // Chrome bezel ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    const bezelGrad = ctx.createRadialGradient(cx - 3, cy - 3, r, cx, cy, r + 5);
    bezelGrad.addColorStop(0, '#555560');
    bezelGrad.addColorStop(0.5, '#888890');
    bezelGrad.addColorStop(1, '#444448');
    ctx.strokeStyle = bezelGrad;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Dark face
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const faceGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    faceGrad.addColorStop(0, '#1a1a20');
    faceGrad.addColorStop(1, '#0d0d12');
    ctx.fillStyle = faceGrad;
    ctx.fill();

    // Tick marks and numbers
    const majorTicks = 10;
    for (let i = 0; i <= majorTicks; i++) {
      const frac = i / majorTicks;
      const angle = startAngle + frac * sweepRange;
      const isRedline = frac >= config.redline;

      // Major tick
      const outerR = r - 3;
      const innerR = r - 10;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.strokeStyle = isRedline ? '#DC143C' : 'rgba(220, 220, 230, 0.6)';
      ctx.lineWidth = isRedline ? 2 : 1.5;
      ctx.stroke();

      // Minor ticks
      if (i < majorTicks) {
        for (let j = 1; j < 5; j++) {
          const mFrac = (i + j / 5) / majorTicks;
          const mAngle = startAngle + mFrac * sweepRange;
          const mInner = r - 6;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(mAngle) * mInner, cy + Math.sin(mAngle) * mInner);
          ctx.lineTo(cx + Math.cos(mAngle) * outerR, cy + Math.sin(mAngle) * outerR);
          ctx.strokeStyle = mFrac >= config.redline ? 'rgba(220, 20, 60, 0.4)' : 'rgba(180, 180, 190, 0.25)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    // Redline zone arc
    const redStart = startAngle + config.redline * sweepRange;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.5, redStart, endAngle);
    ctx.strokeStyle = 'rgba(220, 20, 60, 0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Colored arc for current value
    if (displayValue > 0.001) {
      const valAngle = startAngle + displayValue * sweepRange;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 7, startAngle, valAngle);
      let arcColor = config.accent;
      if (displayValue >= config.redline) arcColor = '#DC143C';
      ctx.strokeStyle = arcColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Needle
    const needleAngle = startAngle + Math.max(0, Math.min(1, displayValue)) * sweepRange;
    const needleLen = r - 8;
    const needleTail = 8;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(needleAngle);
    // Needle body
    ctx.beginPath();
    ctx.moveTo(needleLen, 0);
    ctx.lineTo(2, -1.5);
    ctx.lineTo(-needleTail, 0);
    ctx.lineTo(2, 1.5);
    ctx.closePath();
    let needleColor = displayValue >= config.redline ? '#DC143C' : config.accent;
    ctx.fillStyle = needleColor;
    ctx.shadowColor = needleColor;
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;
    // Center hub
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#444450';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#888890';
    ctx.fill();
    ctx.restore();

    // Thermal backlight for temp gauges
    if (config.type === 'coolant' || config.type === 'oil') {
      const thermal = displayValue;
      let glowColor;
      if (thermal < 0.4) glowColor = `rgba(0, 100, 255, ${thermal * 0.15})`;
      else if (thermal < 0.65) glowColor = `rgba(200, 160, 0, ${0.06 + thermal * 0.08})`;
      else glowColor = `rgba(220, 20, 60, ${0.08 + thermal * 0.12})`;
      const thermalGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.6);
      thermalGlow.addColorStop(0, glowColor);
      thermalGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = thermalGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ─── Engine Block (CPU Cores) ───
class EngineBlock {
  constructor(canvasId, coreCount) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.coreCount = coreCount;
    this.coreLoads = new Array(coreCount).fill(0);
    this.time = 0;

    // V-configuration: 2 rows (banks), staggered
    const cols = Math.ceil(coreCount / 2);
    const xStep = this.canvas.width / (cols + 1);
    const yMid = this.canvas.height / 2;
    const vAngle = 12; // V-spread in pixels
    this.cylinders = [];
    for (let i = 0; i < coreCount; i++) {
      const bank = i % 2; // 0 = left bank, 1 = right bank
      const col = Math.floor(i / 2);
      this.cylinders.push({
        x: (col + 1) * xStep,
        y: yMid + (bank === 0 ? -vAngle : vAngle),
        bank,
      });
    }
  }

  update(usagePercent) {
    const base = usagePercent / 100;
    for (let i = 0; i < this.coreCount; i++) {
      this.coreLoads[i] = Math.min(1, Math.max(0, base + (Math.random() - 0.5) * 0.3));
    }
    this.time += 0.05;
    this.draw();
  }

  draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cylW = 16, cylH = 22;

    // Center crankcase line
    ctx.beginPath();
    ctx.moveTo(20, canvas.height / 2);
    ctx.lineTo(canvas.width - 20, canvas.height / 2);
    ctx.strokeStyle = 'rgba(100, 100, 110, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    this.cylinders.forEach((cyl, i) => {
      const load = this.coreLoads[i];
      const px = cyl.x - cylW / 2, py = cyl.y - cylH / 2;

      // Cylinder bore
      ctx.fillStyle = `rgba(20, 20, 25, 0.6)`;
      ctx.fillRect(px, py, cylW, cylH);
      ctx.strokeStyle = `rgba(100, 100, 115, ${0.15 + load * 0.2})`;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(px, py, cylW, cylH);

      // Piston position and combustion
      const pistonY = py + cylH * (1 - load * 0.7);
      const pistonH = 4;

      // Combustion glow (above piston)
      if (load > 0.1) {
        const combustH = pistonY - py;
        if (combustH > 0) {
          let combustColor;
          if (load < 0.3) combustColor = `rgba(80, 60, 30, ${load * 0.6})`;
          else if (load < 0.6) combustColor = `rgba(200, 120, 20, ${0.2 + load * 0.3})`;
          else if (load < 0.85) combustColor = `rgba(255, 140, 0, ${0.3 + load * 0.4})`;
          else combustColor = `rgba(255, 60, 30, ${0.5 + load * 0.4})`;

          ctx.fillStyle = combustColor;
          ctx.fillRect(px + 1, py, cylW - 2, combustH);

          // Fire flash for high load
          if (load > 0.7 && Math.sin(this.time * 6 + i * 2) > 0.3) {
            ctx.fillStyle = `rgba(255, 200, 50, ${0.15 + load * 0.2})`;
            ctx.fillRect(px + 2, py + 1, cylW - 4, Math.min(combustH, 6));
          }
        }
      }

      // Piston head
      ctx.fillStyle = load > 0.85 ? '#883030' : '#555560';
      ctx.fillRect(px + 1, pistonY, cylW - 2, pistonH);

      // Cherry-red warning glow for maxed cores
      if (load > 0.9) {
        ctx.save();
        ctx.shadowColor = '#DC143C';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = 'rgba(220, 20, 60, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, cylW, cylH);
        ctx.restore();
      }
    });
  }
}

// ─── Fuel Tank (Memory) ───
class FuelTank {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.data = { percent: 0, swapPercent: 0, loadavg: [0, 0, 0] };
    this.time = 0;
    this.sloshPhase = 0;
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
    this.sloshPhase += 0.04;

    // Main fuel cell outline (F1 bladder tank shape)
    const tankL = w * 0.12, tankR = w * 0.68, tankT = h * 0.12, tankB = h * 0.88;
    const tankW = tankR - tankL, tankH = tankB - tankT;

    // Tank body outline
    ctx.beginPath();
    ctx.roundRect(tankL, tankT, tankW, tankH, 6);
    ctx.strokeStyle = 'rgba(140, 140, 150, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Fuel quantity markings
    for (let i = 0; i <= 4; i++) {
      const markY = tankB - (i / 4) * tankH;
      ctx.beginPath();
      ctx.moveTo(tankL - 5, markY);
      ctx.lineTo(tankL, markY);
      ctx.strokeStyle = 'rgba(140, 140, 150, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(140, 140, 150, 0.3)';
      ctx.font = '7px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${i * 25}%`, tankL - 7, markY + 3);
    }

    // Fuel level (amber liquid)
    const fuelH = tankH * data.percent;
    const fuelY = tankB - fuelH;

    if (data.percent > 0.01) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(tankL + 1, tankT + 1, tankW - 2, tankH - 2, 5);
      ctx.clip();

      // Fuel gradient
      let fuelColor1, fuelColor2;
      if (data.percent < 0.5) {
        fuelColor1 = 'rgba(200, 160, 40, 0.35)';
        fuelColor2 = 'rgba(180, 120, 20, 0.5)';
      } else if (data.percent < 0.8) {
        fuelColor1 = 'rgba(220, 140, 20, 0.4)';
        fuelColor2 = 'rgba(200, 100, 10, 0.55)';
      } else {
        fuelColor1 = 'rgba(220, 60, 40, 0.4)';
        fuelColor2 = 'rgba(200, 40, 20, 0.55)';
      }
      const fuelGrad = ctx.createLinearGradient(0, fuelY, 0, tankB);
      fuelGrad.addColorStop(0, fuelColor1);
      fuelGrad.addColorStop(1, fuelColor2);
      ctx.fillStyle = fuelGrad;
      ctx.fillRect(tankL, fuelY, tankW, fuelH);

      // Slosh wave on surface
      ctx.beginPath();
      for (let x = tankL; x < tankR; x += 2) {
        const wave = Math.sin((x - tankL) * 0.06 + this.sloshPhase) * 2
                   + Math.sin((x - tankL) * 0.1 + this.sloshPhase * 1.3) * 1;
        if (x === tankL) ctx.moveTo(x, fuelY + wave);
        else ctx.lineTo(x, fuelY + wave);
      }
      ctx.strokeStyle = 'rgba(255, 220, 120, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Auxiliary tank (Swap)
    const auxL = w * 0.74, auxR = w * 0.88, auxT = h * 0.25, auxB = h * 0.75;
    const auxW = auxR - auxL, auxH = auxB - auxT;
    ctx.beginPath();
    ctx.roundRect(auxL, auxT, auxW, auxH, 4);
    ctx.strokeStyle = 'rgba(140, 140, 150, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(140, 140, 150, 0.25)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AUX', auxL + auxW / 2, auxT - 4);

    if (data.swapPercent > 0.01) {
      const swapH = auxH * data.swapPercent;
      const swapGrad = ctx.createLinearGradient(0, auxB - swapH, 0, auxB);
      swapGrad.addColorStop(0, 'rgba(0, 136, 255, 0.25)');
      swapGrad.addColorStop(1, 'rgba(0, 100, 200, 0.4)');
      ctx.fillStyle = swapGrad;
      ctx.fillRect(auxL + 1, auxB - swapH, auxW - 2, swapH);
    }

    // Gear ratios (load average) — sequential gearbox display
    const gearX = w * 0.9, gearY = h * 0.15;
    const gearSlots = ['1st', '2nd', '3rd'];
    data.loadavg.forEach((load, i) => {
      const gy = gearY + i * 22;
      const isHot = load > 5;
      ctx.fillStyle = isHot ? 'rgba(220, 20, 60, 0.15)' : 'rgba(42, 42, 46, 0.3)';
      ctx.fillRect(gearX - 12, gy, 24, 16);
      ctx.strokeStyle = isHot ? 'rgba(220, 20, 60, 0.3)' : 'rgba(140, 140, 150, 0.15)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(gearX - 12, gy, 24, 16);
      ctx.fillStyle = isHot ? '#DC143C' : 'rgba(224, 224, 232, 0.5)';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(load.toFixed(1), gearX, gy + 11);
    });
  }
}

// ─── Tire Wear (GPU VRAM) ───
class TireWear {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.value = 0;
    this.gpuName = '';
    this.vramTotal = 0;
    this.time = 0;
  }

  update(used, total, gpuName) {
    this.value = total > 0 ? used / total : 0;
    this.gpuName = gpuName || '';
    this.vramTotal = total;
    this.draw();
  }

  draw() {
    const { ctx, canvas, value } = this;
    const w = canvas.width, h = canvas.height;
    const cx = w * 0.3, cy = h / 2;
    const tireR = 32;
    ctx.clearRect(0, 0, w, h);
    this.time += 0.01;

    // Tire outer circle (sidewall)
    ctx.beginPath();
    ctx.arc(cx, cy, tireR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(60, 60, 65, 0.6)';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Tread surface — degrades with VRAM usage
    ctx.beginPath();
    ctx.arc(cx, cy, tireR - 4, 0, Math.PI * 2);
    const treadColor = value < 0.5 ? '#2a4a2a' : (value < 0.8 ? '#4a4a20' : '#3a2020');
    ctx.fillStyle = treadColor;
    ctx.fill();

    // Tread grooves (disappear with usage = tire going slick)
    const grooveCount = 8;
    const grooveDepth = 1 - value; // 1 = fresh grooves, 0 = slick
    if (grooveDepth > 0.05) {
      for (let i = 0; i < grooveCount; i++) {
        const angle = (i / grooveCount) * Math.PI * 2;
        const innerR = tireR * 0.3;
        const outerR = tireR - 5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
        ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
        ctx.strokeStyle = `rgba(15, 15, 18, ${grooveDepth * 0.5})`;
        ctx.lineWidth = 2 * grooveDepth;
        ctx.stroke();
      }
    }

    // Optimal zone coloring (green when fresh, red when worn)
    let zoneColor;
    if (value < 0.4) zoneColor = 'rgba(0, 170, 85, 0.12)';
    else if (value < 0.7) zoneColor = 'rgba(255, 200, 0, 0.1)';
    else zoneColor = 'rgba(220, 20, 60, 0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy, tireR - 5, 0, Math.PI * 2);
    ctx.fillStyle = zoneColor;
    ctx.fill();

    // Sidewall text
    ctx.save();
    ctx.fillStyle = 'rgba(140, 140, 150, 0.35)';
    ctx.font = '6px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.vramTotal} MiB`, cx, cy + tireR + 12);
    ctx.restore();

    // Brake disc (GPU temp) — to the right
    const discX = w * 0.65, discY = cy;
    const discR = 25;

    // Disc rotor
    ctx.beginPath();
    ctx.arc(discX, discY, discR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(80, 80, 88, 0.4)';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Ventilation slots
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(discX + Math.cos(a) * discR * 0.4, discY + Math.sin(a) * discR * 0.4);
      ctx.lineTo(discX + Math.cos(a) * discR * 0.85, discY + Math.sin(a) * discR * 0.85);
      ctx.strokeStyle = 'rgba(30, 30, 35, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Thermal glow on disc (based on value as proxy for heat)
    if (value > 0.2) {
      const heat = value;
      let heatColor;
      if (heat < 0.4) heatColor = `rgba(100, 60, 30, ${heat * 0.3})`;
      else if (heat < 0.7) heatColor = `rgba(200, 80, 20, ${0.1 + heat * 0.2})`;
      else heatColor = `rgba(255, 120, 40, ${0.2 + heat * 0.3})`;
      const heatGrad = ctx.createRadialGradient(discX, discY, 0, discX, discY, discR);
      heatGrad.addColorStop(0, heatColor);
      heatGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = heatGrad;
      ctx.beginPath();
      ctx.arc(discX, discY, discR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Caliper
    ctx.fillStyle = 'rgba(220, 20, 60, 0.3)';
    ctx.fillRect(discX - 4, discY - discR - 2, 8, 8);
  }
}

// ─── Telemetry Trace (Network) ───
class TelemetryTrace {
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

    // Grid background (F1 telemetry style)
    ctx.strokeStyle = 'rgba(100, 100, 110, 0.06)';
    ctx.lineWidth = 0.5;
    // Horizontal
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Vertical
    for (let x = 0; x < w; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Download trace (electric blue — throttle)
    this._drawTrace(this.historyDown, 'rgba(0, 136, 255, 0.7)', 'rgba(0, 136, 255, 0.06)');
    // Upload trace (red — brake)
    this._drawTrace(this.historyUp, 'rgba(220, 20, 60, 0.5)', 'rgba(220, 20, 60, 0.03)');

    // Data flow particles
    const t = this.time;
    const lastDown = this.historyDown[this.historyDown.length - 1] || 0;
    const lastUp = this.historyUp[this.historyUp.length - 1] || 0;
    const numDown = Math.min(8, Math.ceil(lastDown / (this.maxVal * 0.1)));
    for (let i = 0; i < numDown; i++) {
      const px = ((t * 70 + i * 35) % w);
      const py = h / 2 + Math.sin(t * 2 + i) * 6;
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 136, 255, 0.4)';
      ctx.fill();
    }
    const numUp = Math.min(5, Math.ceil(lastUp / (this.maxVal * 0.1)));
    for (let i = 0; i < numUp; i++) {
      const px = w - ((t * 55 + i * 30) % w);
      const py = h / 2 + Math.sin(t * 2.5 + i + 3) * 5;
      ctx.beginPath();
      ctx.arc(px, py, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(220, 20, 60, 0.35)';
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

// ─── Pit Lane (Docker) ───
class PitLane {
  constructor(containerId) { this.container = document.getElementById(containerId); }
  update(names) {
    this.container.innerHTML = names.map(n => {
      const teamName = n.toUpperCase().replace(/-/g, ' ') + ' RACING';
      return `<div class="pit-box"><span class="pit-light"></span><span class="pit-team">${teamName}</span></div>`;
    }).join('');
  }
}

// ─── Race Standings (Processes) ───
class RaceStandings {
  constructor(containerId) { this.container = document.getElementById(containerId); }
  update(procs) {
    const teamColors = ['#DC143C', '#0088FF', '#FF8000', '#00AA55', '#FFD700'];
    this.container.innerHTML = procs.map((p, i) => {
      if (!p.name) return '';
      const pct = parseFloat(p.cpu) || 0;
      const width = Math.min(100, pct * 5);
      const color = teamColors[i % teamColors.length];
      return `<div class="standing-entry">
        <span class="standing-pos">P${i + 1}</span>
        <span class="standing-name" style="color:${color}">${p.name}</span>
        <div class="standing-bar"><div class="standing-bar-fill" style="width:${width}%;background:${color};box-shadow:0 0 4px ${color}"></div></div>
        <span class="standing-gap">${p.cpu}%</span>
      </div>`;
    }).filter(Boolean).join('');
  }
}

// ─── Uptime to Stint Timer format ───
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
    this.tachGauges = new TachGaugeRow();
    this.engineBlock = new EngineBlock('engine-block', 32);
    this.fuelTank = new FuelTank('fuel-tank');
    this.tireWear = new TireWear('tire-wear');
    this.telemetry = new TelemetryTrace('telemetry');
    this.pitLane = new PitLane('pit-lane');
    this.standings = new RaceStandings('standings');

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
    this.scheduleCautionFlash();
  }

  scheduleCautionFlash() {
    setTimeout(() => {
      if (this.glitchEl) {
        this.glitchEl.classList.add('active');
        setTimeout(() => this.glitchEl.classList.remove('active'), 200);
      }
      this.scheduleCautionFlash();
    }, 8000 + Math.random() * 18000);
  }

  updateTime() {
    const now = new Date();
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    if (this.el.time) this.el.time.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
    if (this.el.date) this.el.date.textContent = `SESSION ${days[now.getDay()]} ${String(now.getDate()).padStart(2, '0')}.${months[now.getMonth()]}.${now.getFullYear()}`;
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
      this.tachGauges.setValue(i, v);
      this.tachGauges.setDisplay(i, displays[i]);
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
    setRow(el.cpuModel, 'CHASSIS', s.cpu.model);
    setRow(el.cpuLoad, 'THROTTLE', `${s.cpu.usage}%`, 'val-blue');
    setRow(el.cpuFreq, 'RPM', `${(s.cpu.freq * 1000).toFixed(0)} MHz`, 'val-gold');
    setRow(el.cpuTemp, 'COOLANT', s.cpu.temp, 'val-orange');

    // Memory
    setRow(el.ram, 'FUEL', `${fmt(s.memory.used)} / ${fmt(s.memory.total)}`);
    setRow(el.ramPct, 'LEVEL', `${s.memory.percent}%`, 'val-orange');
    setRow(el.ramFree, 'RESERVE', fmt(s.memory.free), 'val-green');
    setRow(el.swap, 'AUX TANK', `${fmt(s.memory.swapUsed)} / ${fmt(s.memory.swapTotal)}`);
    setRow(el.loadavg, 'GEARS', s.system.loadavg);

    // Storage drag strips
    const updateStrip = (id, data) => {
      const el = document.getElementById(id);
      if (!el) return;
      const car = el.querySelector('.strip-car');
      const text = el.querySelector('.strip-text');
      const light = el.querySelector('.strip-light');
      if (car) car.style.width = `${data.percent}%`;
      if (text) text.textContent = `${data.percent}%`;
      // Stage lights: green < 75%, yellow 75-90%, red > 90%
      if (light) {
        if (data.percent > 90) {
          light.style.background = '#DC143C';
          light.style.boxShadow = '0 0 4px #DC143C';
        } else if (data.percent > 75) {
          light.style.background = '#FF8000';
          light.style.boxShadow = '0 0 4px #FF8000';
        } else {
          light.style.background = '#00AA55';
          light.style.boxShadow = '0 0 4px #00AA55';
        }
      }
      // Car color shift
      if (car && data.percent > 80) {
        car.style.background = 'linear-gradient(90deg, #DC143C, #FF8000)';
      } else if (car && data.percent > 60) {
        car.style.background = 'linear-gradient(90deg, #FF8000, #FFD700)';
      }
    };
    updateStrip('strip-root', s.storage.root);
    updateStrip('strip-home', s.storage.home);
    updateStrip('strip-cave', s.storage.cave);

    // Speed needles for disk I/O
    if (s.diskIO) {
      const maxIO = 50000;
      const readEl = document.querySelector('#stat-disk-read');
      const writeEl = document.querySelector('#stat-disk-write');
      if (readEl) {
        const needle = readEl.querySelector('.speed-needle');
        const val = readEl.querySelector('.val');
        if (needle) needle.style.width = `${Math.min(100, (s.diskIO.read / maxIO) * 100)}%`;
        if (val) { val.textContent = `${s.diskIO.read} KiB/s`; val.className = 'val val-blue'; }
      }
      if (writeEl) {
        const needle = writeEl.querySelector('.speed-needle');
        const val = writeEl.querySelector('.val');
        if (needle) needle.style.width = `${Math.min(100, (s.diskIO.write / maxIO) * 100)}%`;
        if (val) { val.textContent = `${s.diskIO.write} KiB/s`; val.className = 'val val-orange'; }
      }
    }

    // GPU
    setRow(el.gpuRegistry, 'ECU FW', `${s.gpu.name} // FW:${s.gpu.driver}`);
    setRow(el.gpuUsage, 'THROTTLE', `${s.gpu.usage}%`, 'val-blue');
    setRow(el.gpuTemp, 'BRAKE DISC', `${s.gpu.temp}°C`, 'val-red');
    setRow(el.gpuFan, 'TURBO', `${s.gpu.fan}%`);
    if (el.vramText) el.vramText.textContent = `TYRE WEAR: ${s.gpu.vramUsed} / ${s.gpu.vramTotal} MiB`;

    // Network
    setRow(el.netIp, 'PIT RADIO', s.network.ip);
    setRow(el.netType, 'LINK', s.network.type);
    setRow(el.netDown, 'TOP SPD \u2193', `${s.network.down} KiB/s`, 'val-blue');
    setRow(el.netUp, 'TOP SPD \u2191', `${s.network.up} KiB/s`, 'val-red');

    // Docker
    setRow(el.dockerActive, 'PIT LANE', `${s.docker.count} cars`, 'val-green');

    // Top bar
    if (el.met) el.met.textContent = uptimeToMET(s.system.uptime);
    if (el.netStatus) {
      el.netStatus.textContent = s.network.type;
      el.netStatus.style.color = s.network.type === 'Disconnected' ? '#DC143C' : '#00AA55';
    }
  }

  updateWidgets(s) {
    this.engineBlock.update(s.cpu.usage);
    this.fuelTank.update({ ...s.memory, loadavg: s.system.loadavg });
    this.tireWear.update(s.gpu.vramUsed, s.gpu.vramTotal, s.gpu.name);
    this.telemetry.push(s.network.down, s.network.up);
    this.pitLane.update(s.docker.names || []);
    this.standings.update(s.cpu.top || []);
  }
}

document.addEventListener('DOMContentLoaded', () => new HoloStatsApp());
