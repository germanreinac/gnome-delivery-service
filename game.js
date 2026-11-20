/* Gnome Delivery Service — 3D prototype (three.js r128).
   An open sewer labyrinth, seen from just behind the gnome. The camera swings round to follow where they run.
   Core loop: stock up at the depot, pick which orders to run, find your own route, come back.
   The roll on the gnome's back is cargo, health, ammo and the key to the vents all at once:
     - each order takes some sheets off it
     - bites and dunks tear sheets off it
     - a paper wrap costs one sheet
   Smokes are the second tool, swapped on the fly, each with its own cooldown:
     cigarette = a gnome-shaped smoke decoy that runs off, pipe = a smoke ring that shoves creatures back,
     cigar = a thick cloud that hides you, joint = a haze that leaves creatures too mellow to bite.
   The shady side: the back room hands out steroid packages for gym ducts (big tips, slim roll required),
   mob gnomes lunge with knives and steal the package, and humans above shoot and then reach in to grab.
     - vents only fit a roll of VENT_MAX sheets or fewer */
(() => {
'use strict';

const TS = 3.2, WALL_H = 3.2;            // tile size, wall height
const CW = 10, CH = 8, W = CW * 2 + 1, H = CH * 2 + 1; // maze cells and tile grid
const GRAV = 22, RUN = 6.5, JUMP = 8, RADIUS = 0.42;
const MAX_SHEETS = 12, VENT_MAX = 6, TOTAL_ORDERS = 8, MAX_ACTIVE = 3;
const DISPLAY = '"Lilita One", "Arial Rounded MT Bold", sans-serif';
const BODY = 'Nunito, system-ui, sans-serif';
const SMOKES = [
  { id: 'cig', name: 'Cigarette', cd: 8, hint: 'runaway decoy' },
  { id: 'pipe', name: 'Pipe', cd: 5, hint: 'push ring' },
  { id: 'cigar', name: 'Cigar', cd: 12, hint: 'smokescreen' },
  { id: 'joint', name: 'Joint', cd: 15, hint: 'mellow haze' },
];
const ADDRESSES = ['Apartment 3B', 'Café Bruma', 'Night bus depot', 'Mrs. Okafor, No. 12', 'The gym showers', 'Dentist, 2nd floor'];

/* ---------- three.js setup ---------- */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('view'), antialias: true });
const hudCanvas = document.getElementById('hud');
const ctx = hudCanvas.getContext('2d');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1615);
scene.fog = new THREE.Fog(0x0a1615, 8, 40);
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 140);
scene.add(new THREE.HemisphereLight(0xb8e8d8, 0x2c3a24, 0.7));
const sun = new THREE.DirectionalLight(0xfff2d0, 0.35); sun.position.set(-4, 10, 6); scene.add(sun);
const lantern = new THREE.PointLight(0xffe2b0, 1.1, 22);
scene.add(lantern);

let LW = 960, LH = 540; // HUD logical size
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!w || !h) return;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w < h ? 82 : 62; camera.updateProjectionMatrix();
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
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = (r + c) % 2 ? '#66756c' : '#6f7f75'; g.fillRect(c * 64 + 2, r * 64 + 2, 60, 60); }
  g.fillStyle = 'rgba(60,90,50,0.4)';
  for (let i = 0; i < 30; i++) g.fillRect((i * 71) % n, (i * 113) % n, 10, 6);
});
const sewageTex = canvasTexture(128, (g, n) => {
  g.fillStyle = '#7f9a3a'; g.fillRect(0, 0, n, n);
  g.strokeStyle = '#b6cf6c'; g.lineWidth = 3;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo((i * 47) % n, (i * 29) % n); g.lineTo((i * 47) % n + 6, (i * 29) % n + 26); g.stroke(); }
});
const ventTex = canvasTexture(64, (g, n) => {
  g.fillStyle = '#aeb9b8'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#6d7a7a'; for (let i = 0; i < 4; i++) g.fillRect(4, i * 16 + 5, n - 8, 6);
});
const lam = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra));
const DS2 = { side: THREE.DoubleSide };
const M = {
  // walls and rock tops are one-sided on purpose: the camera can sit inside the rock and see out through them
  wall: lam(0xffffff, { map: brickTex }), curb: lam(0xffffff, { map: brickTex, ...DS2 }), top: lam(0x1d2c2a), floor: lam(0xffffff, { map: floorTex, ...DS2 }),
  sewage: lam(0xffffff, { map: sewageTex, emissive: 0x2c3c12, ...DS2 }), vent: lam(0xffffff, { map: ventTex, ...DS2 }), steel: lam(0x9aa8a8),
  copper: lam(0xb7743c), crate: lam(0x9a6b3c), porcelain: lam(0xf1eee4, DS2),
  paper: lam(0xf7f4ea, DS2), rope: lam(0x7a5230), card: lam(0xa98258),
  hat: lam(0xd8432f), tunic: lam(0x2f6fa8), skin: lam(0xeab98f), nose: lam(0xe09a7a), boot: lam(0x4a3222), gold: lam(0xe2b23c),
  wood: lam(0xc99a5b), rubber: lam(0xb3261e), black: lam(0x151515),
  rat: lam(0x8a8582), pink: lam(0xd78a9a), eye: new THREE.MeshBasicMaterial({ color: 0xff4030 }),
  roach: lam(0x6b3d1e), roachHi: lam(0xa2673a), clog: lam(0x4d382d), white: lam(0xf3efe2),
  glow: new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.22, depthWrite: false, ...DS2 }),
  ring: new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.55, depthWrite: false, ...DS2 }),
  suit: lam(0x2a2a33), fedora: lam(0x141418), blade: lam(0xd0d6da), purple: lam(0x8a4fd0),
  ventLamp: new THREE.MeshBasicMaterial({ color: 0xff4030 }), coin: new THREE.MeshBasicMaterial({ color: 0xffd24a }),
  smoke: new THREE.MeshLambertMaterial({ color: 0xd9dedc, transparent: true, opacity: 0.6, depthWrite: false }),
  splash: new THREE.MeshBasicMaterial({ color: 0xa9c46a }), poof: new THREE.MeshBasicMaterial({ color: 0xb9b3a2 }), star: new THREE.MeshBasicMaterial({ color: 0xffe27a }),
};
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const sphere = (r, mat, x, y, z) => mesh(new THREE.SphereGeometry(r, 12, 10), mat, x, y, z);
const box = (w, h, d, m, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);

/* ---------- state ---------- */
const G = {
  state: 'title', shift: 1, tips: 0, t: 0, clock: 0, TS,
  grid: null, seen: null, depot: null, points: [], group: null,
  player: null, decoy: null, rings: [], clouds: [], drops: [], fixer: null, hunt: null, huntTimer: 40, enemies: [], pickups: [], shots: [], particles: [],
  delivered: 0, spawned: 0, orderTimer: 0, lastPoint: -1, shake: 0, banner: null,
};
window.__gds = G;

