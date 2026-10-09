/* ═══════════════════════════════════════════════════════════════
   FOR AYA — a cinematic 3D birthday universe
   vanilla JS · Three.js r128 · GSAP + ScrollTrigger
   ─────────────────────────────────────────────────────────────
   structure
     01 config & quality scaling
     02 texture helpers (glow, text, nebula)
     03 renderer / scene / camera / lights
     04 background (stars, dust, nebula)
     05 the heart (geometry, glow, orbiting words, ember particles)
     06 the cake (tiers, candles, balloons, confetti, mini hearts)
     07 fireworks (rockets, bursts, heart & "AYA" shaped shells)
     08 scroll choreography (camera keyframes + reveals)
     09 opening sequence
     10 the letter (typewriter)
     11 the wish sequence
     12 memory cards (3D tilt)
     13 generative music (WebAudio — no assets, autoplay-safe)
     14 replay
     15 main loop
   ═══════════════════════════════════════════════════════════════ */

"use strict";

/* ────────────────────────────────────────────── 01 · CONFIG ── */

const IS_TOUCH = window.matchMedia("(pointer: coarse)").matches;
const IS_MOBILE = IS_TOUCH || Math.min(window.innerWidth, window.innerHeight) < 620;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const QUALITY = {
  pixelRatio: Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.6 : 2),
  stars:      REDUCED_MOTION ? 350 : (IS_MOBILE ? 650 : 1300),
  dust:       REDUCED_MOTION ? 80  : (IS_MOBILE ? 130 : 260),
  embers:     IS_MOBILE ? 40 : 70,
  confetti:   IS_MOBILE ? 60 : 110,
  burstSize:  IS_MOBILE ? 150 : 260,   // particles per firework shell
};

const PALETTE = {
  bg:       0x08060e,
  pink:     0xf2a7c3,
  pinkSoft: 0xffd9e8,
  roseGold: 0xd9a184,
  purple:   0x6b4a8f,
  white:    0xfff6fa,
};

// CSS-side twins for canvas painting
const CSS = {
  pink: "#f2a7c3", pinkSoft: "#ffd9e8", roseGold: "#d9a184",
  purple: "#6b4a8f", white: "#fff6fa",
};

/* ─────────────────────────────────── 02 · TEXTURE HELPERS ── */

// Soft radial glow sprite texture (used for flames, glows, nebulae cores)
function makeGlowTexture(inner, outer, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, "0.55)"));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// Nebula blob — irregular soft cloud painted with layered radials
function makeNebulaTexture(colors, size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  for (let i = 0; i < 26; i++) {
    const x = size / 2 + (Math.random() - 0.5) * size * 0.45;
    const y = size / 2 + (Math.random() - 0.5) * size * 0.45;
    const r = size * (0.08 + Math.random() * 0.2);
    const col = colors[(Math.random() * colors.length) | 0];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(c);
}

// Elegant word sprite — Cormorant italic with a soft bloom shadow
function makeTextSprite(text, { size = 72, color = CSS.white, glow = CSS.pink, scale = 1 } = {}) {
  const pad = 60;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const font = `italic 300 ${size}px "Cormorant Garamond", serif`;
  ctx.font = font;
  c.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  c.height = size * 2.2 + pad;
  const ctx2 = c.getContext("2d");
  ctx2.font = font;
  ctx2.textAlign = "center";
  ctx2.textBaseline = "middle";
  ctx2.shadowColor = glow;
  ctx2.shadowBlur = 26;
  ctx2.fillStyle = color;
  ctx2.fillText(text, c.width / 2, c.height / 2);
  ctx2.shadowBlur = 8;
  ctx2.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.9,
  });
  const sprite = new THREE.Sprite(mat);
  const aspect = c.width / c.height;
  sprite.scale.set(1.15 * aspect * scale, 1.15 * scale, 1);
  return sprite;
}

// Sample 2D points from rendered text (for the "AYA" firework shell)
function sampleTextPoints(text, step = 5) {
  const w = 360, h = 150;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.font = '600 104px "Cormorant Garamond", serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(text, w / 2, h / 2);
  const data = ctx.getImageData(0, 0, w, h).data;
  const pts = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (data[(y * w + x) * 4 + 3] > 128) {
        pts.push([(x - w / 2) * 0.035, (h / 2 - y) * 0.035, (Math.random() - 0.5) * 0.3]);
      }
    }
  }
  return pts;
}

// Parametric heart outline points (for heart-shaped shells)
function heartPoints(n, scale = 0.16) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([x * scale, y * scale, (Math.random() - 0.5) * 0.4]);
  }
  return pts;
}

/* ───────────────────────── 03 · RENDERER / SCENE / CAMERA ── */

