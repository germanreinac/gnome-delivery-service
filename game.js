/* Gnome Delivery Service — 3D prototype (three.js r128).
   Every level is one long bent pipe. Gameplay lives in pipe coordinates:
     s = distance along the pipe, u = sideways across the walkway, h = height above it.
   pos(s, u, h) maps that onto the curved pipe, so bends and slopes cost no collision code.
   The roll on the gnome's back is both the cargo and the health bar. */
(() => {
'use strict';

const HALF = 2.6, EDGE = 2.2;                     // walkway half-width, how far entities may stray
const PR = 3.6, PC = Math.sqrt(PR * PR - HALF * HALF); // pipe radius, height of its centre above the walkway
const GRAV = 22, RUN = 7, JUMP = 8;
const MAX_SHEETS = 12, LEAD = 10, DS = 0.5;
const DISPLAY = '"Lilita One", "Arial Rounded MT Bold", sans-serif';
const BODY = 'Nunito, system-ui, sans-serif';

/* ---------- levels ----------
   path:   [length, turnDegrees, climb] pieces, laid end to end.
   pits:   [s0, s1] the walkway is missing; sewage below.
   boxes:  [s0, s1, u0, u1, top] solid slabs. top 0 = bridge over a pit, higher = crate or pipe to hop.
   things: [kind, s, u]  R rat, C cockroach, B clogling, P spare roll. */
const LEVELS = [
  { name: 'The Main Drain', customer: 'Apartment 3B', note: 'There is NO paper. Hurry!!', time: 60,
    path: [[30, 0, 0], [20, 60, 0], [20, 0, -3], [20, -60, 0], [25, 0, 0], [20, -50, 0], [20, 50, 2]],
    pits: [[26, 29], [58, 61], [88, 96], [120, 123]],
    boxes: [[88, 96, -2.4, -0.8, 0], [42, 43.5, -2.6, 0, 0.9], [105, 106, -2.6, 2.6, 0.7]],
    things: [['R', 36, 1], ['P', 42.7, -1.3], ['C', 50, 0], ['R', 72, -1], ['C', 93, -1.6], ['P', 100, 1], ['R', 112, 0], ['C', 135, 1]] },
  { name: 'The U-Bend', customer: 'Café Bruma, staff toilet', note: 'Customer waiting. Roll holder is empty.', time: 75,
    path: [[20, 0, 0], [24, 0, -7], [30, 70, 0], [24, -70, 0], [20, 0, 0], [24, 0, 7], [20, -60, 0], [25, 60, 0]],
    pits: [[15, 18], [48, 57], [80, 83], [110, 118], [140, 143], [160, 163]],
    boxes: [[51.5, 53.5, -1.1, 1.1, 0], [110, 118, 0.8, 2.4, 0], [66, 67, -2.6, 2.6, 0.7], [95, 97, 0, 2.6, 0.9], [128, 129, -2.6, 2.6, 0.7]],
    things: [['C', 10, 0], ['R', 30, 1], ['B', 40, -1], ['P', 52.5, 0], ['R', 62, 0], ['C', 72, 1], ['B', 90, -1], ['P', 96, 1.3],
      ['R', 102, 0], ['C', 114, 1.6], ['B', 123, 0], ['R', 134, -1], ['C', 150, 0], ['P', 152, 1.5], ['B', 172, 0]] },
  { name: 'The Grease Trap', customer: 'Night bus depot', note: 'Forty drivers. One cubicle. Zero rolls.', time: 95,
    path: [[20, 0, 0], [20, -70, 0], [20, 70, -4], [25, 0, 0], [20, 80, 0], [20, -80, 0], [25, 0, 5], [20, -60, 0], [20, 60, 0], [30, 0, 0]],
    pits: [[12, 15], [19, 22], [26, 29], [50, 60], [85, 88], [100, 109], [135, 138], [150, 153], [170, 178], [195, 198]],
    boxes: [[50, 55.5, -2.4, -1, 0], [54.5, 60, 1, 2.4, 0], [103.5, 105.5, -1.1, 1.1, 0], [170, 178, -0.8, 0.8, 0],
      [40, 41, -2.6, 2.6, 0.7], [72, 73.5, -2.6, 0, 0.9], [120, 121, -2.6, 2.6, 0.7], [160, 161, -2.6, 2.6, 0.7], [185, 186.5, 0, 2.6, 0.9]],
    things: [['R', 33, 0], ['C', 36, 1], ['B', 45, 0], ['P', 52, -1.7], ['R', 65, 0], ['C', 68, -1], ['C', 78, 1], ['B', 93, 0], ['P', 104.5, 0],
      ['R', 115, 0], ['B', 126, 1], ['R', 143, 0], ['C', 146, 1], ['B', 165, 0], ['C', 174, 0], ['P', 181, -1.5], ['R', 182, 1],
      ['P', 185.7, 1.3], ['R', 191, 0], ['B', 205, 0], ['C', 208, -1]] },
];

/* ---------- three.js setup ---------- */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('view'), antialias: true });
const hudCanvas = document.getElementById('hud');
const ctx = hudCanvas.getContext('2d');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1615);
scene.fog = new THREE.Fog(0x0a1615, 10, 56);
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 120);
scene.add(new THREE.HemisphereLight(0xa8e0d0, 0x2c3a24, 0.62));
const lantern = new THREE.PointLight(0xffe2b0, 1.25, 28);
scene.add(lantern);

let LW = 960, LH = 540; // HUD logical size
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!w || !h) return;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w < h ? 78 : 60; camera.updateProjectionMatrix();
  const k = Math.max(0.75, Math.min(w / 960, h / 540));
  LW = w / k; LH = h / k;
  hudCanvas.width = w * dpr; hudCanvas.height = h * dpr;
  ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
}
addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