/* ---------- maze generation ---------- */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const open = c => c !== '#';
function bfs(grid, sx, sy, pass = c => c === '.') {
  const d = grid.map(r => r.map(() => -1)); d[sy][sx] = 0; const q = [[sx, sy]];
  for (let k = 0; k < q.length; k++) { const [x, y] = q[k];
    for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (grid[ny] && grid[ny][nx] !== undefined && d[ny][nx] < 0 && pass(grid[ny][nx])) { d[ny][nx] = d[y][x] + 1; q.push([nx, ny]); } } }
  return d;
}
function generate(seed) {
  const R = rng(seed), grid = []; for (let y = 0; y < H; y++) grid.push(new Array(W).fill('#'));
  const pick = a => a[Math.floor(R() * a.length)], shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // depth-first maze over the cells, then knock out a few extra walls so there are loops
  const seenCell = new Set(['0,0']), stack = [[0, 0]]; grid[1][1] = '.';
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const next = shuffle(DIRS.map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < CW && y < CH && !seenCell.has(x + ',' + y)));
    if (!next.length) { stack.pop(); continue; }
    const [nx, ny] = next[0]; seenCell.add(nx + ',' + ny);
    grid[cy + ny + 1][cx + nx + 1] = '.'; grid[ny * 2 + 1][nx * 2 + 1] = '.'; stack.push([nx, ny]);
  }
  const passages = []; // wall slots between two cells
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if ((x + y) % 2 === 1) passages.push([x, y, x % 2 === 0 ? 1 : 0, x % 2 === 0 ? 0 : 1]);
  for (const [x, y] of passages) if (grid[y][x] === '#' && R() < 0.09) grid[y][x] = '.';
  // chambers: the depot in the middle and two side rooms
  const room = grid.map(r => r.map(() => false)), depot = { i: 11, j: 9 };
  for (const [rx, ry] of [[depot.i, depot.j], [5, 5], [15, 13]]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { grid[ry + dy][rx + dx] = '.'; room[ry + dy][rx + dx] = true; }
  const nearRoom = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (room[y + dy] && room[y + dy][x + dx]) return true; return false; };
  const dist = bfs(grid, depot.i, depot.j);
  const cells = []; for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) { const x = cx * 2 + 1, y = cy * 2 + 1; if (!room[y][x]) cells.push([x, y]); }
  const exits = (x, y) => DIRS.filter(([dx, dy]) => open(grid[y + dy][x + dx])).length;
  const deadEnds = cells.filter(([x, y]) => exits(x, y) === 1);
  // delivery points: far from the depot and from each other
  const points = [], used = new Set();
  const spread = pool => { let best = null, bs = -1; for (const [x, y] of pool) { if (used.has(x + ',' + y) || dist[y][x] < 8) continue;
    const s = Math.min(Math.hypot(x - depot.i, y - depot.j), ...points.map(p => Math.hypot(x - p.i, y - p.j) * 1.2)); if (s > bs) { bs = s; best = [x, y]; } } return best; };
  while (points.length < ADDRESSES.length) { const b = spread(deadEnds) || spread(cells); if (!b) break; used.add(b[0] + ',' + b[1]); points.push({ i: b[0], j: b[1] }); }
  points.forEach((p, n) => Object.assign(p, { x: p.i * TS, z: p.j * TS, letter: 'ABCDEF'[n], name: ADDRESSES[n], order: null }));
  // gym ducts for the back-room packages, spaced away from everything else
  const drops = []; points.push({ i: 5, j: 5 }); // count the back room too, so a duct is never next door to it
  for (const name of ['Iron Temple Gym', 'Pump House Gym']) { const b = spread(cells); if (!b) break; used.add(b[0] + ',' + b[1]);
    const d = { i: b[0], j: b[1], x: b[0] * TS, z: b[1] * TS, name }; drops.push(d); points.push(d); }
  points.length -= drops.length + 1;
  // vents: holes through walls where the walk around is long
  const vents = [];
  const cand = passages.filter(([x, y, dx, dy]) => grid[y][x] === '#' && grid[y - dy][x - dx] === '.' && grid[y + dy][x + dx] === '.' && !nearRoom(x, y))
    .map(([x, y, dx, dy]) => [x, y, bfs(grid, x - dx, y - dy)[y + dy][x + dx]]).filter(c => c[2] >= 14).sort((a, b) => b[2] - a[2]);
  for (const [x, y] of cand) { if (vents.length >= 6) break; if (vents.every(v => Math.abs(v[0] - x) + Math.abs(v[1] - y) >= 5)) { vents.push([x, y]); } }
  for (const [x, y] of vents) grid[y][x] = 'v';
  // sewage channels across straight corridors: one tile wide, always jumpable
  const wet = shuffle(passages.filter(([x, y, dx, dy]) => grid[y][x] === '.' && !nearRoom(x, y) && grid[y - dy][x - dx] === '.' && grid[y + dy][x + dx] === '.'
    && grid[y - dx][x - dy] === '#' && grid[y + dx][x + dy] === '#' && !used.has((x - dx) + ',' + (y - dy)) && !used.has((x + dx) + ',' + (y + dy)))).slice(0, 10);
  for (const [x, y] of wet) grid[y][x] = '~';
  // creatures, spare rolls, coins
  const things = [], taken = new Set(used), far = (x, y, n) => things.every(t => Math.abs(t[1] - x) + Math.abs(t[2] - y) >= n);
  things.push(['M', 16, 12], ['M', 15, 14]); // the mob's den; the other side room is the fixer's back room
  const kinds = ['R', 'C', 'B', 'R', 'C', 'B', 'R']; // nothing spawns within 9 tiles' walk of the depot
  for (const [x, y] of shuffle(cells.slice())) { if (!kinds.length) break; if (dist[y][x] >= 9 && !taken.has(x + ',' + y) && far(x, y, 4)) { things.push([kinds.pop(), x, y]); taken.add(x + ',' + y); } }
  let spare = 0; for (const [x, y] of shuffle(deadEnds.slice())) if (spare < 4 && !taken.has(x + ',' + y)) { things.push(['P', x, y]); taken.add(x + ',' + y); spare++; }
  let coins = 0; for (const [x, y] of shuffle(cells.slice())) if (coins < 14 && !taken.has(x + ',' + y)) { things.push(['$', x, y]); taken.add(x + ',' + y); coins++; }
  return { grid, depot: { ...depot, x: depot.i * TS, z: depot.j * TS }, points, drops, fixer: { i: 5, j: 5, x: 5 * TS, z: 5 * TS, cool: 0 }, things };
}

