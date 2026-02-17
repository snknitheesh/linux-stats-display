import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ─── Constants ───
const RING_CIRCUMFERENCE = 2 * Math.PI * 30; // r=30 in SVG viewBox

// ─── Background Scene ───
class BackgroundScene {
  constructor() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.clock = new THREE.Clock();
    this.intensity = 0;
    this.starLayers = [];
    this.bgDots = [];
    this.nebulae = [];
    this.meteorData = [];
    this.spaceships = [];

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

    this.createDeepStarField();
    this.createBrightStars();
    this.createPlanet();
    this.createSun();
    this.createBlackHole();
    this.createSpiralGalaxy();
    this.createBackgroundDots();
    this.createCosmicDust();
    this.createMeteorShower();
    this.createSpaceships();
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

  // ── Deep star field: 3 layers at varying depth ──
  createDeepStarField() {
    const configs = [
      { count: 600, color: 0xccddff, size: 0.4, opacity: 0.5,  spread: 2500, speed: 0.02 },
      { count: 200, color: 0x88bbff, size: 1.0, opacity: 0.4, spread: 2000, speed: 0.04 },
      { count: 200, color: 0xffcc88, size: 0.6, opacity: 0.35, spread: 2200, speed: 0.03 },  // warm gold
      { count: 100, color: 0xff99bb, size: 0.5, opacity: 0.3,  spread: 2100, speed: 0.025 }, // rose
      { count: 60,  color: 0xffffff, size: 2.5, opacity: 0.3,  spread: 1600, speed: 0.01 },
      { count: 40,  color: 0xaaddff, size: 1.8, opacity: 0.25, spread: 1800, speed: 0.015 }, // bright blue
      { count: 25,  color: 0xff4466, size: 2.8, opacity: 0.35, spread: 2400, speed: 0.008 }, // bright red
      { count: 20,  color: 0xcc44ff, size: 2.5, opacity: 0.3,  spread: 2300, speed: 0.01 },  // bright purple
      { count: 15,  color: 0xff6688, size: 3.2, opacity: 0.25, spread: 2600, speed: 0.006 }, // deep red distant
      { count: 12,  color: 0x9933ff, size: 3.0, opacity: 0.28, spread: 2500, speed: 0.007 }, // deep purple distant
    ];
    configs.forEach(cfg => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(cfg.count * 3);
      const twinklePhases = [];
      for (let i = 0; i < cfg.count; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * cfg.spread;
        pos[i * 3 + 1] = (Math.random() - 0.5) * cfg.spread * 0.6;
        pos[i * 3 + 2] = -Math.random() * cfg.spread * 0.8 - 100;
        twinklePhases.push(Math.random() * Math.PI * 2);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: cfg.color, size: cfg.size, transparent: true, opacity: cfg.opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      });
      const points = new THREE.Points(geo, mat);
      this.scene.add(points);
      this.starLayers.push({ points, config: cfg, twinklePhases });
    });
  }

  // ── Small sun-like glowing stars (red, purple, blue) placed at edges ──
  createBrightStars() {
    this.brightStars = [];
    const colors = [
      { core: [255, 120, 100], glow: [255, 60, 40] },    // red
      { core: [255, 80, 80],   glow: [200, 40, 30] },    // deep red
      { core: [200, 130, 255], glow: [160, 80, 255] },   // purple
      { core: [180, 100, 240], glow: [130, 50, 220] },   // deep purple
      { core: [120, 160, 255], glow: [60, 120, 255] },   // blue
      { core: [100, 180, 255], glow: [40, 140, 255] },   // bright blue
    ];

    // Project 3D point to normalized screen coords (0-1) using camera
    const projVec = new THREE.Vector3();
    const isInExclusionZone = (x, y, z) => {
      projVec.set(x, y, z);
      projVec.project(this.camera);
      // Convert to 0-1 screen space (0,0 = top-left, 1,1 = bottom-right)
      const sx = (projVec.x + 1) / 2;
      const sy = 1 - (projVec.y + 1) / 2;
      // Exclude: overlay center area (rings + stats text) ~15%-85% x, 5%-95% y
      if (sx > 0.12 && sx < 0.88 && sy > 0.03 && sy < 0.97) return true;
      return false;
    };

    for (let i = 0; i < 80; i++) {
      const col = colors[Math.floor(Math.random() * colors.length)];
      const size = 3 + Math.random() * 6;
      const haloSize = size * 5 + Math.random() * 15;

      const group = new THREE.Group();
      // Generate random position, reject if it projects onto overlay/planet area
      let px, py, pz, attempts = 0;
      do {
        px = (Math.random() - 0.5) * 3000;
        py = (Math.random() - 0.5) * 1800;
        pz = -1000 - Math.random() * 2000;
        attempts++;
      } while (isInExclusionZone(px, py, pz) && attempts < 50);
      if (attempts >= 50) continue; // skip if can't find valid spot
      group.position.set(px, py, pz);

      // Star body - small bright sphere
      const sc = document.createElement('canvas');
      sc.width = 64; sc.height = 64;
      const sctx = sc.getContext('2d');
      const sg = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      sg.addColorStop(0, `rgba(${col.core[0]}, ${col.core[1]}, ${col.core[2]}, 1)`);
      sg.addColorStop(0.15, `rgba(${col.core[0]}, ${col.core[1]}, ${col.core[2]}, 0.8)`);
      sg.addColorStop(0.4, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.3)`);
      sg.addColorStop(0.7, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.05)`);
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = sg;
      sctx.fillRect(0, 0, 64, 64);

      const starGeo = new THREE.SphereGeometry(size, 12, 8);
      const starMat = new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(sc), transparent: true, opacity: 0.7 + Math.random() * 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      group.add(new THREE.Mesh(starGeo, starMat));

      // Glow halo
      const hc = document.createElement('canvas');
      hc.width = 64; hc.height = 64;
      const hctx = hc.getContext('2d');
      const hg = hctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      hg.addColorStop(0, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.5)`);
      hg.addColorStop(0.3, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.15)`);
      hg.addColorStop(0.7, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.03)`);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      hctx.fillStyle = hg;
      hctx.fillRect(0, 0, 64, 64);
      const haloMat = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(hc), transparent: true, opacity: 0.6 + Math.random() * 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const halo = new THREE.Sprite(haloMat);
      halo.scale.set(haloSize, haloSize, 1);
      group.add(halo);

      // Light rays emanating from the star
      const rc = document.createElement('canvas');
      rc.width = 128; rc.height = 128;
      const rctx = rc.getContext('2d');
      rctx.globalCompositeOperation = 'lighter';
      // Horizontal ray
      const hrg = rctx.createLinearGradient(0, 64, 128, 64);
      hrg.addColorStop(0, 'rgba(0,0,0,0)');
      hrg.addColorStop(0.3, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.08)`);
      hrg.addColorStop(0.5, `rgba(${col.core[0]}, ${col.core[1]}, ${col.core[2]}, 0.4)`);
      hrg.addColorStop(0.7, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.08)`);
      hrg.addColorStop(1, 'rgba(0,0,0,0)');
      rctx.fillStyle = hrg;
      rctx.fillRect(0, 62, 128, 4);
      // Vertical ray
      const vrg = rctx.createLinearGradient(64, 0, 64, 128);
      vrg.addColorStop(0, 'rgba(0,0,0,0)');
      vrg.addColorStop(0.3, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.06)`);
      vrg.addColorStop(0.5, `rgba(${col.core[0]}, ${col.core[1]}, ${col.core[2]}, 0.3)`);
      vrg.addColorStop(0.7, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.06)`);
      vrg.addColorStop(1, 'rgba(0,0,0,0)');
      rctx.fillStyle = vrg;
      rctx.fillRect(62, 0, 4, 128);
      const rayMat = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(rc), transparent: true, opacity: 0.5 + Math.random() * 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const rays = new THREE.Sprite(rayMat);
      const rayScale = haloSize * 2.5;
      rays.scale.set(rayScale, rayScale, 1);
      group.add(rays);

      this.scene.add(group);
      this.brightStars.push({ group, halo, rays, baseOpacity: haloMat.opacity, rayBaseOpacity: rayMat.opacity, phase: Math.random() * Math.PI * 2 });
    }

    // Additional distant stars in the middle area (behind overlay, deep z)
    for (let i = 0; i < 40; i++) {
      const col = colors[Math.floor(Math.random() * colors.length)];
      const size = 2 + Math.random() * 4;
      const haloSize = size * 4 + Math.random() * 10;

      const group = new THREE.Group();
      const px = (Math.random() - 0.5) * 1200;
      const py = (Math.random() - 0.5) * 800;
      const pz = -1800 - Math.random() * 1500;
      group.position.set(px, py, pz);

      const sc = document.createElement('canvas');
      sc.width = 64; sc.height = 64;
      const sctx = sc.getContext('2d');
      const sg = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      sg.addColorStop(0, `rgba(${col.core[0]}, ${col.core[1]}, ${col.core[2]}, 1)`);
      sg.addColorStop(0.15, `rgba(${col.core[0]}, ${col.core[1]}, ${col.core[2]}, 0.8)`);
      sg.addColorStop(0.4, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.3)`);
      sg.addColorStop(0.7, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.05)`);
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = sg;
      sctx.fillRect(0, 0, 64, 64);
      const starGeo = new THREE.SphereGeometry(size, 12, 8);
      const starMat = new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(sc), transparent: true, opacity: 0.6 + Math.random() * 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      group.add(new THREE.Mesh(starGeo, starMat));

      const hc = document.createElement('canvas');
      hc.width = 64; hc.height = 64;
      const hctx = hc.getContext('2d');
      const hg = hctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      hg.addColorStop(0, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.5)`);
      hg.addColorStop(0.3, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.15)`);
      hg.addColorStop(0.7, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.03)`);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      hctx.fillStyle = hg;
      hctx.fillRect(0, 0, 64, 64);
      const haloMat2 = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(hc), transparent: true, opacity: 0.5 + Math.random() * 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const halo = new THREE.Sprite(haloMat2);
      halo.scale.set(haloSize, haloSize, 1);
      group.add(halo);

      const rc = document.createElement('canvas');
      rc.width = 128; rc.height = 128;
      const rctx = rc.getContext('2d');
      rctx.globalCompositeOperation = 'lighter';
      const hrg = rctx.createLinearGradient(0, 64, 128, 64);
      hrg.addColorStop(0, 'rgba(0,0,0,0)');
      hrg.addColorStop(0.3, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.08)`);
      hrg.addColorStop(0.5, `rgba(${col.core[0]}, ${col.core[1]}, ${col.core[2]}, 0.4)`);
      hrg.addColorStop(0.7, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.08)`);
      hrg.addColorStop(1, 'rgba(0,0,0,0)');
      rctx.fillStyle = hrg;
      rctx.fillRect(0, 62, 128, 4);
      const vrg = rctx.createLinearGradient(64, 0, 64, 128);
      vrg.addColorStop(0, 'rgba(0,0,0,0)');
      vrg.addColorStop(0.3, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.06)`);
      vrg.addColorStop(0.5, `rgba(${col.core[0]}, ${col.core[1]}, ${col.core[2]}, 0.3)`);
      vrg.addColorStop(0.7, `rgba(${col.glow[0]}, ${col.glow[1]}, ${col.glow[2]}, 0.06)`);
      vrg.addColorStop(1, 'rgba(0,0,0,0)');
      rctx.fillStyle = vrg;
      rctx.fillRect(62, 0, 4, 128);
      const rayMat2 = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(rc), transparent: true, opacity: 0.4 + Math.random() * 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const rays = new THREE.Sprite(rayMat2);
      const rayScale = haloSize * 2.5;
      rays.scale.set(rayScale, rayScale, 1);
      group.add(rays);

      this.scene.add(group);
      this.brightStars.push({ group, halo, rays, baseOpacity: haloMat2.opacity, rayBaseOpacity: rayMat2.opacity, phase: Math.random() * Math.PI * 2 });
    }
  }

  // ── Mars-like planet with surface texture ──
  createPlanet() {
    this.planetGroup = new THREE.Group();
    this.planetGroup.position.set(420, -100, -600);

    // High-detail procedural Mars texture
    const texSize = 1024;
    const pc = document.createElement('canvas');
    pc.width = texSize; pc.height = texSize;
    const pctx = pc.getContext('2d');

    // Base surface - warm dusty red
    pctx.fillStyle = '#9B4422';
    pctx.fillRect(0, 0, texSize, texSize);

    // === LAYER 1: Large terrain color variation - heavily distributed everywhere ===
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * texSize;
      const y = Math.random() * texSize;
      const r = 30 + Math.random() * 150;
      const cr = 100 + Math.random() * 80;
      const cg = 30 + Math.random() * 50;
      const cb = 10 + Math.random() * 30;
      const op = 0.15 + Math.random() * 0.35;
      const grad = pctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${op})`);
      grad.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, ${op * 0.4})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      pctx.fillStyle = grad;
      pctx.beginPath();
      pctx.arc(x, y, r, 0, Math.PI * 2);
      pctx.fill();
    }

    // === LAYER 2: Dark basaltic plains scattered everywhere ===
    for (let i = 0; i < 25; i++) {
      const x = Math.random() * texSize;
      const y = Math.random() * texSize;
      const r = 40 + Math.random() * 100;
      for (let j = 0; j < 3; j++) {
        const ox = x + (Math.random() - 0.5) * r * 0.5;
        const oy = y + (Math.random() - 0.5) * r * 0.5;
        const or = r * (0.4 + Math.random() * 0.6);
        const grad = pctx.createRadialGradient(ox, oy, 0, ox, oy, or);
        grad.addColorStop(0, `rgba(65, 22, 10, ${0.2 + Math.random() * 0.2})`);
        grad.addColorStop(0.6, `rgba(75, 28, 14, ${0.06})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        pctx.fillStyle = grad;
        pctx.beginPath();
        pctx.arc(ox, oy, or, 0, Math.PI * 2);
        pctx.fill();
      }
    }

    // === LAYER 3: Bright highland patches everywhere ===
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * texSize;
      const y = Math.random() * texSize;
      const r = 30 + Math.random() * 80;
      for (let j = 0; j < 2; j++) {
        const ox = x + (Math.random() - 0.5) * r * 0.4;
        const oy = y + (Math.random() - 0.5) * r * 0.4;
        const or = r * (0.5 + Math.random() * 0.5);
        const grad = pctx.createRadialGradient(ox, oy, 0, ox, oy, or);
        grad.addColorStop(0, `rgba(200, 110, 55, ${0.2 + Math.random() * 0.2})`);
        grad.addColorStop(0.5, `rgba(185, 95, 45, 0.08)`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        pctx.fillStyle = grad;
        pctx.beginPath();
        pctx.arc(ox, oy, or, 0, Math.PI * 2);
        pctx.fill();
      }
    }

    // === LAYER 4: Shield volcanoes scattered across surface ===
    for (let i = 0; i < 8; i++) {
      const vx = Math.random() * texSize;
      const vy = Math.random() * texSize;
      const vr = 20 + Math.random() * 40;
      const vGrad = pctx.createRadialGradient(vx, vy, 0, vx, vy, vr);
      vGrad.addColorStop(0, `rgba(80, 30, 15, ${0.3 + Math.random() * 0.2})`);
      vGrad.addColorStop(0.2, `rgba(150, 70, 35, 0.2)`);
      vGrad.addColorStop(0.5, `rgba(170, 85, 42, 0.1)`);
      vGrad.addColorStop(1, 'rgba(0,0,0,0)');
      pctx.fillStyle = vGrad;
      pctx.beginPath();
      pctx.arc(vx, vy, vr, 0, Math.PI * 2);
      pctx.fill();
      // Caldera
      pctx.beginPath();
      pctx.arc(vx, vy, 3 + Math.random() * 5, 0, Math.PI * 2);
      pctx.strokeStyle = `rgba(90, 35, 18, ${0.25 + Math.random() * 0.2})`;
      pctx.lineWidth = 1 + Math.random();
      pctx.stroke();
    }

    // === LAYER 5: Heavy crater field - 400 craters all over, very obvious ===
    for (let i = 0; i < 400; i++) {
      const cx = Math.random() * texSize;
      const cy = Math.random() * texSize;
      const cr = 2 + Math.random() * (i < 20 ? 30 : i < 60 ? 18 : i < 150 ? 10 : 5);
      // Dark crater interior shadow (lit from upper-left)
      const sGrad = pctx.createRadialGradient(cx - cr * 0.25, cy - cr * 0.25, cr * 0.05, cx, cy, cr);
      sGrad.addColorStop(0, `rgba(35, 10, 4, ${0.35 + Math.random() * 0.3})`);
      sGrad.addColorStop(0.3, `rgba(45, 14, 6, ${0.2 + Math.random() * 0.15})`);
      sGrad.addColorStop(0.7, `rgba(55, 18, 8, ${0.08 + Math.random() * 0.1})`);
      sGrad.addColorStop(1, 'rgba(0,0,0,0)');
      pctx.fillStyle = sGrad;
      pctx.beginPath();
      pctx.arc(cx, cy, cr, 0, Math.PI * 2);
      pctx.fill();
      // Bright rim highlight on craters > 3px
      if (cr > 3) {
        pctx.beginPath();
        pctx.arc(cx, cy, cr * 0.95, 0, Math.PI * 2);
        pctx.strokeStyle = `rgba(220, 140, 80, ${0.15 + Math.random() * 0.2})`;
        pctx.lineWidth = 0.8 + Math.random() * 1.5;
        pctx.stroke();
        // Light-side bright arc (upper-right rim catch)
        pctx.beginPath();
        pctx.arc(cx + cr * 0.15, cy + cr * 0.15, cr * 0.9, Math.PI * 0.8, Math.PI * 1.8);
        pctx.strokeStyle = `rgba(240, 170, 100, ${0.1 + Math.random() * 0.15})`;
        pctx.lineWidth = 0.6 + Math.random() * 1;
        pctx.stroke();
      }
      // Central peak on big craters
      if (cr > 12) {
        const pkG = pctx.createRadialGradient(cx, cy, 0, cx, cy, cr * 0.15);
        pkG.addColorStop(0, `rgba(200, 120, 65, 0.35)`);
        pkG.addColorStop(0.5, `rgba(180, 100, 50, 0.15)`);
        pkG.addColorStop(1, 'rgba(0,0,0,0)');
        pctx.fillStyle = pkG;
        pctx.beginPath();
        pctx.arc(cx, cy, cr * 0.15, 0, Math.PI * 2);
        pctx.fill();
      }
      // Ejecta rays on very large craters
      if (cr > 20) {
        for (let r = 0; r < 5 + Math.random() * 4; r++) {
          const angle = Math.random() * Math.PI * 2;
          const rayLen = cr * (1.2 + Math.random() * 1.5);
          const ex = cx + Math.cos(angle) * rayLen;
          const ey = cy + Math.sin(angle) * rayLen;
          pctx.beginPath();
          pctx.moveTo(cx + Math.cos(angle) * cr, cy + Math.sin(angle) * cr);
          pctx.lineTo(ex, ey);
          pctx.strokeStyle = `rgba(180, 110, 60, ${0.04 + Math.random() * 0.06})`;
          pctx.lineWidth = 0.5 + Math.random() * 1.5;
          pctx.stroke();
        }
      }
    }

    // === LAYER 6: Lava flow deposits scattered ===
    for (let i = 0; i < 15; i++) {
      const lx = Math.random() * texSize;
      const ly = Math.random() * texSize;
      const lr = 12 + Math.random() * 35;
      const lGrad = pctx.createRadialGradient(lx, ly, lr * 0.15, lx, ly, lr);
      lGrad.addColorStop(0, `rgba(85, 30, 14, ${0.1 + Math.random() * 0.12})`);
      lGrad.addColorStop(0.6, `rgba(100, 40, 20, 0.04)`);
      lGrad.addColorStop(1, 'rgba(0,0,0,0)');
      pctx.fillStyle = lGrad;
      pctx.beginPath();
      pctx.arc(lx, ly, lr, 0, Math.PI * 2);
      pctx.fill();
    }

    // === LAYER 7: Rocky outcrops - small bright spots everywhere ===
    for (let i = 0; i < 150; i++) {
      const rx = Math.random() * texSize;
      const ry = Math.random() * texSize;
      const rr = 1 + Math.random() * 5;
      const bright = 100 + Math.random() * 80;
      const rGrad = pctx.createRadialGradient(rx, ry, 0, rx, ry, rr);
      rGrad.addColorStop(0, `rgba(${bright + 50}, ${bright * 0.45}, ${bright * 0.2}, ${0.08 + Math.random() * 0.12})`);
      rGrad.addColorStop(1, 'rgba(0,0,0,0)');
      pctx.fillStyle = rGrad;
      pctx.beginPath();
      pctx.arc(rx, ry, rr, 0, Math.PI * 2);
      pctx.fill();
    }

    // === LAYER 8: Dust devil tracks - curving dark lines everywhere ===
    for (let i = 0; i < 25; i++) {
      let tx = Math.random() * texSize;
      let ty = Math.random() * texSize;
      pctx.beginPath();
      pctx.moveTo(tx, ty);
      const segs = 5 + Math.floor(Math.random() * 10);
      for (let s = 0; s < segs; s++) {
        tx += (Math.random() - 0.5) * 35;
        ty += (Math.random() - 0.5) * 25;
        pctx.lineTo(tx, ty);
      }
      pctx.strokeStyle = `rgba(55, 20, 10, ${0.04 + Math.random() * 0.06})`;
      pctx.lineWidth = 0.4 + Math.random() * 0.8;
      pctx.stroke();
    }

    // === LAYER 9: Polar ice caps - bright white, especially north pole ===
    // North pole - very prominent bright white ice cap
    const northCapSize = 100 + Math.random() * 40;
    // Solid bright base layer for north cap
    for (let i = 0; i < 120; i++) {
      const px = Math.random() * texSize;
      const ppY = Math.random() * northCapSize;
      const pr = 5 + Math.random() * 35;
      const brightness = 230 + Math.random() * 25;
      const grad = pctx.createRadialGradient(px, ppY, 0, px, ppY, pr);
      grad.addColorStop(0, `rgba(${brightness}, ${brightness}, ${brightness}, ${0.35 + Math.random() * 0.35})`);
      grad.addColorStop(0.3, `rgba(${brightness - 10}, ${brightness - 5}, ${brightness}, ${0.2 + Math.random() * 0.15})`);
      grad.addColorStop(0.6, `rgba(${brightness - 20}, ${brightness - 15}, ${brightness - 5}, 0.08)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      pctx.fillStyle = grad;
      pctx.beginPath();
      pctx.arc(px, ppY, pr, 0, Math.PI * 2);
      pctx.fill();
    }
    // North pole ice edge - frosty transition zone
    for (let i = 0; i < 60; i++) {
      const px = Math.random() * texSize;
      const ppY = northCapSize + (Math.random() - 0.5) * 40;
      const pr = 3 + Math.random() * 15;
      const grad = pctx.createRadialGradient(px, ppY, 0, px, ppY, pr);
      grad.addColorStop(0, `rgba(220, 215, 210, ${0.15 + Math.random() * 0.2})`);
      grad.addColorStop(0.5, `rgba(200, 195, 190, 0.06)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      pctx.fillStyle = grad;
      pctx.beginPath();
      pctx.arc(px, ppY, pr, 0, Math.PI * 2);
      pctx.fill();
    }
    // South pole - smaller, less prominent
    const southCapSize = 60 + Math.random() * 25;
    for (let i = 0; i < 60; i++) {
      const px = Math.random() * texSize;
      const ppY = texSize - Math.random() * southCapSize;
      const pr = 3 + Math.random() * 20;
      const grad = pctx.createRadialGradient(px, ppY, 0, px, ppY, pr);
      grad.addColorStop(0, `rgba(210, 205, 200, ${0.15 + Math.random() * 0.2})`);
      grad.addColorStop(0.5, `rgba(195, 190, 185, 0.05)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      pctx.fillStyle = grad;
      pctx.beginPath();
      pctx.arc(px, ppY, pr, 0, Math.PI * 2);
      pctx.fill();
    }

    // === LAYER 10: Surface channels and ridges - obvious linear features ===
    for (let i = 0; i < 40; i++) {
      let tx = Math.random() * texSize;
      let ty = Math.random() * texSize;
      const baseAngle = Math.random() * Math.PI * 2;
      pctx.beginPath();
      pctx.moveTo(tx, ty);
      const segs = 8 + Math.floor(Math.random() * 15);
      for (let s = 0; s < segs; s++) {
        tx += Math.cos(baseAngle + (Math.random() - 0.5) * 0.8) * (10 + Math.random() * 25);
        ty += Math.sin(baseAngle + (Math.random() - 0.5) * 0.8) * (10 + Math.random() * 25);
        pctx.lineTo(tx, ty);
      }
      pctx.strokeStyle = `rgba(60, 22, 10, ${0.08 + Math.random() * 0.1})`;
      pctx.lineWidth = 1 + Math.random() * 2.5;
      pctx.stroke();
    }

    // === LAYER 11: Rough terrain patches - mottled dark/light spots ===
    for (let i = 0; i < 300; i++) {
      const mx = Math.random() * texSize;
      const my = Math.random() * texSize;
      const mr = 1 + Math.random() * 4;
      const isDark = Math.random() > 0.5;
      if (isDark) {
        pctx.fillStyle = `rgba(50, 18, 8, ${0.08 + Math.random() * 0.12})`;
      } else {
        pctx.fillStyle = `rgba(190, 110, 60, ${0.06 + Math.random() * 0.1})`;
      }
      pctx.beginPath();
      pctx.arc(mx, my, mr, 0, Math.PI * 2);
      pctx.fill();
    }

    // === LAYER 12: Heavy regolith grain - 5000 tiny dots everywhere ===
    for (let i = 0; i < 5000; i++) {
      const sx = Math.random() * texSize;
      const sy = Math.random() * texSize;
      const sr = 0.4 + Math.random() * 1.2;
      const bright = 70 + Math.random() * 110;
      pctx.fillStyle = `rgba(${bright + 50}, ${bright * 0.4}, ${bright * 0.18}, ${0.01 + Math.random() * 0.05})`;
      pctx.beginPath();
      pctx.arc(sx, sy, sr, 0, Math.PI * 2);
      pctx.fill();
    }

    // Fine surface texture noise
    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * texSize;
      const y = Math.random() * texSize;
      const bright = 100 + Math.random() * 80;
      pctx.fillStyle = `rgba(${bright+50}, ${bright*0.45}, ${bright*0.2}, ${0.02 + Math.random() * 0.06})`;
      pctx.fillRect(x, y, 1 + Math.random(), 1 + Math.random());
    }

    const planetTex = new THREE.CanvasTexture(pc);
    planetTex.anisotropy = 4;

    // Main planet sphere - higher poly, more opaque
    const planetGeo = new THREE.SphereGeometry(120, 80, 60);
    const planetMat = new THREE.MeshBasicMaterial({
      map: planetTex, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.planetMesh = new THREE.Mesh(planetGeo, planetMat);
    this.planetGroup.add(this.planetMesh);

    // Thin dust atmosphere layer
    const dustCanvas = document.createElement('canvas');
    dustCanvas.width = 256; dustCanvas.height = 256;
    const dctx = dustCanvas.getContext('2d');
    for (let i = 0; i < 20; i++) {
      const dx = Math.random() * 256;
      const dy = Math.random() * 256;
      const dr = 20 + Math.random() * 50;
      const grad = dctx.createRadialGradient(dx, dy, 0, dx, dy, dr);
      grad.addColorStop(0, `rgba(${180+Math.random()*40}, ${100+Math.random()*30}, ${50+Math.random()*20}, 0.06)`);
      grad.addColorStop(0.5, `rgba(160, 80, 40, 0.02)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = grad;
      dctx.beginPath();
      dctx.arc(dx, dy, dr, 0, Math.PI * 2);
      dctx.fill();
    }
    const dustTex = new THREE.CanvasTexture(dustCanvas);
    const dustGeo = new THREE.SphereGeometry(123, 40, 28);
    const dustMat = new THREE.MeshBasicMaterial({
      map: dustTex, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.cloudMesh = new THREE.Mesh(dustGeo, dustMat);
    this.planetGroup.add(this.cloudMesh);

    // Atmosphere halo - warm Mars glow
    const hc = document.createElement('canvas');
    hc.width = 128; hc.height = 128;
    const hctx = hc.getContext('2d');
    const g = hctx.createRadialGradient(64, 64, 25, 64, 64, 64);
    g.addColorStop(0, 'rgba(200,100,50,0.15)');
    g.addColorStop(0.3, 'rgba(180,70,30,0.08)');
    g.addColorStop(0.6, 'rgba(150,50,20,0.03)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    hctx.fillStyle = g;
    hctx.fillRect(0, 0, 128, 128);
    const haloMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(hc), transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(380, 380, 1);
    this.planetGroup.add(halo);

    this.scene.add(this.planetGroup);
  }

  // ── Distant glowing sun ──
  createSun() {
    this.sunGroup = new THREE.Group();
    this.sunGroup.position.set(1250, 650, -1800);

    // Sun body - bright glowing sphere
    const sc = document.createElement('canvas');
    sc.width = 256; sc.height = 256;
    const sctx = sc.getContext('2d');
    const sg = sctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    sg.addColorStop(0, 'rgba(255, 255, 240, 1)');
    sg.addColorStop(0.1, 'rgba(255, 245, 200, 0.95)');
    sg.addColorStop(0.25, 'rgba(255, 220, 120, 0.7)');
    sg.addColorStop(0.5, 'rgba(255, 180, 60, 0.3)');
    sg.addColorStop(0.75, 'rgba(255, 140, 30, 0.08)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, 256, 256);
    // Surface granulation
    for (let i = 0; i < 100; i++) {
      const sx = Math.random() * 256, sy = Math.random() * 256;
      const sr = 3 + Math.random() * 10;
      const bright = 200 + Math.random() * 55;
      const gr = sctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      gr.addColorStop(0, `rgba(${bright}, ${bright * 0.85}, ${bright * 0.4}, 0.15)`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = gr;
      sctx.beginPath();
      sctx.arc(sx, sy, sr, 0, Math.PI * 2);
      sctx.fill();
    }

    const sunTex = new THREE.CanvasTexture(sc);
    const sunGeo = new THREE.SphereGeometry(40, 32, 24);
    const sunMat = new THREE.MeshBasicMaterial({
      map: sunTex, transparent: true, opacity: 1.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunGroup.add(this.sunMesh);

    // Inner corona glow
    const ic = document.createElement('canvas');
    ic.width = 128; ic.height = 128;
    const ictx = ic.getContext('2d');
    const ig = ictx.createRadialGradient(64, 64, 0, 64, 64, 64);
    ig.addColorStop(0, 'rgba(255, 250, 220, 0.8)');
    ig.addColorStop(0.15, 'rgba(255, 230, 150, 0.5)');
    ig.addColorStop(0.35, 'rgba(255, 200, 80, 0.2)');
    ig.addColorStop(0.6, 'rgba(255, 160, 40, 0.06)');
    ig.addColorStop(1, 'rgba(0,0,0,0)');
    ictx.fillStyle = ig;
    ictx.fillRect(0, 0, 128, 128);
    const innerCorona = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(ic), transparent: true, opacity: 1.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const innerHalo = new THREE.Sprite(innerCorona);
    innerHalo.scale.set(280, 280, 1);
    this.sunGroup.add(innerHalo);
    this.sunInnerHalo = innerHalo;

    // Outer corona - large diffuse glow
    const oc = document.createElement('canvas');
    oc.width = 128; oc.height = 128;
    const octx = oc.getContext('2d');
    const og = octx.createRadialGradient(64, 64, 0, 64, 64, 64);
    og.addColorStop(0, 'rgba(255, 240, 180, 0.3)');
    og.addColorStop(0.2, 'rgba(255, 200, 100, 0.12)');
    og.addColorStop(0.5, 'rgba(255, 160, 60, 0.04)');
    og.addColorStop(1, 'rgba(0,0,0,0)');
    octx.fillStyle = og;
    octx.fillRect(0, 0, 128, 128);
    const outerCorona = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(oc), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const outerHalo = new THREE.Sprite(outerCorona);
    outerHalo.scale.set(550, 550, 1);
    this.sunGroup.add(outerHalo);
    this.sunOuterHalo = outerHalo;

    // Lens flare rays
    const rc = document.createElement('canvas');
    rc.width = 128; rc.height = 128;
    const rctx = rc.getContext('2d');
    rctx.globalCompositeOperation = 'lighter';
    // Horizontal ray
    const hg = rctx.createLinearGradient(0, 64, 128, 64);
    hg.addColorStop(0, 'rgba(255,240,180,0)');
    hg.addColorStop(0.35, 'rgba(255,240,180,0.1)');
    hg.addColorStop(0.5, 'rgba(255,250,220,0.5)');
    hg.addColorStop(0.65, 'rgba(255,240,180,0.1)');
    hg.addColorStop(1, 'rgba(255,240,180,0)');
    rctx.fillStyle = hg;
    rctx.fillRect(0, 62, 128, 4);
    // Vertical ray
    const vg = rctx.createLinearGradient(64, 0, 64, 128);
    vg.addColorStop(0, 'rgba(255,240,180,0)');
    vg.addColorStop(0.35, 'rgba(255,240,180,0.08)');
    vg.addColorStop(0.5, 'rgba(255,250,220,0.4)');
    vg.addColorStop(0.65, 'rgba(255,240,180,0.08)');
    vg.addColorStop(1, 'rgba(255,240,180,0)');
    rctx.fillStyle = vg;
    rctx.fillRect(62, 0, 4, 128);
    const rayMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(rc), transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const rays = new THREE.Sprite(rayMat);
    rays.scale.set(650, 650, 1);
    this.sunGroup.add(rays);
    this.sunRays = rays;

    this.scene.add(this.sunGroup);
  }

  // ── Black hole with torus accretion ring ──
  createBlackHole() {
    this.bhGroup = new THREE.Group();
    this.bhGroup.position.set(-300, 80, -900);

    // Accretion ring - dust/rock particles in a torus ring shape
    const ringCount = 800;
    const ringGeo = new THREE.BufferGeometry();
    const ringPos = new Float32Array(ringCount * 3);
    const ringColors = new Float32Array(ringCount * 3);
    this.bhRingAngles = new Float32Array(ringCount);
    this.bhRingDists = new Float32Array(ringCount);
    this.bhRingYOffsets = new Float32Array(ringCount);
    for (let i = 0; i < ringCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 32 + Math.random() * 23;
      const tubeOffset = (Math.random() - 0.5) * 7;
      this.bhRingAngles[i] = angle;
      this.bhRingDists[i] = dist;
      this.bhRingYOffsets[i] = tubeOffset;
      ringPos[i * 3]     = Math.cos(angle) * dist;
      ringPos[i * 3 + 1] = Math.sin(angle) * dist * 0.12 + tubeOffset * 0.2;
      ringPos[i * 3 + 2] = tubeOffset * 0.4;
      // Rocky grey-brown with slight warm tint
      const grey = 0.35 + Math.random() * 0.35;
      ringColors[i * 3]     = grey + 0.05 + Math.random() * 0.1;
      ringColors[i * 3 + 1] = grey * 0.8;
      ringColors[i * 3 + 2] = grey * 0.6;
    }
    ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
    ringGeo.setAttribute('color', new THREE.BufferAttribute(ringColors, 3));
    const ringMat = new THREE.PointsMaterial({
      size: 1.6, transparent: true, opacity: 0.55, vertexColors: true,
      depthWrite: false, sizeAttenuation: true,
    });
    this.bhRing = new THREE.Points(ringGeo, ringMat);
    this.bhRing.rotation.z = -0.3;
    this.bhGroup.add(this.bhRing);

    // Dark center void
    const vc = document.createElement('canvas');
    vc.width = 64; vc.height = 64;
    const vctx = vc.getContext('2d');
    const vg = vctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    vg.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
    vg.addColorStop(0.25, 'rgba(0, 0, 0, 0.7)');
    vg.addColorStop(0.5, 'rgba(5, 2, 10, 0.3)');
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    vctx.fillStyle = vg;
    vctx.fillRect(0, 0, 64, 64);
    const voidMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(vc), transparent: true, opacity: 0.9,
      blending: THREE.NormalBlending, depthWrite: false,
    });
    const voidSprite = new THREE.Sprite(voidMat);
    voidSprite.scale.set(50, 50, 1);
    this.bhGroup.add(voidSprite);

    // Event horizon glow
    const gc = document.createElement('canvas');
    gc.width = 128; gc.height = 128;
    const gctx = gc.getContext('2d');
    const gg = gctx.createRadialGradient(64, 64, 15, 64, 64, 55);
    gg.addColorStop(0, 'rgba(0,0,0,0)');
    gg.addColorStop(0.2, 'rgba(180, 100, 255, 0.2)');
    gg.addColorStop(0.4, 'rgba(255, 150, 80, 0.25)');
    gg.addColorStop(0.7, 'rgba(255, 100, 50, 0.08)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    gctx.fillStyle = gg;
    gctx.fillRect(0, 0, 128, 128);
    const glowMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.set(145, 145, 1);
    this.bhGroup.add(glowSprite);
    this.bhGlow = glowSprite;

    // Gravitational lensing halo
    const lc = document.createElement('canvas');
    lc.width = 64; lc.height = 64;
    const lctx = lc.getContext('2d');
    const lg = lctx.createRadialGradient(32, 32, 10, 32, 32, 32);
    lg.addColorStop(0, 'rgba(0,0,0,0)');
    lg.addColorStop(0.4, 'rgba(140, 80, 220, 0.1)');
    lg.addColorStop(0.7, 'rgba(100, 50, 180, 0.04)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = lg;
    lctx.fillRect(0, 0, 64, 64);
    const lensMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(lc), transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const lensHalo = new THREE.Sprite(lensMat);
    lensHalo.scale.set(200, 200, 1);
    this.bhGroup.add(lensHalo);

    this.scene.add(this.bhGroup);
  }

  // ── Distant spiral galaxy ──
  createSpiralGalaxy() {
    const count = 1200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const arms = 3;
    for (let i = 0; i < count; i++) {
      const arm = i % arms;
      const dist = (i / count) * 200;
      const armAngle = (arm / arms) * Math.PI * 2;
      const spiralAngle = armAngle + dist * 0.04;
      const scatter = (Math.random() - 0.5) * (10 + dist * 0.15);
      pos[i * 3]     = Math.cos(spiralAngle) * dist + scatter;
      pos[i * 3 + 1] = (Math.random() - 0.5) * (3 + dist * 0.02);
      pos[i * 3 + 2] = Math.sin(spiralAngle) * dist + scatter;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // Use vertex colors for multi-color galaxy arms
    const colors = new Float32Array(count * 3);
    const armColors = [
      [0.6, 0.3, 1.0],  // purple arm
      [0.2, 0.6, 1.0],  // blue arm
      [1.0, 0.4, 0.7],  // pink arm
    ];
    for (let i = 0; i < count; i++) {
      const arm = i % arms;
      const dist = (i / count);
      const c = armColors[arm];
      // Fade to white near center, saturate at edges
      const mix = Math.min(1, dist * 2);
      colors[i * 3]     = c[0] * mix + (1 - mix) * 1.0;
      colors[i * 3 + 1] = c[1] * mix + (1 - mix) * 0.9;
      colors[i * 3 + 2] = c[2] * mix + (1 - mix) * 1.0;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.8, transparent: true, opacity: 0.3, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.galaxy = new THREE.Points(geo, mat);
    this.galaxy.position.set(-170, -200, -900);
    this.galaxy.rotation.x = 0.8;
    this.scene.add(this.galaxy);

    // Galaxy core glow - multi-colored
    const cc = document.createElement('canvas');
    cc.width = 64; cc.height = 64;
    const cctx = cc.getContext('2d');
    const gg = cctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gg.addColorStop(0, 'rgba(255,240,255,0.6)');
    gg.addColorStop(0.2, 'rgba(180,120,255,0.3)');
    gg.addColorStop(0.5, 'rgba(100,60,255,0.1)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    cctx.fillStyle = gg;
    cctx.fillRect(0, 0, 64, 64);
    const coreMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cc), transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const core = new THREE.Sprite(coreMat);
    core.position.copy(this.galaxy.position);
    core.scale.set(100, 100, 1);
    this.scene.add(core);
    this.galaxyCore = core;
  }

  // ── Big bright background dots ──
  createBackgroundDots() {
    // Soft glow texture for dots
    const sz = 64;
    const c = document.createElement('canvas');
    c.width = sz; c.height = sz;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(sz/2, sz/2, 0, sz/2, sz/2, sz/2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.15, 'rgba(255,255,255,0.6)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, sz, sz);
    const dotTex = new THREE.CanvasTexture(c);

    const cfgs = [
      { count: 40, color: 0xffffff, size: 14,  opacity: 0.25, spread: 2000 },
      { count: 35, color: 0xccddff, size: 18,  opacity: 0.2,  spread: 2200 },
      { count: 30, color: 0xffeedd, size: 16,  opacity: 0.22, spread: 1800 },
      { count: 25, color: 0xaaccff, size: 22,  opacity: 0.18, spread: 2400 },
      { count: 20, color: 0xffddaa, size: 20,  opacity: 0.2,  spread: 2600 },
      { count: 15, color: 0xddccff, size: 25,  opacity: 0.15, spread: 2800 },
    ];
    cfgs.forEach(cfg => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(cfg.count * 3);
      for (let i = 0; i < cfg.count; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * cfg.spread;
        pos[i * 3 + 1] = (Math.random() - 0.5) * cfg.spread * 0.6;
        pos[i * 3 + 2] = -300 - Math.random() * cfg.spread * 0.8;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: cfg.color, size: cfg.size, map: dotTex, transparent: true, opacity: cfg.opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      });
      const pts = new THREE.Points(geo, mat);
      this.scene.add(pts);
      this.bgDots.push({ points: pts, baseOpacity: cfg.opacity, phase: Math.random() * Math.PI * 2 });
    });
  }

  // ── Nebula clouds ──
  createNebulae() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);

    const cfgs = [
      { pos: [-500, 120, -700],  color: 0x4488ff, scale: 450, opacity: 0.07 },  // electric blue
      { pos: [400, 200, -800],   color: 0xdd44ff, scale: 400, opacity: 0.06 },  // vivid purple
      { pos: [-200, -80, -900],  color: 0x0088ff, scale: 500, opacity: 0.05 },  // deep blue
      { pos: [300, -40, -650],   color: 0x00ff99, scale: 300, opacity: 0.05 },  // neon green
      { pos: [-400, 250, -1000], color: 0xff44aa, scale: 500, opacity: 0.05 },  // hot pink
      { pos: [100, 300, -1100],  color: 0x6644ff, scale: 420, opacity: 0.05 },  // indigo
      { pos: [-100, -200, -750], color: 0xff6622, scale: 350, opacity: 0.04 },  // warm orange
      { pos: [500, -100, -950],  color: 0x22ddff, scale: 380, opacity: 0.05 },  // cyan
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
      this.nebulae.push({ sprite, baseOpacity: cfg.opacity, baseScale: cfg.scale, phase: Math.random() * Math.PI * 2 });
    });
  }

  // ── Cosmic dust: directional particle streams ──
  createCosmicDust() {
    const count = 200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.dustVelocities = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 2000;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 1000;
      pos[i * 3 + 2] = -Math.random() * 1200 - 100;
      this.dustVelocities.push({
        x: 0.15 + Math.random() * 0.1,
        y: -0.02 - Math.random() * 0.02,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x7799cc, size: 0.6, transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.cosmicDust = new THREE.Points(geo, mat);
    this.scene.add(this.cosmicDust);
  }

  // ── Meteor shower: small particle bursts ──
  createMeteorShower() {
    const poolSize = 80;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(poolSize * 3);
    const sizes = new Float32Array(poolSize);
    for (let i = 0; i < poolSize; i++) {
      pos[i * 3] = 0; pos[i * 3 + 1] = -9999; pos[i * 3 + 2] = 0;
      sizes[i] = 0;
      this.meteorData.push({
        active: false, life: 0, maxLife: 0,
        vx: 0, vy: 0, vz: 0, baseSize: 0,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      color: 0xffeedd, size: 1.5, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.meteorPoints = new THREE.Points(geo, mat);
    this.scene.add(this.meteorPoints);
    this._scheduleMeteorBurst();
  }

  _scheduleMeteorBurst() {
    setTimeout(() => {
      this._fireMeteorBurst();
      this._scheduleMeteorBurst();
    }, 600 + Math.random() * 2500);
  }

  _fireMeteorBurst() {
    const burstCount = 3 + Math.floor(Math.random() * 6);
    const originX = (Math.random() - 0.5) * 1500;
    const originY = 200 + Math.random() * 300;
    const originZ = -300 - Math.random() * 400;
    const baseVx = (Math.random() - 0.5) * 3;
    const baseVy = -6 - Math.random() * 4;
    const baseVz = (Math.random() - 0.5) * 2;
    const pos = this.meteorPoints.geometry.attributes.position.array;
    const sizes = this.meteorPoints.geometry.attributes.size.array;
    let fired = 0;
    for (let i = 0; i < this.meteorData.length && fired < burstCount; i++) {
      const m = this.meteorData[i];
      if (m.active) continue;
      m.active = true;
      m.life = 0;
      m.maxLife = 25 + Math.random() * 35;
      m.vx = baseVx + (Math.random() - 0.5) * 2;
      m.vy = baseVy + (Math.random() - 0.5) * 1.5;
      m.vz = baseVz + (Math.random() - 0.5) * 1;
      m.baseSize = 0.6 + Math.random() * 1.4;
      pos[i * 3]     = originX + (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = originY + (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = originZ + (Math.random() - 0.5) * 20;
      sizes[i] = m.baseSize;
      fired++;
    }
  }

  // ── Spaceships travelling through space ──
  createSpaceships() {
    for (let i = 0; i < 2; i++) {
      const group = new THREE.Group();

      // Ship body - small elongated shape
      const bodyGeo = new THREE.ConeGeometry(2, 10, 4);
      bodyGeo.rotateX(Math.PI / 2);
      const bodyMat = new THREE.MeshBasicMaterial({
        color: 0x8899aa, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      group.add(new THREE.Mesh(bodyGeo, bodyMat));

      // Wings
      const wingGeo = new THREE.BoxGeometry(12, 0.5, 3);
      const wingMat = new THREE.MeshBasicMaterial({
        color: 0x667788, transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      group.add(new THREE.Mesh(wingGeo, wingMat));

      // Engine glow
      const ec = document.createElement('canvas');
      ec.width = 32; ec.height = 32;
      const ectx = ec.getContext('2d');
      const eg = ectx.createRadialGradient(16, 16, 0, 16, 16, 16);
      eg.addColorStop(0, 'rgba(100,180,255,0.9)');
      eg.addColorStop(0.3, 'rgba(50,120,255,0.4)');
      eg.addColorStop(1, 'rgba(0,0,0,0)');
      ectx.fillStyle = eg;
      ectx.fillRect(0, 0, 32, 32);
      const engineMat = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(ec), transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const engine = new THREE.Sprite(engineMat);
      engine.scale.set(6, 6, 1);
      engine.position.set(0, 0, -5);
      group.add(engine);

      // Random position and direction
      const px = (Math.random() - 0.5) * 1500;
      const py = (Math.random() - 0.5) * 600;
      const pz = -300 - Math.random() * 600;
      group.position.set(px, py, pz);

      const vx = (Math.random() - 0.5) * 0.8;
      const vy = (Math.random() - 0.5) * 0.3;
      const vz = (Math.random() - 0.5) * 0.4;
      // Orient ship in direction of travel
      group.lookAt(px + vx * 100, py + vy * 100, pz + vz * 100);

      this.scene.add(group);
      this.spaceships.push({
        group, engine,
        vel: { x: vx, y: vy, z: vz },
        bounds: { x: 900, y: 400, zMin: -1200, zMax: -100 },
      });
    }
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.clearAlpha = 0;
    this.composer.addPass(renderPass);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height), 1.4, 0.9, 0.25
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

    // ── Stars twinkle ──
    this.starLayers.forEach(layer => {
      layer.points.material.opacity = layer.config.opacity * (0.75 + Math.sin(t * 0.4 + layer.config.size * 10) * 0.25);
    });

    // ── Bright stars twinkle with rays ──
    this.brightStars.forEach(s => {
      const twinkle = 0.6 + Math.sin(t * 0.8 + s.phase) * 0.4;
      s.halo.material.opacity = s.baseOpacity * twinkle;
      s.rays.material.opacity = s.rayBaseOpacity * twinkle;
    });

    // ── Planet spins on tilted axis ──
    this.planetGroup.rotation.z = 0.15; // axial tilt
    this.planetMesh.rotation.y += 0.002 + I * 0.003;
    this.cloudMesh.rotation.y += 0.003 + I * 0.002;
    this.cloudMesh.rotation.x += 0.0003;

    // ── Sun pulses gently ──
    this.sunMesh.rotation.y += 0.001;
    const sunPulse = 0.85 + Math.sin(t * 1.5) * 0.1;
    this.sunInnerHalo.material.opacity = 0.7 + Math.sin(t * 2) * 0.2;
    const sunScale = 200 + Math.sin(t * 0.8) * 10;
    this.sunInnerHalo.scale.set(sunScale, sunScale, 1);
    this.sunRays.material.opacity = 0.3 + Math.sin(t * 1.2) * 0.2;
    const rayScale = 500 + Math.sin(t * 0.5) * 30;
    this.sunRays.scale.set(rayScale, rayScale, 1);

    // ── Black hole accretion disc spins ──
    // Dust ring particles orbit individually
    const rPos = this.bhRing.geometry.attributes.position.array;
    const rCount = this.bhRingAngles.length;
    for (let i = 0; i < rCount; i++) {
      this.bhRingAngles[i] += 0.008 + (1 - this.bhRingDists[i] / 55) * 0.012; // inner orbits faster
      const a = this.bhRingAngles[i];
      const d = this.bhRingDists[i];
      rPos[i * 3]     = Math.cos(a) * d;
      rPos[i * 3 + 1] = Math.sin(a) * d * 0.12 + this.bhRingYOffsets[i] * 0.2;
      rPos[i * 3 + 2] = this.bhRingYOffsets[i] * 0.4;
    }
    this.bhRing.geometry.attributes.position.needsUpdate = true;
    this.bhGlow.material.opacity = 0.6 + Math.sin(t * 3) * 0.2;
    const glowScale = 145 + Math.sin(t * 1.8) * 7;
    this.bhGlow.scale.set(glowScale, glowScale, 1);

    // ── Galaxy spins around its center ──
    this.galaxy.rotation.y += 0.0006;
    this.galaxy.material.opacity = 0.25 + Math.sin(t * 0.2) * 0.08;
    this.galaxyCore.material.opacity = 0.35 + Math.sin(t * 0.3) * 0.1;

    // ── Background dots heartbeat pulse ──
    this.bgDots.forEach(d => {
      // Heartbeat: two quick beats then a pause (period ~2s)
      const beat = (t * 2.5 + d.phase) % (Math.PI * 2);
      const pulse1 = Math.max(0, Math.sin(beat * 3)) ** 8;       // first sharp beat
      const pulse2 = Math.max(0, Math.sin(beat * 3 + 1.2)) ** 8; // second quick beat
      const heartbeat = Math.max(pulse1, pulse2 * 0.7);
      d.points.material.opacity = d.baseOpacity * (0.3 + heartbeat * 0.7);
    });


    // ── Cosmic dust drifts ──
    const dPos = this.cosmicDust.geometry.attributes.position.array;
    const dCount = this.dustVelocities.length;
    for (let i = 0; i < dCount; i++) {
      dPos[i * 3]     += this.dustVelocities[i].x * (1 + I);
      dPos[i * 3 + 1] += this.dustVelocities[i].y;
      if (dPos[i * 3] > 1000) dPos[i * 3] = -1000;
    }
    this.cosmicDust.geometry.attributes.position.needsUpdate = true;
    this.cosmicDust.material.opacity = 0.1 + I * 0.08;

    // ── Meteor shower ──
    const mPos = this.meteorPoints.geometry.attributes.position.array;
    const mSizes = this.meteorPoints.geometry.attributes.size.array;
    this.meteorData.forEach((m, i) => {
      if (!m.active) return;
      m.life++;
      mPos[i * 3]     += m.vx;
      mPos[i * 3 + 1] += m.vy;
      mPos[i * 3 + 2] += m.vz;
      const lr = m.life / m.maxLife;
      if (lr > 0.6) {
        mSizes[i] = m.baseSize * (1 - (lr - 0.6) / 0.4);
      }
      if (m.life >= m.maxLife) {
        m.active = false;
        mPos[i * 3 + 1] = -9999;
        mSizes[i] = 0;
      }
    });
    this.meteorPoints.geometry.attributes.position.needsUpdate = true;
    this.meteorPoints.geometry.attributes.size.needsUpdate = true;

    // ── Spaceships travel ──
    this.spaceships.forEach(s => {
      s.group.position.x += s.vel.x;
      s.group.position.y += s.vel.y;
      s.group.position.z += s.vel.z;
      // Wrap around bounds
      const b = s.bounds;
      if (s.group.position.x > b.x) s.group.position.x = -b.x;
      if (s.group.position.x < -b.x) s.group.position.x = b.x;
      if (s.group.position.y > b.y) s.group.position.y = -b.y;
      if (s.group.position.y < -b.y) s.group.position.y = b.y;
      if (s.group.position.z > b.zMax) s.group.position.z = b.zMin;
      if (s.group.position.z < b.zMin) s.group.position.z = b.zMax;
      // Engine glow pulse
      s.engine.material.opacity = 0.4 + Math.sin(t * 3 + s.vel.x * 10) * 0.2;
    });

    // ── Bloom reacts to load ──
    this.bloomPass.strength = 1.2 + I * 0.6;

    // ── Camera fixed position ──
    this.camera.position.set(0, 60, 500);
    this.camera.lookAt(0, 20, -200);

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
        // Flash on value change - text and ring glow
        if (oldVal !== displays[i] && oldVal !== '--') {
          el.classList.add('flash');
          const wrap = el.closest('.ring-wrap');
          if (wrap) wrap.classList.add('glow');
          setTimeout(() => {
            el.classList.remove('flash');
            if (wrap) wrap.classList.remove('glow');
          }, 350);
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
    if (el.cpuTemp) el.cpuTemp.innerHTML = `<span class="label">TEMP</span><span class="val-green">${s.cpu.temp}</span>`;
    if (el.cpuCores) el.cpuCores.innerHTML = `<span class="label">CORES</span><span class="val-white">${s.cpu.cores} / ${s.cpu.freq} GHz</span>`;
    if (el.topProcs) {
      el.topProcs.innerHTML = s.cpu.top.map(p =>
        p.name ? `<span class="val-orange">${p.name}</span><span class="val-white">${p.cpu}%</span>` : ''
      ).filter(Boolean).join('');
    }
    if (el.ramLine) el.ramLine.innerHTML = `<span class="label">RAM</span><span><span class="val-white">${fmt(s.memory.used)} / ${fmt(s.memory.total)}</span> <span class="val-magenta">${s.memory.percent}%</span></span>`;
    if (el.ramFree) el.ramFree.innerHTML = `<span class="label">FREE</span><span class="val-green">${fmt(s.memory.free)}</span>`;
    if (el.swapLine) el.swapLine.innerHTML = `<span class="label">SWAP</span><span><span class="val-white">${fmt(s.memory.swapUsed)} / ${fmt(s.memory.swapTotal)}</span> <span class="val-magenta">${s.memory.swapPercent}%</span></span>`;
    if (el.storageRoot) el.storageRoot.innerHTML = `<span class="label">/</span><span><span class="val-white">${fmt(s.storage.root.used)} / ${fmt(s.storage.root.total)}</span> <span class="val-blue">${s.storage.root.percent}%</span></span>`;
    if (el.storageHome) el.storageHome.innerHTML = `<span class="label">/home</span><span><span class="val-white">${fmt(s.storage.home.used)} / ${fmt(s.storage.home.total)}</span> <span class="val-blue">${s.storage.home.percent}%</span></span>`;
    if (el.storageCave) el.storageCave.innerHTML = `<span class="label">/cave</span><span><span class="val-white">${fmt(s.storage.cave.used)} / ${fmt(s.storage.cave.total)}</span> <span class="val-blue">${s.storage.cave.percent}%</span></span>`;
    if (el.gpuModel) el.gpuModel.innerHTML = `<span class="label">MODEL</span><span class="val-white">${s.gpu.name}</span>`;
    if (el.gpuDriver) el.gpuDriver.innerHTML = `<span class="label">DRIVER</span><span class="val-white">${s.gpu.driver}</span>`;
    if (el.gpuUsage) el.gpuUsage.innerHTML = `<span class="label">USAGE</span><span class="val-green">${s.gpu.usage}%</span>`;
    if (el.gpuTemp) el.gpuTemp.innerHTML = `<span class="label">TEMP</span><span class="val-green">${s.gpu.temp}°C</span>`;
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
