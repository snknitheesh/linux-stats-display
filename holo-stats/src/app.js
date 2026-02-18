import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ─── Seeded random ───
function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ─── Background Scene: Neural network + binary rain ───
class BackgroundScene {
  constructor() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.clock = new THREE.Clock();
    this.intensity = 0;

    this.scene = new THREE.Scene();
    const aspect = this.width / this.height;
    this.camera = new THREE.PerspectiveCamera(35, aspect, 1, 5000);
    this.camera.position.set(0, 30, 400);
    this.camera.lookAt(0, 0, -100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    document.getElementById('canvas-container').appendChild(this.renderer.domElement);

    this.createNeuralNetwork();
    this.createBinaryRain();
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

  createNeuralNetwork() {
    // Neural nodes
    const nodeCount = 80;
    const nodeGeo = new THREE.BufferGeometry();
    const nodePos = new Float32Array(nodeCount * 3);
    this.neuralNodes = [];
    const rand = seededRandom(42);
    for (let i = 0; i < nodeCount; i++) {
      const x = (rand() - 0.5) * 1000;
      const y = (rand() - 0.5) * 500;
      const z = -100 - rand() * 600;
      nodePos[i * 3] = x; nodePos[i * 3 + 1] = y; nodePos[i * 3 + 2] = z;
      this.neuralNodes.push({ x, y, z, phase: rand() * Math.PI * 2 });
    }
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePos, 3));
    const nodeMat = new THREE.PointsMaterial({
      color: 0x00e5ff, size: 3, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.nodePoints = new THREE.Points(nodeGeo, nodeMat);
    this.scene.add(this.nodePoints);

    // Synaptic connections (lines between nearby nodes)
    const linePairs = [];
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const dx = this.neuralNodes[i].x - this.neuralNodes[j].x;
        const dy = this.neuralNodes[i].y - this.neuralNodes[j].y;
        const dz = this.neuralNodes[i].z - this.neuralNodes[j].z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 200 && rand() > 0.5) linePairs.push([i, j]);
      }
    }
    const linePos = new Float32Array(linePairs.length * 6);
    linePairs.forEach(([a, b], idx) => {
      linePos[idx * 6] = this.neuralNodes[a].x;
      linePos[idx * 6 + 1] = this.neuralNodes[a].y;
      linePos[idx * 6 + 2] = this.neuralNodes[a].z;
      linePos[idx * 6 + 3] = this.neuralNodes[b].x;
      linePos[idx * 6 + 4] = this.neuralNodes[b].y;
      linePos[idx * 6 + 5] = this.neuralNodes[b].z;
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff, transparent: true, opacity: 0.03,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.synapseLines = new THREE.LineSegments(lineGeo, lineMat);
    this.scene.add(this.synapseLines);

    // Signal pulses (particles traveling along connections)
    const pulseCount = 60;
    const pulseGeo = new THREE.BufferGeometry();
    const pulsePos = new Float32Array(pulseCount * 3);
    this.pulseData = [];
    for (let i = 0; i < pulseCount; i++) {
      const pair = linePairs[Math.floor(rand() * linePairs.length)];
      if (!pair) continue;
      pulsePos[i * 3] = this.neuralNodes[pair[0]].x;
      pulsePos[i * 3 + 1] = this.neuralNodes[pair[0]].y;
      pulsePos[i * 3 + 2] = this.neuralNodes[pair[0]].z;
      this.pulseData.push({
        from: pair[0], to: pair[1], t: rand(), speed: 0.003 + rand() * 0.008,
      });
    }
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
    const pulseMat = new THREE.PointsMaterial({
      color: 0x00e5ff, size: 4, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.pulsePoints = new THREE.Points(pulseGeo, pulseMat);
    this.scene.add(this.pulsePoints);
    this.linePairs = linePairs;
  }

  createBinaryRain() {
    // Faint vertical binary streams
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.rainData = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 800;
      pos[i * 3 + 1] = 300 + Math.random() * 200;
      pos[i * 3 + 2] = -150 - Math.random() * 400;
      this.rainData.push({ speed: 0.3 + Math.random() * 0.8, resetY: 300 + Math.random() * 200 });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x1a3a6a, size: 1.0, transparent: true, opacity: 0.06,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.rain = new THREE.Points(geo, mat);
    this.scene.add(this.rain);
  }

  createAmbientGlow() {
    const glowTex = (() => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const ctx = c.getContext('2d');
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(0, 229, 255, 0.08)');
      grad.addColorStop(0.5, 'rgba(10, 22, 40, 0.03)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();

    [[-200, 50, -400], [200, -30, -350], [0, 100, -500]].forEach(pos => {
      const mat = new THREE.SpriteMaterial({
        map: glowTex, transparent: true, opacity: 0.05,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(...pos);
      sprite.scale.set(300, 200, 1);
      this.scene.add(sprite);
    });

    // Violet accent
    const vTex = (() => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const ctx = c.getContext('2d');
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(179, 136, 255, 0.06)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const vs = new THREE.Sprite(new THREE.SpriteMaterial({
      map: vTex, transparent: true, opacity: 0.04,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    vs.position.set(-150, -50, -300);
    vs.scale.set(250, 150, 1);
    this.scene.add(vs);
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.clearAlpha = 0;
    this.composer.addPass(renderPass);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height), 1.0, 1.0, 0.4
    );
    this.composer.addPass(this.bloomPass);
  }

  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }

  animate() {
    requestAnimationFrame(() => this.animate());
    const t = this.clock.getElapsedTime();

    // Neural nodes pulse
    this.neuralNodes.forEach((n, i) => {
      const pulse = 0.15 + Math.sin(t * 0.5 + n.phase) * 0.08;
      // Modulated by system intensity
      const active = pulse + this.intensity * 0.15;
    });
    this.nodePoints.material.opacity = 0.15 + this.intensity * 0.2;
    this.nodePoints.material.size = 2.5 + this.intensity * 2;

    // Synapse lines pulse
    this.synapseLines.material.opacity = 0.02 + this.intensity * 0.03;

    // Signal pulses travel
    const pPos = this.pulsePoints.geometry.attributes.position.array;
    this.pulseData.forEach((pd, i) => {
      pd.t += pd.speed + this.intensity * 0.005;
      if (pd.t > 1) {
        pd.t = 0;
        // Pick new random connection
        const newPair = this.linePairs[Math.floor(Math.random() * this.linePairs.length)];
        if (newPair) { pd.from = newPair[0]; pd.to = newPair[1]; }
      }
      const nA = this.neuralNodes[pd.from];
      const nB = this.neuralNodes[pd.to];
      if (nA && nB) {
        pPos[i * 3] = nA.x + (nB.x - nA.x) * pd.t;
        pPos[i * 3 + 1] = nA.y + (nB.y - nA.y) * pd.t;
        pPos[i * 3 + 2] = nA.z + (nB.z - nA.z) * pd.t;
      }
    });
    this.pulsePoints.geometry.attributes.position.needsUpdate = true;
    this.pulsePoints.material.opacity = 0.3 + this.intensity * 0.4;

    // Binary rain falls
    const rPos = this.rain.geometry.attributes.position.array;
    this.rainData.forEach((rd, i) => {
      rPos[i * 3 + 1] -= rd.speed;
      if (rPos[i * 3 + 1] < -150) {
        rPos[i * 3 + 1] = rd.resetY;
        rPos[i * 3] = (Math.random() - 0.5) * 800;
      }
    });
    this.rain.geometry.attributes.position.needsUpdate = true;

    this.bloomPass.strength = 0.8 + this.intensity * 0.6;
    this.composer.render();
  }
}

// ─── Robotic Sensor Gauges: 7 iris/sensor modules ───
const SENSOR_CONFIGS = [
  { name: 'cpu',     type: 'iris',     accent: '#00e5ff' },
  { name: 'ram',     type: 'lidar',    accent: '#0088ff' },
  { name: 'gpu',     type: 'thermal',  accent: '#00bbdd' },
  { name: 'cpuTmp',  type: 'infrared', accent: '#ff6d00' },
  { name: 'gpuTmp',  type: 'cryo',     accent: '#b388ff' },
  { name: 'cpuPwr',  type: 'reactor',  accent: '#ff6d00' },
  { name: 'gpuPwr',  type: 'capacitor', accent: '#00e5ff' },
];

class SensorGaugeRow {
  constructor() {
    this.gauges = [];
    this.time = 0;
    for (let i = 0; i < 7; i++) {
      const canvas = document.getElementById(`sensor-${i}`);
      const ctx = canvas.getContext('2d');
      this.gauges.push({ canvas, ctx, config: SENSOR_CONFIGS[i], value: 0, displayValue: 0 });
    }
    this._animate();
  }

  setValue(index, value01) {
    if (this.gauges[index]) this.gauges[index].value = Math.max(0, Math.min(1, value01));
  }

  setDisplay(index, text) {
    const el = document.getElementById(`sv-${index}`);
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
      g.displayValue += (g.value - g.displayValue) * 0.1;
      this._drawGauge(g);
    });
  }

  _drawGauge(g) {
    const { ctx, canvas, config, displayValue } = g;
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2 - 4;
    const r = 40;
    ctx.clearRect(0, 0, w, h);

    // Titanium housing ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    const housingGrad = ctx.createRadialGradient(cx - 2, cy - 2, r, cx, cy, r + 5);
    housingGrad.addColorStop(0, '#3a4858');
    housingGrad.addColorStop(0.5, '#5a6a7a');
    housingGrad.addColorStop(1, '#2a3848');
    ctx.strokeStyle = housingGrad;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Status LEDs around bezel
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const lx = cx + Math.cos(a) * (r + 6);
      const ly = cy + Math.sin(a) * (r + 6);
      ctx.beginPath();
      ctx.arc(lx, ly, 1, 0, Math.PI * 2);
      const ledActive = (i / 8) < displayValue;
      ctx.fillStyle = ledActive ? config.accent : 'rgba(60, 80, 100, 0.3)';
      if (ledActive) { ctx.shadowColor = config.accent; ctx.shadowBlur = 3; }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Dark sensor face
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#060810';
    ctx.fill();

    // Draw type-specific sensor
    if (config.type === 'iris') this._drawIris(ctx, cx, cy, r, displayValue);
    else if (config.type === 'lidar') this._drawLidar(ctx, cx, cy, r, displayValue);
    else if (config.type === 'thermal') this._drawThermal(ctx, cx, cy, r, displayValue);
    else if (config.type === 'infrared') this._drawInfrared(ctx, cx, cy, r, displayValue);
    else if (config.type === 'cryo') this._drawCryo(ctx, cx, cy, r, displayValue);
    else if (config.type === 'reactor') this._drawReactor(ctx, cx, cy, r, displayValue);
    else if (config.type === 'capacitor') this._drawCapacitor(ctx, cx, cy, r, displayValue);

    // Progress arc
    if (displayValue > 0.001) {
      const angle = displayValue * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 2, -Math.PI / 2, -Math.PI / 2 + angle);
      let arcColor = config.accent;
      if (displayValue > 0.85) arcColor = '#ff1744';
      else if (displayValue > 0.7) arcColor = '#ff6d00';
      ctx.strokeStyle = arcColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  _drawIris(ctx, cx, cy, r, val) {
    // Mechanical aperture blades
    const bladeCount = 8;
    const pupilR = r * (0.15 + val * 0.55); // Dilates with load
    const irisR = r * 0.85;
    ctx.save();
    for (let i = 0; i < bladeCount; i++) {
      const angle = (i / bladeCount) * Math.PI * 2 + this.time * 0.3;
      const spread = pupilR / r;
      ctx.beginPath();
      const bx1 = cx + Math.cos(angle) * pupilR;
      const by1 = cy + Math.sin(angle) * pupilR;
      const bx2 = cx + Math.cos(angle + 0.4) * irisR;
      const by2 = cy + Math.sin(angle + 0.4) * irisR;
      const bx3 = cx + Math.cos(angle + 0.2) * irisR;
      const by3 = cy + Math.sin(angle + 0.2) * irisR;
      ctx.moveTo(bx1, by1);
      ctx.lineTo(bx2, by2);
      ctx.lineTo(bx3, by3);
      ctx.closePath();
      ctx.fillStyle = `rgba(20, 40, 60, ${0.6 + val * 0.3})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    // Pupil glow
    const pupilGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, pupilR);
    let pupilColor = val < 0.5 ? 'rgba(0, 229, 255, 0.3)' : (val < 0.8 ? 'rgba(255, 109, 0, 0.3)' : 'rgba(255, 23, 68, 0.4)');
    pupilGlow.addColorStop(0, pupilColor);
    pupilGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pupilGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, pupilR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawLidar(ctx, cx, cy, r, val) {
    // Concentric scanning rings
    const ringCount = 5;
    const fillRings = Math.ceil(val * ringCount);
    for (let i = 1; i <= ringCount; i++) {
      const ringR = (i / ringCount) * r * 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      const isFilled = i <= fillRings;
      ctx.strokeStyle = isFilled ? `rgba(0, 136, 255, ${0.2 + val * 0.3})` : 'rgba(0, 136, 255, 0.06)';
      ctx.lineWidth = isFilled ? 2 : 0.5;
      if (isFilled) { ctx.shadowColor = '#0088ff'; ctx.shadowBlur = 4; }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // Sweep line
    const sweepAngle = this.time * 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweepAngle) * r * 0.8, cy + Math.sin(sweepAngle) * r * 0.8);
    ctx.strokeStyle = 'rgba(0, 136, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _drawThermal(ctx, cx, cy, r, val) {
    // False-color heat map
    const imgR = r * 0.75;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, imgR);
    if (val < 0.3) {
      grad.addColorStop(0, 'rgba(0, 100, 200, 0.3)');
      grad.addColorStop(1, 'rgba(0, 40, 80, 0.1)');
    } else if (val < 0.6) {
      grad.addColorStop(0, 'rgba(200, 200, 0, 0.3)');
      grad.addColorStop(0.5, 'rgba(0, 180, 200, 0.2)');
      grad.addColorStop(1, 'rgba(0, 40, 80, 0.1)');
    } else {
      grad.addColorStop(0, 'rgba(255, 60, 20, 0.4)');
      grad.addColorStop(0.4, 'rgba(255, 200, 0, 0.25)');
      grad.addColorStop(1, 'rgba(0, 80, 120, 0.1)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, imgR, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawInfrared(ctx, cx, cy, r, val) {
    // Glowing thermal core
    const coreR = r * 0.5;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    if (val < 0.4) {
      grad.addColorStop(0, `rgba(80, 60, 200, ${0.2 + val * 0.3})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
    } else if (val < 0.7) {
      grad.addColorStop(0, `rgba(255, 180, 0, ${0.3 + val * 0.3})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      grad.addColorStop(0, `rgba(255, 255, 220, ${0.4 + val * 0.3})`);
      grad.addColorStop(0.5, `rgba(255, 109, 0, ${0.2 + val * 0.2})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();
    // Heat rings
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, coreR + i * 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 109, 0, ${0.03 * val * (4 - i)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  _drawCryo(ctx, cx, cy, r, val) {
    // Frost crystals that melt with temperature
    const frostIntensity = 1 - val; // More frost when cool
    const rand = seededRandom(99);
    for (let i = 0; i < 12; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = rand() * r * 0.7;
      const fx = cx + Math.cos(angle) * dist;
      const fy = cy + Math.sin(angle) * dist;
      const size = 2 + rand() * 4;
      // Crystal
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, -size * frostIntensity);
      ctx.lineTo(size * 0.3 * frostIntensity, 0);
      ctx.lineTo(0, size * frostIntensity);
      ctx.lineTo(-size * 0.3 * frostIntensity, 0);
      ctx.closePath();
      ctx.fillStyle = `rgba(179, 200, 255, ${frostIntensity * 0.25})`;
      ctx.fill();
      ctx.restore();
    }
    // Central cold/hot indicator
    const cGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.4);
    if (val < 0.5) {
      cGrad.addColorStop(0, `rgba(100, 150, 255, ${0.15 + frostIntensity * 0.15})`);
    } else {
      cGrad.addColorStop(0, `rgba(255, 100, 50, ${val * 0.2})`);
    }
    cGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawReactor(ctx, cx, cy, r, val) {
    // Tokamak ring with plasma
    const ringR = r * 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 109, 0, 0.1)';
    ctx.lineWidth = 8;
    ctx.stroke();
    // Plasma glow
    if (val > 0.01) {
      const plasmaAngle = val * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, -Math.PI / 2 + this.time * 0.5, -Math.PI / 2 + this.time * 0.5 + plasmaAngle);
      const intensity = 0.2 + val * 0.5;
      ctx.strokeStyle = `rgba(255, 150, 30, ${intensity})`;
      ctx.lineWidth = 6;
      ctx.shadowColor = '#ff6d00';
      ctx.shadowBlur = 10 * val;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // Core dot
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 200, 100, ${0.3 + val * 0.5})`;
    ctx.fill();
  }

  _drawCapacitor(ctx, cx, cy, r, val) {
    // Two electrode poles with energy arcs
    const poleH = r * 0.6;
    const gap = r * 0.4;
    // Left pole
    ctx.fillStyle = '#3a4858';
    ctx.fillRect(cx - gap - 4, cy - poleH / 2, 4, poleH);
    // Right pole
    ctx.fillRect(cx + gap, cy - poleH / 2, 4, poleH);
    // Energy arcs between poles
    const arcCount = Math.floor(val * 6);
    for (let i = 0; i < arcCount; i++) {
      const arcY = cy - poleH / 2 + (i + 0.5) * (poleH / (arcCount || 1));
      ctx.beginPath();
      ctx.moveTo(cx - gap, arcY);
      const midX = cx;
      const midY = arcY + (Math.sin(this.time * 4 + i * 2) * 4);
      ctx.quadraticCurveTo(midX, midY, cx + gap, arcY);
      ctx.strokeStyle = `rgba(0, 229, 255, ${0.2 + val * 0.4})`;
      ctx.lineWidth = 1 + val;
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 4 * val;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }
}

// ─── Neural Grid (CPU Cores) ───
class NeuralGrid {
  constructor(canvasId, coreCount) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.coreCount = coreCount;
    this.coreLoads = new Array(coreCount).fill(0);
    this.time = 0;
    const rand = seededRandom(777);
    const cols = 8, rows = Math.ceil(coreCount / cols);
    const xStep = this.canvas.width / (cols + 1);
    const yStep = this.canvas.height / (rows + 1);
    this.neurons = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.neurons.length >= coreCount) break;
        this.neurons.push({
          x: (c + 1) * xStep + (rand() - 0.5) * xStep * 0.25,
          y: (r + 1) * yStep + (rand() - 0.5) * yStep * 0.2,
        });
      }
    }
    // Dendrite connections
    this.dendrites = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx >= coreCount) break;
        if (c < cols - 1 && idx + 1 < coreCount && rand() > 0.2)
          this.dendrites.push([idx, idx + 1]);
        if (r < rows - 1 && idx + cols < coreCount && rand() > 0.4)
          this.dendrites.push([idx, idx + cols]);
      }
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

    // Dendrite connections
    ctx.lineWidth = 0.8;
    this.dendrites.forEach(([a, b]) => {
      const avgLoad = (this.coreLoads[a] + this.coreLoads[b]) / 2;
      ctx.beginPath();
      ctx.moveTo(this.neurons[a].x, this.neurons[a].y);
      ctx.lineTo(this.neurons[b].x, this.neurons[b].y);
      let lineColor = avgLoad < 0.3 ? `rgba(0, 229, 255, ${0.03 + avgLoad * 0.08})`
                     : avgLoad < 0.7 ? `rgba(0, 229, 255, ${0.05 + avgLoad * 0.15})`
                     : `rgba(255, 109, 0, ${0.1 + avgLoad * 0.15})`;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.5 + avgLoad * 1.5;
      ctx.stroke();
    });

    // Signal pulses traveling along active dendrites
    this.dendrites.forEach(([a, b]) => {
      const avgLoad = (this.coreLoads[a] + this.coreLoads[b]) / 2;
      if (avgLoad > 0.3) {
        const t = (this.time * 2 + a * 0.5) % 1;
        const px = this.neurons[a].x + (this.neurons[b].x - this.neurons[a].x) * t;
        const py = this.neurons[a].y + (this.neurons[b].y - this.neurons[a].y) * t;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${avgLoad * 0.5})`;
        ctx.fill();
      }
    });

    // Neuron nodes
    this.neurons.forEach((neuron, i) => {
      const load = this.coreLoads[i];
      const radius = 2.5 + load * 4;
      let color;
      if (load < 0.25) color = 'rgba(0, 229, 255, 0.3)';
      else if (load < 0.5) color = 'rgba(0, 229, 255, 0.6)';
      else if (load < 0.75) color = 'rgba(255, 200, 0, 0.7)';
      else color = 'rgba(255, 23, 68, 0.8)';

      // Firing flash
      const firing = load > 0.5 && Math.sin(this.time * 6 + i * 1.5) > 0.5;

      ctx.save();
      ctx.beginPath();
      ctx.arc(neuron.x, neuron.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = firing ? '#fff' : (load > 0.75 ? '#ff1744' : '#00e5ff');
      ctx.shadowBlur = firing ? 12 : radius * 2;
      ctx.fill();
      ctx.restore();

      // Overload crackle for maxed cores
      if (load > 0.9) {
        for (let j = 0; j < 3; j++) {
          const ca = Math.random() * Math.PI * 2;
          const cd = radius + Math.random() * 5;
          ctx.beginPath();
          ctx.moveTo(neuron.x, neuron.y);
          ctx.lineTo(neuron.x + Math.cos(ca) * cd, neuron.y + Math.sin(ca) * cd);
          ctx.strokeStyle = 'rgba(255, 23, 68, 0.3)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    });
  }
}

// ─── Data Rack (Memory) ───
class DataRack {
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

    // Main rack (DIMM slots)
    const rackL = w * 0.08, rackR = w * 0.65, rackT = h * 0.08, rackB = h * 0.92;
    const slotCount = 16;
    const slotH = (rackB - rackT) / slotCount;
    const filledSlots = Math.round(data.percent * slotCount);

    // Rack frame
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rackL, rackT, rackR - rackL, rackB - rackT);

    for (let i = 0; i < slotCount; i++) {
      const sy = rackT + i * slotH;
      const isFilled = i < filledSlots;

      // Slot background
      ctx.fillStyle = isFilled ? 'rgba(0, 229, 255, 0.08)' : 'rgba(10, 22, 40, 0.3)';
      ctx.fillRect(rackL + 1, sy + 1, rackR - rackL - 2, slotH - 2);

      if (isFilled) {
        // Active DIMM with data stream
        const streamX = rackL + 4 + ((this.time * 50 + i * 15) % (rackR - rackL - 8));
        ctx.beginPath();
        ctx.arc(streamX, sy + slotH / 2, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';
        ctx.fill();

        // Module edge glow
        ctx.fillStyle = `rgba(0, 229, 255, ${0.02 + data.percent * 0.04})`;
        ctx.fillRect(rackL + 2, sy + 1, 3, slotH - 2);
      } else {
        // Empty slot placeholder
        ctx.strokeStyle = 'rgba(30, 50, 70, 0.15)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(rackL + 4, sy + 2, rackR - rackL - 8, slotH - 4);
      }
    }

    // Swap rack
    const swapL = w * 0.70, swapR = w * 0.82;
    ctx.strokeStyle = data.swapPercent > 0.01 ? 'rgba(255, 109, 0, 0.15)' : 'rgba(0, 229, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.strokeRect(swapL, rackT, swapR - swapL, rackB - rackT);
    ctx.fillStyle = 'rgba(90, 70, 50, 0.2)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SWAP', swapL + (swapR - swapL) / 2, rackT - 3);

    if (data.swapPercent > 0.01) {
      const swapFillH = (rackB - rackT) * data.swapPercent;
      ctx.fillStyle = 'rgba(255, 109, 0, 0.15)';
      ctx.fillRect(swapL + 1, rackB - swapFillH, swapR - swapL - 2, swapFillH);
    }

    // Load average actuators
    const actX = w * 0.88;
    data.loadavg.forEach((load, i) => {
      const ay = rackT + 10 + i * 28;
      const deflection = Math.min(load / 10, 1);
      // Strain gauge
      ctx.fillStyle = 'rgba(58, 72, 88, 0.3)';
      ctx.fillRect(actX - 10, ay, 20, 18);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.1)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(actX - 10, ay, 20, 18);
      // Deflection indicator
      const barW = deflection * 16;
      ctx.fillStyle = deflection > 0.7 ? 'rgba(255, 23, 68, 0.4)' : 'rgba(0, 229, 255, 0.3)';
      ctx.fillRect(actX - 8, ay + 6, barW, 6);
      ctx.fillStyle = 'rgba(200, 216, 232, 0.4)';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(load.toFixed(1), actX, ay + 28);
    });
  }
}

// ─── Tensor Matrix (GPU VRAM) ───
class TensorMatrix {
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
    ctx.clearRect(0, 0, w, h);
    this.time += 0.02;

    // Tensor core matrix grid
    const cols = 20, rows = 6;
    const cellW = (w - 20) / cols;
    const cellH = (h - 10) / rows;
    const totalCells = cols * rows;
    const filledCells = Math.round(value * totalCells);

    // Compute wave position
    const wavePos = (this.time * 0.5) % 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const cx = 10 + c * cellW;
        const cy = 5 + r * cellH;
        const isFilled = idx < filledCells;

        // Wave highlight effect
        const cellFrac = idx / totalCells;
        const waveDist = Math.abs(cellFrac - wavePos);
        const waveGlow = waveDist < 0.1 ? (1 - waveDist / 0.1) * 0.3 : 0;

        if (isFilled) {
          let cellColor;
          if (value < 0.5) cellColor = `rgba(0, 229, 255, ${0.15 + waveGlow})`;
          else if (value < 0.8) cellColor = `rgba(0, 180, 220, ${0.2 + waveGlow})`;
          else cellColor = `rgba(255, 109, 0, ${0.2 + waveGlow})`;
          ctx.fillStyle = cellColor;
          ctx.fillRect(cx + 1, cy + 1, cellW - 2, cellH - 2);
        } else {
          ctx.fillStyle = `rgba(10, 22, 40, ${0.2 + waveGlow * 0.3})`;
          ctx.fillRect(cx + 1, cy + 1, cellW - 2, cellH - 2);
        }

        // Cell border
        ctx.strokeStyle = isFilled ? 'rgba(0, 229, 255, 0.08)' : 'rgba(30, 50, 70, 0.06)';
        ctx.lineWidth = 0.3;
        ctx.strokeRect(cx + 1, cy + 1, cellW - 2, cellH - 2);
      }
    }
  }
}

// ─── Mesh Network (Network) ───
class MeshNetwork {
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

    // Grid background
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.03)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < h; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let x = 0; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }

    // Central node
    const cx = w * 0.08, cy = h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Satellite nodes
    const rand = seededRandom(42);
    const satellites = [];
    for (let i = 0; i < 5; i++) {
      satellites.push({ x: cx + 30 + rand() * 40, y: 10 + rand() * (h - 20) });
    }
    satellites.forEach(s => {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(179, 136, 255, 0.2)';
      ctx.fill();
      // Connection line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(s.x, s.y);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.05)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // Telemetry traces (main visualization)
    const traceL = w * 0.2;
    // Download (cyan)
    this._drawTrace(this.historyDown, traceL, 'rgba(0, 229, 255, 0.6)', 'rgba(0, 229, 255, 0.04)');
    // Upload (violet)
    this._drawTrace(this.historyUp, traceL, 'rgba(179, 136, 255, 0.5)', 'rgba(179, 136, 255, 0.03)');

    // Packets flowing
    const t = this.time;
    const lastDown = this.historyDown[this.historyDown.length - 1] || 0;
    const numPkt = Math.min(6, Math.ceil(lastDown / (this.maxVal * 0.15)));
    for (let i = 0; i < numPkt; i++) {
      const px = traceL + ((t * 60 + i * 30) % (w - traceL));
      const py = h / 2 + Math.sin(t * 2 + i) * 6;
      ctx.fillStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.fillRect(px - 2, py - 1, 4, 2);
    }
  }

  _drawTrace(data, offsetX, strokeColor, fillColor) {
    const { ctx, canvas, maxVal } = this;
    const w = canvas.width - offsetX, h = canvas.height;
    const step = w / (data.length - 1);
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = offsetX + i * step;
      const y = h - (v / maxVal) * (h - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineTo(offsetX + w, h);
    ctx.lineTo(offsetX, h);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
}

// ─── Robot Assembly (Docker) ───
class RobotAssembly {
  constructor(containerId) { this.container = document.getElementById(containerId); }
  update(names) {
    this.container.innerHTML = names.map(n =>
      `<div class="module-slot"><span class="module-led"></span><span class="module-name">${n.toUpperCase()} [ACTIVE]</span></div>`
    ).join('');
  }
}

// ─── Task Scheduler (Processes) ───
class TaskScheduler {
  constructor(containerId) { this.container = document.getElementById(containerId); }
  update(procs) {
    const colors = ['#00e5ff', '#b388ff', '#00e676', '#ff6d00', '#ff1744'];
    this.container.innerHTML = procs.map((p, i) => {
      if (!p.name) return '';
      const pct = parseFloat(p.cpu) || 0;
      const width = Math.min(100, pct * 5);
      const color = colors[i % colors.length];
      return `<div class="task-entry">
        <span class="task-priority">P${i + 1}</span>
        <span class="task-name" style="color:${color}">${p.name}</span>
        <div class="task-bar"><div class="task-bar-fill" style="width:${width}%;background:${color};box-shadow:0 0 4px ${color}"></div></div>
        <span class="task-pct">${p.cpu}%</span>
      </div>`;
    }).filter(Boolean).join('');
  }
}

// ─── Uptime to Mission Timer ───
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
    this.sensorGauges = new SensorGaugeRow();
    this.neuralGrid = new NeuralGrid('neural-grid', 32);
    this.dataRack = new DataRack('data-rack');
    this.tensorMatrix = new TensorMatrix('tensor-matrix');
    this.meshNetwork = new MeshNetwork('mesh-network');
    this.robotAssembly = new RobotAssembly('robot-assembly');
    this.taskScheduler = new TaskScheduler('task-scheduler');

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
    this.scheduleAnomalyFlash();
  }

  scheduleAnomalyFlash() {
    setTimeout(() => {
      if (this.glitchEl) {
        this.glitchEl.classList.add('active');
        setTimeout(() => this.glitchEl.classList.remove('active'), 180);
      }
      this.scheduleAnomalyFlash();
    }, 7000 + Math.random() * 16000);
  }

  updateTime() {
    const now = new Date();
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    if (this.el.time) this.el.time.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
    if (this.el.date) this.el.date.textContent = `TIMESTAMP: ${days[now.getDay()]} ${String(now.getDate()).padStart(2, '0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
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
      this.sensorGauges.setValue(i, v);
      this.sensorGauges.setDisplay(i, displays[i]);
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
    setRow(el.cpuModel, 'MODULE', s.cpu.model);
    setRow(el.cpuLoad, 'LOAD', `${s.cpu.usage}%`, 'val-cyan');
    setRow(el.cpuFreq, 'CLOCK', `${s.cpu.freq} GHz`, 'val-violet');
    setRow(el.cpuTemp, 'THERMAL', s.cpu.temp, 'val-orange');

    // Memory
    setRow(el.ram, 'DIMM', `${fmt(s.memory.used)} / ${fmt(s.memory.total)}`);
    setRow(el.ramPct, 'ALLOC', `${s.memory.percent}%`, 'val-cyan');
    setRow(el.ramFree, 'FREE', fmt(s.memory.free), 'val-green');
    setRow(el.swap, 'SWAP OVF', `${fmt(s.memory.swapUsed)} / ${fmt(s.memory.swapTotal)}`);
    setRow(el.loadavg, 'ACTUATORS', s.system.loadavg);

    // Storage vaults
    const updateVault = (id, data) => {
      const el = document.getElementById(id);
      if (!el) return;
      const fill = el.querySelector('.vault-fill');
      const text = el.querySelector('.vault-text');
      if (fill) fill.style.width = `${data.percent}%`;
      if (text) text.textContent = `${data.percent}%`;
      if (fill && data.percent > 85) {
        fill.style.background = 'linear-gradient(90deg, #ff1744, #ff6d00)';
      } else if (fill && data.percent > 65) {
        fill.style.background = 'linear-gradient(90deg, #ff6d00, #00e5ff)';
      }
    };
    updateVault('vault-root', s.storage.root);
    updateVault('vault-home', s.storage.home);
    updateVault('vault-cave', s.storage.cave);

    // Signal traces for disk I/O
    if (s.diskIO) {
      const maxIO = 50000;
      const readEl = document.querySelector('#stat-disk-read');
      const writeEl = document.querySelector('#stat-disk-write');
      if (readEl) {
        const head = readEl.querySelector('.signal-head');
        const val = readEl.querySelector('.val');
        if (head) head.style.width = `${Math.min(100, (s.diskIO.read / maxIO) * 100)}%`;
        if (val) { val.textContent = `${s.diskIO.read} KiB/s`; val.className = 'val val-cyan'; }
      }
      if (writeEl) {
        const head = writeEl.querySelector('.signal-head');
        const val = writeEl.querySelector('.val');
        if (head) head.style.width = `${Math.min(100, (s.diskIO.write / maxIO) * 100)}%`;
        if (val) { val.textContent = `${s.diskIO.write} KiB/s`; val.className = 'val val-green'; }
      }
    }

    // GPU
    setRow(el.gpuRegistry, 'MODULE', `${s.gpu.name} // FW:${s.gpu.driver}`);
    setRow(el.gpuUsage, 'COMPUTE', `${s.gpu.usage}%`, 'val-cyan');
    setRow(el.gpuTemp, 'COOLANT', `${s.gpu.temp}°C`, 'val-orange');
    setRow(el.gpuFan, 'ROTORS', `${s.gpu.fan}%`);
    if (el.vramText) el.vramText.textContent = `TENSOR MEM: ${s.gpu.vramUsed} / ${s.gpu.vramTotal} MiB`;

    // Network
    setRow(el.netIp, 'NODE ID', s.network.ip);
    setRow(el.netType, 'PROTOCOL', s.network.type);
    setRow(el.netDown, 'RX RATE', `${s.network.down} KiB/s`, 'val-cyan');
    setRow(el.netUp, 'TX RATE', `${s.network.up} KiB/s`, 'val-violet');

    // Docker
    setRow(el.dockerActive, 'MODULES', `${s.docker.count} active`, 'val-green');

    // Top bar
    if (el.met) el.met.textContent = uptimeToMET(s.system.uptime);
    if (el.netStatus) {
      el.netStatus.textContent = s.network.type;
      el.netStatus.style.color = s.network.type === 'Disconnected' ? '#ff1744' : '#00e676';
    }
  }

  updateWidgets(s) {
    this.neuralGrid.update(s.cpu.usage);
    this.dataRack.update({ ...s.memory, loadavg: s.system.loadavg });
    this.tensorMatrix.update(s.gpu.vramUsed, s.gpu.vramTotal);
    this.meshNetwork.push(s.network.down, s.network.up);
    this.robotAssembly.update(s.docker.names || []);
    this.taskScheduler.update(s.cpu.top || []);
  }
}

document.addEventListener('DOMContentLoaded', () => new HoloStatsApp());