/* ---------- world building ---------- */
const tileAt = (x, z) => { const r = G.grid[Math.round(z / TS)]; return (r && r[Math.round(x / TS)]) || '#'; };
function buildWorld() {
  const g = new THREE.Group(), grid = G.grid, bufs = {};
  const quad = (name, a, b, c, d, uw, uh) => {
    const o = bufs[name] || (bufs[name] = { p: [], uv: [] });
    o.p.push(...a, ...b, ...c, ...a, ...c, ...d); o.uv.push(0, 0, uw, 0, uw, uh, 0, 0, uw, uh, 0, uh);
  };
  const hs = TS / 2, U = TS / 4;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = grid[j][i], x = i * TS, z = j * TS, y = c === '#' ? WALL_H : c === '~' ? -0.4 : 0;
    quad(c === '#' ? 'top' : c === '~' ? 'sewage' : c === 'v' ? 'vent' : 'floor', [x - hs, y, z + hs], [x + hs, y, z + hs], [x + hs, y, z - hs], [x - hs, y, z - hs], c === 'v' ? 2 : U, c === 'v' ? 2 : U);
    if (c === '#' || c === '~') for (const [dx, dz] of DIRS) { // side faces towards anything lower
      const n = grid[j + dz] && grid[j + dz][i + dx]; if (!n || n === '#' || (c === '~' && n === '~')) continue;
      const cx = x + dx * hs, cz = z + dz * hs, ex = dz * hs, ez = -dx * hs, y0 = c === '#' ? (n === '~' ? -0.4 : 0) : -0.4, y1 = c === '#' ? WALL_H : 0;
      quad(c === '#' ? 'wall' : 'curb', [cx - ex, y0, cz - ez], [cx + ex, y0, cz + ez], [cx + ex, y1, cz + ez], [cx - ex, y1, cz - ez], U, (y1 - y0) / 4);
    }
    if (c === '#' && (i * 7 + j * 13) % 6 === 0 && i > 0 && j > 0 && i < W - 1 && j < H - 1) { // service pipes lying on the rock
      const pipe = mesh(new THREE.CylinderGeometry(0.22, 0.22, TS, 10), M.copper, x, WALL_H + 0.2, z); pipe.rotation[(i + j) % 2 ? 'x' : 'z'] = Math.PI / 2; g.add(pipe);
    }
    if (c === 'v') { // vent mouth at both ends, with a lamp that says whether the roll fits
      const alongX = open(grid[j][i - 1]);
      for (const sgn of [-1, 1]) {
        const f = new THREE.Group(); f.position.set(x + (alongX ? sgn * hs : 0), 0, z + (alongX ? 0 : sgn * hs)); if (alongX) f.rotation.y = Math.PI / 2;
        f.add(box(TS, 0.4, 0.3, M.steel, 0, 1.85, 0), box(0.3, 2.05, 0.3, M.steel, -hs + 0.15, 1.02, 0), box(0.3, 2.05, 0.3, M.steel, hs - 0.15, 1.02, 0));
        f.add(sphere(0.16, M.ventLamp, 0, 2.2, 0)); g.add(f);
      }
    }
  }
  const mats = { top: M.top, floor: M.floor, sewage: M.sewage, vent: M.vent, wall: M.wall, curb: M.curb };
  for (const k in bufs) { const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bufs[k].p, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(bufs[k].uv, 2));
    geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, mats[k])); }
  g.add(mesh(new THREE.PlaneGeometry(W * TS, H * TS), M.top, (W - 1) * TS / 2, -0.6, (H - 1) * TS / 2).rotateX(-Math.PI / 2));
  // depot: pallet of rolls and a warm lamp
  const d = G.depot, pallet = new THREE.Group(); pallet.position.set(d.x - 2.6, 0, d.z - 2.6);
  pallet.add(box(2.2, 0.2, 2.2, M.wood, 0, 0.1, 0));
  for (const [px, py, pz] of [[-0.55, 0.5, -0.5], [0.55, 0.5, -0.5], [-0.55, 0.5, 0.5], [0.55, 0.5, 0.5], [0, 1.1, 0]]) {
    pallet.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 18), M.paper, px, py, pz), mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.62, 10), M.card, px, py, pz)); }
  g.add(pallet, mesh(new THREE.RingGeometry(1.5, 1.8, 32), M.ring, d.x, 0.03, d.z).rotateX(-Math.PI / 2));
  const dl = new THREE.PointLight(0xfff0b0, 1.2, 16); dl.position.set(d.x, 3, d.z); g.add(dl);
  // delivery points: a porcelain pipe up to someone's bathroom
  for (const p of G.points) {
    const pg = new THREE.Group(); pg.position.set(p.x, 0, p.z);
    pg.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 14, 18, 1, true), M.porcelain, 0, 9.6, 0), mesh(new THREE.TorusGeometry(0.8, 0.14, 8, 22), M.porcelain, 0, 2.6, 0).rotateX(Math.PI / 2));
    p.beam = mesh(new THREE.CylinderGeometry(0.7, 1.5, 2.6, 18, 1, true), M.glow, 0, 1.3, 0);
    p.ring = mesh(new THREE.RingGeometry(1.2, 1.45, 28), M.ring, 0, 0.03, 0).rotateX(-Math.PI / 2);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(64, (c2, n) => { c2.fillStyle = '#d8432f'; c2.beginPath(); c2.arc(32, 32, 30, 0, 7); c2.fill();
      c2.fillStyle = '#f3efe2'; c2.font = `44px ${DISPLAY}`; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText(p.letter, 32, 35); }), depthTest: false }));
    tag.position.y = 3.4; tag.scale.setScalar(1.3); p.tag = tag;
    pg.add(p.beam, p.ring, tag); g.add(pg);
  }
  // gym ducts: square steel, with a grille to post packages through
  const purpleRing = new THREE.MeshBasicMaterial({ color: 0xb98cff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  for (const dr of G.drops) {
    const dg = new THREE.Group(); dg.position.set(dr.x, 0, dr.z);
    dg.add(box(1.3, 12, 1.3, M.steel, 0, 8.7, 0), box(1.6, 0.14, 1.6, M.steel, 0, 2.7, 0));
    dr.beam = mesh(new THREE.CylinderGeometry(0.6, 1.4, 2.6, 4, 1, true), M.glow, 0, 1.3, 0);
    dr.ring = mesh(new THREE.RingGeometry(1.2, 1.45, 28), purpleRing, 0, 0.03, 0).rotateX(-Math.PI / 2);
    dr.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(64, c2 => { c2.fillStyle = '#8a4fd0'; c2.beginPath(); c2.arc(32, 32, 30, 0, 7); c2.fill();
      c2.fillStyle = '#f3efe2'; c2.font = `44px ${DISPLAY}`; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText('G', 32, 35); }), depthTest: false }));
    dr.tag.position.y = 3.4; dr.tag.scale.setScalar(1.3);
    dg.add(dr.beam, dr.ring, dr.tag); g.add(dg);
  }
  // the back room: a fixer gnome among crates
  const f = G.fixer, fg = buildGnome({ bare: true, hat: M.purple, tunic: M.suit }); fg.position.set(f.x, 0, f.z - 1.2); g.add(fg);
  for (const [cx, cz, sy] of [[-3.4, -3.4, 1], [-2.2, -3.6, 0.7], [3.3, -3.3, 1.1], [3.5, 3.2, 0.8]]) g.add(box(1.1, sy, 1.1, M.crate, f.x + cx, sy / 2, f.z + cz));
  f.ring = mesh(new THREE.RingGeometry(1.3, 1.6, 28), purpleRing, f.x, 0.03, f.z).rotateX(-Math.PI / 2); g.add(f.ring);
  return g;
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
  const knife = new THREE.Group(); knife.add(box(0.05, 0.14, 0.05, M.boot, 0, 0.16, 0), box(0.02, 0.42, 0.09, M.blade, 0, 0.44, 0)); knife.visible = false; arm.add(knife);
  const pkg = new THREE.Group(); pkg.add(box(0.56, 0.34, 0.44, M.crate, 0, 0, 0), box(0.58, 0.1, 0.46, M.purple, 0, 0, 0)); pkg.position.set(0, 1.28, -0.66); pkg.visible = false; torso.add(pkg);
  if (o.bare) { roll.visible = false; mouth.forEach(m => { m.visible = false; }); plunger.forEach(m => { m.visible = false; }); knife.visible = !!o.knife; }
  torso.add(arm);
  g.add(bootL, bootR, torso);
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
  const cocoon = sphere(1, M.paper, 0, 0.4, 0); cocoon.scale.set(0.55, 0.5, 0.75); cocoon.visible = false; g.add(cocoon);
  g.userData.body = body; g.userData.cocoon = cocoon;
  return g;
}
function buildPickup(kind) {
  const g = new THREE.Group();
  if (kind === 'K') { g.add(box(0.06, 0.16, 0.06, M.boot, 0, -0.2, 0), box(0.03, 0.5, 0.12, M.blade, 0, 0.12, 0), sphere(0.5, M.glow, 0, 0, 0)); return g; }
  if (kind === '$') { g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.07, 16), M.coin).rotateX(Math.PI / 2)); return g; }
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.42, 18), M.paper).rotateZ(Math.PI / 2));
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.44, 10), M.card).rotateZ(Math.PI / 2));
  g.add(sphere(0.6, M.glow, 0, 0, 0));
  return g;
}

/* ---------- shift loading ---------- */
function loadShift(n) {
  if (G.group) scene.remove(G.group);
  for (const q of G.particles) scene.remove(q.mesh);
  for (const s of G.shots) scene.remove(s.mesh);
  for (const s of [...G.rings, ...G.clouds]) scene.remove(s.mesh);
  const world = generate(40 + n);
  Object.assign(G, { shift: n, grid: world.grid, depot: world.depot, points: world.points, drops: world.drops, fixer: world.fixer, hunt: null, huntTimer: 90, enemies: [], pickups: [], shots: [], particles: [],
    seen: world.grid.map(r => r.map(() => false)), decoy: null, rings: [], clouds: [], delivered: 0, spawned: 0, orderTimer: 0, lastPoint: -1, banner: null, shake: 0, clock: 0, tips: 0 });
  G.group = buildWorld(); scene.add(G.group);
  const pm = buildGnome(); G.group.add(pm);
  G.player = { isPlayer: true, x: G.depot.x, z: G.depot.z + 1.2, h: 0, vx: 0, vz: 0, vh: 0, ang: 0, fx: 0, fz: 1, onGround: true, sheets: MAX_SHEETS,
    invuln: 0, knock: 0, attack: 0, cooldown: 0, throwCd: 0, smoke: G.player ? G.player.smoke : 0, smokeCd: SMOKES.map(() => 0), swing: 0, coyote: 0, jbuf: 0, walk: 0, pkg: null, knife: false, safe: { x: G.depot.x, z: G.depot.z }, mesh: pm };
  for (const [kind, i, j] of world.things) {
    const x = i * TS, z = j * TS;
    if (kind === 'P' || kind === '$') { const m = buildPickup(kind); G.group.add(m); G.pickups.push({ kind, x, z, mesh: m }); continue; }
    const m = buildEnemy(kind); G.group.add(m);
    G.enemies.push({ kind, x, z, h: 0, vx: 0, vz: 0, vh: 0, hp: kind === 'C' ? 1 : kind === 'M' ? 3 : 2, wind: 0, dash: 0, cool: 0, lx: 0, lz: 1, fx: 0, fz: 1, onGround: true, stun: 0, flash: 0, wrap: 0, launch: 0,
      hitBy: 0, timer: (i % 5) * 0.3, home: [i, j], goal: null, from: null, stuck: 0, mesh: m });
  }
  spawnOrder(); spawnOrder();
  camReady = false; camYaw = Math.PI;
}
function spawnOrder() {
  const free = G.points.map((p, n) => n).filter(n => !G.points[n].order && n !== G.lastPoint);
  if (!free.length || G.spawned >= TOTAL_ORDERS) return;
  const n = free[Math.floor(Math.random() * free.length)];
  G.points[n].order = { need: 3 + Math.floor(Math.random() * 4), bonus: 8 };
  G.spawned++; G.orderTimer = 0;
  if (G.state === 'play') { G.banner = { text: `New order: ${G.points[n].name}`, t: 2.2 }; blip(520, 0.08, 'triangle', 200); }
}