const canvas = document.getElementById("universe");
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: !IS_MOBILE, powerPreference: "high-performance",
});
renderer.setPixelRatio(QUALITY.pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(PALETTE.bg, 1);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(PALETTE.bg, 0.028);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(0, 2.2, 9);

// Lights — dim violet ambience, rose key, warm candle light (lit later)
scene.add(new THREE.AmbientLight(0x2a1a3e, 1.4));
const keyLight = new THREE.PointLight(PALETTE.pink, 1.6, 30);
keyLight.position.set(0, 2, 4);
scene.add(keyLight);
const candleLight = new THREE.PointLight(0xffb27a, 0, 22);
scene.add(candleLight);
const rim = new THREE.DirectionalLight(0x8a6bbf, 0.5);
rim.position.set(-4, 6, -6);
scene.add(rim);

/* ───────────────────────── 04 · BACKGROUND: STARS / DUST / NEBULA ── */

const worldHeight = 110; // total vertical span of the journey in world units

function buildStars() {
  const layers = [];
  const defs = [
    { count: Math.floor(QUALITY.stars * 0.6), size: 0.055, tint: new THREE.Color(PALETTE.white) },
    { count: Math.floor(QUALITY.stars * 0.4), size: 0.09,  tint: new THREE.Color(PALETTE.pinkSoft) },
  ];
  for (const def of defs) {
    const pos = new Float32Array(def.count * 3);
    for (let i = 0; i < def.count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 70;
      pos[i * 3 + 1] = 18 - Math.random() * worldHeight;
      pos[i * 3 + 2] = -8 - Math.random() * 60;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: def.tint, size: def.size, transparent: true, opacity: 0.85,
      sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    layers.push({ points, mat, phase: Math.random() * Math.PI * 2 });
  }
  return layers;
}
const starLayers = buildStars();

function buildDust() {
  const n = QUALITY.dust;
  const pos = new Float32Array(n * 3);
  const speed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * 26;
    pos[i * 3 + 1] = 16 - Math.random() * worldHeight;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
    speed[i] = 0.12 + Math.random() * 0.3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: PALETTE.roseGold, size: 0.12, transparent: true, opacity: 0.5,
    map: makeGlowTexture("rgba(255,240,230,1)", "rgba(255,240,230,0)", 64),
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  return { points, speed, n };
}
const dust = buildDust();

function buildNebulae() {
  const group = new THREE.Group();
  const texA = makeNebulaTexture(["rgba(107,74,143,0.32)", "rgba(242,167,195,0.22)", "rgba(60,34,92,0.4)"]);
  const texB = makeNebulaTexture(["rgba(217,161,132,0.2)", "rgba(242,167,195,0.26)", "rgba(43,24,66,0.42)"]);
  const defs = [
    { tex: texA, pos: [-9, 4, -26], scale: 34, rot: 0.00016 },
    { tex: texB, pos: [10, -34, -30], scale: 40, rot: -0.00012 },
    { tex: texA, pos: [-8, -72, -28], scale: 36, rot: 0.0001 },
    { tex: texB, pos: [6, -98, -30], scale: 44, rot: -0.00014 },
  ];
  const sprites = [];
  for (const d of defs) {
    const mat = new THREE.SpriteMaterial({
      map: d.tex, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(...d.pos);
    s.scale.set(d.scale, d.scale, 1);
    group.add(s);
    sprites.push({ sprite: s, mat, rot: d.rot, phase: Math.random() * Math.PI * 2 });
  }
  scene.add(group);
  return sprites;
}
const nebulae = buildNebulae();

/* ───────────────────────── 05 · THE HEART ── */

function buildHeartGeometry(depth = 0.5, size = 1) {
  // The classic three.js heart curve — drawn inverted, so we bake in a PI rotation
  const s = new THREE.Shape();
  const x = 0, y = 0;
  s.moveTo(x + 5, y + 5);
  s.bezierCurveTo(x + 5, y + 5, x + 4, y, x, y);
  s.bezierCurveTo(x - 6, y, x - 6, y + 7, x - 6, y + 7);
  s.bezierCurveTo(x - 6, y + 11, x - 3, y + 15.4, x + 5, y + 19);
  s.bezierCurveTo(x + 12, y + 15.4, x + 16, y + 11, x + 16, y + 7);
  s.bezierCurveTo(x + 16, y + 7, x + 16, y, x + 10, y);
  s.bezierCurveTo(x + 7, y, x + 5, y + 5, x + 5, y + 5);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 7, bevelEnabled: true, bevelThickness: 0.9, bevelSize: 0.85,
    bevelSegments: IS_MOBILE ? 3 : 5, curveSegments: IS_MOBILE ? 24 : 44,
  });
  geo.center();
  geo.rotateZ(Math.PI); // point down, lobes up
  geo.scale(0.085 * size, 0.085 * size, 0.085 * size);
  return geo;
}

function buildHeartAssembly({ withWords = true, scale = 1 } = {}) {
  const group = new THREE.Group();

  // Core — rose-gold/pink glossy heart
  const heartMat = new THREE.MeshStandardMaterial({
    color: 0xe88aa8, metalness: 0.55, roughness: 0.22,
    emissive: 0xb04a72, emissiveIntensity: 0.55,
  });
  const heart = new THREE.Mesh(buildHeartGeometry(0.5, 1.15), heartMat);
  group.add(heart);

  // Halo — additive glow sprite sitting behind the heart
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture("rgba(242,167,195,0.85)", "rgba(107,74,143,0)"),
    transparent: true, opacity: 0.85, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  halo.scale.set(7.5, 7.5, 1);
  halo.position.z = -1.2;
  group.add(halo);

  // Embers — tiny particles that breathe out of the heart
  const n = QUALITY.embers;
  const emberPos = new Float32Array(n * 3);
  const emberSeed = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    emberSeed[i * 2] = Math.random() * Math.PI * 2;      // angle
    emberSeed[i * 2 + 1] = 0.25 + Math.random() * 0.75;  // speed
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
  const emberMat = new THREE.PointsMaterial({
    color: PALETTE.pinkSoft, size: 0.14, transparent: true, opacity: 0.8,
    map: makeGlowTexture("rgba(255,217,232,1)", "rgba(255,217,232,0)", 64),
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  group.add(embers);

  // Orbiting words
  const words = [];
  if (withWords) {
    const texts = ["Love", "Aya", "Forever", "Smile", "Beautiful", "my favorite person"];
    const wScale = IS_MOBILE ? { short: 0.42, long: 0.32 } : { short: 0.62, long: 0.52 };
    const baseR = IS_MOBILE ? 1.9 : 2.7;
    texts.forEach((t, i) => {
      const spr = makeTextSprite(t, { scale: t.length > 8 ? wScale.long : wScale.short });
      const angle = (i / texts.length) * Math.PI * 2;
      const radius = baseR + (i % 2) * (IS_MOBILE ? 0.45 : 0.6);
      const yOff = Math.sin(i * 2.1) * 1.1;
      group.add(spr);
      words.push({ spr, angle, radius, yOff, speed: 0.12 + (i % 3) * 0.035 });
    });
  }

  group.scale.setScalar(scale);
  return { group, heart, heartMat, halo, embers, emberSeed, emberGeo, emberMat, words, n };
}

// Act II heart — sits at world y = 0
const heartA = buildHeartAssembly({ withWords: true });
heartA.group.position.set(0, -0.6, 0);
heartA.group.scale.setScalar(0.0001); // hidden until Act II
scene.add(heartA.group);

// Finale heart — larger, wordless, waiting at the bottom of the sky
const heartB = buildHeartAssembly({ withWords: false });
heartB.group.position.set(0, -86.6, -3);
heartB.group.scale.setScalar(0.0001);
scene.add(heartB.group);

function animateHeart(h, t, dt) {
  // pulse — a natural two-beat rhythm
  const beat = Math.pow(Math.max(Math.sin(t * 2.2), 0), 3) * 0.06
             + Math.pow(Math.max(Math.sin(t * 2.2 - 0.55), 0), 6) * 0.035;
  const s = h.baseScale * (1 + beat);
  h.group.scale.setScalar(Math.max(s, 0.0001));
  if (h.group.scale.x > 0.01) {
    // gentle rock — the heart always reads as a heart, never a slab
    h.heart.rotation.y = Math.sin(t * 0.32) * 0.85;
    h.halo.material.opacity = 0.65 + beat * 3.2;
    h.heartMat.emissiveIntensity = 0.45 + beat * 4;
  }
  // embers rise & orbit outward, then respawn
  const pos = h.emberGeo.attributes.position.array;
  for (let i = 0; i < h.n; i++) {
    const a = h.emberSeed[i * 2] + t * h.emberSeed[i * 2 + 1];
    const life = (t * h.emberSeed[i * 2 + 1] * 0.35 + i * 0.618) % 1;
    const r = 1.1 + life * 2.6;
    pos[i * 3]     = Math.cos(a) * r;
    pos[i * 3 + 1] = -0.8 + life * 3.2;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  h.emberGeo.attributes.position.needsUpdate = true;
  h.emberMat.opacity = 0.55 + beat * 2;
  // orbiting words — horizontally compressed ellipse so they never leave the frame
  for (const w of h.words) {
    const a = w.angle + t * w.speed;
    w.spr.position.set(
      Math.cos(a) * w.radius * 0.58,
      w.yOff + Math.sin(t * 0.5 + w.angle) * 0.25,
      Math.sin(a) * w.radius
    );
  }
}
heartA.fullScale = IS_MOBILE ? 1 : 1.55;    heartA.baseScale = 0.0001;
heartB.fullScale = IS_MOBILE ? 1.35 : 2.0;  heartB.baseScale = 0.0001;

/* ───────────────────────── 06 · THE CAKE ── */

const cakeGroup = new THREE.Group();
cakeGroup.position.set(0, -45, -1.5);
scene.add(cakeGroup);

const flames = [];        // candle flame sprites (extinguished during the wish)
const candleState = { level: 1 }; // 0 = blown out (tweened by the wish sequence)
let confettiMesh = null;  // instanced confetti
const balloons = [];
const miniHearts = [];

(function buildCake() {
  const cream = new THREE.MeshStandardMaterial({ color: 0xf6dce8, roughness: 0.55, metalness: 0.05 });
  const blush = new THREE.MeshStandardMaterial({ color: 0xe8a8c4, roughness: 0.5, metalness: 0.08 });
  const gold  = new THREE.MeshStandardMaterial({ color: 0xd9a184, roughness: 0.3, metalness: 0.7 });

  // plate
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.22, 48), gold);
  plate.position.y = -1.6;
  cakeGroup.add(plate);

  // tiers
  const tiers = [
    { r: 2.3, h: 1.5, y: -0.75, mat: cream },
    { r: 1.65, h: 1.3, y: 0.65, mat: blush },
    { r: 1.05, h: 1.15, y: 1.85, mat: cream },
  ];
  for (const t of tiers) {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, t.h, 48), t.mat);
    tier.position.y = t.y;
    cakeGroup.add(tier);
    // frosting rim
    const rimT = new THREE.Mesh(new THREE.TorusGeometry(t.r, 0.11, 12, 48), gold);
    rimT.rotation.x = Math.PI / 2;
    rimT.position.y = t.y + t.h / 2;
    cakeGroup.add(rimT);
  }

  // "AYA" plaque on the middle tier
  const plaqueC = document.createElement("canvas");
  plaqueC.width = 512; plaqueC.height = 220;
  const pctx = plaqueC.getContext("2d");
  pctx.fillStyle = "#fff8f4";
  pctx.beginPath();
  if (pctx.roundRect) pctx.roundRect(8, 8, 496, 204, 42);
  else pctx.rect(8, 8, 496, 204);
  pctx.fill();
  pctx.font = '300 118px "Cormorant Garamond", serif';
  pctx.textAlign = "center";
  pctx.textBaseline = "middle";
  pctx.fillStyle = "#b87a5f";
  pctx.letterSpacing = "22px";
  pctx.fillText("AYA", 266, 118);
  const plaqueTex = new THREE.CanvasTexture(plaqueC);
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.73),
    new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.4, transparent: true })
  );
  plaque.position.set(0, 0.6, 1.66);
  plaque.rotation.x = -0.06;
  cakeGroup.add(plaque);

  // candles on the top tier
  const flameTex = makeGlowTexture("rgba(255,214,170,1)", "rgba(255,120,90,0)", 128);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const r = i === 0 ? 0 : 0.55;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const candle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.62, 12),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xf2a7c3 : 0xfff6fa, roughness: 0.4 })
    );
    candle.position.set(cx, 2.75, cz);
    cakeGroup.add(candle);

    const flame = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flameTex, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    flame.position.set(cx, 3.22, cz);
    flame.scale.set(0.42, 0.62, 1);
    cakeGroup.add(flame);
    flames.push({ flame, baseY: 3.22, phase: Math.random() * Math.PI * 2, lit: true });
  }

  // balloons — glossy spheres on thread
  const balloonCols = [0xf2a7c3, 0xd9a184, 0x9a6bbf, 0xffd9e8, 0xc98a6e, 0x8a5aa8];
  for (let i = 0; i < 6; i++) {
    const bg = new THREE.Group();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 24, 20),
      new THREE.MeshStandardMaterial({
        color: balloonCols[i], roughness: 0.25, metalness: 0.15,
        emissive: balloonCols[i], emissiveIntensity: 0.12,
      })
    );
    sphere.scale.y = 1.15;
    bg.add(sphere);
    const threadGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -0.45, 0), new THREE.Vector3(0, -2.2, 0),
    ]);
    bg.add(new THREE.Line(threadGeo, new THREE.LineBasicMaterial({ color: 0xd9a184, transparent: true, opacity: 0.5 })));
    const ang = (i / 6) * Math.PI * 2 + 0.75;
    bg.position.set(Math.cos(ang) * 4.8, 2.4 + Math.sin(i * 1.7) * 1.4, Math.sin(ang) * 4.8);
    cakeGroup.add(bg);
    balloons.push({ bg, phase: Math.random() * Math.PI * 2, baseY: bg.position.y });
  }

  // floating mini hearts
  const miniGeo = buildHeartGeometry(0.5, 0.24);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(miniGeo, new THREE.MeshStandardMaterial({
      color: 0xf2a7c3, emissive: 0xb04a72, emissiveIntensity: 0.6,
      roughness: 0.3, metalness: 0.4,
    }));
    const ang = (i / 7) * Math.PI * 2;
    m.position.set(Math.cos(ang) * 3.1, Math.sin(i * 2.3) * 2, Math.sin(ang) * 3.1);
    cakeGroup.add(m);
    miniHearts.push({ m, phase: Math.random() * Math.PI * 2, baseY: m.position.y });
  }

  // confetti — instanced fluttering slips
  const confGeo = new THREE.PlaneGeometry(0.09, 0.14);
  const confMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false });
  confettiMesh = new THREE.InstancedMesh(confGeo, confMat, QUALITY.confetti);
  const confColors = [new THREE.Color(0xf2a7c3), new THREE.Color(0xd9a184), new THREE.Color(0xfff6fa), new THREE.Color(0x9a6bbf)];
  const dummy = new THREE.Object3D();
  confettiMesh.userData.pieces = [];
  for (let i = 0; i < QUALITY.confetti; i++) {
    const piece = {
      x: (Math.random() - 0.5) * 9, y: Math.random() * 8 - 1, z: (Math.random() - 0.5) * 9,
      fall: 0.35 + Math.random() * 0.5, spin: Math.random() * Math.PI * 2,
      spinSpeed: (Math.random() - 0.5) * 3, sway: Math.random() * Math.PI * 2,
    };
    confettiMesh.userData.pieces.push(piece);
    dummy.position.set(piece.x, piece.y, piece.z);
    dummy.updateMatrix();
    confettiMesh.setMatrixAt(i, dummy.matrix);
    confettiMesh.setColorAt(i, confColors[i % confColors.length]);
  }
  confettiMesh.instanceColor.needsUpdate = true;
  cakeGroup.add(confettiMesh);

  cakeGroup.scale.setScalar(0.0001); // hidden until Act IV
})();