/* ---------- textures & materials ---------- */
function canvasTexture(size, paint) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const brickTex = canvasTexture(256, (g, n) => {
  g.fillStyle = '#5a6e64'; g.fillRect(0, 0, n, n);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
    const v = 86 + ((r * 7 + c * 13) % 5) * 7;
    g.fillStyle = `rgb(${v - 14},${v + 12},${v})`;
    g.fillRect(c * 64 + (r % 2 ? 32 : 0) - 64 + 3, r * 32 + 3, 58, 26); g.fillRect(c * 64 + (r % 2 ? 32 : 0) + 3, r * 32 + 3, 58, 26);
  }
  g.fillStyle = 'rgba(120,160,80,0.35)';
  for (let i = 0; i < 9; i++) g.fillRect((i * 53) % n, 0, 5 + (i % 3) * 3, 40 + (i * 37) % 120);
});
const floorTex = canvasTexture(256, (g, n) => {
  g.fillStyle = '#7f9c5e'; g.fillRect(0, 0, n, n);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    g.fillStyle = (r + c) % 2 ? '#66756c' : '#6f7f75'; g.fillRect(c * 64 + 2, r * 64 + 2, 60, 60);
  }
  g.fillStyle = 'rgba(60,90,50,0.4)';
  for (let i = 0; i < 30; i++) g.fillRect((i * 71) % n, (i * 113) % n, 10, 6);
});
const sewageTex = canvasTexture(128, (g, n) => {
  g.fillStyle = '#7f9a3a'; g.fillRect(0, 0, n, n);
  g.strokeStyle = '#b6cf6c'; g.lineWidth = 3;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo((i * 47) % n, (i * 29) % n); g.lineTo((i * 47) % n + 6, (i * 29) % n + 26); g.stroke(); }
});
const lam = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra));
const M = {
  wall: lam(0xffffff, { map: brickTex, side: THREE.DoubleSide }),
  floor: lam(0xffffff, { map: floorTex, side: THREE.DoubleSide }),
  sewage: lam(0xffffff, { map: sewageTex, emissive: 0x2c3c12, side: THREE.DoubleSide }),
  copper: lam(0xb7743c, { side: THREE.DoubleSide }), crate: lam(0x9a6b3c, { side: THREE.DoubleSide }),
  joint: lam(0x3f6b62), porcelain: lam(0xf1eee4, { side: THREE.DoubleSide }),
  paper: lam(0xf7f4ea, { side: THREE.DoubleSide }), rope: lam(0x7a5230), card: lam(0xa98258),
  hat: lam(0xd8432f), tunic: lam(0x2f6fa8), skin: lam(0xeab98f), nose: lam(0xe09a7a), boot: lam(0x4a3222), gold: lam(0xe2b23c),
  wood: lam(0xc99a5b), rubber: lam(0xb3261e), black: lam(0x151515),
  rat: lam(0x8a8582), pink: lam(0xd78a9a), eye: new THREE.MeshBasicMaterial({ color: 0xff4030 }),
  roach: lam(0x6b3d1e), roachHi: lam(0xa2673a), clog: lam(0x4d382d), white: lam(0xf3efe2),
  glow: new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
  splash: new THREE.MeshBasicMaterial({ color: 0xa9c46a }), poof: new THREE.MeshBasicMaterial({ color: 0xb9b3a2 }), star: new THREE.MeshBasicMaterial({ color: 0xffe27a }),
};
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const sphere = (r, mat, x, y, z) => mesh(new THREE.SphereGeometry(r, 12, 10), mat, x, y, z);

/* ---------- state ---------- */
const G = {
  state: 'title', levelIndex: 0, tips: 0, t: 0, level: null, len: 0, pts: [],
  group: null, player: null, enemies: [], pickups: [], particles: [],
  timeLeft: 0, shake: 0, result: null, banner: null,
};
window.__gds = G;