/* ---------- input ---------- */
const held = {}, pressed = {}, stickAxis = { x: 0, y: 0 };
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyX: 'attack', KeyJ: 'attack', KeyC: 'wrap', KeyK: 'wrap', KeyV: 'smoke', KeyL: 'smoke', KeyQ: 'swap', KeyE: 'swap', Enter: 'confirm' };
function press(k) { if (!held[k]) pressed[k] = true; held[k] = true; audioInit(); }
function release(k) { held[k] = false; }
addEventListener('keydown', e => { const k = KEYMAP[e.code]; if (k) { press(k); e.preventDefault(); }
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (n >= 0 && G.player) G.player.smoke = n; });
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) release(k); });
addEventListener('blur', () => { for (const k in held) held[k] = false; });
stage.addEventListener('pointerdown', e => {
  if (e.target.tagName === 'CANVAS') { // tapping the smoke chip in the HUD swaps smokes
    const r = stage.getBoundingClientRect(), k = r.width / LW, x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
    if (G.state === 'play' && x > 12 && x < 234 && y > 60 && y < 98) pressed.swap = true;
    else { pressed.confirm = true; if (G.state === 'play') { camDrag = { id: e.pointerId, x: e.clientX, y: e.clientY }; stage.setPointerCapture(e.pointerId); } }
  }
  audioInit();
});
// drag anywhere on the view (right thumb, or the mouse) to swing and tilt the camera
let camDrag = null;
stage.addEventListener('pointermove', e => {
  if (!camDrag || e.pointerId !== camDrag.id) return;
  camYaw -= (e.clientX - camDrag.x) * 0.007; camPitch = Math.max(0.14, Math.min(1.1, camPitch + (e.clientY - camDrag.y) * 0.005)); camHold = 2.5;
  camDrag.x = e.clientX; camDrag.y = e.clientY;
});
for (const ev of ['pointerup', 'pointercancel']) stage.addEventListener(ev, e => { if (camDrag && e.pointerId === camDrag.id) camDrag = null; });
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
/* What a tile is to a given body: rock stops everyone; vents stop creatures and oversized rolls;
   creatures on their feet will not walk into sewage, but can be knocked or hop into it. */
function solid(c, e) {
  if (c === '#') return true;
  if (c === 'v') return !e.isPlayer || e.sheets > VENT_MAX;
  if (c === '~') return !e.isPlayer && e.onGround && e.stun <= 0 && !e.launch;
  return false;
}
function hit(x, z, e) {
  for (const sx of [-RADIUS, RADIUS]) for (const sz of [-RADIUS, RADIUS]) { const c = tileAt(x + sx, z + sz); if (solid(c, e)) return c; }
  return null;
}
function step(e, dt) {
  e.bump = null;
  let c = hit(e.x + e.vx * dt, e.z, e); if (c) { e.bump = c; e.vx = 0; } else e.x += e.vx * dt;
  c = hit(e.x, e.z + e.vz * dt, e); if (c) { e.bump = c; e.vz = 0; } else e.z += e.vz * dt;
  e.vh -= GRAV * dt; e.h += e.vh * dt;
  const g = tileAt(e.x, e.z) === '~' ? -Infinity : 0;
  e.onGround = false;
  if (e.h <= g) { e.h = g; e.vh = 0; e.onGround = true; }
}
function sight(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.8);
  for (let k = 1; k < n; k++) { const c = tileAt(ax + (bx - ax) * k / n, az + (bz - az) * k / n); if (c === '#' || c === 'v') return false; }
  return true;
}

const PGEO = { sheet: new THREE.PlaneGeometry(0.24, 0.17), dot: new THREE.SphereGeometry(0.09, 6, 5), shot: new THREE.BoxGeometry(0.16, 0.05, 0.9) };
function burst(type, x, h, z, n, speed = 4) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(type === 'sheet' ? PGEO.sheet : PGEO.dot, type === 'sheet' ? M.paper : M[type]);
    m.position.set(x, h, z); scene.add(m);
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

/* Smoke decoy: runs off down the corridors the way the gnome was facing. Creatures that see it chase it instead. */
function spawnDecoy() {
  const p = G.player; popDecoy();
  const m = buildDecoy(); G.group.add(m);
  G.decoy = { x: p.x, z: p.z, h: 0, vx: 0, vz: 0, vh: 0, fx: p.fx, fz: p.fz, onGround: true, stun: 0, life: 5.5, goal: null, from: null, puff: 0, mesh: m };
  burst('smoke', p.x + p.fx * 0.4, 1, p.z + p.fz * 0.4, 8, 1.5); blip(240, 0.35, 'sine', 160, 0.05);
}
function popDecoy() {
  const d = G.decoy; if (!d) return;
  burst('smoke', d.x, 0.8, d.z, 16, 2.5); G.group.remove(d.mesh); G.decoy = null;
}
function updateDecoy(dt) {
  const d = G.decoy; if (!d) return;
  const ti = Math.round(d.x / TS), tj = Math.round(d.z / TS);
  if (!d.goal || Math.hypot(d.goal[0] * TS - d.x, d.goal[1] * TS - d.z) < 0.3) {
    let opts = DIRS.map(([a, b]) => [ti + a, tj + b]).filter(([a, b]) => G.grid[b] && G.grid[b][a] === '.');
    const fresh = opts.filter(([a, b]) => !d.from || a !== d.from[0] || b !== d.from[1]); if (fresh.length) opts = fresh;
    const score = ([a, b]) => (a - ti) * d.fx + (b - tj) * d.fz + Math.random() * 0.3; // keep heading the same way where it can
    d.from = [ti, tj]; d.goal = opts.sort((a, b) => score(b) - score(a))[0] || [ti, tj];
  }
  const gx = d.goal[0] * TS - d.x, gz = d.goal[1] * TS - d.z, gd = Math.hypot(gx, gz) || 1;
  d.vx = gx / gd * 7.5; d.vz = gz / gd * 7.5; if (gd > 0.3) { d.fx = gx / gd; d.fz = gz / gd; }
  step(d, dt);
  if ((d.puff -= dt) <= 0) { d.puff = 0.09; burst('smoke', d.x, 0.5, d.z, 1, 0.8); }
  d.mesh.position.set(d.x, Math.abs(Math.sin(now() * 14)) * 0.12, d.z); d.mesh.rotation.y = Math.atan2(d.fx, d.fz);
  if ((d.life -= dt) <= 0) popDecoy();
}

const inCloud = (x, z) => G.clouds.some(c => Math.hypot(c.x - x, c.z - z) < c.r);
function useSmoke() {
  const p = G.player, k = SMOKES[p.smoke];
  if (p.smokeCd[p.smoke] > 0) { say(`${k.name} needs ${Math.ceil(p.smokeCd[p.smoke])} s to relight`, 1); return; }
  p.smokeCd[p.smoke] = k.cd;
  if (k.id === 'cig') spawnDecoy();
  else if (k.id === 'pipe') { // a smoke ring that rolls forward and shoves whatever it meets
    const m = mesh(new THREE.TorusGeometry(0.8, 0.16, 8, 20), M.smoke); m.rotation.y = p.ang; scene.add(m);
    G.rings.push({ x: p.x + p.fx * 0.7, z: p.z + p.fz * 0.7, vx: p.fx * 9, vz: p.fz * 9, life: 1.1, mesh: m });
    blip(300, 0.3, 'sine', -120, 0.05);
  } else if (k.id === 'cigar') { // a thick cloud: creatures inside choke, and cannot see a gnome standing in it
    const m = new THREE.Group(); for (let i = 0; i < 11; i++) { const a = i * 2.4, r = i ? 1.2 + (i % 3) * 0.6 : 0; m.add(sphere(1.1 + (i % 4) * 0.2, M.smoke, Math.cos(a) * r, 0.7 + (i % 3) * 0.35, Math.sin(a) * r)); }
    m.position.set(p.x, 0, p.z); scene.add(m);
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
    const c = tileAt(r.x, r.z); if (c === '#' || c === 'v') r.life = 0;
    const sc = 0.6 + (1 - Math.max(0, r.life) / 1.1) * 0.9; r.mesh.scale.setScalar(sc); r.mesh.position.set(r.x, 0.8, r.z);
    for (const e of G.enemies) if (e.ringed !== r && !e.launch && Math.hypot(e.x - r.x, e.z - r.z) < 0.9 + sc * 0.6) {
      e.ringed = r; e.stun = 1.3; e.vx = r.vx; e.vz = r.vz; e.vh = 5; e.onGround = false; e.h = Math.max(e.h, 0.05); blip(140, 0.1, 'square', -40, 0.05); }
    if (r.life <= 0) { burst('smoke', r.x, 0.8, r.z, 6, 1.5); scene.remove(r.mesh); }
  }
  G.rings = G.rings.filter(r => r.life > 0);
  for (const c of G.clouds) { c.life -= dt; c.mesh.scale.setScalar(Math.max(0.01, Math.min(1, (6 - c.life) * 4, c.life))); c.mesh.rotation.y += dt * 0.3; if (c.life <= 0) scene.remove(c.mesh); }
  G.clouds = G.clouds.filter(c => c.life > 0);
}