function animateCake(t, dt) {
  if (cakeGroup.scale.x < 0.002) return;
  cakeGroup.rotation.y = Math.sin(t * 0.12) * 0.22;

  for (const f of flames) {
    if (!f.lit) continue;
    const flick = 0.85 + Math.sin(t * 11 + f.phase) * 0.12 + Math.sin(t * 23 + f.phase * 2) * 0.06;
    f.flame.scale.set(0.42 * flick, 0.62 * (2 - flick) * 0.9, 1);
    f.flame.position.y = f.baseY + Math.sin(t * 9 + f.phase) * 0.02;
  }
  const target = candleState.level * (1.1 + Math.sin(t * 13) * 0.25);
  candleLight.intensity = damp(candleLight.intensity, target, 0.15, dt);
  candleLight.position.copy(cakeGroup.position).add(new THREE.Vector3(0, 3.4, 0.5));

  for (const b of balloons) {
    b.bg.position.y = b.baseY + Math.sin(t * 0.7 + b.phase) * 0.35;
    b.bg.rotation.z = Math.sin(t * 0.5 + b.phase) * 0.06;
  }
  for (const mh of miniHearts) {
    mh.m.position.y = mh.baseY + Math.sin(t * 0.8 + mh.phase) * 0.3;
    mh.m.rotation.y += dt * 0.8;
  }

  // confetti falls & flutters, respawning at the top
  const dummy = new THREE.Object3D();
  const pieces = confettiMesh.userData.pieces;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    p.y -= p.fall * dt;
    p.spin += p.spinSpeed * dt;
    if (p.y < -2.4) { p.y = 6.5; p.x = (Math.random() - 0.5) * 9; }
    dummy.position.set(p.x + Math.sin(t + p.sway) * 0.3, p.y, p.z);
    dummy.rotation.set(p.spin, p.spin * 0.7, p.sway);
    dummy.updateMatrix();
    confettiMesh.setMatrixAt(i, dummy.matrix);
  }
  confettiMesh.instanceMatrix.needsUpdate = true;
}