/* ---------- pipe geometry ---------- */
const smooth = t => t * t * (3 - 2 * t);
function makePath(spec) {
  const pts = []; let x = 0, y = 0, z = 0, th = 0;
  for (const [len, turn, dy] of [[LEAD, 0, 0], ...spec, [8, 0, 0]]) {
    const n = Math.round(len / DS);
    for (let i = 0; i < n; i++) {
      pts.push({ x, y, z, th });
      th += turn * Math.PI / 180 / n;
      x += Math.sin(th) * DS; z += Math.cos(th) * DS;
      y += dy * (smooth((i + 1) / n) - smooth(i / n));
    }
  }
  pts.push({ x, y, z, th });
  return pts;
}
function sample(s) {
  const f = Math.max(0, Math.min(G.pts.length - 1.001, (s + LEAD) / DS)), i = Math.floor(f), t = f - i, a = G.pts[i], b = G.pts[i + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, th: a.th + (b.th - a.th) * t };
}
function pos(s, u, h, out = new THREE.Vector3()) {
  const p = sample(s);
  return out.set(p.x - Math.cos(p.th) * u, p.y + h, p.z + Math.sin(p.th) * u);
}
/* Sweep a cross-section (list of [u, h]) along the pipe from s0 to s1. */
function extrude(profile, s0, s1, mat, caps) {
  const n = Math.max(1, Math.ceil((s1 - s0) / DS)), P = [], UV = [], rings = [], plen = [0];
  for (let j = 1; j < profile.length; j++) plen.push(plen[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));
  for (let k = 0; k <= n; k++) { const s = s0 + (s1 - s0) * k / n; rings.push(profile.map(([u, h]) => pos(s, u, h))); }
  const tri = (a, b, c, ua, ub, uc) => { P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); UV.push(...ua, ...ub, ...uc); };
  for (let k = 0; k < n; k++) {
    const v0 = (s0 + (s1 - s0) * k / n) / 4, v1 = (s0 + (s1 - s0) * (k + 1) / n) / 4;
    for (let j = 0; j < profile.length - 1; j++) {
      const a = rings[k][j], b = rings[k][j + 1], c = rings[k + 1][j + 1], d = rings[k + 1][j], u0 = plen[j] / 4, u1 = plen[j + 1] / 4;
      tri(a, b, c, [u0, v0], [u1, v0], [u1, v1]); tri(a, c, d, [u0, v0], [u1, v1], [u0, v1]);
    }
  }
  if (caps) for (const r of [rings[0], rings[n]]) {
    tri(r[0], r[1], r[2], [0, 0], [1, 0], [1, 0.3]); tri(r[0], r[2], r[3], [0, 0], [1, 0.3], [0, 0.3]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
const rect = (u0, u1, top, bot) => [[u0, top], [u1, top], [u1, bot], [u0, bot], [u0, top]];

function buildWorld(L) {
  const g = new THREE.Group(), len = G.len;
  // pipe wall
  const arc = [[HALF, -1.3]], a0 = Math.atan2(-PC, HALF);
  for (let i = 0; i <= 28; i++) { const a = a0 + (Math.PI - 2 * a0) * i / 28; arc.push([PR * Math.cos(a), PC + PR * Math.sin(a)]); }
  arc.push([-HALF, -1.3]);
  g.add(extrude(arc, -LEAD, len + 8, M.wall));
  g.add(extrude([[-HALF, -0.9], [HALF, -0.9]], -LEAD, len + 8, M.sewage));
  // walkway, broken by pits
  let from = -LEAD;
  for (const [a, b] of [...L.pits, [len + 8, 0]]) { g.add(extrude(rect(-HALF, HALF, 0, -1.3), from, a, M.floor, true)); from = b; }
  for (const [s0, s1, u0, u1, top] of L.boxes)
    g.add(extrude(rect(u0, u1, top, top ? 0 : -0.3), s0, s1, top ? (u1 - u0 > 5 ? M.copper : M.crate) : M.copper, true));
  // joints and lamps for a sense of speed
  for (let s = 5; s < len + 6; s += 10) {
    const p = sample(s), ring = mesh(new THREE.TorusGeometry(PR - 0.05, 0.2, 6, 28), M.joint, p.x, p.y + PC, p.z);
    ring.rotation.y = p.th; g.add(ring);
    if (s % 20 === 5) g.add(sphere(0.22, M.lamp, p.x, p.y + PC + PR - 0.35, p.z));
  }
  // end walls
  for (const s of [-LEAD + 0.5, len + 6]) {
    const p = sample(s), wall = mesh(new THREE.CircleGeometry(PR + 0.3, 24), M.wall, p.x, p.y + PC, p.z);
    wall.material.side = THREE.DoubleSide; wall.rotation.y = p.th; g.add(wall);
  }
  // the customer's pipe: porcelain down from the ceiling, bathroom light spilling out
  const e = sample(len - 3), exit = new THREE.Group();
  exit.position.set(e.x, e.y, e.z);
  exit.add(mesh(new THREE.CylinderGeometry(0.95, 0.95, 3.2, 20, 1, true), M.porcelain, 0, 4.6, 0));
  exit.add(mesh(new THREE.TorusGeometry(1.0, 0.16, 8, 24), M.porcelain, 0, 3.0, 0).rotateX(Math.PI / 2));
  const beam = mesh(new THREE.CylinderGeometry(0.9, 1.9, 3.0, 20, 1, true), M.glow, 0, 1.5, 0); exit.add(beam);
  const light = new THREE.PointLight(0xfff0b0, 1.4, 18); light.position.y = 2.2; exit.add(light);
  g.add(exit); G.beam = beam;
  return g;
}

/* ---------- characters ---------- */
function buildGnome() {
  const g = new THREE.Group(), box = (w, h, d, m, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
  const bootL = box(0.22, 0.16, 0.38, M.boot, -0.15, 0.08, 0.05), bootR = box(0.22, 0.16, 0.38, M.boot, 0.15, 0.08, 0.05);
  const torso = new THREE.Group();
  torso.add(mesh(new THREE.CylinderGeometry(0.25, 0.34, 0.5, 14), M.tunic, 0, 0.41, 0));
  torso.add(mesh(new THREE.CylinderGeometry(0.335, 0.345, 0.09, 14), M.boot, 0, 0.3, 0));
  torso.add(box(0.12, 0.13, 0.05, M.gold, 0, 0.3, 0.33));
  torso.add(sphere(0.26, M.skin, 0, 0.86, 0));
  torso.add(mesh(new THREE.ConeGeometry(0.24, 0.46, 12), M.paper, 0, 0.62, 0.15).rotateX(Math.PI));
  torso.add(sphere(0.075, M.nose, 0, 0.86, 0.27));
  torso.add(sphere(0.035, M.black, -0.1, 0.94, 0.23)); torso.add(sphere(0.035, M.black, 0.1, 0.94, 0.23));
  torso.add(mesh(new THREE.ConeGeometry(0.31, 0.8, 14), M.hat, 0, 1.4, -0.05).rotateX(-0.14));
  // the cargo: one big roll, roped on like a backpack
  const roll = new THREE.Group(); roll.position.set(0, 0.62, -0.66);
  roll.add(mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.84, 22), M.paper).rotateZ(Math.PI / 2));
  roll.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.86, 12), M.card).rotateZ(Math.PI / 2));
  for (const x of [-0.24, 0.24]) roll.add(mesh(new THREE.TorusGeometry(0.47, 0.035, 6, 22), M.rope, x, 0, 0).rotateY(Math.PI / 2));
  const tail = mesh(new THREE.PlaneGeometry(0.5, 0.7), M.paper, 0, -0.35, 0); tail.geometry.translate(0, -0.35, 0); tail.position.set(0, -0.38, -0.2);
  roll.add(tail);
  for (const x of [-0.18, 0.18]) torso.add(box(0.05, 0.05, 0.5, M.rope, x, 0.66, -0.25));
  torso.add(roll);
  // plunger arm, pivoting at the shoulder
  const arm = new THREE.Group(); arm.position.set(0.36, 0.58, 0.05);
  arm.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), M.wood, 0, 0.4, 0));
  arm.add(mesh(new THREE.ConeGeometry(0.17, 0.22, 14), M.rubber, 0, 0.88, 0).rotateX(Math.PI));
  arm.add(sphere(0.08, M.skin, 0, 0.05, 0));
  torso.add(arm);
  g.add(bootL, bootR, torso);
  g.userData = { bootL, bootR, torso, roll, tail, arm };
  return g;
}
function buildEnemy(kind) {
  const g = new THREE.Group();
  if (kind === 'R') {
    const b = sphere(1, M.rat, 0, 0.3, 0); b.scale.set(0.32, 0.27, 0.52); g.add(b);
    g.add(mesh(new THREE.ConeGeometry(0.2, 0.42, 10), M.rat, 0, 0.3, 0.62).rotateX(Math.PI / 2));
    g.add(sphere(0.1, M.pink, -0.15, 0.5, 0.42), sphere(0.1, M.pink, 0.15, 0.5, 0.42), sphere(0.05, M.pink, 0, 0.3, 0.84));
    g.add(sphere(0.045, M.eye, -0.1, 0.38, 0.62), sphere(0.045, M.eye, 0.1, 0.38, 0.62));
    const tail = mesh(new THREE.CylinderGeometry(0.035, 0.012, 0.8, 6), M.pink, 0, 0.36, -0.8).rotateX(Math.PI / 2 - 0.35); g.add(tail);
    g.userData.tail = tail; g.scale.setScalar(1.35);
  } else if (kind === 'C') {
    const b = sphere(1, M.roach, 0, 0.15, 0); b.scale.set(0.24, 0.1, 0.4); g.add(b);
    const hi = sphere(1, M.roachHi, 0, 0.2, -0.04); hi.scale.set(0.16, 0.07, 0.28); g.add(hi);
    g.add(sphere(0.1, M.roach, 0, 0.14, 0.38));
    g.userData.legs = [];
    for (const z of [-0.2, 0, 0.2]) { const leg = mesh(new THREE.BoxGeometry(0.8, 0.025, 0.03), M.black, 0, 0.08, z); g.add(leg); g.userData.legs.push(leg); }
    for (const x of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), M.black, x * 0.1, 0.25, 0.6).rotateX(1.1).rotateZ(-x * 0.3));
    g.scale.setScalar(1.3);
  } else {
    const blob = new THREE.Group(); blob.position.y = 0;
    blob.add(mesh(new THREE.IcosahedronGeometry(0.45, 1), M.clog, 0, 0.45, 0));
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4, e = 0.2 + (i % 5) * 0.28, d = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      const spike = mesh(new THREE.ConeGeometry(0.06, 0.45, 5), M.clog, d.x * 0.5, 0.45 + d.y * 0.5, d.z * 0.5);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); blob.add(spike);
    }
    blob.add(sphere(0.14, M.white, -0.15, 0.55, 0.36), sphere(0.11, M.white, 0.17, 0.52, 0.37));
    blob.add(sphere(0.06, M.black, -0.15, 0.55, 0.48), sphere(0.05, M.black, 0.17, 0.52, 0.46));
    g.add(blob); g.userData.blob = blob;
  }
  return g;
}
function buildPickup() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.42, 18), M.paper).rotateZ(Math.PI / 2));
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.44, 10), M.card).rotateZ(Math.PI / 2));
  g.add(sphere(0.6, M.glow, 0, 0, 0));
  return g;
}