function knockout(msg) {
  const p = G.player;
  G.tips = Math.max(0, G.tips - 5); G.hunt = null; G.huntTimer = 70;
  if (p.pkg) { p.pkg = null; msg += ', package lost'; }
  Object.assign(p, { x: G.depot.x, z: G.depot.z + 1.2, h: 0, vx: 0, vz: 0, vh: 0, invuln: 2.5, knock: 0, safe: { x: G.depot.x, z: G.depot.z } });
  say(msg, 3); blip(160, 0.5, 'sawtooth', -100); G.shake = 0.3;
  camReady = false;
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
    G.huntTimer -= dt * (p.pkg ? 2 : 1); // carrying a package draws attention
    if (G.huntTimer > 0) return;
    h = G.hunt = { x: p.x - p.fx * 4, z: p.z - p.fz * 4, phase: 'track', timer: 1.8, shots: 0, lost: 0, flash: 0 };
    say('A human spotted you! Keep moving, or hide in a vent or smoke', 3.5); blip(90, 0.6, 'sawtooth', 40, 0.07);
  }
  const covered = tileAt(p.x, p.z) === 'v' || inCloud(p.x, p.z);
  h.lost = covered ? h.lost + dt : 0; h.flash -= dt;
  const dx = p.x - h.x, dz = p.z - h.z, d = Math.hypot(dx, dz) || 0.001;
  const end = msg => { G.hunt = null; G.huntTimer = 70 + Math.random() * 30; if (msg) say(msg, 2.2); };
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
    if (d < 1.6 && !covered) knockout('Caught by a human! Dumped at the depot, −5 tips');
  } else end();
}

function loseSheets(n) {
  const p = G.player;
  G.shake = 0.3;
  if (p.sheets === 0) { knockout('Knocked out! Dragged back to the depot, −5 tips'); return; } // nothing left to protect you
  p.sheets = Math.max(0, p.sheets - n);
  burst('sheet', p.x, p.h + 0.8, p.z, n * 3);
}

function updatePlayer(dt) {
  const p = G.player;
  let ax = (held.right ? 1 : 0) - (held.left ? 1 : 0) + stickAxis.x, ay = (held.up ? 1 : 0) - (held.down ? 1 : 0) + stickAxis.y;
  const mag = Math.hypot(ax, ay); if (mag > 1) { ax /= mag; ay /= mag; }
  if (p.knock > 0) p.knock -= dt;
  else {
    const k = Math.min(1, dt * 12);
    // the stick is relative to the camera: up is away from it
    const wx = Math.sin(camYaw) * ay - Math.cos(camYaw) * ax, wz = Math.cos(camYaw) * ay + Math.sin(camYaw) * ax;
    p.vx += (wx * RUN - p.vx) * k; p.vz += (wz * RUN - p.vz) * k;
    if (mag > 0.2) { let d = Math.atan2(wx, wz) - p.ang; d = Math.atan2(Math.sin(d), Math.cos(d)); p.ang += d * Math.min(1, dt * 16); p.fx = Math.sin(p.ang); p.fz = Math.cos(p.ang); }
  }
  p.coyote = p.onGround ? 0.1 : p.coyote - dt;
  p.jbuf = pressed.jump ? 0.12 : p.jbuf - dt;
  if (p.jbuf > 0 && p.coyote > 0) { p.vh = JUMP; p.jbuf = 0; p.coyote = 0; p.onGround = false; blip(330, 0.12, 'square', 220, 0.03); }
  if (!held.jump && p.vh > 0) p.vh -= GRAV * dt * 1.2; // release early for a short hop
  step(p, dt);
  // the camera swings in behind the gnome; running straight at it leaves it alone, so there is no spinning
  if ((camHold -= dt) <= 0) camYaw += 2.0 * Math.sin(p.ang - camYaw) * Math.min(1, Math.hypot(p.vx, p.vz) / RUN) * dt;
  if (p.bump === 'v' && !(G.banner && G.banner.vent)) G.banner = { text: `Roll too big for the vent: ${VENT_MAX} sheets or fewer`, t: 1.6, vent: true };
  p.walk = p.onGround && Math.hypot(p.vx, p.vz) > 0.8 ? p.walk + dt * 13 : 0;
  const ti = Math.round(p.x / TS), tj = Math.round(p.z / TS), here = tileAt(p.x, p.z);
  if (p.onGround && p.knock <= 0 && here !== '~') p.safe = { x: ti * TS, z: tj * TS };
  for (let j = tj - 3; j <= tj + 3; j++) for (let i = ti - 3; i <= ti + 3; i++) if (G.seen[j] && i >= 0 && i < W && Math.hypot(i - ti, j - tj) < 3.4) G.seen[j][i] = true;

  p.cooldown -= dt; p.attack -= dt; p.invuln -= dt; p.throwCd -= dt;
  if (pressed.attack && p.cooldown <= 0) { p.attack = 0.22; p.cooldown = p.knife ? 0.26 : 0.36; p.swing++; blip(180, 0.08, 'sawtooth', 200, 0.04); }
  if (pressed.wrap && p.throwCd <= 0) {
    if (p.sheets < 1) say('No paper left to throw');
    else { // costs a sheet; leans towards the nearest creature in front
      p.sheets--; p.throwCd = 0.45;
      let dx = p.fx, dz = p.fz, best = 11;
      for (const e of G.enemies) { const ex = e.x - p.x, ez = e.z - p.z, d = Math.hypot(ex, ez); if (d < best && !e.wrap && (ex * p.fx + ez * p.fz) / d > 0.75 && sight(p.x, p.z, e.x, e.z)) { best = d; dx = ex / d; dz = ez / d; } }
      const m = new THREE.Mesh(PGEO.shot, M.paper); m.rotation.y = Math.atan2(dx, dz); scene.add(m);
      G.shots.push({ x: p.x + dx * 0.6, z: p.z + dz * 0.6, vx: dx * 17, vz: dz * 17, life: 0.65, mesh: m });
      blip(700, 0.12, 'triangle', -400, 0.04);
    }
  }
  for (let i = 0; i < SMOKES.length; i++) p.smokeCd[i] -= dt;
  if (pressed.swap) { p.smoke = (p.smoke + 1) % SMOKES.length; blip(400, 0.05, 'square', 100, 0.03); }
  if (pressed.smoke) useSmoke();
  if (p.h < -0.7) {
    burst('splash', p.x, -0.3, p.z, 14, 5); blip(140, 0.3, 'sine', -80, 0.08);
    Object.assign(p, { x: p.safe.x, z: p.safe.z, h: 0, vx: 0, vz: 0, vh: 0, knock: 0 });
    if (p.sheets > 0) say('Soggy! −2 sheets', 1.4);
    loseSheets(2); p.invuln = Math.max(p.invuln, 1.5);
  }
  for (const k of G.pickups) if (!k.taken && Math.hypot(k.x - p.x, k.z - p.z) < 1 && p.h < 1.2) {
    if (k.kind === 'P' && p.sheets >= MAX_SHEETS) continue;
    k.taken = true; k.mesh.visible = false; burst('star', k.x, 0.8, k.z, 8, 3);
    if (k.kind === 'P') { p.sheets = Math.min(MAX_SHEETS, p.sheets + 3); blip(660, 0.1, 'triangle', 300); }
    else if (k.kind === 'K') { p.knife = true; say('Took the knife: faster, sharper swings', 2.2); blip(900, 0.1, 'square', 300, 0.04); }
    else { G.tips += 2; blip(880, 0.07, 'square', 400, 0.03); }
  }
  // depot restock
  if (Math.hypot(p.x - G.depot.x, p.z - G.depot.z) < 2.2 && p.sheets < MAX_SHEETS) { p.sheets = MAX_SHEETS; say('Fresh roll loaded'); blip(440, 0.1, 'triangle', 220); }
  // back room: the fixer hands out steroid packages for the gyms. The duct is narrow, so the roll must be slim to post one.
  const fixer = G.fixer; fixer.cool -= dt;
  if (!p.pkg && fixer.cool <= 0 && G.drops.length && Math.hypot(p.x - fixer.x, p.z - fixer.z) < 2) {
    const n = Math.floor(Math.random() * G.drops.length); p.pkg = { drop: n };
    say(`Steroids for ${G.drops[n].name}. Post them down the gym duct.`, 3.5); blip(300, 0.15, 'triangle', -100);
    G.huntTimer = Math.min(G.huntTimer, 30);
  }
  if (p.pkg) {
    const dr = G.drops[p.pkg.drop];
    if (Math.hypot(p.x - dr.x, p.z - dr.z) > 1.7 || !p.onGround) dr.warned = false;
    else if (p.sheets > VENT_MAX) { if (!dr.warned) { dr.warned = true; say(`The duct is tight: ${VENT_MAX} sheets or fewer to post it`, 2.4); } }
    else { p.pkg = null; G.tips += 25; fixer.cool = 8; burst('star', dr.x, 1.5, dr.z, 16, 4); say(`Package posted to ${dr.name}  +25 tips`, 2.6);
      blip(392, 0.12, 'triangle'); setTimeout(() => blip(587, 0.25, 'triangle'), 120); }
  }
  // deliveries
  for (const pt of G.points) {
    const o = pt.order; if (!o) continue;
    o.bonus = Math.max(0, o.bonus - dt / 10);
    if (Math.hypot(p.x - pt.x, p.z - pt.z) > 1.7 || !p.onGround) { o.warned = false; continue; }
    if (p.sheets < o.need) { if (!o.warned) { o.warned = true; say(`${pt.name} needs ${o.need} sheets. You have ${p.sheets}.`, 2.4); } continue; }
    const tip = 4 + o.need + Math.ceil(o.bonus);
    p.sheets -= o.need; G.tips += tip; G.delivered++; pt.order = null; G.lastPoint = G.points.indexOf(pt);
    burst('star', pt.x, 1.5, pt.z, 14, 4); burst('sheet', pt.x, 1.5, pt.z, 6, 3);
    say(`Delivered to ${pt.name}  +${tip} tips`, 2.4);
    blip(523, 0.12, 'triangle'); setTimeout(() => blip(659, 0.12, 'triangle'), 110); setTimeout(() => blip(784, 0.25, 'triangle'), 220);
    if (G.delivered >= TOTAL_ORDERS) { G.state = 'end'; G.t = 0; }
    else if (!G.points.some(q => q.order)) spawnOrder();
  }
}