/* ───────────────────────── 07 · FIREWORKS ── */

const fireworks = {
  active: [],          // live shells
  rockets: [],         // rising rockets
  running: false,
  timer: 0,
  colors: [PALETTE.pink, PALETTE.purple, PALETTE.roseGold, PALETTE.white, PALETTE.pinkSoft],

  // spawn a rocket that will explode into `pattern` at a random offset
  launch(pattern = "sphere") {
    const from = new THREE.Vector3(
      camera.position.x + (Math.random() - 0.5) * 8,
      camera.position.y - 6,
      camera.position.z - 9
    );
    const to = new THREE.Vector3(
      camera.position.x + (Math.random() - 0.5) * 11,
      camera.position.y - 1 + Math.random() * 4,
      camera.position.z - 8 - Math.random() * 5
    );
    this.rockets.push({ from, to, t: 0, dur: 0.8 + Math.random() * 0.5, pattern });
  },

  explode(at, pattern) {
    const n = QUALITY.burstSize;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const color = this.colors[(Math.random() * this.colors.length) | 0];

    let targets = null;
    if (pattern === "heart") targets = heartPoints(n, 0.34);
    if (pattern === "aya")   targets = sampleTextPoints("AYA", IS_MOBILE ? 6 : 5);

    for (let i = 0; i < n; i++) {
      pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
      if (targets) {
        const tp = targets[i % targets.length];
        vel[i * 3] = tp[0] * 2.4; vel[i * 3 + 1] = tp[1] * 2.4; vel[i * 3 + 2] = tp[2] * 2.4;
      } else {
        // uniform sphere burst
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        const sp = 2.2 + Math.random() * 2.6;
        vel[i * 3]     = Math.sin(ph) * Math.cos(th) * sp;
        vel[i * 3 + 1] = Math.cos(ph) * sp;
        vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color, size: pattern === "sphere" ? 0.42 : 0.46, transparent: true, opacity: 1,
      map: makeGlowTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)", 64),
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    this.active.push({ points, geo, mat, vel, age: 0, life: pattern === "sphere" ? 3.2 : 4.8, shaped: pattern !== "sphere" });
  },

  update(dt) {
    // rockets rise, then burst
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.t += dt / r.dur;
      if (r.t >= 1) {
        this.explode(r.to, r.pattern);
        this.rockets.splice(i, 1);
      }
    }
    // shells expand, drift, fade
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      s.age += dt;
      const k = s.age / s.life;
      const pos = s.geo.attributes.position.array;
      const drag = s.shaped ? 0.55 : 0.9;
      for (let j = 0; j < pos.length; j += 3) {
        s.vel[j] *= (1 - drag * dt); s.vel[j + 1] *= (1 - drag * dt); s.vel[j + 2] *= (1 - drag * dt);
        s.vel[j + 1] -= (s.shaped ? 0.25 : 0.9) * dt; // gentle gravity
        pos[j] += s.vel[j] * dt; pos[j + 1] += s.vel[j + 1] * dt; pos[j + 2] += s.vel[j + 2] * dt;
      }
      s.geo.attributes.position.needsUpdate = true;
      s.mat.opacity = Math.pow(Math.max(0, 1 - k), 1.4);
      if (k >= 1) {
        scene.remove(s.points);
        s.geo.dispose(); s.mat.dispose();
        this.active.splice(i, 1);
      }
    }
    // auto-launch while the show runs
    if (this.running) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0.55 + Math.random() * 0.7;
        const roll = Math.random();
        this.launch(roll < 0.62 ? "sphere" : "heart");
      }
    }
  },

  stop() { this.running = false; this.rockets.length = 0; },
};