/* ---------- level loading ---------- */
function ground(s, u) {
  const L = G.level; let g = -Infinity;
  for (const [s0, s1, u0, u1, top] of L.boxes) if (s >= s0 && s <= s1 && u >= u0 && u <= u1 && top > g) g = top;
  if (g > -Infinity) return g;
  for (const [a, b] of L.pits) if (s > a && s < b) return -Infinity;
  return 0;
}
G.ground = ground;

function loadLevel(i) {
  const L = LEVELS[i];
  if (G.group) scene.remove(G.group);
  for (const q of G.particles) scene.remove(q.mesh);
  Object.assign(G, { level: L, pts: makePath(L.path), len: L.path.reduce((a, p) => a + p[0], 0), enemies: [], pickups: [], particles: [],
    timeLeft: L.time, banner: null, shake: 0, said50: false, said25: false });
  G.group = buildWorld(L); scene.add(G.group);
  const pm = buildGnome(); G.group.add(pm);
  G.player = { s: 2, u: 0, h: 0, vs: 0, vu: 0, vh: 0, face: 0, onGround: true, sheets: MAX_SHEETS, invuln: 0, knock: 0, attack: 0, cooldown: 0,
    swing: 0, coyote: 0, jbuf: 0, walk: 0, safe: { s: 2, u: 0, h: 0 }, mesh: pm };
  for (const [kind, s, u] of L.things) {
    if (kind === 'P') { const m = buildPickup(); G.group.add(m); G.pickups.push({ s, u, h: Math.max(0, ground(s, u)) + 0.75, mesh: m }); continue; }
    const m = buildEnemy(kind); G.group.add(m);
    G.enemies.push({ kind, s, u, h: Math.max(0, ground(s, u)), vs: 0, vu: 0, vh: 0, hp: kind === 'C' ? 1 : 2, face: Math.PI, onGround: true,
      stun: 0, flash: 0, hitBy: 0, timer: (s % 5) * 0.3, home: s, dir: 1, mesh: m });
  }
  camReady = false;
}

/* ---------- input ---------- */
const held = {}, pressed = {}, stickAxis = { x: 0, y: 0 };
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyX: 'attack', KeyJ: 'attack', KeyK: 'attack', Enter: 'confirm' };
function press(k) { if (!held[k]) pressed[k] = true; held[k] = true; audioInit(); }
function release(k) { held[k] = false; }
addEventListener('keydown', e => { const k = KEYMAP[e.code]; if (k) { press(k); e.preventDefault(); } });
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) release(k); });
addEventListener('blur', () => { for (const k in held) held[k] = false; });
stage.addEventListener('pointerdown', e => { if (e.target.tagName === 'CANVAS') pressed.confirm = true; audioInit(); });
for (const b of document.querySelectorAll('[data-key]')) {
  const k = b.dataset.key;
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); press(k); if (G.state !== 'play') pressed.confirm = true; });
  for (const ev of ['pointerup', 'pointercancel']) b.addEventListener(ev, () => { b.classList.remove('on'); release(k); });
  b.addEventListener('contextmenu', e => e.preventDefault());
}
{ // thumb stick
  const stick = document.getElementById('stick'), knob = stick.firstElementChild;
  const set = e => {
    const r = stick.getBoundingClientRect(), R = r.width / 2;
    let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const d = Math.hypot(x, y);
    if (d > 1) { x /= d; y /= d; }
    stickAxis.x = Math.abs(x) < 0.15 ? 0 : x; stickAxis.y = Math.abs(y) < 0.15 ? 0 : -y;
    knob.style.transform = `translate(${x * R * 0.6}px, ${y * R * 0.6}px)`;
  };
  stick.addEventListener('pointerdown', e => { e.preventDefault(); stick.setPointerCapture(e.pointerId); set(e); audioInit(); });
  stick.addEventListener('pointermove', e => { if (stick.hasPointerCapture(e.pointerId)) set(e); });
  for (const ev of ['pointerup', 'pointercancel']) stick.addEventListener(ev, () => { stickAxis.x = stickAxis.y = 0; knob.style.transform = ''; });
}