function defeat(e, tip) {
  if (e.dead) return;
  if (e.kind === 'M' && !G.player.knife) { const m = buildPickup('K'); G.group.add(m); G.pickups.push({ kind: 'K', x: e.x, z: e.z, mesh: m }); } // mob gnomes drop their knife
  e.dead = true; burst('poof', e.x, e.h + 0.4, e.z, 10, 3.5); if (e.wrap || e.launch) burst('sheet', e.x, 0.6, e.z, 5, 3); G.tips += tip; }
function updateEnemies(dt) {
  const p = G.player;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.flash -= dt; e.timer += dt;
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 0.001;
    if (e.launch > 0) { // a wrapped creature that has been whacked: a bowling ball
      e.launch -= dt; step(e, dt);
      for (const o of G.enemies) if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.z - e.z) < 1.2) { defeat(o, 2); blip(90, 0.12, 'square', -30, 0.06); }
      if (e.launch <= 0 || e.bump || e.h < -0.7) defeat(e, 1);
      continue;
    }
    const whacked = p.attack > 0 && e.hitBy !== p.swing && d < 2.3 && Math.abs(e.h - p.h) < 1.6 && (d < 0.9 || (-dx * p.fx - dz * p.fz) / d > 0.15);
    if (e.wrap > 0) {
      e.wrap -= dt; e.vx = e.vz = 0;
      if (whacked) { e.hitBy = p.swing; e.wrap = 0; e.launch = 0.8; e.vx = p.fx * 15; e.vz = p.fz * 15; e.vh = 3; e.h = 0.2; e.onGround = false; blip(260, 0.15, 'square', 300, 0.06); continue; }
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
      // creatures need the gnome in view for a moment before they react, and give up once it is out of sight
      const spotted = !(e.mellow > 0) && (lured || (!inCloud(p.x, p.z) && d < 7.5 && sight(e.x, e.z, p.x, p.z)));
      e.alert = spotted ? Math.min(1.6, (e.alert || 0) + dt) : Math.max(0, (e.alert || 0) - dt * 0.6);
      const sees = spotted && (lured || e.alert > 0.9);
      if (e.kind === 'B') { // clogling: sits, then hops at the gnome
        if (e.onGround) { e.vx = e.vz = 0; if (e.timer > 2.2 && sees) { e.timer = 0; e.vx = tx / td * 3.4; e.vz = tz / td * 3.4; e.vh = 8.5; e.fx = tx / td; e.fz = tz / td; } }
      } else {
        let wx = 0, wz = 0;
        const speed = e.kind === 'R' ? [1.3, 2.6] : e.kind === 'M' ? [1.5, 3.0] : [2.4, 3.6];
        if (sees) { wx = tx / td * speed[1]; wz = tz / td * speed[1]; if (e.kind === 'C') { wx += Math.sin(e.timer * 9) * 2 * tz / td; wz -= Math.sin(e.timer * 9) * 2 * tx / td; } e.goal = null; }
        else { // wander tile to tile
          const ti = Math.round(e.x / TS), tj = Math.round(e.z / TS);
          if (!e.goal || Math.hypot(e.goal[0] * TS - e.x, e.goal[1] * TS - e.z) < 0.25 || (e.stuck += dt) > 3) {
            let opts = DIRS.map(([a, b]) => [ti + a, tj + b]).filter(([a, b]) => G.grid[b] && G.grid[b][a] === '.');
            if (e.kind === 'M') { const near = opts.filter(([a, b]) => Math.abs(a - e.home[0]) + Math.abs(b - e.home[1]) <= 2); if (near.length) opts = near; } // the mob stays by its den
            const fresh = opts.filter(([a, b]) => !e.from || a !== e.from[0] || b !== e.from[1]); if (fresh.length) opts = fresh;
            e.from = [ti, tj]; e.goal = opts.length ? opts[Math.floor(Math.random() * opts.length)] : [ti, tj]; e.stuck = 0;
          }
          const gx = e.goal[0] * TS - e.x, gz = e.goal[1] * TS - e.z, gd = Math.hypot(gx, gz) || 1; wx = gx / gd * speed[0]; wz = gz / gd * speed[0];
        }
        e.vx = wx; e.vz = wz;
        if (e.kind === 'M') { // knife lunge: stop, wind up, dash. The wind-up is the moment to sidestep or whack.
          e.cool -= dt;
          if (e.dash > 0) { e.dash -= dt; e.vx = e.lx * 10; e.vz = e.lz * 10; wx = e.lx; wz = e.lz; }
          else if (e.wind > 0) { e.vx = e.vz = 0; wx = e.lx; wz = e.lz; if ((e.wind -= dt) <= 0) { e.dash = 0.22; blip(520, 0.08, 'sawtooth', 300, 0.04); } }
          else if (sees && td < 2.6 && e.cool <= 0) { e.wind = 0.65; e.cool = 2.8; e.lx = tx / td; e.lz = tz / td; e.vx = e.vz = 0; }
        }
        if (Math.hypot(wx, wz) > 0.3) { e.fx = wx / Math.hypot(wx, wz); e.fz = wz / Math.hypot(wx, wz); }
      }
    }
    step(e, dt);
    if (e.h < -0.7) { e.dead = true; burst('splash', e.x, -0.3, e.z, 8, 4); G.tips += 1; continue; }
    if (whacked) {
      e.hitBy = p.swing; e.hp -= p.knife ? 2 : 1; e.wind = e.dash = 0; e.flash = 0.18; e.stun = 0.4; e.vx = -dx / d * 7 + p.fx * 3; e.vz = -dz / d * 7 + p.fz * 3; e.vh = 5; e.onGround = false;
      blip(120, 0.1, 'square', -40, 0.06);
      if (e.hp <= 0) defeat(e, 1);
    } else if (p.invuln <= 0 && e.stun <= 0 && !(e.mellow > 0) && d < 0.85 && Math.abs(e.h - p.h) < 1.1) {
      p.invuln = 1.2; p.knock = 0.25; p.vx = dx / d * 7; p.vz = dz / d * 7; p.vh = 5.5;
      blip(200, 0.2, 'sawtooth', -120, 0.06);
      if (e.kind === 'M' && p.pkg) { p.pkg = null; say('The mob took the package!', 2.4); }
      loseSheets(e.kind === 'M' ? 3 : 2);
    }
  }
  for (const s of G.shots) { // paper streamers
    s.life -= dt; s.x += s.vx * dt; s.z += s.vz * dt; s.mesh.position.set(s.x, 0.8, s.z); s.mesh.rotation.z += dt * 20;
    const c = tileAt(s.x, s.z); if (c === '#' || c === 'v') s.life = 0;
    for (const e of G.enemies) if (!e.dead && !e.wrap && !e.launch && Math.hypot(e.x - s.x, e.z - s.z) < 0.95) { e.wrap = 5; e.stun = 0; s.life = 0; burst('sheet', e.x, 0.6, e.z, 6, 2.5); blip(500, 0.1, 'triangle', -200); break; }
    if (s.life <= 0) scene.remove(s.mesh);
  }
  G.shots = G.shots.filter(s => s.life > 0);
  for (const e of G.enemies) if (e.dead) G.group.remove(e.mesh);
  G.enemies = G.enemies.filter(e => !e.dead);
}