/* ─────────────────── 08 · SCROLL CHOREOGRAPHY ── */

gsap.registerPlugin(ScrollTrigger);

// Camera keyframes: vertical position of the lens through the journey.
// Anchors are recomputed on resize from real section offsets.
let camAnchors = [];
function computeAnchors() {
  const doc = document.documentElement.scrollHeight - window.innerHeight;
  const at = (id, frac = 0.5) => {
    const el = document.getElementById(id);
    return Math.min(1, Math.max(0, (el.offsetTop + el.offsetHeight * frac - window.innerHeight * 0.5) / doc));
  };
  camAnchors = [
    { p: 0,                        y: 3.2 },   // opening — adrift in the dark
    { p: at("scene-heart", 0.55),  y: 0 },     // the heart
    { p: at("scene-letter", 0.5),  y: -6 },    // drifting down past the heart
    { p: at("scene-cake", 0.62),   y: -45 },   // the cake
    { p: at("scene-memories", 0.55), y: -70 }, // among the stars
    { p: 1,                        y: -88 },   // the finale heart
  ].sort((a, b) => a.p - b.p);
}
computeAnchors();

// frame-rate independent damping: approach `target` with per-frame factor k at 60fps
function damp(current, target, k, dt) {
  return current + (target - current) * (1 - Math.pow(1 - k, dt * 60));
}