/* ---------- sound (tiny synth blips) ---------- */
let ac = null;
function audioInit() { if (ac === null) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = false; } } }
function blip(freq, dur, type = 'square', slide = 0, vol = 0.05) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
}

/* ---------- simulation ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function step(e, dt) {
  const ns = clamp(e.s + e.vs * dt, 0.5, G.len - 1.5);
  e.blocked = ground(ns, e.u) > e.h + 0.35;
  if (!e.blocked) e.s = ns;
  const nu = clamp(e.u + e.vu * dt, -EDGE, EDGE);
  if (ground(e.s, nu) <= e.h + 0.35) e.u = nu;
  e.vh -= GRAV * dt; e.h += e.vh * dt;
  const g = ground(e.s, e.u);
  e.onGround = false;
  if (e.h <= g) { e.h = g; e.vh = 0; e.onGround = true; }
}
const walkable = (e, s, u) => { const g = ground(s, u); return g > e.h - 0.5 && g <= e.h + 0.35; };

const PGEO = { sheet: new THREE.PlaneGeometry(0.24, 0.17), dot: new THREE.SphereGeometry(0.09, 6, 5) };
function burst(type, s, u, h, n, speed = 4) {
  const at = pos(s, u, h);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(type === 'sheet' ? PGEO.sheet : PGEO.dot, type === 'sheet' ? M.paper : M[type]);
    m.position.copy(at); scene.add(m);
    const a = Math.random() * 6.28, sp = speed * (0.3 + Math.random() * 0.7);
    G.particles.push({ type, mesh: m, vx: Math.cos(a) * sp, vy: speed * (0.5 + Math.random()), vz: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.6 });
  }
}
function updateParticles(dt) {
  for (const q of G.particles) {
    q.life -= dt; q.vy -= (q.type === 'sheet' ? 6 : 16) * dt;
    q.mesh.position.x += q.vx * dt; q.mesh.position.y += q.vy * dt; q.mesh.position.z += q.vz * dt;
    if (q.type === 'sheet') { q.mesh.rotation.x += dt * 7; q.mesh.rotation.z += dt * 5; q.vx *= 0.97; q.vz *= 0.97; }
    if (q.life <= 0) scene.remove(q.mesh);
  }
  G.particles = G.particles.filter(q => q.life > 0);
}

function loseSheets(n) {
  const p = G.player;
  p.sheets = Math.max(0, p.sheets - n);
  burst('sheet', p.s, p.u, p.h + 0.8, n * 3);
  G.shake = 0.25;
  if (p.sheets === 0) finish(false, 'The roll is gone. Nothing left to deliver.');
}
function finish(ok, text) {
  if (G.state !== 'play') return;
  const p = G.player, L = G.level;
  if (ok) {
    const stars = 1 + (p.sheets >= MAX_SHEETS * 0.6 ? 1 : 0) + (G.timeLeft >= L.time * 0.3 ? 1 : 0);
    const tip = stars * 5 + p.sheets;
    G.tips += tip;
    G.result = { ok, stars, tip, text: ['', 'Is this… damp? One star.', 'A bit crumpled, but it will do.', 'Five stars. You saved my life.'][stars] };
    G.state = 'delivered';
    blip(523, 0.12, 'triangle'); setTimeout(() => blip(659, 0.12, 'triangle'), 110); setTimeout(() => blip(784, 0.25, 'triangle'), 220);
  } else {
    G.result = { ok, text }; G.state = 'failed';
    blip(220, 0.5, 'sawtooth', -150);
  }
  G.t = 0;
}

function updatePlayer(dt) {
  const p = G.player;
  let ax = (held.right ? 1 : 0) - (held.left ? 1 : 0) + stickAxis.x, ay = (held.up ? 1 : 0) - (held.down ? 1 : 0) + stickAxis.y;
  const mag = Math.hypot(ax, ay); if (mag > 1) { ax /= mag; ay /= mag; }
  if (p.knock > 0) p.knock -= dt;
  else {
    const k = Math.min(1, dt * 12);
    p.vs += (ay * RUN * (ay < 0 ? 0.75 : 1) - p.vs) * k; p.vu += (ax * RUN * 0.85 - p.vu) * k;
    if (mag > 0.2) { let d = Math.atan2(ax, ay) - p.face; d = Math.atan2(Math.sin(d), Math.cos(d)); p.face += d * Math.min(1, dt * 14); }
  }
  p.coyote = p.onGround ? 0.1 : p.coyote - dt;
  p.jbuf = pressed.jump ? 0.12 : p.jbuf - dt;
  if (p.jbuf > 0 && p.coyote > 0) { p.vh = JUMP; p.jbuf = 0; p.coyote = 0; p.onGround = false; blip(330, 0.12, 'square', 220, 0.03); }
  if (!held.jump && p.vh > 0) p.vh -= GRAV * dt * 1.2; // release early for a short hop
  step(p, dt);
  p.walk = p.onGround && Math.hypot(p.vs, p.vu) > 0.8 ? p.walk + dt * 13 : 0;
  if (p.onGround && p.knock <= 0 && isFinite(ground(p.s - 0.5, p.u)) && isFinite(ground(p.s + 0.5, p.u))) p.safe = { s: p.s, u: p.u, h: p.h };

  p.cooldown -= dt; p.attack -= dt; p.invuln -= dt;
  if (pressed.attack && p.cooldown <= 0) { p.attack = 0.22; p.cooldown = 0.36; p.swing++; blip(180, 0.08, 'sawtooth', 200, 0.04); }

  if (p.h < -0.75) {
    burst('splash', p.s, p.u, -0.8, 14, 5);
    blip(140, 0.3, 'sine', -80, 0.08);
    Object.assign(p, { s: p.safe.s, u: p.safe.u, h: p.safe.h, vs: 0, vu: 0, vh: 0, invuln: 1.5, knock: 0 });
    loseSheets(3);
    G.banner = { text: 'Soggy! −3 sheets', t: 1.4 };
  }
  for (const k of G.pickups) {
    if (!k.taken && Math.hypot(k.s - p.s, k.u - p.u) < 1 && Math.abs(k.h - p.h - 0.6) < 1.4) {
      k.taken = true; k.mesh.visible = false;
      p.sheets = Math.min(MAX_SHEETS, p.sheets + 3);
      burst('star', k.s, k.u, k.h, 8, 3);
      blip(660, 0.1, 'triangle', 300);
    }
  }
  if (p.s >= G.len - 4.2) finish(true);
}

function updateEnemies(dt) {
  const p = G.player, fs = Math.cos(p.face), fu = Math.sin(p.face);
  for (const e of G.enemies) {
    e.flash -= dt; e.timer += dt;
    const ds = p.s - e.s, du = p.u - e.u, d = Math.hypot(ds, du) || 0.001;
    if (e.stun > 0) e.stun -= dt;
    else if (e.kind === 'B') {
      // clogling: sits, then hops at the gnome
      if (e.onGround) {
        e.vs = e.vu = 0;
        if (e.timer > 1.3 && d < 13) { e.timer = 0; e.vs = ds / d * 4.4; e.vu = du / d * 4.4; e.vh = 8.5; e.face = Math.atan2(du, ds); }
      }
    } else {
      let ws, wu;
      if (e.kind === 'R') { // rats patrol, then charge
        if (d < 10) { ws = ds / d * 3.6; wu = du / d * 3.6; }
        else { if (Math.abs(e.s - e.home) > 4) e.dir = Math.sign(e.home - e.s); ws = e.dir * 1.6; wu = 0; }
      } else { // roaches zig-zag fast
        if (d < 7) { ws = ds / d * 5.2; wu = du / d * 5.2 + Math.sin(e.timer * 9) * 2; }
        else { if (Math.abs(e.s - e.home) > 5) e.dir = Math.sign(e.home - e.s); ws = e.dir * 3; wu = Math.sin(e.timer * 4) * 3.5; }
      }
      if (!walkable(e, e.s + Math.sign(ws) * 0.6, e.u)) { ws = 0; e.dir = -e.dir; }
      if (!walkable(e, e.s, e.u + Math.sign(wu) * 0.5)) wu = 0;
      e.vs = ws; e.vu = wu;
      if (Math.hypot(ws, wu) > 0.3) e.face = Math.atan2(wu, ws);
    }
    step(e, dt);
    if (e.h < -0.75) { e.dead = true; burst('splash', e.s, e.u, -0.8, 8, 4); continue; }
    const dh = Math.abs(e.h - p.h);
    if (p.attack > 0 && e.hitBy !== p.swing && dh < 1.6 && d < 2.3 && (d < 0.9 || (-ds * fs - du * fu) / d > 0.15)) {
      e.hitBy = p.swing; e.hp--; e.flash = 0.18; e.stun = 0.4; e.vs = -ds / d * 7 + fs * 3; e.vu = -du / d * 7 + fu * 3; e.vh = 5;
      blip(120, 0.1, 'square', -40, 0.06);
      if (e.hp <= 0) { e.dead = true; burst('poof', e.s, e.u, e.h + 0.4, 10, 3.5); G.tips += 1; }
    } else if (p.invuln <= 0 && e.stun <= 0 && d < 0.85 && dh < 1.1) {
      p.invuln = 1.2; p.knock = 0.25; p.vs = ds / d * 7; p.vu = du / d * 7; p.vh = 5.5;
      blip(200, 0.2, 'sawtooth', -120, 0.06);
      loseSheets(2);
    }
  }
  for (const e of G.enemies) if (e.dead) G.group.remove(e.mesh);
  G.enemies = G.enemies.filter(e => !e.dead);
}

function update(dt) {
  G.t += dt;
  const go = pressed.confirm || pressed.jump;
  if (G.state === 'title') {
    G.player.walk += dt * 13;
    if (go) { G.levelIndex = 0; G.tips = 0; loadLevel(0); G.state = 'ticket'; G.t = 0; }
  } else if (G.state === 'ticket') {
    if (go && G.t > 0.25) { G.state = 'play'; pressed.jump = false; }
  } else if (G.state === 'play') {
    G.timeLeft -= dt;
    const frac = G.timeLeft / G.level.time;
    if (!G.said50 && frac < 0.5) { G.said50 = true; G.banner = { text: '“Hello?? Anyone down there??”', t: 2.5 }; }
    if (!G.said25 && frac < 0.25) { G.said25 = true; G.banner = { text: '“I AM RUNNING OUT OF OPTIONS.”', t: 2.5 }; }
    updatePlayer(dt);
    if (G.state === 'play') updateEnemies(dt);
    if (G.state === 'play' && G.timeLeft <= 0) finish(false, 'Too late. The customer used a sock.');
    if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;
    G.shake = Math.max(0, G.shake - dt);
  } else if (G.state === 'delivered' || G.state === 'failed') {
    if (go && G.t > 0.5) {
      if (G.state === 'delivered') G.levelIndex++;
      if (G.levelIndex >= LEVELS.length) { G.state = 'end'; G.t = 0; }
      else { loadLevel(G.levelIndex); G.state = 'ticket'; G.t = 0; }
    }
  } else if (G.state === 'end') {
    if (go && G.t > 0.5) { loadLevel(0); G.state = 'title'; G.t = 0; }
  }
  updateParticles(dt);
  for (const k in pressed) pressed[k] = false;
}

/* ---------- presenting the 3D scene ---------- */
const now = () => performance.now() / 1000;
function place(e) {
  pos(e.s, e.u, e.h, e.mesh.position);
  const th = sample(e.s).th, c = Math.cos(e.face), sn = Math.sin(e.face);
  e.mesh.rotation.y = Math.atan2(Math.sin(th) * c - Math.cos(th) * sn, Math.cos(th) * c + Math.sin(th) * sn);
}
let camReady = false; const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
function present(dt) {
  const p = G.player, t = now(), ud = p.mesh.userData;
  place(p);
  const sw = Math.sin(p.walk);
  ud.bootL.position.z = 0.05 + sw * 0.2; ud.bootR.position.z = 0.05 - sw * 0.2;
  ud.bootL.position.y = 0.08 + Math.max(0, sw) * 0.08 + (p.onGround ? 0 : 0.1); ud.bootR.position.y = 0.08 + Math.max(0, -sw) * 0.08;
  ud.torso.position.y = Math.abs(sw) * 0.05; ud.torso.rotation.x = p.onGround ? Math.min(0.25, Math.hypot(p.vs, p.vu) * 0.02) : -0.1;
  const r = 0.4 + 0.6 * p.sheets / MAX_SHEETS; ud.roll.scale.set(1, r, r);
  ud.tail.rotation.x = -0.5 - Math.hypot(p.vs, p.vu) * 0.1 + Math.sin(t * 9) * 0.2;
  ud.arm.rotation.x = p.attack > 0 ? -0.9 + (1 - p.attack / 0.22) * 2.8 : 0.35 + sw * 0.15;
  p.mesh.visible = !(p.invuln > 0 && G.state === 'play' && Math.floor(t * 14) % 2);
  for (const e of G.enemies) {
    place(e);
    const d = e.mesh.userData, f = e.flash > 0 ? 1.3 : 1, base = e.kind === 'R' ? 1.35 : e.kind === 'C' ? 1.3 : 1;
    e.mesh.scale.setScalar(base * f);
    if (d.tail) d.tail.rotation.z = Math.sin(t * 7 + e.home) * 0.4;
    if (d.legs) d.legs.forEach((l, i) => { l.rotation.y = Math.sin(t * 30 + i * 2) * 0.35; });
    if (d.blob) { const q = e.onGround ? 1 + Math.sin(t * 5 + e.home) * 0.07 : 1.2; d.blob.scale.set(1 / q, q, 1 / q); }
  }
  for (const k of G.pickups) { pos(k.s, k.u, k.h + Math.sin(t * 3 + k.s) * 0.12, k.mesh.position); k.mesh.rotation.y = t * 2; }
  if (G.beam) G.beam.material.opacity = 0.2 + 0.08 * Math.sin(t * 4);
  M.sewage.map.offset.y = -t * 0.25;
  pos(p.s, p.u, p.h + 2.2, lantern.position);
  // camera rides the pipe a few steps behind the gnome
  if (G.state === 'title') {
    pos(p.s + 3.3, 1.3 + Math.sin(t * 0.4) * 0.5, 1.35, tmpA); pos(p.s, 0, 0.95, tmpB);
    p.face = 0.5;
  } else {
    pos(Math.max(-LEAD + 2, p.s - 6.2), p.u * 0.5, 2.9 + Math.max(0, p.h) * 0.4, tmpA); pos(p.s + 5, p.u * 0.7, 0.9, tmpB);
  }
  const k = camReady ? Math.min(1, dt * 7) : 1; camReady = true;
  camPos.lerp(tmpA, k); camLook.lerp(tmpB, k);
  camera.position.copy(camPos);
  if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake; camera.position.y += (Math.random() - 0.5) * G.shake; }
  camera.lookAt(camLook);
  renderer.render(scene, camera);
}