function update(dt) {
  G.t += dt;
  const go = pressed.confirm || pressed.jump;
  if (G.state === 'title') {
    G.player.walk += dt * 13;
    if (go) { loadShift(1); G.state = 'brief'; G.t = 0; }
  } else if (G.state === 'brief') {
    if (go && G.t > 0.3) { G.state = 'play'; pressed.jump = false; }
  } else if (G.state === 'play') {
    G.clock += dt; G.orderTimer += dt;
    const active = G.points.filter(p => p.order).length;
    if (active < MAX_ACTIVE && G.orderTimer > 22) spawnOrder();
    updatePlayer(dt);
    if (G.state === 'play') { updateDecoy(dt); updateSmokes(dt); updateHunt(dt); if (G.state === 'play') updateEnemies(dt); }
    if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;
    G.shake = Math.max(0, G.shake - dt);
  } else if (G.state === 'end') {
    if (go && G.t > 0.8) { loadShift(G.shift + 1); G.state = 'brief'; G.t = 0; }
  }
  updateParticles(dt);
  for (const k in pressed) pressed[k] = false;
}

/* ---------- presenting the 3D scene ---------- */
const now = () => performance.now() / 1000;
let camReady = false, camYaw = Math.PI, camDist = 4.6, camPitch = 27 * Math.PI / 180, camHold = 0; // camHold: seconds the auto-follow waits after a manual look
 const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
function present(dt) {
  const p = G.player, t = now(), ud = p.mesh.userData;
  p.mesh.position.set(p.x, p.h, p.z); p.mesh.rotation.y = p.ang;
  const sw = Math.sin(p.walk), spd = Math.hypot(p.vx, p.vz);
  ud.bootL.position.z = 0.05 + sw * 0.2; ud.bootR.position.z = 0.05 - sw * 0.2;
  ud.bootL.position.y = 0.08 + Math.max(0, sw) * 0.08 + (p.onGround ? 0 : 0.1); ud.bootR.position.y = 0.08 + Math.max(0, -sw) * 0.08;
  ud.torso.position.y = Math.abs(sw) * 0.05; ud.torso.rotation.x = p.onGround ? Math.min(0.25, spd * 0.02) : -0.1;
  const r = 0.3 + 0.7 * p.sheets / MAX_SHEETS; ud.roll.scale.set(1, r, r); ud.roll.visible = p.sheets > 0;
  ud.tail.rotation.x = -0.5 - spd * 0.1 + Math.sin(t * 9) * 0.2;
  ud.arm.rotation.x = p.attack > 0 ? -0.9 + (1 - p.attack / 0.22) * 2.8 : 0.35 + sw * 0.15;
  ud.mouth.forEach((m, i) => { m.visible = i === p.smoke; });
  ud.plunger.forEach(m => { m.visible = !p.knife; }); ud.knife.visible = p.knife; ud.pkg.visible = !!p.pkg;
  p.mesh.visible = !(p.invuln > 0 && G.state === 'play' && Math.floor(t * 14) % 2);
  for (const e of G.enemies) {
    const d = e.mesh.userData;
    e.mesh.position.set(e.x, e.h, e.z); e.mesh.rotation.y = Math.atan2(e.fx, e.fz);
    if (e.launch > 0) e.mesh.rotation.x += dt * 18; else e.mesh.rotation.x = 0;
    e.mesh.rotation.z = e.mellow > 0 ? Math.sin(t * 3 + e.x) * 0.3 : 0;
    const wrapped = e.wrap > 0 || e.launch > 0;
    d.cocoon.visible = wrapped; d.body.visible = !wrapped || (e.wrap < 1.2 && e.wrap > 0 && Math.floor(t * 10) % 2 === 0);
    e.mesh.scale.setScalar(e.flash > 0 ? 1.3 : 1);
    if (d.tail) d.tail.rotation.z = Math.sin(t * 7 + e.x) * 0.4;
    if (d.mob) { const w = Math.hypot(e.vx, e.vz) > 0.5 ? Math.sin(e.timer * 11) : 0; d.mob.bootL.position.z = 0.05 + w * 0.2; d.mob.bootR.position.z = 0.05 - w * 0.2;
      d.mob.arm.rotation.x = e.wind > 0 ? -2.3 : e.dash > 0 ? 1.5 : 0.35; }
    if (d.legs) d.legs.forEach((l, i) => { l.rotation.y = Math.sin(t * 30 + i * 2) * 0.35; });
    if (d.blob) { const q = e.onGround ? 1 + Math.sin(t * 5 + e.x) * 0.07 : 1.2; d.blob.scale.set(1 / q, q, 1 / q); }
  }
  for (const k of G.pickups) { k.mesh.position.set(k.x, 0.75 + Math.sin(t * 3 + k.x) * 0.12, k.z); k.mesh.rotation.y = t * 2; }
  for (const pt of G.points) { const on = !!pt.order; pt.beam.visible = pt.ring.visible = on; pt.tag.visible = on; pt.tag.position.y = 3.4 + (on ? Math.sin(t * 3) * 0.15 : 0); }
  G.drops.forEach((dr, n) => { dr.beam.visible = dr.ring.visible = dr.tag.visible = !!p.pkg && p.pkg.drop === n; });
  G.fixer.ring.visible = !p.pkg && G.fixer.cool <= 0;
  const hu = G.state === 'play' ? G.hunt : null;
  HUNT.ring.visible = !!hu && hu.phase !== 'slam'; HUNT.beam.visible = !!hu && hu.flash > 0; HUNT.hand.visible = !!hu && (hu.phase === 'grab' || hu.phase === 'slam');
  if (hu) {
    HUNT.ring.position.set(hu.x, 0.06, hu.z); HUNT.ring.scale.setScalar((hu.phase === 'grab' ? 1.5 : 1) * (1 + Math.sin(t * 12) * 0.06));
    HUNT.ring.material.color.setHex(hu.phase === 'lock' ? 0xff3020 : hu.phase === 'grab' ? 0xff8a30 : 0xffd24a);
    HUNT.beam.position.set(hu.x, 9, hu.z); HUNT.hand.position.set(hu.x, hu.phase === 'slam' ? 0.5 : 0.5 + 13 * Math.max(0, hu.timer) / 1.1, hu.z); HUNT.hand.rotation.y = camYaw;
  }
  M.glow.opacity = 0.22 + 0.08 * Math.sin(t * 4);
  M.ventLamp.color.setHex(p.sheets <= VENT_MAX ? 0x58e070 : 0xff4030);
  M.sewage.map.offset.y = -t * 0.25;
  lantern.position.set(p.x, 2.4, p.z);
  // chase camera: low behind the gnome, pulled in when a wall is at their back
  if (G.state === 'title') { tmpA.set(p.x + 1.6, 1.8, p.z + 3.0); tmpB.set(p.x, 0.95, p.z); p.ang = 0.5; }
  else {
    // The camera orbits the gnome at camPitch. Below the wall tops it may back into the rock (walls are see-through
    // from behind) but never out the far side into another pipe; above them it pulls in when a wall would block the view.
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), D = 4.6 * Math.cos(camPitch), hc = 1.0 + 4.6 * Math.sin(camPitch), through = hc < WALL_H - 0.05;
    let room = D, inRock = false;
    for (let d = 0.4; d < D; d += 0.2) { const rock = tileAt(p.x - fx * d, p.z - fz * d) === '#';
      if (through) { if (inRock && !rock) { room = d - 0.4; break; } inRock = inRock || rock; }
      else if (rock && (hc < WALL_H + 0.3 || 1.2 + (hc - 1.2) * d / D < WALL_H + 0.15)) { room = Math.max(0.6, d - 0.35); break; } }
    camDist = room < camDist ? room : camDist + (room - camDist) * Math.min(1, dt * 5);
    tmpA.set(p.x - fx * camDist, hc, p.z - fz * camDist); tmpB.set(p.x + fx * 2.0, 1.0, p.z + fz * 2.0);
  }
  const k = camReady ? Math.min(1, dt * 14) : 1; camReady = true;
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