function cameraYAt(p) {
  for (let i = 0; i < camAnchors.length - 1; i++) {
    const a = camAnchors[i], b = camAnchors[i + 1];
    if (p >= a.p && p <= b.p) {
      const k = (p - a.p) / Math.max(1e-6, b.p - a.p);
      const e = k * k * (3 - 2 * k); // smoothstep — cinematic ease between anchors
      return a.y + (b.y - a.y) * e;
    }
  }
  return camAnchors[camAnchors.length - 1].y;
}

// Pointer parallax (mouse + touch-drag both feed normalized coords)
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
function setPointer(cx, cy) {
  pointer.tx = (cx / window.innerWidth) * 2 - 1;
  pointer.ty = -((cy / window.innerHeight) * 2 - 1);
}
window.addEventListener("pointermove", (e) => setPointer(e.clientX, e.clientY), { passive: true });
window.addEventListener("touchmove", (e) => {
  if (e.touches[0]) setPointer(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });

// Heart group visibility windows driven by camera Y (cheap + robust)
let entered = false; // becomes true once Aya taps "Enter Your Surprise"
function syncGroupsWithCamera(camY) {
  const heartIn = entered && camY > -10 && camY < 8;
  const cakeIn = camY < -32 && camY > -58;
  const finaleIn = camY < -78;

  const targetA = heartIn ? heartA.fullScale : 0.0001;
  const targetCake = cakeIn ? 1 : 0.0001;
  const targetB = finaleIn ? heartB.fullScale : 0.0001;

  const dt = syncGroupsWithCamera._dt || 1 / 60;
  heartA.baseScale = damp(heartA.baseScale, targetA, 0.045, dt);
  cakeGroup.scale.setScalar(damp(cakeGroup.scale.x, targetCake, 0.05, dt));
  heartB.baseScale = damp(heartB.baseScale, targetB, 0.04, dt);

  keyLight.intensity = 0.4 + Math.min(1.4, Math.max(0, 1.4 - Math.abs(camY) * 0.12));
  candleLight.visible = cakeIn;
  if (!cakeIn && camY < -58) fireworks.running = false; // show ends as she scrolls on
}

// Section text reveals — line-mask style: wrap once, slide up on enter
document.querySelectorAll(".scene-caption .display").forEach((el) => {
  const wrapper = document.createElement("span");
  wrapper.className = "mask-line";
  wrapper.innerHTML = `<span>${el.innerHTML}</span>`;
  el.innerHTML = "";
  el.appendChild(wrapper);
});
document.querySelectorAll(".scene-caption").forEach((cap) => {
  const line = cap.querySelector(".mask-line > span");
  const brow = cap.querySelector(".eyebrow");
  const tl = gsap.timeline({
    scrollTrigger: { trigger: cap, start: "top 78%", toggleActions: "play none none reverse" },
  });
  if (brow) tl.to(brow, { opacity: 1, duration: 1, ease: "power2.out" });
  if (line) tl.to(line, { y: 0, duration: 1.4, ease: "power4.out" }, brow ? "-=0.6" : 0);
});

// Memory cards drift up as they enter
gsap.utils.toArray(".memory-card").forEach((card, i) => {
  gsap.from(card, {
    opacity: 0, y: 70, duration: 1.3, ease: "power3.out", delay: (i % 2) * 0.12,
    scrollTrigger: { trigger: card, start: "top 88%", toggleActions: "play none none reverse" },
  });
});

// Finale text sequence
ScrollTrigger.create({
  trigger: "#scene-finale", start: "top 45%",
  onEnter: playFinaleText, onLeaveBack: resetFinaleText,
});
let finalePlayed = false;
function playFinaleText() {
  if (finalePlayed) return;
  finalePlayed = true;
  gsap.timeline()
    .to("#finaleAya", { opacity: 1, duration: 1.6, ease: "power2.out" }, 0.3)
    .to("#finaleTitle", { opacity: 1, y: 0, duration: 1.6, ease: "power3.out" }, 1.1)
    .to("#finaleSub", { opacity: 1, duration: 1.4, ease: "power2.out" }, 2)
    .to("#replayBtn", { opacity: 1, duration: 1.2, ease: "power2.out" }, 2.6);
}
function resetFinaleText() {
  finalePlayed = false;
  gsap.set(["#finaleAya", "#finaleSub", "#replayBtn"], { opacity: 0 });
  gsap.set("#finaleTitle", { opacity: 0, y: 30 });
}

// Scroll hint: visible through the middle of the journey
const scrollHint = document.getElementById("scrollHint");
window.addEventListener("scroll", () => {
  const p = window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  scrollHint.classList.toggle("visible", p > 0.03 && p < 0.93);
}, { passive: true });

/* ─────────────────── 09 · OPENING SEQUENCE ── */

const openLines = ["#openLine1", "#openLine2", "#openLine3"].map((s) => document.querySelector(s));
const enterBtn = document.getElementById("enterBtn");

function playOpening() {
  gsap.set(openLines, { opacity: 0, filter: "blur(6px)", y: 14 });
  enterBtn.classList.add("hidden");
  const tl = gsap.timeline();
  openLines.forEach((line, i) => {
    tl.to(line, { opacity: 1, filter: "blur(0px)", y: 0, duration: 1.7, ease: "power2.out" }, 1 + i * 2.4);
    if (i < openLines.length - 1) {
      tl.to(line, { opacity: 0.25, duration: 1.2, ease: "power2.inOut" }, 1 + i * 2.4 + 2.1);
    }
  });
  tl.add(() => enterBtn.classList.remove("hidden"), 1 + 2 * 2.4 + 1.2);
}

enterBtn.addEventListener("click", () => {
  entered = true;
  document.getElementById("musicToggle").classList.add("ready");
  const heartScene = document.getElementById("scene-heart");
  window.scrollTo({ top: heartScene.offsetTop + 10, behavior: "smooth" });
});

/* ─────────────────── 10 · THE LETTER ── */

const LETTER =
`You are one of the most beautiful parts of my life.

I hope this birthday brings you the same happiness, warmth and beautiful moments that you bring into my life.

Today is your day, Aya.

So smile…
make a wish…
and remember that someone is very happy that you exist. ❤`;

const typeTarget = document.getElementById("typewriter");
const caret = document.getElementById("caret");
let typeTimer = null, typed = false;

function typeLetter() {
  if (typed) return;
  typed = true;
  let i = 0;
  (function tick() {
    if (i >= LETTER.length) { caret.style.display = "none"; return; }
    const ch = LETTER[i++];
    typeTarget.textContent += ch;
    let delay = 34 + Math.random() * 40;               // human rhythm
    if (ch === "." || ch === "…") delay = 420;
    else if (ch === ",") delay = 220;
    else if (ch === "\n") delay = 300;
    typeTimer = setTimeout(tick, delay);
  })();
}
function resetLetter() {
  clearTimeout(typeTimer);
  typed = false;
  typeTarget.textContent = "";
  caret.style.display = "";
}
ScrollTrigger.create({
  trigger: "#scene-letter", start: "top 55%",
  onEnter: typeLetter, onLeaveBack: resetLetter,
});

/* ─────────────────── 11 · THE WISH ── */

const wishBtn = document.getElementById("wishBtn");
const wishOverlay = document.getElementById("wishOverlay");
let wishDone = false;

wishBtn.addEventListener("click", () => {
  if (wishDone) return;
  wishDone = true;
  wishBtn.classList.add("hidden");

  // 1 · candles go out, one by one
  flames.forEach((f, i) => {
    gsap.to(f.flame.material, {
      opacity: 0, duration: 0.5, delay: i * 0.35,
      onComplete: () => { f.lit = false; },
    });
  });
  gsap.to(candleState, { level: 0, duration: 1.6, delay: 0.6 });

  // 2 · the dark beat → 3 · fireworks + the words
  wishOverlay.classList.add("lit");
  gsap.timeline()
    .to(wishOverlay, { opacity: 1, duration: 1.2, ease: "power2.inOut" }, 1.4)
    .add(() => {
      fireworks.running = true;
      fireworks.timer = 0.2;
      fireworks.launch("aya");        // the big one — her name in the sky
      fireworks.launch("heart");
      fireworks.launch("sphere");
      fireworks.launch("sphere");
    }, 2.6)
    .to("#wishTitle", { opacity: 1, y: 0, duration: 1.8, ease: "power3.out" }, 3.2)
    .to("#wishSub", { opacity: 1, y: 0, duration: 1.6, ease: "power2.out" }, 4.4);
});

// tap the overlay to fold it away and keep watching the sky
wishOverlay.addEventListener("click", () => {
  gsap.to(wishOverlay, {
    opacity: 0, duration: 1, ease: "power2.inOut",
    onComplete: () => wishOverlay.classList.remove("lit"),
  });
});

function resetWish() {
  wishDone = false;
  wishBtn.classList.remove("hidden");
  candleState.level = 1;
  fireworks.stop();
  gsap.set(wishOverlay, { opacity: 0 });
  wishOverlay.classList.remove("lit");
  gsap.set(["#wishTitle", "#wishSub"], { opacity: 0, y: 24 });
  flames.forEach((f) => {
    f.lit = true;
    gsap.to(f.flame.material, { opacity: 0.95, duration: 0.4 });
  });
}

/* ─────────────────── 12 · MEMORY CARDS TILT ── */

if (!IS_TOUCH) {
  document.querySelectorAll(".memory-card").forEach((card) => {
    let raf = null;
    card.addEventListener("pointermove", (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        const depth = parseFloat(card.dataset.depth || 1);
        gsap.to(card, {
          rotationY: px * 14 * depth, rotationX: -py * 10 * depth,
          z: 30, duration: 0.6, ease: "power2.out",
        });
        raf = null;
      });
    });
    card.addEventListener("pointerleave", () => {
      gsap.to(card, { rotationY: 0, rotationX: 0, z: 0, duration: 1, ease: "elastic.out(1, 0.5)" });
    });
  });
} else {
  // gentle autonomous sway on touch devices
  document.querySelectorAll(".memory-card").forEach((card, i) => {
    gsap.to(card, {
      rotationY: 4 * (i % 2 ? 1 : -1), y: "-=8",
      duration: 3 + i * 0.4, yoyo: true, repeat: -1, ease: "sine.inOut",
    });
  });
}