/* ---------- 2D overlay: HUD and tickets ---------- */
function drawRoll(x, y, r) {
  ctx.fillStyle = '#f7f4ea'; ctx.strokeStyle = '#b9b3a2'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0.4, 5); ctx.stroke();
  ctx.fillStyle = '#a98258'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill();
}
const text = (s, x, y, font, color) => { ctx.font = font; ctx.fillStyle = color; ctx.fillText(s, x, y); };
const panel = (x, y, w, h) => { ctx.fillStyle = 'rgba(8,18,17,0.75)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); };

function drawHUD() {
  const p = G.player, L = G.level, narrow = LW < 760;
  ctx.textBaseline = 'middle';
  panel(12, 12, 222, 34); drawRoll(30, 29, 10);
  for (let i = 0; i < MAX_SHEETS; i++) { ctx.fillStyle = i < p.sheets ? '#f7f4ea' : 'rgba(247,244,234,0.15)'; ctx.fillRect(48 + i * 15, 20, 12, 18); }
  const frac = Math.max(0, G.timeLeft / L.time), bw = Math.min(300, LW - 44), bx = LW / 2 - bw / 2, by = narrow ? 54 : 12;
  panel(bx - 10, by, bw + 20, 34);
  ctx.fillStyle = 'rgba(247,244,234,0.15)'; ctx.fillRect(bx, by + 18, bw, 8);
  ctx.fillStyle = frac < 0.25 ? '#d8432f' : frac < 0.5 ? '#e2b23c' : '#8fb26a'; ctx.fillRect(bx, by + 18, bw * frac, 8);
  ctx.textAlign = 'left'; text(`${L.customer} can hold on for`, bx, by + 9, `800 12px ${BODY}`, '#f3efe2');
  ctx.textAlign = 'right'; ctx.fillText(`${Math.max(0, Math.ceil(G.timeLeft))} s`, bx + bw, by + 9);
  panel(LW - 182, 12, 170, 34);
  ctx.textAlign = 'left'; text(`Order ${G.levelIndex + 1}/${LEVELS.length}`, LW - 170, 30, `15px ${DISPLAY}`, '#f3efe2');
  ctx.textAlign = 'right'; text(`${G.tips} tips`, LW - 24, 30, `15px ${DISPLAY}`, '#ffe27a');
  // progress along the pipe
  const px = 16, pw = LW - 32, py = LH - 14, pf = clamp(p.s / (G.len - 4.2), 0, 1);
  ctx.fillStyle = 'rgba(8,18,17,0.6)'; ctx.fillRect(px, py, pw, 5);
  ctx.fillStyle = '#f3efe2'; ctx.fillRect(px, py, pw * pf, 5);
  ctx.fillStyle = '#d8432f'; ctx.beginPath(); ctx.moveTo(px + pw * pf - 6, py); ctx.lineTo(px + pw * pf + 6, py); ctx.lineTo(px + pw * pf, py - 11); ctx.fill();
  if (G.banner) {
    ctx.font = `20px ${DISPLAY}`; ctx.textAlign = 'center';
    const w = ctx.measureText(G.banner.text).width + 32, y = by + 46;
    ctx.fillStyle = '#f3efe2'; ctx.beginPath(); ctx.roundRect(LW / 2 - w / 2, y, w, 36, 10); ctx.fill();
    text(G.banner.text, LW / 2, y + 19, `20px ${DISPLAY}`, '#10201f');
  }
}
/* A delivery ticket: the card every between-level screen is printed on. */
function ticket(h, draw) {
  ctx.fillStyle = 'rgba(8,18,17,0.72)'; ctx.fillRect(0, 0, LW, LH);
  const w = Math.min(460, LW - 24), x = LW / 2 - w / 2, y = LH / 2 - h / 2;
  ctx.fillStyle = '#f3efe2'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(8,18,17,0.72)'; // perforated ends, like a torn sheet
  for (let i = 10; i < w; i += 20) { ctx.beginPath(); ctx.arc(x + i, y, 5, 0, 7); ctx.arc(x + i, y + h, 5, 0, 7); ctx.fill(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  draw(LW / 2, y);
  if (Math.floor(now() * 2) % 2) text('Press Enter or tap to continue', LW / 2, y + h - 24, `800 13px ${BODY}`, '#5b6f6a');
}
function overlay() {
  ctx.clearRect(0, 0, LW, LH);
  const L = G.level;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (G.state === 'title') {
    const g = ctx.createLinearGradient(0, 0, 0, 230); g.addColorStop(0, 'rgba(8,18,17,0.9)'); g.addColorStop(1, 'rgba(8,18,17,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, 230);
    const big = LW < 620 ? 0.72 : 1;
    text('GNOME', LW / 2, 62 * big + 8, `${64 * big}px ${DISPLAY}`, '#f3efe2');
    text('DELIVERY SERVICE', LW / 2, 118 * big + 8, `${44 * big}px ${DISPLAY}`, '#d8432f');
    text('Emergency toilet paper, straight up the pipe.', LW / 2, 160 * big + 8, `800 ${Math.max(13, 17 * big)}px ${BODY}`, '#c9d8d3');
    if (Math.floor(now() * 2) % 2) { panel(LW / 2 - 190, LH - 76, 380, 40); text('Press Enter or tap to start your shift', LW / 2, LH - 55, `20px ${DISPLAY}`, '#f3efe2'); }
  } else if (G.state === 'play') drawHUD();
  else if (G.state === 'ticket') ticket(270, (cx, y) => {
    text(`ORDER ${G.levelIndex + 1} OF ${LEVELS.length}`, cx, y + 34, `800 13px ${BODY}`, '#d8432f');
    text(L.name, cx, y + 68, `34px ${DISPLAY}`, '#10201f');
    text(`Deliver to: ${L.customer}`, cx, y + 110, `800 16px ${BODY}`, '#10201f');
    text(`“${L.note}”`, cx, y + 138, `600 15px ${BODY}`, '#3d4f4b');
    text(`1 roll · ${MAX_SHEETS} sheets · ${L.time} seconds`, cx, y + 174, `800 14px ${BODY}`, '#10201f');
    text('Every bite and every dunk costs sheets.', cx, y + 198, `600 13px ${BODY}`, '#5b6f6a');
  });
  else if (G.state === 'delivered') ticket(270, (cx, y) => {
    const r = G.result;
    text('DELIVERED', cx, y + 44, `40px ${DISPLAY}`, '#10201f');
    text('★'.repeat(r.stars) + '☆'.repeat(3 - r.stars), cx, y + 92, `40px ${DISPLAY}`, '#e2a21c');
    text(`“${r.text}”`, cx, y + 136, `600 16px ${BODY}`, '#3d4f4b');
    text(`${G.player.sheets}/${MAX_SHEETS} sheets intact · ${Math.ceil(G.timeLeft)} s to spare`, cx, y + 170, `800 14px ${BODY}`, '#10201f');
    text(`Tip: +${r.tip}`, cx, y + 200, `20px ${DISPLAY}`, '#d8432f');
  });
  else if (G.state === 'failed') ticket(200, (cx, y) => {
    text('ORDER FAILED', cx, y + 50, `40px ${DISPLAY}`, '#d8432f');
    text(G.result.text, cx, y + 98, `600 16px ${BODY}`, '#3d4f4b');
    text('Grab a fresh roll and run it again.', cx, y + 128, `800 14px ${BODY}`, '#10201f');
  });
  else if (G.state === 'end') ticket(220, (cx, y) => {
    text('SHIFT COMPLETE', cx, y + 50, `40px ${DISPLAY}`, '#10201f');
    text(`All ${LEVELS.length} emergencies handled.`, cx, y + 98, `600 16px ${BODY}`, '#3d4f4b');
    text(`Total tips: ${G.tips}`, cx, y + 138, `26px ${DISPLAY}`, '#d8432f');
  });
}

loadLevel(0);
resize();
let last = performance.now();
function frame(t) {
  const dt = Math.min(1 / 30, (t - last) / 1000);
  last = t;
  update(dt);
  present(dt);
  overlay();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