function drawMap(x0, y0, c) {
  const p = G.player, t = now();
  panel(x0 - 6, y0 - 6, W * c + 12, H * c + 12);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const ch = G.grid[j][i]; if (!G.seen[j][i] || ch === '#') continue;
    ctx.fillStyle = ch === '~' ? '#8aa63c' : ch === 'v' ? '#d5dcdc' : '#4f6d63'; ctx.fillRect(x0 + i * c, y0 + j * c, c, c);
  }
  ctx.fillStyle = '#ffe27a'; ctx.fillRect(x0 + (G.depot.i - 0.5) * c, y0 + (G.depot.j - 0.5) * c, c * 2, c * 2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const pt of G.points) {
    const px = x0 + (pt.i + 0.5) * c, py = y0 + (pt.j + 0.5) * c;
    if (pt.order) { ctx.fillStyle = '#d8432f'; ctx.beginPath(); ctx.arc(px, py, c * 0.9 + Math.sin(t * 5) * 1.2, 0, 7); ctx.fill(); text(pt.letter, px, py + 0.5, `${c * 1.3}px ${DISPLAY}`, '#f3efe2'); }
    else if (G.seen[pt.j][pt.i]) { ctx.strokeStyle = '#f3efe2'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, c * 0.45, 0, 7); ctx.stroke(); }
  }
  const fx = G.fixer; if (G.seen[fx.j][fx.i]) { ctx.fillStyle = '#8a4fd0'; ctx.fillRect(x0 + (fx.i - 0.5) * c, y0 + (fx.j - 0.5) * c, c * 2, c * 2); }
  if (p.pkg) { const dr = G.drops[p.pkg.drop]; ctx.fillStyle = '#b98cff'; ctx.beginPath(); ctx.arc(x0 + (dr.i + 0.5) * c, y0 + (dr.j + 0.5) * c, c * 0.9 + Math.sin(t * 5) * 1.2, 0, 7); ctx.fill(); }
  ctx.save(); ctx.translate(x0 + (p.x / TS + 0.5) * c, y0 + (p.z / TS + 0.5) * c); ctx.rotate(Math.PI - p.ang);
  ctx.fillStyle = '#f3efe2'; ctx.beginPath(); ctx.moveTo(0, -c * 0.9); ctx.lineTo(c * 0.6, c * 0.6); ctx.lineTo(-c * 0.6, c * 0.6); ctx.fill(); ctx.restore();
}
function drawHUD() {
  const p = G.player, narrow = LW < 620;
  ctx.textBaseline = 'middle';
  // roll gauge, with the vent line
  panel(12, 12, 222, 46); drawRoll(30, 29, 10);
  for (let i = 0; i < MAX_SHEETS; i++) { ctx.fillStyle = i < p.sheets ? '#f7f4ea' : 'rgba(247,244,234,0.15)'; ctx.fillRect(48 + i * 15, 18, 12, 18); }
  const fits = p.sheets <= VENT_MAX, vx = 48 + VENT_MAX * 15 - 1.5;
  ctx.fillStyle = fits ? '#58e070' : '#ff6a55'; ctx.fillRect(vx - 1, 14, 2, 26);
  ctx.textAlign = 'left'; text(fits ? 'Fits through vents' : `Too big for vents (max ${VENT_MAX})`, 48, 49, `800 11px ${BODY}`, fits ? '#58e070' : '#ff8a78');
  // current smoke: tap it (or Q) to swap
  const sm = SMOKES[p.smoke], cd = p.smokeCd[p.smoke];
  panel(12, 64, 222, 30);
  text(sm.name, 22, 80, `15px ${DISPLAY}`, '#f3efe2'); const nw = ctx.measureText(sm.name).width;
  text(sm.hint, 30 + nw, 80, `600 11px ${BODY}`, '#8fa9a2');
  ctx.textAlign = 'right'; text(cd > 0 ? `${Math.ceil(cd)} s` : 'ready', 224, 80, `800 12px ${BODY}`, cd > 0 ? '#e2b23c' : '#58e070');
  ctx.save(); ctx.translate(0, 36);
  // orders
  const orders = G.points.filter(q => q.order), ow = 222, slots = Math.max(1, orders.length);
  panel(12, 64, ow, 26 + (slots + 1) * 22);
  ctx.textAlign = 'left'; text(`Orders  ${G.delivered}/${TOTAL_ORDERS} done`, 22, 78, `14px ${DISPLAY}`, '#f3efe2');
  ctx.textAlign = 'right'; text(`${G.tips} tips`, 12 + ow - 10, 78, `14px ${DISPLAY}`, '#ffe27a');
  if (!orders.length) { ctx.textAlign = 'left'; text('Quiet for now. Explore.', 22, 101, `600 12px ${BODY}`, '#8fa9a2'); }
  orders.forEach((pt, n) => {
    const y = 101 + n * 22, ok = p.sheets >= pt.order.need;
    ctx.fillStyle = '#d8432f'; ctx.beginPath(); ctx.arc(30, y, 8, 0, 7); ctx.fill();
    ctx.textAlign = 'center'; text(pt.letter, 30, y + 0.5, `11px ${DISPLAY}`, '#f3efe2');
    ctx.textAlign = 'left'; text(pt.name.length > 17 ? pt.name.slice(0, 16) + '…' : pt.name, 44, y, `800 12px ${BODY}`, '#f3efe2');
    ctx.textAlign = 'right'; text(`${pt.order.need} sheets`, 12 + ow - 34, y, `800 12px ${BODY}`, ok ? '#58e070' : '#e2b23c');
    text(`+${4 + pt.order.need + Math.ceil(pt.order.bonus)}`, 12 + ow - 10, y, `800 12px ${BODY}`, '#ffe27a');
  });
  { // the back-room job, always the last row
    const y = 101 + slots * 22;
    ctx.fillStyle = '#8a4fd0'; ctx.beginPath(); ctx.arc(30, y, 8, 0, 7); ctx.fill();
    ctx.textAlign = 'center'; text('G', 30, y + 0.5, `11px ${DISPLAY}`, '#f3efe2');
    ctx.textAlign = 'left'; text(p.pkg ? `Steroids: ${G.drops[p.pkg.drop].name}` : G.fixer.cool <= 0 ? 'Back room has a package' : 'Back room: come back soon', 44, y, `800 12px ${BODY}`, p.pkg ? '#d9c2ff' : '#b79be0');
    if (p.pkg) { ctx.textAlign = 'right'; text('+25', 12 + ow - 10, y, `800 12px ${BODY}`, '#ffe27a'); }
  }
  ctx.restore();
  const c = narrow ? 5 : 7; drawMap(LW - W * c - 18, 18, c);
  if (G.hunt) { const hw = W * c + 12, hx = LW - W * c - 24, hy = 18 + H * c + 12;
    ctx.fillStyle = Math.floor(now() * 4) % 2 ? '#d8432f' : '#a52f20'; ctx.beginPath(); ctx.roundRect(hx, hy, hw, 26, 8); ctx.fill();
    ctx.textAlign = 'center'; text(G.hunt.phase === 'grab' || G.hunt.phase === 'slam' ? 'HAND COMING DOWN' : 'HUMAN ABOVE', hx + hw / 2, hy + 14, `${narrow ? 11 : 14}px ${DISPLAY}`, '#f3efe2'); }
  if (G.banner) {
    ctx.font = `${narrow ? 15 : 19}px ${DISPLAY}`; ctx.textAlign = 'center';
    const w = Math.min(LW - 24, ctx.measureText(G.banner.text).width + 32), y = narrow ? 236 : LH - 70;
    ctx.fillStyle = '#f3efe2'; ctx.beginPath(); ctx.roundRect(LW / 2 - w / 2, y, w, 36, 10); ctx.fill();
    ctx.fillStyle = '#10201f'; ctx.fillText(G.banner.text, LW / 2, y + 19, w - 16);
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
  } else if (G.state === 'play') drawHUD();
  else if (G.state === 'brief') ticket(404, (cx, y, w) => {
    const body = `600 ${w < 440 ? 12 : 14}px ${BODY}`, lines = [
      ['No clock. Take orders in any order, find your own way.', '#10201f'],
      ['Your roll is cargo, health and ammo. Reload at the depot.', '#5b6f6a'],
      ['Paper wrap: throw a sheet to cocoon a creature,', '#10201f'],
      ['then whack the cocoon to bowl it into the others.', '#5b6f6a'],
      [`Vents are shortcuts, but only fit ${VENT_MAX} sheets or fewer.`, '#10201f'],
      ['Smokes: cigarette decoy, pipe push ring, cigar', '#10201f'],
      ['smokescreen, joint haze. Swap with Q or tap its name.', '#5b6f6a'],
      ['Back room: run steroids to a gym duct for big tips.', '#10201f'],
      ['Mob gnomes lunge with knives and take the package.', '#5b6f6a'],
      ['Humans above shoot, then grab. Keep moving, or hide', '#10201f'],
      ['in a vent or smoke until they lose you.', '#5b6f6a'],
      ['Drag the view to look around.', '#10201f']];
    text(`SHIFT ${G.shift} · ${TOTAL_ORDERS} ORDERS`, cx, y + 32, `800 13px ${BODY}`, '#d8432f');
    text('The Undercity', cx, y + 64, `34px ${DISPLAY}`, '#10201f');
    lines.forEach(([s, col], n) => s && text(s, cx, y + 104 + n * 20, body, col));
  });
  else if (G.state === 'end') ticket(230, (cx, y) => {
    const m = Math.floor(G.clock / 60), s = Math.floor(G.clock % 60);
    text('SHIFT COMPLETE', cx, y + 50, `40px ${DISPLAY}`, '#10201f');
    text(`All ${TOTAL_ORDERS} emergencies handled in ${m}:${String(s).padStart(2, '0')}.`, cx, y + 98, `600 16px ${BODY}`, '#3d4f4b');
    text(`Tips earned: ${G.tips}`, cx, y + 138, `26px ${DISPLAY}`, '#d8432f');
    text('Next shift is a new part of the sewers.', cx, y + 172, `600 13px ${BODY}`, '#5b6f6a');
  });
}

loadShift(1);
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
