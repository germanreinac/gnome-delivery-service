/* Gnome Delivery Service — 3D prototype (three.js r128).
   A top-down action game on big open platforms hung in a sewer cavern, at different heights, joined by stairs and bridges.
   Mood: desaturated grey-blue, haze, shafts of light, long shadows; the red hat is the one strong colour.
   The lobby is the hub. Two ways out of it:
     DOWN, the Underworld: a generated run of chambers going deeper. Fight, scavenge scrap, and at the end either take
       the lift home or push on deeper. Scrap buys gear.
     UP, deliveries: accept orders in the lobby, then climb the ducts under the streets to the bathrooms that ordered.
       Tips and reputation; humans hunt you as heat builds.
   What you carry (tips, scrap) only counts once you are home; a knockout loses it.
   The roll on the gnome's back is cargo, health and ammo at once. The weapon is a knife: slash, slash, spin; dash, then strike. */
(() => {
'use strict';

const TS = 2.4, STEP = 0.4;              // tile size; the height of one stair
const GRAV = 22, RUN = 7.5, RADIUS = 0.42;
let MAX_SHEETS = 12; // grows with the bigger-roll upgrade
const MAX_ACTIVE = 3;
const DISPLAY = '"Lilita One", "Arial Rounded MT Bold", sans-serif';
const BODY = 'Nunito, system-ui, sans-serif';
const SMOKES = [
  { id: 'cig', name: 'Cigarette', cd: 8, hint: 'runaway decoy' },
  { id: 'pipe', name: 'Pipe', cd: 5, hint: 'push ring' },
  { id: 'cigar', name: 'Cigar', cd: 12, hint: 'smokescreen' },
  { id: 'joint', name: 'Joint', cd: 15, hint: 'mellow haze' },
];
const ADDRESSES = ['Apartment 3B', 'Café Bruma', 'Night bus depot', 'Luigi’s back office', 'Mrs. Okafor, No. 12', 'The gym showers', 'Dentist, 2nd floor', 'High Street bank'];
/* What carries over between runs (and between visits, where the browser allows it). */
const SAVE = { bank: 0, scrap: 0, rep: 0, smokes: [true, false, false, false], roll: 0, edge: 0, boots: 0, deepest: 0 };
try { Object.assign(SAVE, JSON.parse(localStorage.getItem('gds-save-2') || '{}')); } catch (e) { /* storage unavailable: play without it */ }
const save = () => { try { localStorage.setItem('gds-save-2', JSON.stringify(SAVE)); } catch (e) { /* ignore */ } };
MAX_SHEETS = [12, 16, 20][SAVE.roll] || 12;

/* ---------- three.js setup ---------- */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('view'), antialias: true });
const hudCanvas = document.getElementById('hud');
const ctx = hudCanvas.getContext('2d');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2126);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
scene.fog = new THREE.Fog(0x1a2126, 11, 31); // grey haze: distance dissolves rather than going black
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 140);
scene.add(new THREE.HemisphereLight(0xaab8c4, 0x1c2226, 0.48));
const sun = new THREE.DirectionalLight(0xd6e0ea, 0.62); // cold light slanting down from the street; follows the gnome and throws the long shadows
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.002; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 50 }); scene.add(sun, sun.target);
const lit = o => { o.traverse(m => { if (m.isMesh && m.material.isMeshLambertMaterial && !m.material.transparent) { m.castShadow = true; m.receiveShadow = true; } }); return o; };
const lantern = new THREE.PointLight(0xffe8cc, 1.0, 13); // a small warm pool around the gnome
scene.add(lantern);

const QUALITY = { dpr: 2, frames: 0, slow: 0, low: false }; // drops shadows and resolution if the device cannot keep up
let LW = 960, LH = 540; // HUD logical size
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight, dpr = Math.min(QUALITY.dpr, window.devicePixelRatio || 1);
  if (!w || !h) return;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w < h ? 62 : 46; camera.updateProjectionMatrix();
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
  g.fillStyle = '#30373c'; g.fillRect(0, 0, n, n);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
    const v = 60 + ((r * 7 + c * 13) % 5) * 6;
    g.fillStyle = `rgb(${v - 6},${v},${v + 7})`;
    g.fillRect(c * 64 + (r % 2 ? 32 : 0) - 64 + 3, r * 32 + 3, 58, 26); g.fillRect(c * 64 + (r % 2 ? 32 : 0) + 3, r * 32 + 3, 58, 26);
  }
  g.fillStyle = 'rgba(16,22,26,0.45)'; // damp streaks
  for (let i = 0; i < 9; i++) g.fillRect((i * 53) % n, 0, 5 + (i % 3) * 3, 40 + (i * 37) % 120);
});
const floorTex = canvasTexture(256, (g, n) => {
  g.fillStyle = '#2a3136'; g.fillRect(0, 0, n, n);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = (r + c) % 2 ? '#4a535a' : '#525c63'; g.fillRect(c * 64 + 2, r * 64 + 2, 60, 60); }
  g.fillStyle = 'rgba(22,28,32,0.5)';
  for (let i = 0; i < 30; i++) g.fillRect((i * 71) % n, (i * 113) % n, 10, 6);
});
const sewageTex = canvasTexture(128, (g, n) => {
  g.fillStyle = '#1d3b3d'; g.fillRect(0, 0, n, n);
  g.strokeStyle = '#4f8f8c'; g.lineWidth = 3;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo((i * 47) % n, (i * 29) % n); g.lineTo((i * 47) % n + 6, (i * 29) % n + 26); g.stroke(); }
});
const ventTex = canvasTexture(64, (g, n) => {
  g.fillStyle = '#5d6970'; g.fillRect(0, 0, n, n); // duct steel: plates, seams and rivets
  g.fillStyle = '#66737a'; g.fillRect(2, 2, n - 4, n - 4); g.fillStyle = '#4a555b'; g.fillRect(0, n / 2 - 1, n, 2);
  g.fillStyle = '#8b989e'; for (const [x, y] of [[6, 6], [n - 8, 6], [6, n - 8], [n - 8, n - 8]]) g.fillRect(x, y, 2, 2);
});
const lobbyTex = canvasTexture(128, (g, n) => { // warm planks
  for (let r = 0; r < 4; r++) { g.fillStyle = ['#6b6258', '#63594f', '#72685d', '#5c5349'][r]; g.fillRect(0, r * 32, n, 32); g.fillStyle = '#3f3831'; g.fillRect(0, r * 32, n, 2); g.fillRect((r * 45) % n, r * 32, 2, 32); }
});
const NPC_LINES = ['Waiting on a ping. Always waiting.', '3B again? Somebody check on 3B.', 'Mind the ledges. Rats do not.', 'Dash, then stab. Trust me.',
  'A human nearly got me Tuesday.', 'Scrap is down. Tips are up.', 'Tips are down this week.', 'My roll got soggy. Again.'];