/* ─────────────────── 13 · GENERATIVE MUSIC ──
   A soft music-box over slow pads — synthesized in WebAudio,
   so there are no assets to load and nothing to autoplay.   */

const music = (() => {
  let ctx = null, master = null, playing = false, schedTimer = null;

  const PAD_CHORDS = [
    [261.63, 329.63, 392.0, 493.88],  // Cmaj7
    [220.0, 261.63, 329.63, 392.0],   // Am7
    [174.61, 220.0, 261.63, 349.23],  // Fmaj7
    [196.0, 246.94, 293.66, 392.0],   // G
  ];
  const MELODY = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C pentatonic-ish, high register

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    // gentle space: feedback delay as a poor-man's reverb
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    master.connect(ctx.destination);
    master.connect(delay); delay.connect(fb); fb.connect(delay);
    delay.connect(wet); wet.connect(ctx.destination);
  }

  function pad(freqs, when, dur = 9) {
    freqs.forEach((f) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.045, when + dur * 0.4);
      g.gain.linearRampToValueAtTime(0, when + dur);
      o.connect(lp); lp.connect(g); g.connect(master);
      o.start(when); o.stop(when + dur + 0.1);
    });
  }

  function bell(freq, when) {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 3.01;
    const g = ctx.createGain(), g2 = ctx.createGain();
    g.gain.setValueAtTime(0.09, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 2.4);
    g2.gain.setValueAtTime(0.02, when);
    g2.gain.exponentialRampToValueAtTime(0.0001, when + 1.1);
    o.connect(g); g.connect(master);
    o2.connect(g2); g2.connect(master);
    o.start(when); o.stop(when + 2.5);
    o2.start(when); o2.stop(when + 1.2);
  }

  let bar = 0;
  function schedule() {
    if (!playing) return;
    const now = ctx.currentTime + 0.15;
    pad(PAD_CHORDS[bar % PAD_CHORDS.length], now, 9);
    // sparse music-box phrase
    let t = now + Math.random() * 0.4;
    const notes = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < notes; i++) {
      bell(MELODY[(Math.random() * MELODY.length) | 0], t);
      t += 0.55 + Math.random() * 0.9;
    }
    bar++;
    schedTimer = setTimeout(schedule, 8000);
  }

  return {
    toggle() {
      if (!ctx) init();
      if (ctx.state === "suspended") ctx.resume();
      playing = !playing;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      if (playing) {
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0.9, now + 2.4); // smooth fade-in
        schedule();
      } else {
        master.gain.linearRampToValueAtTime(0, now + 1.2);
        clearTimeout(schedTimer);
      }
      return playing;
    },
  };
})();

const musicToggle = document.getElementById("musicToggle");
musicToggle.addEventListener("click", () => {
  const on = music.toggle();
  musicToggle.classList.toggle("playing", on);
});

/* ─────────────────── 14 · REPLAY ── */

document.getElementById("replayBtn").addEventListener("click", () => {
  resetWish();
  resetLetter();
  resetFinaleText();
  entered = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(playOpening, 700);
});

/* ─────────────────── 15 · MAIN LOOP ── */

const clock = new THREE.Clock();
let camY = 3.2, camX = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // scroll → camera height
  const doc = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const p = window.scrollY / doc;
  const targetY = cameraYAt(p);
  camY = damp(camY, targetY, 0.06, dt);

  // pointer parallax
  pointer.x = damp(pointer.x, pointer.tx, 0.04, dt);
  pointer.y = damp(pointer.y, pointer.ty, 0.04, dt);
  camX = damp(camX, pointer.x * 1.1, 0.05, dt);

  const camZ = (window.innerWidth / window.innerHeight > 1 ? 7.4 : 9) + Math.sin(t * 0.07) * 0.5;
  camera.position.set(
    camX + Math.sin(t * 0.1) * 0.4,
    camY + pointer.y * 0.5 + Math.sin(t * 0.14) * 0.25,
    camZ
  );
  camera.lookAt(camX * 0.4, camY - 1.2, 0);

  syncGroupsWithCamera._dt = dt;
  syncGroupsWithCamera(camY);
  animateHeart(heartA, t, dt);
  animateHeart(heartB, t, dt);
  animateCake(t, dt);
  fireworks.update(dt);

  // ambient life
  starLayers.forEach((l, i) => {
    l.mat.opacity = 0.6 + Math.sin(t * (0.6 + i * 0.35) + l.phase) * 0.3;
  });
  const dpos = dust.points.geometry.attributes.position.array;
  for (let i = 0; i < dust.n; i++) {
    dpos[i * 3 + 1] += dust.speed[i] * dt;
    dpos[i * 3] += Math.sin(t * 0.4 + i) * 0.002;
    if (dpos[i * 3 + 1] > 18) dpos[i * 3 + 1] = 18 - worldHeight;
  }
  dust.points.geometry.attributes.position.needsUpdate = true;
  nebulae.forEach((n) => {
    n.sprite.material.rotation += n.rot;
    n.mat.opacity = 0.7 + Math.sin(t * 0.2 + n.phase) * 0.15;
  });

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

/* ── boot ── */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  computeAnchors();
  ScrollTrigger.refresh();
});

// fonts settle before first reveal so text sprites render in Cormorant
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => ScrollTrigger.refresh());
}

playOpening();
tick();