const lam = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra));
const DS2 = { side: THREE.DoubleSide };
const M = {
  // walls and rock tops are one-sided on purpose: the camera can sit inside the rock and see out through them
  wall: lam(0xffffff, { map: brickTex }), curb: lam(0xffffff, { map: brickTex, ...DS2 }), top: lam(0x0d1114), floor: lam(0xffffff, { map: floorTex, ...DS2 }),
  sewage: lam(0xffffff, { map: sewageTex, emissive: 0x0c2a2c, ...DS2 }), vent: lam(0xffffff, { map: ventTex, ...DS2 }), steel: lam(0x7d8a90),
  copper: lam(0x4a5258), crate: lam(0x5e564c), porcelain: lam(0xd9dcda, DS2),
  paper: lam(0xe6e4dc, DS2), rope: lam(0x7a5230), card: lam(0xa98258),
  hat: lam(0xe0321f), tunic: lam(0x3d5266), skin: lam(0xd9b08f), nose: lam(0xe09a7a), boot: lam(0x4a3222), gold: lam(0xb9a36a),
  wood: lam(0x7a6f60), rubber: lam(0xb3261e), black: lam(0x151515),
  rat: lam(0x6f6f72), pink: lam(0x9a7f84), eye: new THREE.MeshBasicMaterial({ color: 0xff4030 }),
  roach: lam(0x3a2f2a), roachHi: lam(0xa2673a), clog: lam(0x4d382d), white: lam(0xf3efe2),
  glow: new THREE.MeshBasicMaterial({ color: 0xdfe9ef, transparent: true, opacity: 0.22, depthWrite: false, ...DS2 }),
  ring: new THREE.MeshBasicMaterial({ color: 0xeae6da, transparent: true, opacity: 0.55, depthWrite: false, ...DS2 }),
  rug: lam(0x3f3a3a), phone: new THREE.MeshBasicMaterial({ color: 0x9fe8ff }), lobby: lam(0xffffff, { map: lobbyTex, ...DS2 }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
  warn: new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xf2ead8 }),
  shaft: new THREE.MeshBasicMaterial({ color: 0xbfd2de, transparent: true, opacity: 0.085, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  pool: new THREE.MeshBasicMaterial({ color: 0xbfd2de, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false }),
  puddle: new THREE.MeshBasicMaterial({ color: 0x0a0e11, transparent: true, opacity: 0.55, depthWrite: false }),
  wade: new THREE.MeshLambertMaterial({ color: 0x3a6a6c, map: sewageTex, transparent: true, opacity: 0.6, depthWrite: false }),
  flame: new THREE.MeshBasicMaterial({ color: 0xff8a30 }), bone: lam(0xcfcabb), junk: lam(0x3b4044), cone: lam(0xb5562c),
  drip: new THREE.MeshBasicMaterial({ color: 0xa9c4d0 }),
  grille: new THREE.MeshBasicMaterial({ map: ventTex, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
  scrap: lam(0x8fa0a8), chest: lam(0x6b5a3c), trim: lam(0x9aa9b0, DS2),
  suit: lam(0x2a2a33), fedora: lam(0x141418), blade: lam(0xd0d6da), purple: lam(0x6f5a8c),
  ventLamp: new THREE.MeshBasicMaterial({ color: 0xff4030 }), coin: new THREE.MeshBasicMaterial({ color: 0xffd24a }),
  smoke: new THREE.MeshLambertMaterial({ color: 0xd9dedc, transparent: true, opacity: 0.6, depthWrite: false }),
  splash: new THREE.MeshBasicMaterial({ color: 0x7fb4b0 }), poof: new THREE.MeshBasicMaterial({ color: 0xb9b3a2 }), star: new THREE.MeshBasicMaterial({ color: 0xffe27a }),
};
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const sphere = (r, mat, x, y, z) => mesh(new THREE.SphereGeometry(r, 12, 10), mat, x, y, z);
const blob = r => mesh(new THREE.CircleGeometry(r, 18), M.shadow, 0, 0.03, 0).rotateX(-Math.PI / 2); // a soft shadow to plant things on the floor
const box = (w, h, d, m, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);

/* ---------- state ---------- */
const TOUCH = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const G = {
  state: 'title', mode: 'hub', depth: 0, t: 0, TS, auto: TOUCH, // auto: on a phone the gnome strikes by itself when something is in reach
  L: null, hgt: [[]], kind: [[]], W: 0, H: 0, seen: null, rooms: [], points: [], pads: [], group: null, floorY: -8, baseY: 0,
  player: null, decoy: null, rings: [], clouds: [], offers: [], orders: [], npcs: [], enemies: [], pickups: [], shots: [], particles: [], shafts: [], fires: [],
  pocket: { tips: 0, scrap: 0 }, heat: 0, runRep: 0, hunt: null, huntTimer: 60, shake: 0, banner: null, hitstop: 0, orderTimer: 0, fade: 0, rects: {},
};
window.__gds = G;

/* ---------- levels ----------
   A level is a height map: hgt[j][i] is the floor height of a tile, or null for open air. Anything may step up one stair
   (STEP) and drop any distance; a tile much higher than its neighbour is simply a wall. kind[j][i] picks the surface:
   f stone, v duct steel, c covered duct (hides you from humans), b plank bridge, L lobby planks, r rock (walls, pillars). */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function newLevel(W, H) { return { W, H, hgt: Array.from({ length: H }, () => new Array(W).fill(null)), kind: Array.from({ length: H }, () => new Array(W).fill('')), rooms: [], things: [], pads: [], points: [], shafts: [], fires: [], start: null }; }
const put = (L, x, y, h, k) => { if (x >= 0 && y >= 0 && x < L.W && y < L.H) { L.hgt[y][x] = h; L.kind[y][x] = k; } };
const fill = (L, x0, y0, w, h, ht, k) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(L, x, y, ht, k); };

function genHub() {
  const L = newLevel(33, 25), x0 = 9, y0 = 6, w = 15, h = 13, my = y0 + 6;
  fill(L, x0 - 1, y0 - 1, w + 2, h + 2, 1.5, 'r'); // a rim of rock…
  fill(L, x0, y0, w, h, 0, 'L');                   // …around the plank floor
  for (let k = 0; k < 5; k++) for (let dy = -1; dy <= 1; dy++) { put(L, x0 - 1 - k, my + dy, -STEP * (k + 1), 'f'); put(L, x0 + w + k, my + dy, STEP * (k + 1), 'v'); } // stairs down west, duct ramp up east
  fill(L, x0 - 9, my - 2, 4, 5, -STEP * 5, 'f'); fill(L, x0 + w + 5, my - 2, 4, 5, STEP * 5, 'v');
  L.pads.push({ i: x0 - 8, j: my, kind: 'under', label: 'UNDERWORLD' }, { i: x0 + w + 7, j: my, kind: 'deliver', label: 'DELIVERIES' });
  L.start = { i: x0 + 7, j: my + 1 }; L.hub = { y0, cx: (x0 + 7) * TS, cz: my * TS };
  L.rooms.push({ x: x0, y: y0, w, h, ht: 0, type: 'hub' }); L.shafts.push([x0 + 7, my, 3.2]);
  return L;
}

/* A run: a chain of big chambers heading mostly east, each joined to the next by a two-wide bridge with stairs on it.
   Underworld runs step down, delivery runs step up. Chambers get pits, a raised dais, pillars, a back wall; some get a
   side room across a gap that only a dash will cross. */
function genRun(mode, depth, seed, orders) {
  const R = rng(seed), ri = (a, b) => a + Math.floor(R() * (b - a + 1)), L = newLevel(170, 120), under = mode === 'under', fk = under ? 'f' : 'v';
  const n = Math.min(9, 5 + depth), blocks = [];
  const hit = (x, y, w, h, m, skip) => x < 2 || y < 2 || x + w > L.W - 2 || y + h > L.H - 2 || blocks.some(b => b !== skip && x < b.x + b.w + m && x + w + m > b.x && y < b.y + b.h + m && y + h + m > b.y);
  let lv = 0; const ht = () => Math.round(lv * STEP * 100) / 100;
  const addRoom = (x, y, w, h, type) => { fill(L, x, y, w, h, ht(), fk); const r = { x, y, w, h, ht: ht(), type, n: L.rooms.length }; L.rooms.push(r); blocks.push(r); return r; };
  let room = addRoom(6, 56, 6, 6, 'start'), last = [1, 0]; L.start = { i: 8, j: 59 };
  for (let k = 1; k < n; k++) {
    let pl = null;
    for (let tries = 0; tries < 40 && !pl; tries++) {
      const d = tries > 28 ? [1, 0] : R() < 0.55 ? [1, 0] : R() < 0.5 ? [0, 1] : [0, -1];
      if (d[0] === -last[0] && d[1] === -last[1]) continue;
      const len = ri(4, 7), w = k === n - 1 ? 7 : ri(9, 13), h = k === n - 1 ? 7 : ri(8, 11); let cx, cy, nx, ny, cr;
      if (d[0]) { cy = room.y + ri(1, room.h - 3); cx = room.x + room.w; nx = cx + len; ny = cy - ri(1, h - 3); cr = { x: cx, y: cy, w: len, h: 2 }; }
      else if (d[1] > 0) { cx = room.x + ri(1, room.w - 3); cy = room.y + room.h; ny = cy + len; nx = cx - ri(1, w - 3); cr = { x: cx, y: cy, w: 2, h: len }; }
      else { cx = room.x + ri(1, room.w - 3); cy = room.y - len; ny = cy - h; nx = cx - ri(1, w - 3); cr = { x: cx, y: cy, w: 2, h: len }; }
      if (hit(nx, ny, w, h, 3) || hit(cr.x, cr.y, cr.w, cr.h, 1, room)) continue;
      pl = { d, len, w, h, nx, ny, cr };
    }
    if (!pl) break;
    const steps = ri(2, Math.min(4, pl.len - 1));
    for (let s = 0; s < pl.len; s++) { if (s < steps) lv += under ? -1 : 1;
      for (let o = 0; o < 2; o++) put(L, pl.d[0] ? pl.cr.x + s : pl.cr.x + o, pl.d[0] ? pl.cr.y + o : pl.d[1] > 0 ? pl.cr.y + s : pl.cr.y + pl.len - 1 - s, ht(), under ? 'b' : 'c'); }
    blocks.push(pl.cr); last = pl.d;
    room = addRoom(pl.nx, pl.ny, pl.w, pl.h, k === n - 1 ? 'end' : 'fight');
  }
  L.rooms[L.rooms.length - 1].type = 'end';
  const fights = L.rooms.filter(r => r.type === 'fight'), free = (r, x, y) => L.hgt[y] && L.hgt[y][x] === r.ht && !L.things.some(t => t[1] === x && t[2] === y);
  const spot = (r, m = 1) => { for (let t = 0; t < 30; t++) { const x = r.x + ri(m, r.w - 1 - m), y = r.y + ri(m, r.h - 1 - m); if (free(r, x, y)) return [x, y]; } return [r.x + 1, r.y + 1]; };
  for (const r of L.rooms) { // a back wall along the far (north) edge wherever nothing joins there
    if (r.type === 'start') continue;
    for (let x = r.x - 1; x <= r.x + r.w; x++) if (L.hgt[r.y - 1][x] == null) put(L, x, r.y - 1, r.ht + 1.6, 'r');
  }
  for (const r of fights) {
    const f = R();
    if (f < 0.4 && r.w >= 10 && r.h >= 9) { const pw = ri(2, 3), px = r.x + ri(3, r.w - 3 - pw), py = r.y + ri(3, r.h - 5); for (let y = py; y < py + 2; y++) for (let x = px; x < px + pw; x++) { L.hgt[y][x] = null; L.kind[y][x] = ''; } } // a pit
    else if (f < 0.8) { const dx = r.x + ri(2, r.w - 5), dy = r.y + ri(2, r.h - 6); fill(L, dx, dy, 3, 3, r.ht + 2 * STEP, fk); put(L, dx + 1, dy + 3, r.ht + STEP, fk); r.dais = [dx + 1, dy + 1]; } // a dais, with a step up on its near side
    for (let q = ri(1, 3); q > 0; q--) { const [px, py] = spot(r, 1); put(L, px, py, r.ht + 1.8, 'r'); } // pillars: cover, and something to be knocked into
    if (R() < 0.6) L.shafts.push([r.x + r.w / 2, r.y + r.h / 2, 2.4]);
  }
  // side rooms: off the near (south) edge, across a one-tile gap that a dash clears
  let sides = 0;
  for (const r of fights) { if (sides >= 2 || R() < 0.4) continue;
    const bx = r.x + ri(1, r.w - 2), sy = r.y + r.h + 4, sx = bx - 2;
    if (hit(sx, sy, 5, 5, 2) || hit(bx, r.y + r.h, 1, 4, 1, r)) continue;
    for (let s = 0; s < 4; s++) if (s !== 1) put(L, bx, r.y + r.h + s, r.ht, 'b');
    fill(L, sx, sy, 5, 5, r.ht, fk); const sr = { x: sx, y: sy, w: 5, h: 5, ht: r.ht, type: 'side', n: L.rooms.length }; L.rooms.push(sr); blocks.push(sr); sides++;
    L.things.push(['X', sx + 2, sy + 2], ['P', sx + 1, sy + 3]);
  }
  // who lives here, and what is lying about
  const pool = under ? (depth <= 1 ? ['R', 'R', 'C'] : depth === 2 ? ['R', 'C', 'B', 'R'] : ['R', 'B', 'M', 'C', 'M']) : (depth <= 1 ? ['C', 'R', 'C'] : ['C', 'R', 'M', 'C']);
  fights.forEach((r, k) => {
    const count = Math.min(7, 2 + Math.floor((depth + k) / 2));
    for (let q = 0; q < count; q++) { const [x, y] = spot(r, 1); L.things.push([pool[Math.floor(R() * pool.length)], x, y]); }
    for (let q = under ? 2 : 1; q > 0; q--) { const [x, y] = spot(r, 0); L.things.push([under ? 'S' : '$', x, y]); }
    if (r.dais) L.things.push(['X', r.dais[0], r.dais[1]]);
    if (k % 3 === 1) { const [x, y] = spot(r, 0); L.things.push(['P', x, y]); }
    if (L.things.some(t => t[0] === 'M' && t[1] >= r.x && t[1] < r.x + r.w && t[2] >= r.y && t[2] < r.y + r.h)) L.fires.push([r.x + 1, r.y + r.h - 2, r.ht]);
  });
  (orders || []).forEach((o, k) => { // each accepted order gets a bathroom pipe against the back wall of a chamber along the way
    const r = fights[Math.min(fights.length - 1, Math.floor((k + 0.5) * fights.length / orders.length))]; let x = r.x + 1 + (k * 4) % (r.w - 2);
    while (L.points.some(q => q.i === x && q.j === r.y)) x = r.x + 1 + (x - r.x) % (r.w - 2);
    L.points.push({ i: x, j: r.y, x: x * TS, z: r.y * TS, h: r.ht, order: o, letter: 'ABC'[k] });
  });
  const end = L.rooms.find(r => r.type === 'end');
  L.pads.push({ i: end.x + 5, j: end.y + 3, kind: 'home', label: 'LIFT HOME' });
  if (under) L.pads.push({ i: end.x + 2, j: end.y + 5, kind: 'deeper', label: 'DEEPER' });
  L.shafts.push([end.x + 3.5, end.y + 3.5, 2.6]);
  return L;
}

/* ---------- world building ---------- */
function label(str, bg, fg) { // a floating sign
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(256, c => { c.fillStyle = bg; c.beginPath(); c.roundRect(6, 88, 244, 80, 16); c.fill();
    c.fillStyle = fg; c.font = `${str.length > 9 ? 34 : 42}px ${DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(str, 128, 130); }), depthTest: false }));
  s.scale.set(3, 3, 1); return s;
}
function buildWorld(L) {
  const g = new THREE.Group(), bufs = {}, hs = TS / 2, U = TS / 4, Hh = (x, y) => (L.hgt[y] && L.hgt[y][x] != null) ? L.hgt[y][x] : null;
  const quad = (name, a, b, c, d, uw, uh) => { const o = bufs[name] || (bufs[name] = { p: [], uv: [] }); o.p.push(...a, ...b, ...c, ...a, ...c, ...d); o.uv.push(0, 0, uw, 0, uw, uh, 0, 0, uw, uh, 0, uh); };
  let minH = 0;
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    const h = Hh(x, y); if (h == null) continue; minH = Math.min(minH, h);
    const k = L.kind[y][x], X = x * TS, Z = y * TS, steel = k === 'v' || k === 'c';
    quad(k === 'r' ? 'top' : k === 'L' || k === 'b' ? 'lobby' : steel ? 'vent' : 'floor', [X - hs, h, Z + hs], [X + hs, h, Z + hs], [X + hs, h, Z - hs], [X - hs, h, Z - hs], steel ? 1 : U, steel ? 1 : U);
    if (k === 'c') quad('grille', [X - hs, h + 1.8, Z + hs], [X + hs, h + 1.8, Z + hs], [X + hs, h + 1.8, Z - hs], [X - hs, h + 1.8, Z - hs], 1.5, 1.5); // the duct's roof, seen through
    for (const [dx, dz] of DIRS) { // side faces down to whatever is lower; over open air, a thick slab edge
      const nh = Hh(x + dx, y + dz), y0 = nh == null ? h - 2.4 : nh; if (y0 >= h - 0.01) continue;
      const cx = X + dx * hs, cz = Z + dz * hs, ex = dz * hs, ez = -dx * hs;
      quad('wall', [cx - ex, y0, cz - ez], [cx + ex, y0, cz + ez], [cx + ex, h, cz + ez], [cx - ex, h, cz - ez], U, (h - y0) / 4);
      if (k !== 'r' && (nh == null || h - nh > 0.45)) { const ix = -dx * 0.16, iz = -dz * 0.16; // a pale strip along every ledge, so drops read at a glance
        quad('trim', [cx - ex, h + 0.012, cz - ez], [cx + ex, h + 0.012, cz + ez], [cx + ex + ix, h + 0.012, cz + ez + iz], [cx - ex + ix, h + 0.012, cz - ez + iz], 1, 1); }
    }
  }
  const mats = { top: M.top, lobby: M.lobby, floor: M.floor, vent: M.vent, wall: M.wall, grille: M.grille, trim: M.trim };
  for (const k in bufs) { const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bufs[k].p, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(bufs[k].uv, 2));
    geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, mats[k])); }
  G.floorY = minH - 7;
  // far below: the sewage the whole place hangs over, and the pipes that hold the chambers up
  g.add(mesh(new THREE.PlaneGeometry(900, 900), M.sewage, L.W * TS / 2, minH - 11, L.H * TS / 2).rotateX(-Math.PI / 2));
  for (const r of L.rooms) for (const [ox, oz] of [[1, 1], [r.w - 2, 1], [1, r.h - 2], [r.w - 2, r.h - 2]]) g.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 16, 10), M.top, (r.x + ox) * TS, r.ht - 2.4 - 8, (r.y + oz) * TS));
  // light, fire, and things lying about
  G.shafts = []; G.fires = [];
  for (const [sx, sy, rad] of L.shafts) { const x = sx * TS, z = sy * TS, h = Hh(Math.round(sx), Math.round(sy)) || 0;
    const cone = mesh(new THREE.CylinderGeometry(rad * 0.3, rad, 9, 20, 1, true), M.shaft.clone(), x + 1.16, h + 4.4, z + 0.8); cone.rotation.z = -0.26; cone.rotation.x = 0.18;
    const pool = mesh(new THREE.CircleGeometry(rad * 1.1, 24), M.pool.clone(), x, h + 0.05, z).rotateX(-Math.PI / 2); g.add(cone, pool); G.shafts.push({ cone, pool, flick: L.kind[Math.round(sy)][Math.round(sx)] === 'v', seed: (sx * 7 + sy * 3) % 9 }); }
  for (const [fx, fy, h] of L.fires) { const x = fx * TS, z = fy * TS, flame = mesh(new THREE.ConeGeometry(0.28, 0.7, 7), M.flame, x, h + 1.2, z), light = new THREE.PointLight(0xff8a40, 1.3, 11); light.position.set(x, h + 1.6, z);
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.9, 12), M.junk, x, h + 0.45, z), flame, light); G.fires.push({ flame, light, seed: x + z }); }
  const hsh = (a, b) => { let n = (a * 374761393 + b * 668265263) ^ 0x5bd1e995; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  for (const r of L.rooms) { if (r.type === 'hub') continue; // junk in the corners, a service pipe along the back wall, a puddle or two
    for (let k = 0; k < 3; k++) { const x = (r.x + 0.4 + hsh(r.n, k) * (r.w - 1.8)) * TS, z = (r.y + (k % 2 ? 0.2 : r.h - 1.2)) * TS;
      for (let q = 0; q < 5; q++) g.add(box(0.24 + (q % 3) * 0.12, 0.14 + (q % 2) * 0.14, 0.22 + (q % 4) * 0.08, M.junk, x + Math.cos(q * 2.4) * (q % 3) * 0.25, r.ht + 0.08, z + Math.sin(q * 2.4) * (q % 3) * 0.25).rotateY(q)); }
    if (Hh(r.x, r.y - 1) > r.ht) g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, r.w * TS, 8), M.copper, (r.x + r.w / 2 - 0.5) * TS, r.ht + 1.0, (r.y - 0.5) * TS + 0.2).rotateZ(Math.PI / 2));
    for (let k = 0; k < 2; k++) g.add(mesh(new THREE.CircleGeometry(0.6 + hsh(r.n, k + 5), 14), M.puddle, (r.x + 1 + hsh(k, r.n) * (r.w - 2)) * TS, r.ht + 0.04, (r.y + 1 + hsh(r.n + 3, k) * (r.h - 2)) * TS).rotateX(-Math.PI / 2));
  }
  // pads: stand on one to go somewhere
  for (const pd of L.pads) { pd.x = pd.i * TS; pd.z = pd.j * TS; pd.h = Hh(pd.i, pd.j) || 0; pd.t = 0;
    pd.ring = mesh(new THREE.RingGeometry(1.0, 1.3, 30), M.ring.clone(), pd.x, pd.h + 0.05, pd.z).rotateX(-Math.PI / 2);
    const tag = label(pd.label, '#10171b', '#f3efe2'); tag.position.set(pd.x, pd.h + 2.4, pd.z); g.add(pd.ring, tag); }
  // delivery points: a porcelain pipe up to someone's bathroom
  for (const pt of L.points) { const pg = new THREE.Group(); pg.position.set(pt.x, pt.h, pt.z);
    pg.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.4, 18, 1, true), M.porcelain, 0, 3.8, 0), mesh(new THREE.TorusGeometry(0.8, 0.14, 8, 22), M.porcelain, 0, 2.6, 0).rotateX(Math.PI / 2));
    pt.beam = mesh(new THREE.CylinderGeometry(0.7, 1.5, 2.6, 18, 1, true), M.glow, 0, 1.3, 0); pt.ring = mesh(new THREE.RingGeometry(1.2, 1.45, 28), M.ring, 0, 0.05, 0).rotateX(-Math.PI / 2);
    pt.tag = label(pt.letter, '#d8432f', '#f3efe2'); pt.tag.position.y = 2.7; pt.tag.scale.set(1.6, 1.6, 1); pg.add(pt.beam, pt.ring, pt.tag); g.add(pg); }
  G.npcs = [];
  if (L.hub) { // the lobby: roll pallet, stores, an order board, a rug, and the other couriers
    const hb = L.hub, cx = hb.cx, cz = hb.cz, pallet = new THREE.Group(); hb.pallet = { x: cx - 13, z: cz - 11 }; pallet.position.set(hb.pallet.x, 0, hb.pallet.z);
    pallet.add(box(2.2, 0.2, 2.2, M.wood, 0, 0.1, 0));
    for (const [px, py, pz] of [[-0.55, 0.5, -0.5], [0.55, 0.5, -0.5], [-0.55, 0.5, 0.5], [0.55, 0.5, 0.5], [0, 1.1, 0]]) pallet.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 18), M.paper, px, py, pz), mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.62, 10), M.card, px, py, pz));
    g.add(pallet, mesh(new THREE.RingGeometry(2.0, 2.3, 32), M.ring, hb.pallet.x, 0.03, hb.pallet.z).rotateX(-Math.PI / 2), mesh(new THREE.CircleGeometry(4.2, 32), M.rug, cx, 0.02, cz).rotateX(-Math.PI / 2));
    const dl = new THREE.PointLight(0xffe2c0, 0.8, 34); dl.position.set(cx, 4, cz); g.add(dl);
    for (let k = 0; k < 14; k++) g.add(sphere(0.14, M.lamp, cx + Math.cos(k * 0.449) * 13, 2.2 + (k % 2) * 0.2, cz + Math.sin(k * 0.449) * 11));
    g.add(mesh(new THREE.PlaneGeometry(2.6, 1.4), new THREE.MeshBasicMaterial({ map: canvasTexture(256, (c2, n) => { c2.fillStyle = '#3f3831'; c2.fillRect(0, 0, n, n);
      c2.fillStyle = '#e6e4dc'; c2.font = `44px ${DISPLAY}`; c2.textAlign = 'center'; c2.fillText('ORDERS', n / 2, 50);
      for (let k = 0; k < 6; k++) { c2.fillStyle = k % 3 ? '#e6e4dc' : '#b9a36a'; c2.fillRect(22 + (k % 3) * 76, 76 + Math.floor(k / 3) * 84, 60, 70); } }) }), cx + 6, 0.78, (hb.y0 - 0.5) * TS + 0.06));
    const sx = cx - 12, sz = cz + 12; hb.shop = { x: sx + 0.4, z: sz - 1.6 };
    g.add(box(2.8, 0.9, 0.8, M.wood, sx, 0.45, sz - 0.6), box(2.9, 0.06, 0.9, M.rug, sx, 0.93, sz - 0.6));
    for (const [ox, m] of [[-0.8, M.paper], [0, M.blade], [0.8, M.rope]]) g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12), m, sx + ox, 1.05, sz - 0.6));
    const keeper = buildGnome({ npc: true, smoke: 2, hat: M.gold, tunic: M.suit }); keeper.position.set(sx, 0, sz + 0.5); keeper.rotation.y = Math.PI; g.add(keeper);
    const sign = label('STORES', '#b9a36a', '#10201f'); sign.position.set(sx, 2.4, sz - 0.2); sign.scale.set(2, 2, 1); g.add(sign);
    const hats = [0x5d6b63, 0x8a8468, 0x55667a, 0x8a6a55, 0x5a7672, 0x7a6276, 0x6a6a86], tunics = [0x5a5148, 0x46574d, 0x5b5f66, 0x3d5266]; // everyone else is muted; only the player's hat is red
    //             x     z    facing sits smoke phone
    const crowd = [[-8, -3, 0.9, 1, -1, 1], [-6.4, -1.8, -2.2, 0, 0, 0], [10, -9, -0.6, 0, 1, 0], [11, 6, -1.9, 1, -1, 1], [9, 8.5, -2.6, 0, -1, 1], [-3, 11, 2.6, 1, 2, 0], [5, -12, 3.14, 0, -1, 0], [-11, 3, 1.4, 1, -1, 1]];
    crowd.forEach(([x, z, face, sits, smoke, phone], n) => {
      const m = buildGnome({ npc: true, smoke, phone, hat: lam(hats[n % hats.length]), tunic: lam(tunics[n % tunics.length]) });
      m.position.set(cx + x, sits ? 0.34 : 0, cz + z); m.rotation.y = face; g.add(m);
      if (sits) g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.42, 16), M.paper, cx + x, 0.21, cz + z));
      G.npcs.push({ mesh: m, x: cx + x, z: cz + z, y: sits ? 0.34 : 0, smokes: smoke >= 0, n });
    });
  }
  return lit(g);
}

/* ---------- characters ---------- */
function buildGnome(o = {}) { // o.bare: no roll, smoke or plunger; o.knife: blade in hand; o.hat / o.tunic: materials
  const g = new THREE.Group();
  const bootL = box(0.22, 0.16, 0.38, M.boot, -0.15, 0.08, 0.05), bootR = box(0.22, 0.16, 0.38, M.boot, 0.15, 0.08, 0.05);
  const torso = new THREE.Group();
  torso.add(mesh(new THREE.CylinderGeometry(0.25, 0.34, 0.5, 14), o.tunic || M.tunic, 0, 0.41, 0));
  torso.add(mesh(new THREE.CylinderGeometry(0.335, 0.345, 0.09, 14), M.boot, 0, 0.3, 0));
  torso.add(box(0.12, 0.13, 0.05, M.gold, 0, 0.3, 0.33));
  torso.add(sphere(0.26, M.skin, 0, 0.86, 0));
  torso.add(mesh(new THREE.ConeGeometry(0.24, 0.46, 12), M.paper, 0, 0.62, 0.15).rotateX(Math.PI));
  torso.add(sphere(0.075, M.nose, 0, 0.86, 0.27));
  torso.add(sphere(0.035, M.black, -0.1, 0.94, 0.23)); torso.add(sphere(0.035, M.black, 0.1, 0.94, 0.23));
  torso.add(mesh(new THREE.ConeGeometry(0.31, 0.8, 14), o.hat || M.hat, 0, 1.4, -0.05).rotateX(-0.14));
  // the cargo: one big roll, roped on like a backpack
  const roll = new THREE.Group(); roll.position.set(0, 0.62, -0.66);
  roll.add(mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.84, 22), M.paper).rotateZ(Math.PI / 2));
  roll.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.86, 12), M.card).rotateZ(Math.PI / 2));
  for (const x of [-0.24, 0.24]) roll.add(mesh(new THREE.TorusGeometry(0.47, 0.035, 6, 22), M.rope, x, 0, 0).rotateY(Math.PI / 2));
  const tail = mesh(new THREE.PlaneGeometry(0.5, 0.7), M.paper); tail.geometry.translate(0, -0.35, 0); tail.position.set(0, -0.38, -0.2);
  roll.add(tail);
  for (const x of [-0.18, 0.18]) torso.add(box(0.05, 0.05, 0.5, M.rope, x, 0.66, -0.25));
  torso.add(roll);
  // whatever is being smoked, one model per entry in SMOKES
  const stick = (r1, r2, len, mat) => { const m = new THREE.Group(); m.position.set(0.09, 0.78, 0.25);
    m.add(mesh(new THREE.CylinderGeometry(r1, r2, len, 8), mat, 0, 0, len / 2).rotateX(Math.PI / 2), sphere(r1 * 1.05, M.eye, 0, 0, len)); return m; };
  const pipe = new THREE.Group(); pipe.position.set(0.09, 0.78, 0.25);
  pipe.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), M.boot, 0, 0, 0.1).rotateX(Math.PI / 2 - 0.3), mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.1, 8), M.boot, 0, 0, 0.22));
  const mouth = [stick(0.02, 0.02, 0.24, M.paper), pipe, stick(0.045, 0.04, 0.3, M.rope), stick(0.035, 0.014, 0.26, M.paper)];
  torso.add(...mouth);
  const arm = new THREE.Group(); arm.position.set(0.36, 0.58, 0.05); // plunger arm, pivoting at the shoulder
  arm.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), M.wood, 0, 0.4, 0));
  arm.add(mesh(new THREE.ConeGeometry(0.17, 0.22, 14), M.rubber, 0, 0.88, 0).rotateX(Math.PI));
  arm.add(sphere(0.08, M.skin, 0, 0.05, 0));
  const plunger = [arm.children[0], arm.children[1]];
  const knife = new THREE.Group(); knife.add(box(0.05, 0.14, 0.05, M.boot, 0, 0.16, 0), box(0.02, 0.42, 0.09, M.blade, 0, 0.44, 0)); knife.scale.setScalar(1.5); arm.add(knife); plunger.forEach(m => { m.visible = false; }); // the plunger is retired: the knife is the weapon now
  const pkg = new THREE.Group(); pkg.add(box(0.56, 0.34, 0.44, M.crate, 0, 0, 0), box(0.58, 0.1, 0.46, M.purple, 0, 0, 0)); pkg.position.set(0, 1.28, -0.66); pkg.visible = false; torso.add(pkg);
  if (o.npc) { knife.visible = false; mouth.forEach((m, i) => { m.visible = i === o.smoke; });
    if (o.phone) torso.add(box(0.13, 0.22, 0.02, M.phone, -0.22, 0.66, 0.36).rotateX(-0.5)); }
  if (o.bare) { roll.visible = false; mouth.forEach(m => { m.visible = false; }); plunger.forEach(m => { m.visible = false; }); knife.visible = !!o.knife; }
  torso.add(arm);
  g.add(bootL, bootR, torso, blob(0.5));
  g.userData = { bootL, bootR, torso, roll, tail, arm, mouth, plunger, knife, pkg };
  return g;
}
function buildDecoy() { // a gnome made of pipe smoke
  const g = new THREE.Group(), puff = (r, x, y, z) => g.add(sphere(r, M.smoke, x, y, z));
  puff(0.36, 0, 0.36, 0); puff(0.3, 0, 0.82, 0); puff(0.2, 0, 0.6, 0.2); puff(0.34, 0, 0.6, -0.5);
  g.add(mesh(new THREE.ConeGeometry(0.33, 0.85, 12), M.smoke, 0, 1.4, 0));
  puff(0.16, -0.16, 0.1, 0.05); puff(0.16, 0.16, 0.1, 0.05);
  return g;
}
function buildEnemy(kind) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  if (kind === 'M') { const mob = buildGnome({ bare: true, knife: true, hat: M.fedora, tunic: M.suit }); body.add(mob); g.userData.mob = mob.userData; }
  else if (kind === 'R') {
    const b = sphere(1, M.rat, 0, 0.3, 0); b.scale.set(0.32, 0.27, 0.52); body.add(b);
    body.add(mesh(new THREE.ConeGeometry(0.2, 0.42, 10), M.rat, 0, 0.3, 0.62).rotateX(Math.PI / 2));
    body.add(sphere(0.1, M.pink, -0.15, 0.5, 0.42), sphere(0.1, M.pink, 0.15, 0.5, 0.42), sphere(0.05, M.pink, 0, 0.3, 0.84));
    body.add(sphere(0.045, M.eye, -0.1, 0.38, 0.62), sphere(0.045, M.eye, 0.1, 0.38, 0.62));
    const tail = mesh(new THREE.CylinderGeometry(0.035, 0.012, 0.8, 6), M.pink, 0, 0.36, -0.8).rotateX(Math.PI / 2 - 0.35); body.add(tail);
    g.userData.tail = tail; body.scale.setScalar(1.35);
  } else if (kind === 'C') {
    const b = sphere(1, M.roach, 0, 0.15, 0); b.scale.set(0.24, 0.1, 0.4); body.add(b);
    const hi = sphere(1, M.roachHi, 0, 0.2, -0.04); hi.scale.set(0.16, 0.07, 0.28); body.add(hi);
    body.add(sphere(0.1, M.roach, 0, 0.14, 0.38));
    g.userData.legs = [];
    for (const z of [-0.2, 0, 0.2]) { const leg = box(0.8, 0.025, 0.03, M.black, 0, 0.08, z); body.add(leg); g.userData.legs.push(leg); }
    for (const x of [-1, 1]) body.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), M.black, x * 0.1, 0.25, 0.6).rotateX(1.1).rotateZ(-x * 0.3));
    body.scale.setScalar(1.3);
  } else {
    body.add(mesh(new THREE.IcosahedronGeometry(0.45, 1), M.clog, 0, 0.45, 0));
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4, e = 0.2 + (i % 5) * 0.28, d = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      const spike = mesh(new THREE.ConeGeometry(0.06, 0.45, 5), M.clog, d.x * 0.5, 0.45 + d.y * 0.5, d.z * 0.5);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); body.add(spike);
    }
    body.add(sphere(0.14, M.white, -0.15, 0.55, 0.36), sphere(0.11, M.white, 0.17, 0.52, 0.37));
    body.add(sphere(0.06, M.black, -0.15, 0.55, 0.48), sphere(0.05, M.black, 0.17, 0.52, 0.46));
    g.userData.blob = body;
  }
  // paper cocoon, shown while wrapped
  const warn = mesh(new THREE.RingGeometry(0.75, 1.0, 22), M.warn, 0, 0.05, 0).rotateX(-Math.PI / 2); warn.visible = false; g.add(warn, blob(kind === 'C' ? 0.35 : 0.5)); g.userData.warn = warn; // red ring: about to lunge
  const cocoon = sphere(1, M.paper, 0, 0.4, 0); cocoon.scale.set(0.55, 0.5, 0.75); cocoon.visible = false; g.add(cocoon);
  g.userData.body = body; g.userData.cocoon = cocoon;
  return g;
}
function buildPickup(kind) {
  const g = new THREE.Group();
  if (kind === 'S') { for (let k = 0; k < 3; k++) g.add(box(0.26, 0.1, 0.18, M.scrap, Math.cos(k * 2.1) * 0.15, k * 0.1 - 0.1, Math.sin(k * 2.1) * 0.15).rotateY(k)); g.add(sphere(0.5, M.glow, 0, 0, 0)); return g; } // scrap
  if (kind === 'X') { g.add(box(0.9, 0.55, 0.6, M.chest, 0, -0.3, 0), box(0.94, 0.12, 0.64, M.gold, 0, -0.02, 0), sphere(0.7, M.glow, 0, -0.2, 0)); return g; } // a chest
  if (kind === 'K') { g.add(box(0.06, 0.16, 0.06, M.boot, 0, -0.2, 0), box(0.03, 0.5, 0.12, M.blade, 0, 0.12, 0), sphere(0.5, M.glow, 0, 0, 0)); return g; }
  if (kind === '$') { g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.07, 16), M.coin).rotateX(Math.PI / 2)); return g; }
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.42, 18), M.paper).rotateZ(Math.PI / 2));
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.44, 10), M.card).rotateZ(Math.PI / 2));
  g.add(sphere(0.6, M.glow, 0, 0, 0));
  return g;
}

/* ---------- levels in and out ---------- */
function makeEnemy(kind, x, z) {
  const m = lit(buildEnemy(kind)); G.group.add(m);
  return { kind, x, z, h: groundAt(x, z), vx: 0, vz: 0, vh: 0, hp: kind === 'C' ? 1 : kind === 'M' ? 4 : kind === 'B' ? 3 : 2, wind: 0, dash: 0, cool: 0, lx: 0, lz: 1, fx: 0, fz: 1, onGround: true,
    stun: 0, flash: 0, wrap: 0, launch: 0, hitBy: 0, timer: (x % 5) * 0.3, home: { x, z }, goal: null, stuck: 0, mesh: m };
}
function loadLevel(L, mode, depth) {
  if (G.group) scene.remove(G.group);
  for (const q of [...G.particles, ...G.shots, ...G.rings, ...G.clouds]) scene.remove(q.mesh);
  const old = G.player;
  Object.assign(G, { L, mode, depth, hgt: L.hgt, kind: L.kind, W: L.W, H: L.H, rooms: L.rooms, points: L.points, pads: L.pads, enemies: [], pickups: [], shots: [], particles: [], rings: [], clouds: [], decoy: null,
    seen: L.hgt.map(r => r.map(() => false)), hunt: null, huntTimer: 60, heat: 0, shake: 0, hitstop: 0, mapCanvas: null, mapTick: 0, fade: 1 });
  G.group = buildWorld(L); scene.add(G.group);
  const pm = lit(buildGnome()); G.group.add(pm);
  const x = L.start.i * TS, z = L.start.j * TS;
  G.player = Object.assign({ isPlayer: true, sheets: MAX_SHEETS, smoke: 0, smokeCd: SMOKES.map(() => 0) }, old ? { sheets: old.sheets, smoke: old.smoke, smokeCd: old.smokeCd } : {},
    { x, z, h: groundAt(x, z), vx: 0, vz: 0, vh: 0, ang: mode === 'hub' ? Math.PI : Math.PI / 2, fx: mode === 'hub' ? 0 : 1, fz: mode === 'hub' ? -1 : 0, onGround: true, invuln: 0.5, knock: 0, attack: 0, cooldown: 0, throwCd: 0,
      swing: 0, dashT: 0, dashCd: 0, dashGrace: 0, combo: 0, comboT: 0, big: false, kind: 'slash', walk: 0, safe: { x, z, h: groundAt(x, z) }, mesh: pm });
  for (const [kind, i, j] of L.things) {
    if ('RCBM'.includes(kind)) G.enemies.push(makeEnemy(kind, i * TS, j * TS));
    else { const m = buildPickup(kind); G.group.add(m); G.pickups.push({ kind, x: i * TS, z: j * TS, h: groundAt(i * TS, j * TS), mesh: m }); }
  }
  camReady = false;
}
function goHub(msg) {
  loadLevel(genHub(), 'hub', 0);
  G.player.sheets = MAX_SHEETS; G.player.smokeCd = SMOKES.map(() => 0);
  while (G.offers.length < 2) spawnOffer();
  if (msg) say(msg, 4);
}
function startRun(mode, depth) {
  loadLevel(genRun(mode, depth, (Math.random() * 1e9) | 0, mode === 'deliver' ? G.orders : null), mode, depth);
  if (mode === 'under') { SAVE.deepest = Math.max(SAVE.deepest, depth); say(depth > 1 ? `Deeper: level ${depth}. Everything you carry is still at risk.` : 'The Underworld. Scavenge, then take the lift home, or go deeper.', 3.5); }
  else say('Under the streets. Find the pipes, post the paper, take the lift home.', 3.5);
}
/* Orders arrive as offers on the app while the gnome is in the lobby. Accepted ones are run on the next trip up. */
function spawnOffer() {
  if (G.offers.length >= 3) return;
  const tier = Math.min(3, Math.floor(SAVE.rep / 4)), names = ADDRESSES.filter(n => !G.offers.some(o => o.name === n) && !G.orders.some(o => o.name === n));
  const need = 3 + Math.floor(Math.random() * 3), o = { name: names[Math.floor(Math.random() * Math.min(names.length, 2 + tier * 2))], need, tip: Math.round((6 + need * 2) * (1 + tier * 0.35)) };
  G.offers.push(o); G.orderTimer = 0;
  if (G.state === 'play') { say(`App ping: ${o.name} wants ${need} sheets`, 2.4); blip(520, 0.08, 'triangle', 200); setTimeout(() => blip(520, 0.08, 'triangle', 200), 140); }
}
const heatUp = n => { G.heat = Math.min(100, G.heat + n); };
G.dev = { genRun, genHub, startRun, goHub }; // for tests and tinkering from the console
/* Taking the lift home: what was carried is banked. */
function bankRun() {
  const t = G.pocket.tips, sc = G.pocket.scrap, rep = G.runRep;
  SAVE.bank += t; SAVE.scrap += sc; SAVE.rep += rep; G.pocket = { tips: 0, scrap: 0 }; G.runRep = 0; save();
  goHub(t || sc || rep ? `Home safe. Banked ${[t && `${t} tips`, sc && `${sc} scrap`, rep && `${rep} reputation`].filter(Boolean).join(', ')}` : 'Home, empty-handed.');
  blip(660, 0.15, 'triangle', 200);
}
/* The stores: what is still for sale, in the order the number keys buy it. Scrap buys kit; tips buy comfort. */
function shopItems() {
  const it = [];
  SMOKES.forEach((k, n) => { if (!SAVE.smokes[n]) it.push({ label: `${k.name}: ${k.hint}`, cost: [0, 15, 30, 45][n], cur: 'scrap', buy: () => { SAVE.smokes[n] = true; G.player.smoke = n; } }); });
  if (SAVE.edge < 2) it.push({ label: `Sharper knife: +1 damage`, cost: [25, 60][SAVE.edge], cur: 'scrap', buy: () => { SAVE.edge++; } });
  if (SAVE.roll < 2) it.push({ label: `Bigger roll: ${[16, 20][SAVE.roll]} sheets`, cost: [40, 90][SAVE.roll], cur: 'bank', buy: () => { SAVE.roll++; MAX_SHEETS = [12, 16, 20][SAVE.roll]; G.player.sheets = MAX_SHEETS; } });
  if (!SAVE.boots) it.push({ label: 'Quick boots: dash again sooner', cost: 50, cur: 'bank', buy: () => { SAVE.boots = 1; } });
  return it;
}
function buyItem(n) {
  const it = shopItems()[n]; if (!it) return;
  if (SAVE[it.cur] < it.cost) { say(`That costs ${it.cost} ${it.cur === 'bank' ? 'tips' : 'scrap'}. You have ${SAVE[it.cur]}.`, 1.8); return; }
  SAVE[it.cur] -= it.cost; it.buy(); save(); say(`Bought: ${it.label}`, 2.2); blip(880, 0.1, 'triangle', 300);
}

/* ---------- input ---------- */
const held = {}, pressed = {}, stickAxis = { x: 0, y: 0 };
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyX: 'attack', KeyJ: 'attack', KeyC: 'wrap', KeyK: 'wrap', KeyV: 'smoke', KeyL: 'smoke', KeyQ: 'swap', KeyF: 'accept', KeyE: 'accept', Enter: 'confirm' };
function press(k) { if (!held[k]) pressed[k] = true; held[k] = true; audioInit(); }
function release(k) { held[k] = false; }
addEventListener('keydown', e => { const k = KEYMAP[e.code]; if (k) { press(k); e.preventDefault(); }
  if (/^Digit[1-9]$/.test(e.code)) pressed['n' + (+e.code[5] - 1)] = true; });
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) release(k); });
addEventListener('blur', () => { for (const k in held) held[k] = false; });
stage.addEventListener('pointerdown', e => {
  if (e.target.tagName === 'CANVAS') { // tapping the smoke chip in the HUD swaps smokes
    const r = stage.getBoundingClientRect(), k = r.width / LW, x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
    const R = G.rects, inR = q => q && x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.h;
    if (G.state === 'play' && inR(R.shop)) pressed['n' + Math.floor((y - R.shop.y) / 24)] = true; // tapping a row in the stores buys it
    else if (G.state === 'play' && inR(R.swap)) pressed.swap = true;                             // tapping the smoke chip swaps smokes
    else if (G.state === 'play' && inR(R.list)) pressed.accept = true;                           // tapping the order list accepts the next offer
    else pressed.confirm = true;
  }
  audioInit();
});
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
const tI = v => Math.round(v / TS);
const groundAt = (x, z) => { const r = G.hgt[tI(z)], h = r ? r[tI(x)] : null; return h == null ? -Infinity : h; };
const tileAt = (x, z) => { const r = G.kind[tI(z)]; return (r && r[tI(x)]) || ' '; };
/* Would standing here mean climbing more than a stair? Then it is a wall. Open air never blocks: you just fall. */
function blockedAt(x, z, e) { for (const sx of [-RADIUS, RADIUS]) for (const sz of [-RADIUS, RADIUS]) if (groundAt(x + sx, z + sz) > e.h + 0.45) return true; return false; }
function step(e, dt) {
  e.bump = false;
  if (blockedAt(e.x + e.vx * dt, e.z, e)) { e.bump = true; e.vx = 0; } else e.x += e.vx * dt;
  if (blockedAt(e.x, e.z + e.vz * dt, e)) { e.bump = true; e.vz = 0; } else e.z += e.vz * dt;
  const g = groundAt(e.x, e.z);
  if (e.dashT > 0) { e.vh = 0; if (g > e.h) e.h = g; e.onGround = false; return; } // a dash holds its height, so it carries across gaps
  e.vh -= GRAV * dt; e.h += e.vh * dt; e.onGround = false;
  if (e.h <= g) { e.h = g; e.vh = 0; e.onGround = true; }
}
function sight(ax, az, bx, bz) { // blocked only by something standing well above both ends
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 1.2), top = Math.max(groundAt(ax, az), groundAt(bx, bz), -50) + 1.2;
  for (let k = 1; k < n; k++) if (groundAt(ax + (bx - ax) * k / n, az + (bz - az) * k / n) > top) return false;
  return true;
}
const walkable = (e, x, z) => { const g = groundAt(x, z); return g > e.h - 0.45 && g <= e.h + 0.45; }; // somewhere a creature would choose to step

const PGEO = { sheet: new THREE.PlaneGeometry(0.24, 0.17), dot: new THREE.SphereGeometry(0.09, 6, 5), shot: new THREE.BoxGeometry(0.16, 0.05, 0.9) };
function burst(type, x, h, z, n, speed = 4) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(type === 'sheet' ? PGEO.sheet : PGEO.dot, type === 'sheet' ? M.paper : M[type]);
    m.position.set(x, h + G.baseY, z); scene.add(m); // heights are given relative to where the gnome stands
    const a = Math.random() * 6.28, sp = speed * (0.3 + Math.random() * 0.7);
    G.particles.push({ type, mesh: m, vx: Math.cos(a) * sp, vy: speed * (0.5 + Math.random()), vz: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.6 });
  }
}
function updateParticles(dt) {
  for (const q of G.particles) {
    q.life -= dt; q.vy -= (q.type === 'sheet' ? 6 : q.type === 'smoke' ? -2 : 16) * dt;
    q.mesh.position.x += q.vx * dt; q.mesh.position.y += q.vy * dt; q.mesh.position.z += q.vz * dt;
    if (q.type === 'sheet') { q.mesh.rotation.x += dt * 7; q.mesh.rotation.z += dt * 5; q.vx *= 0.97; q.vz *= 0.97; }
    if (q.life <= 0) scene.remove(q.mesh);
  }
  G.particles = G.particles.filter(q => q.life > 0);
}
const say = (text, t = 1.8) => { G.banner = { text, t }; };

/* Smoke decoy: runs off the way the gnome was facing, turning at walls and ledges. Creatures that see it chase it instead. */
function spawnDecoy() {
  const p = G.player; popDecoy();
  const m = buildDecoy(); G.group.add(m);
  G.decoy = { x: p.x, z: p.z, h: p.h, vx: 0, vz: 0, vh: 0, fx: p.fx, fz: p.fz, onGround: true, life: 5.5, puff: 0, mesh: m };
  burst('smoke', p.x + p.fx * 0.4, 1, p.z + p.fz * 0.4, 8, 1.5); blip(240, 0.35, 'sine', 160, 0.05);
}
function popDecoy() {
  const d = G.decoy; if (!d) return;
  burst('smoke', d.x, 0.8, d.z, 16, 2.5); G.group.remove(d.mesh); G.decoy = null;
}
function updateDecoy(dt) {
  const d = G.decoy; if (!d) return;
  if (!walkable(d, d.x + d.fx * 1.3, d.z + d.fz * 1.3)) { const opts = [[-d.fz, d.fx], [d.fz, -d.fx], [-d.fx, -d.fz]].filter(([a, b]) => walkable(d, d.x + a * 1.3, d.z + b * 1.3)), o = opts[Math.floor(Math.random() * opts.length)] || [0, 0]; d.fx = o[0]; d.fz = o[1]; }
  d.vx = d.fx * 7.5; d.vz = d.fz * 7.5; step(d, dt);
  if ((d.puff -= dt) <= 0) { d.puff = 0.09; burst('smoke', d.x, 0.5, d.z, 1, 0.8); }
  d.mesh.position.set(d.x, d.h + Math.abs(Math.sin(now() * 14)) * 0.12, d.z); d.mesh.rotation.y = Math.atan2(d.fx, d.fz);
  if ((d.life -= dt) <= 0 || d.h < G.floorY) popDecoy();
}

/* Attacks aim themselves: the nearest creature in view gets a ring, and whack, wrap and the pipe ring turn to face it. */
function nearestEnemy(range, skipWrapped) {
  const p = G.player; let best = null, bd = range;
  for (const e of G.enemies) { if (e.dead || e.launch || (skipWrapped && e.wrap > 0)) continue; const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd && sight(p.x, p.z, e.x, e.z)) { bd = d; best = e; } }
  return best;
}
function faceTo(e) { const p = G.player; p.ang = Math.atan2(e.x - p.x, e.z - p.z); p.fx = Math.sin(p.ang); p.fz = Math.cos(p.ang); }
const DUST = (() => { // motes hanging in the air around the gnome
  const n = 150, pos = new Float32Array(n * 3); for (let k = 0; k < n; k++) { pos[k * 3] = (Math.random() - 0.5) * 26; pos[k * 3 + 1] = 0.3 + Math.random() * 3.6; pos[k * 3 + 2] = (Math.random() - 0.5) * 26; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xc8d4dc, size: 0.07, transparent: true, opacity: 0.5, depthWrite: false })); pts.frustumCulled = false; scene.add(pts); return pts;
})();
const SLASH = new THREE.Group(); // the swing: a crescent in front of the gnome
SLASH.add(mesh(new THREE.RingGeometry(1.1, 2.0, 18, 1, -Math.PI / 2 - 0.95, 1.9), new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })).rotateX(-Math.PI / 2));
SLASH.visible = false; scene.add(SLASH);
const TARGET = mesh(new THREE.RingGeometry(0.62, 0.8, 24), new THREE.MeshBasicMaterial({ color: 0xff5040, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false })).rotateX(-Math.PI / 2);
TARGET.visible = false; scene.add(TARGET);
const inCloud = (x, z) => G.clouds.some(c => Math.hypot(c.x - x, c.z - z) < c.r);
function useSmoke() {
  const p = G.player, k = SMOKES[p.smoke];
  if (p.smokeCd[p.smoke] > 0) { say(`${k.name} needs ${Math.ceil(p.smokeCd[p.smoke])} s to relight`, 1); return; }
  p.smokeCd[p.smoke] = k.cd;
  if (k.id === 'cig') spawnDecoy();
  else if (k.id === 'pipe') { // a smoke ring that rolls forward and shoves whatever it meets
    const tg = nearestEnemy(9); if (tg) faceTo(tg);
    const m = mesh(new THREE.TorusGeometry(0.8, 0.16, 8, 20), M.smoke); m.rotation.y = p.ang; scene.add(m);
    G.rings.push({ h: p.h, x: p.x + p.fx * 0.7, z: p.z + p.fz * 0.7, vx: p.fx * 9, vz: p.fz * 9, life: 1.1, mesh: m });
    blip(300, 0.3, 'sine', -120, 0.05);
  } else if (k.id === 'cigar') { // a thick cloud: creatures inside choke, and cannot see a gnome standing in it
    const m = new THREE.Group(); for (let i = 0; i < 11; i++) { const a = i * 2.4, r = i ? 1.2 + (i % 3) * 0.6 : 0; m.add(sphere(1.1 + (i % 4) * 0.2, M.smoke, Math.cos(a) * r, 0.7 + (i % 3) * 0.35, Math.sin(a) * r)); }
    m.position.set(p.x, p.h, p.z); scene.add(m);
    G.clouds.push({ x: p.x, z: p.z, r: 3.4, life: 6, mesh: m });
    blip(110, 0.5, 'sine', 60, 0.06);
  } else { // a haze: creatures that breathe it wander off harmless for a while
    for (const e of G.enemies) if (Math.hypot(e.x - p.x, e.z - p.z) < 7 && sight(p.x, p.z, e.x, e.z)) { e.mellow = 9; e.goal = null; }
    burst('smoke', p.x, 0.9, p.z, 28, 5); blip(200, 0.6, 'triangle', 80, 0.04);
  }
}
function updateSmokes(dt) {
  for (const r of G.rings) {
    r.life -= dt; r.x += r.vx * dt; r.z += r.vz * dt;
    if (groundAt(r.x, r.z) > r.h + 0.6) r.life = 0; // a wall stops it; open air does not
    const sc = 0.6 + (1 - Math.max(0, r.life) / 1.1) * 0.9; r.mesh.scale.setScalar(sc); r.mesh.position.set(r.x, r.h + 0.8, r.z);
    for (const e of G.enemies) if (e.ringed !== r && !e.launch && Math.hypot(e.x - r.x, e.z - r.z) < 0.9 + sc * 0.6) {
      e.ringed = r; e.stun = 1.3; e.vx = r.vx; e.vz = r.vz; e.vh = 5; e.onGround = false; e.h += 0.05; blip(140, 0.1, 'square', -40, 0.05); }
    if (r.life <= 0) { burst('smoke', r.x, 0.8, r.z, 6, 1.5); scene.remove(r.mesh); }
  }
  G.rings = G.rings.filter(r => r.life > 0);
  for (const c of G.clouds) { c.life -= dt; c.mesh.scale.setScalar(Math.max(0.01, Math.min(1, (6 - c.life) * 4, c.life))); c.mesh.rotation.y += dt * 0.3; if (c.life <= 0) scene.remove(c.mesh); }
  G.clouds = G.clouds.filter(c => c.life > 0);
}

function knockout(msg) { // back to the lobby with empty pockets; the bank is safe
  const t = G.pocket.tips, sc = G.pocket.scrap;
  if (t || sc) msg += `, lost what you carried (${[t && `${t} tips`, sc && `${sc} scrap`].filter(Boolean).join(', ')})`;
  G.pocket = { tips: 0, scrap: 0 }; G.runRep = 0;
  goHub(msg); blip(160, 0.5, 'sawtooth', -100); G.shake = 0.3; G.left = true;
}
/* Humans above: a reticle hunts the gnome. A few shots, then a hand comes down. Vents and smoke break the line of sight. */
const HUNT = {
  ring: mesh(new THREE.RingGeometry(0.95, 1.2, 28), new THREE.MeshBasicMaterial({ color: 0xffd24a, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })).rotateX(-Math.PI / 2),
  beam: mesh(new THREE.CylinderGeometry(0.07, 0.07, 18, 6), new THREE.MeshBasicMaterial({ color: 0xfff2a0 })),
  hand: new THREE.Group(),
};
HUNT.hand.add(box(2.3, 0.7, 2.4, M.skin, 0, 0, 0), box(0.6, 0.6, 1.3, M.skin, -1.5, 0, 0.5));
for (let i = 0; i < 4; i++) HUNT.hand.add(box(0.5, 0.6, 1.6, M.skin, -0.87 + i * 0.58, -0.1, 1.9));
for (const k in HUNT) { HUNT[k].visible = false; scene.add(HUNT[k]); }
function updateHunt(dt) {
  const p = G.player; let h = G.hunt;
  if (!h) {
    if (G.mode !== 'deliver') return; // humans only watch the ducts under their streets
    if (G.heat < 20) return; // humans only come looking once there is heat
    G.huntTimer -= dt * (G.heat / 35) * (p.pkg ? 1.5 : 1); // hotter means sooner; carrying a package draws attention
    if (G.huntTimer > 0) return;
    h = G.hunt = { x: p.x - p.fx * 4, z: p.z - p.fz * 4, phase: 'track', timer: 1.8, shots: 0, lost: 0, flash: 0 };
    say('A human spotted you! Keep moving, or hide in a covered duct or smoke', 3.5); blip(90, 0.6, 'sawtooth', 40, 0.07);
  }
  const covered = tileAt(p.x, p.z) === 'c' || inCloud(p.x, p.z);
  h.lost = covered ? h.lost + dt : 0; h.flash -= dt;
  const dx = p.x - h.x, dz = p.z - h.z, d = Math.hypot(dx, dz) || 0.001;
  const end = msg => { G.hunt = null; G.huntTimer = 60; if (msg) say(msg, 2.2); };
  if (h.phase !== 'slam' && h.lost > 1.5) return end('The human lost you');
  if ((h.phase === 'track' || h.phase === 'grab') && !covered) { const sp = Math.min(d, (h.phase === 'grab' ? 4.0 : 4.6) * dt); h.x += dx / d * sp; h.z += dz / d * sp; }
  if ((h.timer -= dt) > 0) return;
  if (h.phase === 'track') { if (h.shots < 4) { h.phase = 'lock'; h.timer = 0.8; } else { h.phase = 'grab'; h.timer = 1.1; say('It is reaching in!', 1.5); } }
  else if (h.phase === 'lock') { // the reticle froze half a second ago; now the shot lands there
    h.shots++; h.phase = 'track'; h.timer = 1.4; h.flash = 0.12; G.shake = 0.3; burst('star', h.x, 0.3, h.z, 10, 4); blip(80, 0.25, 'square', -40, 0.09);
    for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - h.x, e.z - h.z) < 1.3) defeat(e, 1); // creatures can be lured under it
    if (d < 1.25 && !covered && p.invuln <= 0) { say('Shot! −3 sheets', 1.4); p.invuln = 1; loseSheets(3); }
  } else if (h.phase === 'grab') {
    h.phase = 'slam'; h.timer = 0.5; G.shake = 0.4; blip(60, 0.3, 'sine', -20, 0.1);
    if (d < 1.6 && !covered) knockout('Caught by a human! Dumped at the lobby'); return;;
  } else end();
}

function loseSheets(n) {
  const p = G.player; G.shake = 0.3;
  if (p.sheets === 0) { knockout('Knocked out! Dragged back to the lobby'); return; } // nothing left to protect you
  p.sheets = Math.max(0, p.sheets - n);
  burst('sheet', p.x, 0.8, p.z, n * 3);
}
/* The knife. slash: a quick arc, steps in to connect. spin: every third swing, hits all round and throws things back.
   stab: struck out of a dash, a long lunge that hits hard. */
function swing(kind) {
  const p = G.player, tg = nearestEnemy(kind === 'stab' ? 5.5 : 3.6); if (tg && kind !== 'spin') faceTo(tg);
  p.swing++; p.kind = kind; p.big = kind !== 'slash'; p.attack = kind === 'stab' ? 0.2 : 0.16; p.cooldown = kind === 'slash' ? 0.24 : 0.42; p.comboT = 0.75;
  const reach = tg ? Math.hypot(tg.x - p.x, tg.z - p.z) : 0, sp = kind === 'stab' ? 21 : tg ? Math.max(0, Math.min(18, (reach - 1.3) / 0.1)) : 5;
  p.vx = p.fx * sp; p.vz = p.fz * sp;
  blip(kind === 'slash' ? 520 : kind === 'spin' ? 300 : 700, 0.07, 'sawtooth', kind === 'stab' ? -400 : 300, 0.04);
}
function usePad(pd) {
  if (pd.kind === 'under') startRun('under', 1);
  else if (pd.kind === 'deeper') startRun('under', G.depth + 1);
  else if (pd.kind === 'home') bankRun();
  else if (pd.kind === 'deliver') { if (!G.orders.length) { say('No orders accepted. Take one from the app first (F, or tap the list).', 2.6); pd.t = -1.5; return; } startRun('deliver', 1 + Math.min(2, Math.floor(SAVE.rep / 6))); }
  G.left = true;
}

function updatePlayer(dt) {
  const p = G.player;
  let ax = (held.right ? 1 : 0) - (held.left ? 1 : 0) + stickAxis.x, ay = (held.up ? 1 : 0) - (held.down ? 1 : 0) + stickAxis.y;
  const mag = Math.hypot(ax, ay); if (mag > 1) { ax /= mag; ay /= mag; }
  const wx = ax, wz = -ay, wm = Math.hypot(wx, wz); // the camera never turns, so the stick maps straight onto the floor
  p.dashCd -= dt; p.dashGrace -= dt;
  if (p.dashT > 0) { // mid-dash: committed, untouchable, carried over gaps
    if (Math.random() < dt * 70) burst('smoke', p.x, 0.5, p.z, 1, 0.6);
    if ((p.dashT -= dt) <= 0) { p.vx *= 0.25; p.vz *= 0.25; p.dashGrace = 0.22; }
  } else if (p.knock > 0) p.knock -= dt;
  else {
    const k = Math.min(1, dt * 24); // snappy: near-instant start, stop and turn
    if (p.attack > 0) { const f = p.kind === 'stab' ? 0.94 : 0.8; p.vx *= f; p.vz *= f; } // a swing commits: the step into it plays out, then control returns
    else { p.vx += (wx * RUN - p.vx) * k; p.vz += (wz * RUN - p.vz) * k; }
    if (wm > 0.2 && p.attack <= 0) { p.ang = Math.atan2(wx, wz); p.fx = Math.sin(p.ang); p.fz = Math.cos(p.ang); }
    if (pressed.jump && p.dashCd <= 0) { // dash where the stick points, or the way the gnome faces
      if (wm > 0.2) { p.fx = wx / wm; p.fz = wz / wm; p.ang = Math.atan2(p.fx, p.fz); }
      p.dashT = 0.17; p.dashCd = SAVE.boots ? 0.45 : 0.65; p.vx = p.fx * 27; p.vz = p.fz * 27; p.attack = 0; p.invuln = Math.max(p.invuln, 0.24);
      blip(520, 0.13, 'sawtooth', -320, 0.04); burst('smoke', p.x, 0.4, p.z, 6, 1.6);
    }
  }
  step(p, dt);
  p.walk = p.onGround && Math.hypot(p.vx, p.vz) > 0.8 ? p.walk + dt * 13 : 0;
  const ti = tI(p.x), tj = tI(p.z);
  if (p.onGround && p.knock <= 0) p.safe = { x: ti * TS, z: tj * TS, h: p.h };
  for (let j = tj - 7; j <= tj + 7; j++) for (let i = ti - 7; i <= ti + 7; i++) if (G.seen[j] && i >= 0 && i < G.W && !G.seen[j][i] && Math.hypot(i - ti, j - tj) < 7.4) { G.seen[j][i] = true; G.mapCanvas = null; }
  if (p.h < G.floorY) { // off the edge
    blip(140, 0.3, 'sine', -80, 0.08);
    Object.assign(p, { x: p.safe.x, z: p.safe.z, h: p.safe.h, vx: 0, vz: 0, vh: 0, knock: 0, dashT: 0 });
    if (p.sheets > 0) say('A long way down. −2 sheets', 1.6);
    loseSheets(2); if (G.left) return; p.invuln = Math.max(p.invuln, 1.5); camReady = false;
  }

  // the knife
  p.cooldown -= dt; p.attack -= dt; p.invuln -= dt; p.throwCd -= dt;
  if ((p.comboT -= dt) <= 0) p.combo = 0;
  if ((pressed.attack || held.attack || (G.auto && nearestEnemy(2.7))) && p.cooldown <= 0) {
    if (p.dashT > 0 || p.dashGrace > 0) { p.dashT = 0; p.dashGrace = 0; p.combo = 0; swing('stab'); }
    else { p.combo = p.combo % 3 + 1; swing(p.combo === 3 ? 'spin' : 'slash'); }
  }
  if (pressed.wrap && p.throwCd <= 0) {
    if (p.sheets < 1) say('No paper left to throw');
    else { // costs a sheet; aimed at the nearest creature in view
      p.sheets--; p.throwCd = 0.45;
      const tg = nearestEnemy(11, true); if (tg) faceTo(tg);
      const m = new THREE.Mesh(PGEO.shot, M.paper); m.rotation.y = p.ang; scene.add(m);
      G.shots.push({ x: p.x + p.fx * 0.6, z: p.z + p.fz * 0.6, h: p.h, vx: p.fx * 17, vz: p.fz * 17, life: 0.65, mesh: m });
      blip(700, 0.12, 'triangle', -400, 0.04);
    }
  }
  for (let i = 0; i < SMOKES.length; i++) p.smokeCd[i] -= dt;
  if (pressed.swap) { do { p.smoke = (p.smoke + 1) % SMOKES.length; } while (!SAVE.smokes[p.smoke]); blip(400, 0.05, 'square', 100, 0.03);
    if (SAVE.smokes.filter(Boolean).length === 1) say('Only the cigarette so far. The stores sell more.', 1.8); }
  if (pressed.smoke) useSmoke();

  // things on the floor
  for (const k of G.pickups) if (!k.taken && Math.hypot(k.x - p.x, k.z - p.z) < 1.1 && Math.abs(k.h - p.h) < 1.2) {
    if (k.kind === 'P' && p.sheets >= MAX_SHEETS) continue;
    k.taken = true; k.mesh.visible = false; burst('star', k.x, 0.8, k.z, k.kind === 'X' ? 16 : 8, 3);
    if (k.kind === 'P') { p.sheets = Math.min(MAX_SHEETS, p.sheets + 3); blip(660, 0.1, 'triangle', 300); }
    else if (k.kind === 'S') { G.pocket.scrap += 3; blip(880, 0.07, 'square', 400, 0.03); }
    else if (k.kind === 'X') { const n = 6 + G.depth * 2; G.pocket.scrap += n; say(`A stash: +${n} scrap`, 1.8); blip(523, 0.1, 'triangle'); setTimeout(() => blip(784, 0.2, 'triangle'), 110); }
    else { G.pocket.tips += 2; blip(880, 0.07, 'square', 400, 0.03); }
  }
  // pads: stand still on one for a moment
  for (const pd of G.pads) {
    if (Math.hypot(pd.x - p.x, pd.z - p.z) < 1.3 && p.onGround) { if ((pd.t += dt) > 0.8) { usePad(pd); if (G.left) return; } } else pd.t = Math.min(0, pd.t + dt);
  }
  if (G.mode === 'hub') {
    const hb = G.L.hub;
    if (Math.hypot(p.x - hb.pallet.x, p.z - hb.pallet.z) < 2.8 && p.sheets < MAX_SHEETS) { p.sheets = MAX_SHEETS; say('Fresh roll loaded'); blip(440, 0.1, 'triangle', 220); }
    G.shopOpen = Math.hypot(p.x - hb.shop.x, p.z - hb.shop.z) < 2.8;
    if ((G.orderTimer += dt) > 12) spawnOffer();
    if (pressed.accept) {
      const o = G.offers[0];
      if (!o) say('No orders on the app right now', 1.4);
      else if (G.orders.length >= MAX_ACTIVE) say('Three orders on the go is the limit', 1.6);
      else { G.offers.shift(); G.orders.push(o); say(`Accepted: ${o.name}, ${o.need} sheets. Head up the east ramp.`, 2.6); blip(660, 0.1, 'triangle', 200); }
    }
  } else G.shopOpen = false;
  for (let n = 0; n < 9; n++) if (pressed['n' + n]) { if (G.shopOpen) buyItem(n); else if (n < 4 && SAVE.smokes[n]) p.smoke = n; } // number keys: buy at the stores, pick a smoke elsewhere
  if (G.mode === 'deliver') {
    heatUp(dt * 0.3); // under the streets, heat builds just from being there
    for (const pt of G.points) { const o = pt.order; if (!o || o.done) continue;
      if (Math.hypot(p.x - pt.x, p.z - pt.z) > 1.7 || !p.onGround) { pt.warned = false; continue; }
      if (p.sheets < o.need) { if (!pt.warned) { pt.warned = true; say(`${o.name} needs ${o.need} sheets. You have ${p.sheets}.`, 2.4); } continue; }
      p.sheets -= o.need; G.pocket.tips += o.tip; G.runRep++; heatUp(12); o.done = true; G.orders = G.orders.filter(q => q !== o);
      burst('star', pt.x, 1.5, pt.z, 14, 4); burst('sheet', pt.x, 1.5, pt.z, 6, 3); say(`Delivered to ${o.name}  +${o.tip} tips in your pocket`, 2.6);
      blip(523, 0.12, 'triangle'); setTimeout(() => blip(659, 0.12, 'triangle'), 110); setTimeout(() => blip(784, 0.25, 'triangle'), 220);
    }
  }
}

function defeat(e) {
  if (e.dead) return; e.dead = true;
  burst('poof', e.x, e.h - G.baseY + 0.4, e.z, 10, 3.5); if (e.wrap || e.launch) burst('sheet', e.x, e.h - G.baseY + 0.6, e.z, 5, 3);
  if (G.mode === 'deliver') G.pocket.tips += 1; else G.pocket.scrap += e.kind === 'M' ? 3 : 1;
}
function updateEnemies(dt) {
  const p = G.player, dmg = 1 + SAVE.edge;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.flash -= dt; e.timer += dt;
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 0.001, dh = Math.abs(e.h - p.h), dot = (-dx * p.fx - dz * p.fz) / d;
    if (e.h < G.floorY) { if (e.stun > 0 || e.launch > 0) { say('Over the edge!', 1.2); blip(90, 0.25, 'sine', -50, 0.07); } defeat(e); continue; } // knocked, blown or lunged off a ledge
    if (e.launch > 0) { // a wrapped creature that has been struck: a bowling ball
      e.launch -= dt; step(e, dt);
      for (const o of G.enemies) if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.z - e.z) < 1.2 && Math.abs(o.h - e.h) < 1.5) { defeat(o); blip(90, 0.12, 'square', -30, 0.06); }
      if (e.launch <= 0 || e.bump) defeat(e);
      continue;
    }
    const struck = p.attack > 0 && e.hitBy !== p.swing && dh < 1.6 && (p.kind === 'spin' ? d < 2.9 : p.kind === 'stab' ? d < 1.2 || (d < 2.6 && dot > 0.3) : d < 2.6 && (d < 0.9 || dot > 0.15));
    if (e.wrap > 0) {
      e.wrap -= dt; e.vx = e.vz = 0;
      if (struck) { e.hitBy = p.swing; e.wrap = 0; e.launch = 0.8; e.vx = p.fx * 15; e.vz = p.fz * 15; e.vh = 3; e.h += 0.2; e.onGround = false; blip(260, 0.15, 'square', 300, 0.06); continue; }
      step(e, dt); continue;
    }
    if (e.mellow > 0) e.mellow -= dt;
    if (inCloud(e.x, e.z)) e.stun = Math.max(e.stun, 0.3);
    if (e.stun > 0) { e.stun -= dt; if (e.onGround) { e.vx *= 0.85; e.vz *= 0.85; } }
    else {
      let tx = dx, tz = dz, td = d, lured = false; // chase the smoke gnome if it is in view, else the real one
      const dc = G.decoy;
      if (dc) { const ex = dc.x - e.x, ez = dc.z - e.z, ed = Math.hypot(ex, ez) || 0.001; if (ed < 13 && sight(e.x, e.z, dc.x, dc.z)) { tx = ex; tz = ez; td = ed; lured = true; } }
      if (lured && td < 0.9) { popDecoy(); e.stun = 1.8; e.vx = e.vz = 0; blip(150, 0.2, 'sine', -60, 0.05); } // caught a lungful
      // creatures need the gnome in view for a moment before they react, and give up once it is away
      const spotted = !(e.mellow > 0) && (lured || (!inCloud(p.x, p.z) && d < 8.5 + G.heat * 0.03 && dh < 2.6 && sight(e.x, e.z, p.x, p.z)));
      e.alert = spotted ? Math.min(1.6, (e.alert || 0) + dt) : Math.max(0, (e.alert || 0) - dt * 0.6);
      const sees = spotted && (lured || e.alert > 0.7);
      if (e.kind === 'B') { // clogling: sits, then hops at the gnome
        if (e.onGround) { e.vx = e.vz = 0; if (e.timer > 2.0 && sees) { e.timer = 0; e.vx = tx / td * 3.6; e.vz = tz / td * 3.6; e.vh = 8.5; e.fx = tx / td; e.fz = tz / td; } }
      } else {
        let wx = 0, wz = 0;
        const speed = e.kind === 'R' ? [1.3, 2.9] : e.kind === 'M' ? [1.5, 3.3] : [2.4, 3.9];
        if (sees) { wx = tx / td * speed[1]; wz = tz / td * speed[1]; if (e.kind === 'C') { wx += Math.sin(e.timer * 9) * 2 * tz / td; wz -= Math.sin(e.timer * 9) * 2 * tx / td; } e.goal = null; }
        else { // potter about near home
          if (!e.goal || Math.hypot(e.goal.x - e.x, e.goal.z - e.z) < 0.3 || (e.stuck += dt) > 2.5) { const a = Math.random() * 6.28, r = 1 + Math.random() * 3, gx = e.home.x + Math.cos(a) * r, gz = e.home.z + Math.sin(a) * r; e.goal = walkable(e, gx, gz) ? { x: gx, z: gz } : { x: e.x, z: e.z }; e.stuck = 0; }
          const gx = e.goal.x - e.x, gz = e.goal.z - e.z, gd = Math.hypot(gx, gz) || 1; if (gd > 0.3) { wx = gx / gd * speed[0]; wz = gz / gd * speed[0]; }
        }
        e.vx = wx; e.vz = wz;
        if (e.kind === 'M' || e.kind === 'R') { // lunge: stop, wind up (red ring), then dash. The wind-up is the moment to dash clear or strike first.
          e.cool -= dt;
          if (e.dash > 0) { e.dash -= dt; e.vx = e.lx * (e.kind === 'M' ? 10 : 8.5); e.vz = e.lz * (e.kind === 'M' ? 10 : 8.5); wx = e.lx; wz = e.lz; }
          else if (e.wind > 0) { e.vx = e.vz = 0; wx = e.lx; wz = e.lz; if ((e.wind -= dt) <= 0) { e.dash = 0.22; blip(520, 0.08, 'sawtooth', 300, 0.04); } }
          else if (sees && td < 2.8 && e.cool <= 0) { e.wind = 0.6; e.cool = 2.6; e.lx = tx / td; e.lz = tz / td; e.vx = e.vz = 0; }
        }
        if (Math.hypot(wx, wz) > 0.3) { e.fx = wx / Math.hypot(wx, wz); e.fz = wz / Math.hypot(wx, wz); }
        const m = Math.hypot(e.vx, e.vz); // on their own feet they will not walk off a ledge or up a wall; a lunge does not look
        if (m > 0.1 && !(e.dash > 0) && !walkable(e, e.x + e.vx / m * 0.8, e.z + e.vz / m * 0.8)) {
          if (walkable(e, e.x + Math.sign(e.vx) * 0.8, e.z)) e.vz = 0; else if (walkable(e, e.x, e.z + Math.sign(e.vz) * 0.8)) e.vx = 0; else e.vx = e.vz = 0;
          e.goal = null;
        }
      }
    }
    step(e, dt);
    if (struck) { // impact: a beat of freeze, a shake, sparks, and the creature thrown back
      const kb = p.kind === 'slash' ? 4.5 : p.kind === 'spin' ? 13 : 11, ax = p.kind === 'stab' ? p.fx : -dx / d, az = p.kind === 'stab' ? p.fz : -dz / d;
      e.hitBy = p.swing; e.hp -= dmg + (p.big ? 1 : 0); e.wind = e.dash = 0; e.flash = 0.18; e.stun = p.big ? 0.6 : 0.4; e.vx = ax * kb; e.vz = az * kb; e.vh = p.big ? 6.5 : 4.5; e.onGround = false;
      G.hitstop = p.big ? 0.09 : 0.05; G.shake = Math.max(G.shake, p.big ? 0.28 : 0.13); burst('star', e.x, e.h - G.baseY + 0.7, e.z, p.big ? 9 : 4, 3.5);
      blip(p.big ? 90 : 120, p.big ? 0.16 : 0.1, 'square', -40, 0.07);
      if (e.hp <= 0) defeat(e);
    } else if (p.invuln <= 0 && e.stun <= 0 && !(e.mellow > 0) && d < 0.9 && dh < 1.1 && (e.kind === 'C' || e.kind === 'B' || e.dash > 0)) { // rats and the mob only hurt on a lunge
      p.invuln = 1.2; p.knock = 0.25; p.vx = dx / d * 7; p.vz = dz / d * 7; p.vh = 5.5;
      blip(200, 0.2, 'sawtooth', -120, 0.06);
      loseSheets(e.kind === 'M' ? 3 : e.kind === 'C' ? 1 : 2); if (G.left) return;
    }
  }
  for (const s of G.shots) { // paper streamers
    s.life -= dt; s.x += s.vx * dt; s.z += s.vz * dt; s.mesh.position.set(s.x, s.h + 0.8, s.z); s.mesh.rotation.z += dt * 20;
    if (groundAt(s.x, s.z) > s.h + 0.6) s.life = 0;
    for (const e of G.enemies) if (!e.dead && !e.wrap && !e.launch && Math.hypot(e.x - s.x, e.z - s.z) < 0.95 && Math.abs(e.h - s.h) < 1.5) { e.wrap = 5; e.stun = 0; s.life = 0; burst('sheet', e.x, 0.6, e.z, 6, 2.5); blip(500, 0.1, 'triangle', -200); break; }
    if (s.life <= 0) scene.remove(s.mesh);
  }
  G.shots = G.shots.filter(s => s.life > 0);
  for (const e of G.enemies) if (e.dead) G.group.remove(e.mesh);
  G.enemies = G.enemies.filter(e => !e.dead);
}

function update(dt) {
  G.t += dt; G.fade = Math.max(0, G.fade - dt * 1.6);
  const go = pressed.confirm || pressed.jump;
  if (G.state === 'title') {
    G.player.walk += dt * 13;
    if (go) { G.state = 'brief'; G.t = 0; }
  } else if (G.state === 'brief') {
    if (go && G.t > 0.3) { G.state = 'play'; pressed.jump = false; }
  } else if (G.state === 'play') {
    if (G.hitstop > 0) { G.hitstop -= dt; dt = 0.0001; } // freeze-frame on impact
    G.left = false; G.baseY = G.player.h; // G.left: a level change happened this frame, so stop touching the old one
    updatePlayer(dt);
    if (!G.left) { updateDecoy(dt); updateSmokes(dt); updateHunt(dt); }
    if (!G.left) updateEnemies(dt);
    if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;
    G.shake = Math.max(0, G.shake - dt);
  }
  updateParticles(dt);
  for (const k in pressed) pressed[k] = false;
}

/* ---------- presenting the 3D scene ---------- */
const now = () => performance.now() / 1000;
let camReady = false; const camLead = { x: 0, z: 0 };
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
function present(dt) {
  const p = G.player, t = now(), ud = p.mesh.userData;
  p.mesh.position.set(p.x, p.h, p.z); p.mesh.rotation.y = p.kind === 'spin' && p.attack > 0 ? p.ang + (1 - p.attack / 0.16) * 6.28 : p.ang;
  const sw = Math.sin(p.walk), spd = Math.hypot(p.vx, p.vz);
  ud.bootL.position.z = 0.05 + sw * 0.2; ud.bootR.position.z = 0.05 - sw * 0.2;
  ud.bootL.position.y = 0.08 + Math.max(0, sw) * 0.08 + (p.onGround ? 0 : 0.1); ud.bootR.position.y = 0.08 + Math.max(0, -sw) * 0.08;
  ud.torso.position.y = Math.abs(sw) * 0.05; ud.torso.rotation.x = p.dashT > 0 ? 0.5 : p.onGround ? Math.min(0.25, spd * 0.02) : -0.1;
  const r = 0.3 + 0.7 * p.sheets / MAX_SHEETS; ud.roll.scale.set(1, r, r); ud.roll.visible = p.sheets > 0;
  ud.tail.rotation.x = -0.5 - spd * 0.1 + Math.sin(t * 9) * 0.2;
  ud.arm.rotation.x = p.attack > 0 ? (p.kind === 'stab' ? 1.5 : -0.9 + (1 - p.attack / 0.16) * 2.8) : 0.35 + sw * 0.15;
  ud.mouth.forEach((m, i) => { m.visible = i === p.smoke; });
  p.mesh.visible = !(p.invuln > 0 && p.dashT <= 0 && G.state === 'play' && Math.floor(t * 14) % 2);
  for (const e of G.enemies) {
    const d = e.mesh.userData;
    e.mesh.position.set(e.x, e.h, e.z); e.mesh.rotation.y = Math.atan2(e.fx, e.fz);
    if (e.launch > 0) e.mesh.rotation.x += dt * 18; else e.mesh.rotation.x = 0;
    e.mesh.rotation.z = e.mellow > 0 ? Math.sin(t * 3 + e.x) * 0.3 : 0;
    const wrapped = e.wrap > 0 || e.launch > 0;
    d.cocoon.visible = wrapped; d.body.visible = !wrapped || (e.wrap < 1.2 && e.wrap > 0 && Math.floor(t * 10) % 2 === 0);
    e.mesh.scale.setScalar(e.flash > 0 ? 1.3 : e.wind > 0 ? 1 + Math.sin(t * 30) * 0.06 : 1);
    d.warn.visible = e.wind > 0; if (e.wind > 0) d.warn.scale.setScalar(1.6 - e.wind);
    if (d.tail) d.tail.rotation.z = Math.sin(t * 7 + e.x) * 0.4;
    if (d.mob) { const w = Math.hypot(e.vx, e.vz) > 0.5 ? Math.sin(e.timer * 11) : 0; d.mob.bootL.position.z = 0.05 + w * 0.2; d.mob.bootR.position.z = 0.05 - w * 0.2; d.mob.arm.rotation.x = e.wind > 0 ? -2.3 : e.dash > 0 ? 1.5 : 0.35; }
    if (d.legs) d.legs.forEach((l, i) => { l.rotation.y = Math.sin(t * 30 + i * 2) * 0.35; });
    if (d.blob) { const q = e.onGround ? 1 + Math.sin(t * 5 + e.x) * 0.07 : 1.2; d.blob.scale.set(1 / q, q, 1 / q); }
  }
  for (const k of G.pickups) { k.mesh.position.set(k.x, k.h + 0.75 + Math.sin(t * 3 + k.x) * 0.12, k.z); if (k.kind !== 'X') k.mesh.rotation.y = t * 2; }
  for (const pt of G.points) { const on = pt.order && !pt.order.done; pt.beam.visible = pt.ring.visible = pt.tag.visible = on; }
  for (const pd of G.pads) { pd.ring.scale.setScalar(1 + Math.max(0, pd.t) * 0.5 + Math.sin(t * 3) * 0.04); pd.ring.material.opacity = 0.45 + Math.max(0, pd.t) * 0.6; }
  for (const c of G.npcs) { c.mesh.position.y = c.y + Math.sin(t * 2 + c.n) * 0.02; c.mesh.userData.torso.rotation.z = Math.sin(t * 0.7 + c.n * 2) * 0.05;
    if (c.smokes && Math.random() < dt * 0.5) burst('smoke', c.x + Math.sin(c.mesh.rotation.y) * 0.5, c.y + 0.95 - G.baseY, c.z + Math.cos(c.mesh.rotation.y) * 0.5, 1, 0.5); }
  const hu = G.state === 'play' ? G.hunt : null;
  HUNT.ring.visible = !!hu && hu.phase !== 'slam'; HUNT.beam.visible = !!hu && hu.flash > 0; HUNT.hand.visible = !!hu && (hu.phase === 'grab' || hu.phase === 'slam');
  if (hu) { const gy = Math.max(p.h, groundAt(hu.x, hu.z));
    HUNT.ring.position.set(hu.x, gy + 0.06, hu.z); HUNT.ring.scale.setScalar((hu.phase === 'grab' ? 1.5 : 1) * (1 + Math.sin(t * 12) * 0.06));
    HUNT.ring.material.color.setHex(hu.phase === 'lock' ? 0xff3020 : hu.phase === 'grab' ? 0xff8a30 : 0xffd24a);
    HUNT.beam.position.set(hu.x, gy + 9, hu.z); HUNT.hand.position.set(hu.x, gy + (hu.phase === 'slam' ? 0.5 : 0.5 + 13 * Math.max(0, hu.timer) / 1.1), hu.z); }
  const tg = G.state === 'play' ? nearestEnemy(9) : null; TARGET.visible = !!tg;
  if (tg) { TARGET.position.set(tg.x, tg.h + 0.06, tg.z); TARGET.scale.setScalar(1 + Math.sin(t * 8) * 0.08); }
  M.glow.opacity = 0.22 + 0.08 * Math.sin(t * 4);
  M.sewage.map.offset.y = -t * 0.05;
  lantern.position.set(p.x, p.h + 2.6, p.z);
  sun.position.set(p.x - 7, p.h + 13, p.z - 9); sun.target.position.set(p.x, p.h, p.z); sun.target.updateMatrixWorld();
  SLASH.visible = p.attack > 0 && G.state === 'play';
  if (SLASH.visible) { const f = 1 - p.attack / (p.kind === 'stab' ? 0.2 : 0.16), spin = p.kind === 'spin'; SLASH.position.set(p.x, p.h + 0.75, p.z); SLASH.rotation.y = spin ? p.ang + f * 6.28 : p.ang;
    SLASH.scale.set(p.kind === 'stab' ? 0.5 : spin ? 1.5 : 1, 1, p.kind === 'stab' ? 1.7 : spin ? 1.5 : 1); SLASH.children[0].material.opacity = 0.85 * (1 - f); }
  for (const sh of G.shafts) { const f = sh.flick && ((t * 0.8 + sh.seed) % 4.5) < 0.55 ? 0.25 : 1 + Math.sin(t * 0.9 + sh.seed) * 0.12; sh.cone.material.opacity = 0.085 * f; sh.pool.material.opacity = 0.13 * f; } // under the streets, people walking over the grates cut the light
  for (const fr of G.fires) { const f = 0.8 + Math.sin(t * 17 + fr.seed) * 0.12 + Math.sin(t * 7.3 + fr.seed) * 0.1; fr.light.intensity = 1.3 * f; fr.flame.scale.set(1, f * 1.2, 1); fr.flame.rotation.y = t * 3; }
  { const a = DUST.geometry.attributes.position, v = a.array; DUST.position.y = p.h; // motes drift, and wrap so there are always some around the gnome
    for (let k = 0; k < v.length; k += 3) { v[k] += Math.sin(t * 0.4 + k) * dt * 0.2; v[k + 1] += Math.cos(t * 0.3 + k) * dt * 0.08;
      if (v[k] - p.x > 13) v[k] -= 26; else if (v[k] - p.x < -13) v[k] += 26; if (v[k + 2] - p.z > 13) v[k + 2] -= 26; else if (v[k + 2] - p.z < -13) v[k + 2] += 26; }
    a.needsUpdate = true; }
  if (G.state === 'play' && Math.random() < dt * 5) { // drips from the roof
    const m = new THREE.Mesh(PGEO.dot, M.drip); m.position.set(p.x + (Math.random() - 0.5) * 20, p.h + 4.5, p.z + (Math.random() - 0.5) * 16); m.scale.set(0.5, 1.6, 0.5); scene.add(m);
    G.particles.push({ type: 'drip', mesh: m, vx: 0, vy: -3, vz: 0, life: 0.62 }); }
  // top-down action camera: one fixed angle that never turns, leading a little in the direction of travel, riding up and down with the floor
  if (G.state === 'title') { tmpA.set(p.x + 2.2, p.h + 2.0, p.z + 4.2); tmpB.set(p.x, p.h + 0.95, p.z); p.ang = 0.5; }
  else {
    const cf = camera.aspect < 1 ? 1.15 : 1, lk = Math.min(1, dt * 3), cl = v => Math.max(-1.8, Math.min(1.8, v * 0.22));
    camLead.x += (cl(p.vx) - camLead.x) * lk; camLead.z += (cl(p.vz) - camLead.z) * lk;
    tmpA.set(p.x + camLead.x, p.h + 12.5 * cf, p.z + 7.4 * cf + camLead.z); tmpB.set(p.x + camLead.x, p.h + 0.5, p.z - 0.4 + camLead.z);
  }
  const k = camReady ? Math.min(1, dt * 8) : 1; camReady = true;
  camPos.lerp(tmpA, k); camLook.lerp(tmpB, k);
  camera.position.copy(camPos);
  if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake; camera.position.y += (Math.random() - 0.5) * G.shake; }
  camera.lookAt(camLook);
  renderer.render(scene, camera);
}

/* ---------- 2D overlay: HUD, map and tickets ---------- */
function drawRoll(x, y, r) {
  ctx.fillStyle = '#f7f4ea'; ctx.strokeStyle = '#b9b3a2'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0.4, 5); ctx.stroke();
  ctx.fillStyle = '#a98258'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill();
}
const text = (s, x, y, font, color) => { ctx.font = font; ctx.fillStyle = color; ctx.fillText(s, x, y); };
const panel = (x, y, w, h) => { ctx.fillStyle = 'rgba(8,18,17,0.78)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); };

function drawMap(x0, y0, w, h) { // what has been seen so far, redrawn only when something new is seen
  const p = G.player, c = Math.min(w / G.W, h / G.H, 4);
  if (!G.mapCanvas) { const mc = G.mapCanvas = document.createElement('canvas'), k = 2; mc.width = Math.ceil(G.W * c * k); mc.height = Math.ceil(G.H * c * k); const m = mc.getContext('2d'); m.scale(k, k);
    let lo = 0, hi = 0; for (const r of G.rooms) { lo = Math.min(lo, r.ht); hi = Math.max(hi, r.ht); }
    for (let j = 0; j < G.H; j++) for (let i = 0; i < G.W; i++) { const ht = G.hgt[j][i]; if (ht == null || !G.seen[j][i] || G.kind[j][i] === 'r') continue;
      const f = hi > lo ? (ht - lo) / (hi - lo) : 0.5, v = Math.round(70 + f * 90); m.fillStyle = G.kind[j][i] === 'L' ? '#8a7f6e' : `rgb(${v - 10},${v},${v + 8})`; m.fillRect(i * c, j * c, c + 0.3, c + 0.3); } // higher ground is paler
  }
  panel(x0 - 6, y0 - 6, w + 12, h + 12);
  const ox = x0 + (w - G.W * c) / 2, oy = y0 + (h - G.H * c) / 2, t = now(); ctx.drawImage(G.mapCanvas, ox, oy, G.W * c, G.H * c);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const pd of G.pads) if (G.seen[pd.j][pd.i]) { ctx.fillStyle = '#eae6da'; ctx.beginPath(); ctx.arc(ox + (pd.i + 0.5) * c, oy + (pd.j + 0.5) * c, 3, 0, 7); ctx.fill(); }
  for (const pt of G.points) if (pt.order && !pt.order.done) { const px = ox + (pt.i + 0.5) * c, py = oy + (pt.j + 0.5) * c; ctx.fillStyle = '#d8432f'; ctx.beginPath(); ctx.arc(px, py, 5 + Math.sin(t * 5), 0, 7); ctx.fill(); text(pt.letter, px, py + 0.5, `8px ${DISPLAY}`, '#f3efe2'); }
  ctx.save(); ctx.translate(ox + (p.x / TS + 0.5) * c, oy + (p.z / TS + 0.5) * c); ctx.rotate(Math.PI - p.ang);
  ctx.fillStyle = '#e0321f'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(3.5, 3.5); ctx.lineTo(-3.5, 3.5); ctx.fill(); ctx.restore();
}
function drawHUD() {
  const p = G.player, narrow = LW < 620, hub = G.mode === 'hub', ow = 222; G.rects = {};
  ctx.textBaseline = 'middle';
  panel(12, 12, 222, 34); drawRoll(30, 29, 10); // the roll
  const st = 180 / MAX_SHEETS;
  for (let i = 0; i < MAX_SHEETS; i++) { ctx.fillStyle = i < p.sheets ? '#f7f4ea' : 'rgba(247,244,234,0.15)'; ctx.fillRect(48 + i * st, 20, st - 3, 18); }
  const sm = SMOKES[p.smoke], cd = p.smokeCd[p.smoke]; // current smoke: tap it (or Q) to swap
  panel(12, 52, 222, 30); G.rects.swap = { x: 12, y: 52, w: 222, h: 30 };
  ctx.textAlign = 'left'; text(sm.name, 22, 68, `15px ${DISPLAY}`, '#f3efe2'); const nw = ctx.measureText(sm.name).width;
  text(sm.hint, 30 + nw, 68, `600 11px ${BODY}`, '#8fa9a2');
  ctx.textAlign = 'right'; text(cd > 0 ? `${Math.ceil(cd)} s` : 'ready', 224, 68, `800 12px ${BODY}`, cd > 0 ? '#e2b23c' : '#58e070');
  // what you have, and what is on the app
  const rows = hub ? Math.max(1, G.orders.length + G.offers.length) : G.mode === 'deliver' ? G.points.length : 0, ph = 44 + rows * 22 + (G.mode === 'deliver' ? 16 : 0);
  panel(12, 88, ow, ph); if (hub) G.rects.list = { x: 12, y: 88, w: ow, h: ph };
  ctx.textAlign = 'left'; text(hub ? `Tips ${SAVE.bank}` : `Carrying ${G.pocket.tips} tips`, 22, 102, `14px ${DISPLAY}`, '#ffe27a');
  ctx.textAlign = 'right'; text(hub ? `Scrap ${SAVE.scrap}` : `${G.pocket.scrap} scrap`, 12 + ow - 10, 102, `14px ${DISPLAY}`, '#c9d3d6');
  ctx.textAlign = 'left'; text(hub ? `Reputation ${SAVE.rep} · deepest level ${SAVE.deepest}` : G.mode === 'under' ? `Underworld, level ${G.depth}. Lost if you fall.` : 'Under the streets. Lost if you are caught.', 22, 120, `600 11px ${BODY}`, '#8fa9a2');
  let y = 142;
  if (G.mode === 'deliver') { text('HEAT', 22, 138, `800 10px ${BODY}`, '#8fa9a2'); ctx.fillStyle = 'rgba(247,244,234,0.15)'; ctx.fillRect(56, 135, ow - 54, 6);
    ctx.fillStyle = G.heat < 35 ? '#8fb26a' : G.heat < 70 ? '#e2b23c' : '#d8432f'; ctx.fillRect(56, 135, (ow - 54) * G.heat / 100, 6); ctx.fillStyle = '#f3efe2'; ctx.fillRect(56 + (ow - 54) * 0.2, 133, 1.5, 10); y = 158; }
  const short = s => s.length > 17 ? s.slice(0, 16) + '…' : s, row = (letter, name, right, col, solid) => {
    if (solid) { ctx.fillStyle = '#d8432f'; ctx.beginPath(); ctx.arc(30, y, 8, 0, 7); ctx.fill(); } else { ctx.strokeStyle = '#d8432f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(30, y, 7.5, 0, 7); ctx.stroke(); }
    ctx.textAlign = 'center'; text(letter, 30, y + 0.5, `11px ${DISPLAY}`, '#f3efe2'); ctx.textAlign = 'left'; text(short(name), 44, y, `${solid ? 800 : 600} 12px ${BODY}`, col);
    ctx.textAlign = 'right'; text(right, 12 + ow - 10, y, `800 12px ${BODY}`, col); y += 22; };
  if (hub) {
    if (!G.orders.length && !G.offers.length) { ctx.textAlign = 'left'; text('No pings yet. Hang about.', 22, y, `600 12px ${BODY}`, '#8fa9a2'); }
    G.orders.forEach((o, n) => row('ABC'[n], o.name, `${o.need} sh · +${o.tip}`, '#f3efe2', true));
    G.offers.forEach((o, n) => row(n === 0 ? 'F' : '·', o.name, `${o.need} sh · +${o.tip}`, n === 0 ? '#ffe27a' : '#a9bcb6', false)); // F (or a tap) takes the first one
  } else if (G.mode === 'deliver') G.points.forEach(pt => row(pt.letter, pt.order.name, pt.order.done ? 'done' : `${pt.order.need} sh · +${pt.order.tip}`, pt.order.done ? '#7c8a8c' : p.sheets >= pt.order.need ? '#58e070' : '#e2b23c', !pt.order.done));
  const mw = narrow ? 110 : 170, mh = narrow ? 84 : 120; drawMap(LW - mw - 18, 18, mw, mh);
  const chipY = 18 + mh + 12, chipX = LW - mw - 24, chipW = mw + 12;
  if (G.hunt) { ctx.fillStyle = Math.floor(now() * 4) % 2 ? '#d8432f' : '#a52f20'; ctx.beginPath(); ctx.roundRect(chipX, chipY, chipW, 26, 8); ctx.fill();
    ctx.textAlign = 'center'; text(G.hunt.phase === 'grab' || G.hunt.phase === 'slam' ? 'HAND COMING DOWN' : 'HUMAN ABOVE', chipX + chipW / 2, chipY + 14, `${narrow ? 11 : 14}px ${DISPLAY}`, '#f3efe2'); }
  else { panel(chipX, chipY, chipW, 24); ctx.textAlign = 'center'; text(hub ? 'The Lobby' : G.mode === 'under' ? `Underworld ${G.depth}` : 'Under the streets', chipX + chipW / 2, chipY + 13, `${narrow ? 10 : 13}px ${DISPLAY}`, '#f3efe2'); }
  if (G.shopOpen) { // the stores
    const items = shopItems(), w = Math.min(340, LW - 24), x = LW / 2 - w / 2, h = 62 + Math.max(1, items.length) * 24, sy = Math.max(narrow ? 250 : 90, LH / 2 - h / 2);
    ctx.fillStyle = '#f3efe2'; ctx.beginPath(); ctx.roundRect(x, sy, w, h, 10); ctx.fill();
    ctx.textAlign = 'left'; text('Stores', x + 14, sy + 20, `20px ${DISPLAY}`, '#10201f'); ctx.textAlign = 'right'; text(`${SAVE.scrap} scrap · ${SAVE.bank} tips`, x + w - 14, sy + 20, `15px ${DISPLAY}`, '#d8432f');
    ctx.textAlign = 'left'; text('Scrap comes from the Underworld. Tips come from deliveries.', x + 14, sy + 40, `600 11px ${BODY}`, '#5b6f6a');
    G.rects.shop = { x, y: sy + 50, w, h: items.length * 24 };
    if (!items.length) text('Sold out. Nice work.', x + 14, sy + 64, `800 13px ${BODY}`, '#10201f');
    items.forEach((it, n) => { const ry = sy + 62 + n * 24, can = SAVE[it.cur] >= it.cost;
      ctx.fillStyle = '#10201f'; ctx.beginPath(); ctx.roundRect(x + 12, ry - 9, 18, 18, 4); ctx.fill(); ctx.textAlign = 'center'; text(String(n + 1), x + 21, ry + 0.5, `12px ${DISPLAY}`, '#f3efe2');
      ctx.textAlign = 'left'; text(it.label, x + 38, ry, `800 13px ${BODY}`, can ? '#10201f' : '#8a938f'); ctx.textAlign = 'right'; text(`${it.cost} ${it.cur === 'bank' ? 'tips' : 'scrap'}`, x + w - 14, ry, `13px ${DISPLAY}`, can ? '#2e8b47' : '#b0563f'); });
  }
  { // a line of chat from the nearest courier in the lobby
    let best = null, bd = 4.5; for (const c of G.npcs) { const dd = Math.hypot(c.x - p.x, c.z - p.z); if (dd < bd) { bd = dd; best = c; } }
    if (best) { const v = tmpB.set(best.x, best.y + 2.1, best.z).project(camera);
      if (v.z < 1 && Math.abs(v.x) < 0.95) { const line = NPC_LINES[(best.n + Math.floor(now() / 6)) % NPC_LINES.length], sx = (v.x * 0.5 + 0.5) * LW, sy = Math.max(30, (-v.y * 0.5 + 0.5) * LH);
        ctx.font = `800 12px ${BODY}`; const bw = ctx.measureText(line).width + 20; ctx.fillStyle = '#f3efe2'; ctx.beginPath(); ctx.roundRect(sx - bw / 2, sy - 13, bw, 26, 9); ctx.fill();
        ctx.textAlign = 'center'; text(line, sx, sy + 1, `800 12px ${BODY}`, '#10201f'); } }
  }
  for (const pd of G.pads) if (pd.t > 0) { const v = tmpB.set(pd.x, pd.h + 1.2, pd.z).project(camera), sx = (v.x * 0.5 + 0.5) * LW, sy = (-v.y * 0.5 + 0.5) * LH; // hold-to-go progress
    ctx.strokeStyle = '#f3efe2'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(sx, sy, 20, -1.57, -1.57 + 6.28 * Math.min(1, pd.t / 0.8)); ctx.stroke(); }
  if (G.banner) {
    ctx.font = `${narrow ? 15 : 19}px ${DISPLAY}`; ctx.textAlign = 'center';
    const w = Math.min(LW - 24, ctx.measureText(G.banner.text).width + 32), by = narrow ? 250 : LH - 70;
    ctx.fillStyle = '#f3efe2'; ctx.beginPath(); ctx.roundRect(LW / 2 - w / 2, by, w, 36, 10); ctx.fill();
    ctx.fillStyle = '#10201f'; ctx.fillText(G.banner.text, LW / 2, by + 19, w - 16);
  }
}
/* A delivery ticket: the card every between-shift screen is printed on. */
function ticket(h, draw) {
  ctx.fillStyle = 'rgba(8,18,17,0.72)'; ctx.fillRect(0, 0, LW, LH);
  const w = Math.min(470, LW - 24), x = LW / 2 - w / 2, y = LH / 2 - h / 2;
  ctx.fillStyle = '#f3efe2'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(8,18,17,0.72)'; // perforated ends, like a torn sheet
  for (let i = 10; i < w; i += 20) { ctx.beginPath(); ctx.arc(x + i, y, 5, 0, 7); ctx.arc(x + i, y + h, 5, 0, 7); ctx.fill(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  draw(LW / 2, y, w);
  if (Math.floor(now() * 2) % 2) text('Press Enter or tap to continue', LW / 2, y + h - 22, `800 13px ${BODY}`, '#5b6f6a');
}
function overlay() {
  ctx.clearRect(0, 0, LW, LH);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (G.state === 'title') {
    const g = ctx.createLinearGradient(0, 0, 0, 230); g.addColorStop(0, 'rgba(8,18,17,0.9)'); g.addColorStop(1, 'rgba(8,18,17,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, 230);
    const big = LW < 620 ? 0.72 : 1;
    text('GNOME', LW / 2, 62 * big + 8, `${64 * big}px ${DISPLAY}`, '#f3efe2');
    text('DELIVERY SERVICE', LW / 2, 118 * big + 8, `${44 * big}px ${DISPLAY}`, '#d8432f');
    text('Emergency toilet paper, straight up the pipe.', LW / 2, 160 * big + 8, `800 ${Math.max(13, 17 * big)}px ${BODY}`, '#c9d8d3');
    if (Math.floor(now() * 2) % 2) { panel(LW / 2 - 190, LH - 76, 380, 40); text('Press Enter or tap to start your shift', LW / 2, LH - 55, `20px ${DISPLAY}`, '#f3efe2'); }
  } else if (G.state === 'play') {
    const vg = ctx.createRadialGradient(LW / 2, LH / 2, Math.min(LW, LH) * 0.42, LW / 2, LH / 2, Math.max(LW, LH) * 0.72); // darkness at the edges of the light
    vg.addColorStop(0, 'rgba(8,11,13,0)'); vg.addColorStop(1, 'rgba(8,11,13,0.78)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, LW, LH);
    drawHUD();
  } else if (G.state === 'brief') ticket(384, (cx, y, w) => {
    const body = `600 ${w < 440 ? 12 : 14}px ${BODY}`, lines = [
      ['The lobby is home. There are two ways out of it.', '#10201f'],
      ['West, down the stairs: the Underworld. Fight, scavenge', '#10201f'],
      ['scrap, then take the lift home or push on deeper.', '#5b6f6a'],
      ['East, up the ramp: deliveries. Accept orders first (F or', '#10201f'],
      ['tap the list), then climb to the pipes that ordered.', '#5b6f6a'],
      ['What you carry only counts once you are home.', '#10201f'],
      ['Your roll is cargo, health and ammo. Mind the ledges.', '#5b6f6a'],
      [TOUCH ? 'The knife swings by itself when something is in reach.' : 'Knife X: slash, slash, spin. Dash (Space), then strike:', '#10201f'],
      [TOUCH ? 'Dash, then strike, for a lunge. Knock things off edges.' : 'a lunge that hits hard. Knock things off the edges.', '#5b6f6a'],
      ['Paper wrap C · smoke V · scrap buys kit at the stores.', '#10201f']];
    text('HOW THE JOB WORKS', cx, y + 32, `800 13px ${BODY}`, '#d8432f');
    text('The Lobby', cx, y + 64, `34px ${DISPLAY}`, '#10201f');
    lines.forEach(([s, col], n) => s && text(s, cx, y + 104 + n * 20, body, col));
  });
  if (G.fade > 0) { ctx.fillStyle = `rgba(8,11,13,${Math.min(1, G.fade)})`; ctx.fillRect(0, 0, LW, LH); } // a level change fades in from black
}

let last = performance.now();
function frame(t) {
  const dt = Math.min(1 / 30, (t - last) / 1000);
  if (!QUALITY.low && G.state === 'play') { // five seconds of mostly slow frames: trade the shadows and sharpness for speed
    QUALITY.frames++; if (t - last > 45) QUALITY.slow++;
    if (QUALITY.frames >= 120) { if (QUALITY.slow > 80) { QUALITY.low = true; QUALITY.dpr = 1; sun.castShadow = false; M.shadow.opacity = 0.38; resize(); } QUALITY.frames = QUALITY.slow = 0; }
  }
  last = t;
  update(dt);
  present(dt);
  overlay();
  requestAnimationFrame(frame);
}
// Signs are painted onto textures once, so wait (briefly) for the display font before building the world.
const fontReady = document.fonts && document.fonts.load ? Promise.race([document.fonts.load('20px "Lilita One"'), new Promise(r => setTimeout(r, 1500))]) : Promise.resolve();
fontReady.catch(() => {}).then(() => { goHub(); resize(); last = performance.now(); requestAnimationFrame(frame); });
})();
