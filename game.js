/* Gnome Delivery Service — 3D prototype (three.js r128).
   A sewer labyrinth played as a top-down action game: fixed overhead camera, snappy movement, a dash, telegraphed enemies.
   Core loop (push your luck): accept orders in the lobby, head out through one of its four pipes, deliver.
   Tips go in your pocket and only count once you walk back into the lobby; a knockout loses the pocket.
   Every drop raises heat (sharper creatures, more humans), which clears when you come home.
   Banked tips buy gear at the lobby stores; reputation opens the other pipes, each to a district with its own threat.
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

const TS = 3.2, WALL_H = 1.5;            // tile size, wall height
const CW = 10, CH = 8, W = CW * 2 + 1, H = CH * 2 + 1; // maze cells and tile grid
const GRAV = 22, RUN = 7.5, RADIUS = 0.42;
let MAX_SHEETS = 12; // grows with the bigger-roll upgrade
const VENT_MAX = 6, MAX_ACTIVE = 3;
const DISPLAY = '"Lilita One", "Arial Rounded MT Bold", sans-serif';
const BODY = 'Nunito, system-ui, sans-serif';
const SMOKES = [
  { id: 'cig', name: 'Cigarette', cd: 8, hint: 'runaway decoy' },
  { id: 'pipe', name: 'Pipe', cd: 5, hint: 'push ring' },
  { id: 'cigar', name: 'Cigar', cd: 12, hint: 'smokescreen' },
  { id: 'joint', name: 'Joint', cd: 15, hint: 'mellow haze' },
];
const ADDRESSES = ['Apartment 3B', 'Café Bruma', 'Night bus depot', 'Luigi’s back office', 'Mrs. Okafor, No. 12', 'The gym showers', 'Dentist, 2nd floor', 'High Street bank'];
/* Four districts, one behind each lobby pipe. Reputation opens them in turn; tips and gym pay scale with the danger. */
const DISTRICTS = [
  { name: 'Rat Runs', dir: [0, -1], rep: 0, mult: 1, pay: 15, tint: '#4f6d63', gym: 'Iron Temple Gym', mobs: ['R', 'R', 'C', 'R'], wet: 2 },
  { name: 'Mob Turf', dir: [1, 0], rep: 3, mult: 1.3, pay: 25, tint: '#6b5868', gym: 'Pump House Gym', mobs: ['M', 'M', 'R'], wet: 2 },
  { name: 'The Flood', dir: [0, 1], rep: 7, mult: 1.6, pay: 30, tint: '#47795c', gym: 'Deep End Gym', mobs: ['B', 'B', 'C', 'B', 'C'], wet: 9 },
  { name: 'High Street', dir: [-1, 0], rep: 12, mult: 2, pay: 40, tint: '#566785', gym: 'High Street Fitness', mobs: ['C', 'C', 'R'], wet: 1 },
];
const districtOf = (cx, cy) => { const dx = cx - 5, dy = cy - 4; if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return -1; return Math.abs(dx) * 0.8 >= Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy < 0 ? 0 : 2); };
/* What carries over between runs (and between visits, where the browser allows it). */
const SAVE = { bank: 0, rep: 0, smokes: [true, false, false, false], roll: 0, knife: false, maps: [false, false, false, false] };
try { Object.assign(SAVE, JSON.parse(localStorage.getItem('gds-save-1') || '{}')); } catch (e) { /* storage unavailable: play without it */ }
const save = () => { try { localStorage.setItem('gds-save-1', JSON.stringify(SAVE)); } catch (e) { /* ignore */ } };
MAX_SHEETS = [12, 16, 20][SAVE.roll] || 12;

/* ---------- three.js setup ---------- */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('view'), antialias: true });
const hudCanvas = document.getElementById('hud');
const ctx = hudCanvas.getContext('2d');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1615);
scene.fog = new THREE.Fog(0x070f0f, 14, 36); // the edges of the view fall away into the dark
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 140);
scene.add(new THREE.HemisphereLight(0xb8e8d8, 0x2c3a24, 0.4));
const sun = new THREE.DirectionalLight(0xfff2d0, 0.22); sun.position.set(-4, 10, 6); scene.add(sun);
const lantern = new THREE.PointLight(0xffd9a0, 1.7, 15); // the gnome carries the light
scene.add(lantern);

let LW = 960, LH = 540; // HUD logical size
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
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
  g.fillStyle = '#3f4f48'; g.fillRect(0, 0, n, n);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
    const v = 64 + ((r * 7 + c * 13) % 5) * 6;
    g.fillStyle = `rgb(${v - 14},${v + 12},${v})`;
    g.fillRect(c * 64 + (r % 2 ? 32 : 0) - 64 + 3, r * 32 + 3, 58, 26); g.fillRect(c * 64 + (r % 2 ? 32 : 0) + 3, r * 32 + 3, 58, 26);
  }
  g.fillStyle = 'rgba(120,160,80,0.35)';
  for (let i = 0; i < 9; i++) g.fillRect((i * 53) % n, 0, 5 + (i % 3) * 3, 40 + (i * 37) % 120);
});
const floorTex = canvasTexture(256, (g, n) => {
  g.fillStyle = '#44543f'; g.fillRect(0, 0, n, n);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = (r + c) % 2 ? '#586660' : '#616f68'; g.fillRect(c * 64 + 2, r * 64 + 2, 60, 60); }
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
const lobbyTex = canvasTexture(128, (g, n) => { // warm planks
  for (let r = 0; r < 4; r++) { g.fillStyle = ['#a9793f', '#9c6d38', '#b28246', '#946634'][r]; g.fillRect(0, r * 32, n, 32); g.fillStyle = '#6e4a22'; g.fillRect(0, r * 32, n, 2); g.fillRect((r * 45) % n, r * 32, 2, 32); }
});
const NPC_LINES = ['Waiting on a ping. Always waiting.', '3B again? Somebody check on 3B.', 'Mind the mob den, south-east.', 'Slim roll, quick vents. Trust me.',
  'A human nearly got me Tuesday.', 'Back room pays. I never said that.', 'Tips are down this week.', 'My roll got soggy. Again.'];
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
  rug: lam(0x6e3a30), phone: new THREE.MeshBasicMaterial({ color: 0x9fe8ff }), lobby: lam(0xffffff, { map: lobbyTex, ...DS2 }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }),
  warn: new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
  suit: lam(0x2a2a33), fedora: lam(0x141418), blade: lam(0xd0d6da), purple: lam(0x8a4fd0),
  ventLamp: new THREE.MeshBasicMaterial({ color: 0xff4030 }), coin: new THREE.MeshBasicMaterial({ color: 0xffd24a }),
  smoke: new THREE.MeshLambertMaterial({ color: 0xd9dedc, transparent: true, opacity: 0.6, depthWrite: false }),
  splash: new THREE.MeshBasicMaterial({ color: 0xa9c46a }), poof: new THREE.MeshBasicMaterial({ color: 0xb9b3a2 }), star: new THREE.MeshBasicMaterial({ color: 0xffe27a }),
};
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const sphere = (r, mat, x, y, z) => mesh(new THREE.SphereGeometry(r, 12, 10), mat, x, y, z);
const blob = r => mesh(new THREE.CircleGeometry(r, 18), M.shadow, 0, 0.03, 0).rotateX(-Math.PI / 2); // a soft shadow to plant things on the floor
const box = (w, h, d, m, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);

/* ---------- state ---------- */
const G = {
  state: 'title', shift: 1, tips: 0, t: 0, clock: 0, TS,
  grid: null, seen: null, depot: null, points: [], group: null,
  player: null, decoy: null, rings: [], clouds: [], drops: [], fixer: null, offers: [], npcs: [], gates: [], spawns: [], pocket: 0, heat: 0, runRep: 0, out: false, shopOpen: false, hunt: null, huntTimer: 60, enemies: [], pickups: [], shots: [], particles: [],
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
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const cellD = (cx, cy) => cx < 0 || cy < 0 || cx >= CW || cy >= CH ? -2 : districtOf(cx, cy), tileD = (x, y) => cellD((x - 1) / 2, (y - 1) / 2);
  // one depth-first maze per district, each starting at the cell behind its lobby pipe, never crossing into another
  const seenCell = new Set(), key = (x, y) => x + ',' + y;
  const carve = (cx, cy, nx, ny) => { grid[cy + ny + 1][cx + nx + 1] = '.'; grid[ny * 2 + 1][nx * 2 + 1] = '.'; seenCell.add(key(nx, ny)); };
  DISTRICTS.forEach((D, d) => {
    const sx = 5 + D.dir[0] * 2, sy = 4 + D.dir[1] * 2, stack = [[sx, sy]]; grid[sy * 2 + 1][sx * 2 + 1] = '.'; seenCell.add(key(sx, sy));
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const next = shuffle(DIRS.map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => cellD(x, y) === d && !seenCell.has(key(x, y))));
      if (!next.length) { stack.pop(); continue; }
      carve(cx, cy, next[0][0], next[0][1]); stack.push(next[0]);
    }
  });
  for (let pass = 0; pass < 4; pass++) for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) { // join any cell the walk could not reach
    const d = cellD(cx, cy); if (d < 0 || seenCell.has(key(cx, cy))) continue;
    const nb = shuffle(DIRS.map(([dx, dy]) => [cx + dx, cy + dy])).filter(([x, y]) => seenCell.has(key(x, y)) && cellD(x, y) >= 0), same = nb.filter(([x, y]) => cellD(x, y) === d);
    const to = same[0] || (pass === 3 ? nb[0] : null); if (to) carve(to[0], to[1], cx, cy);
  }
  const passages = []; // wall slots between two cells
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if ((x + y) % 2 === 1) passages.push([x, y, x % 2 === 0 ? 1 : 0, x % 2 === 0 ? 0 : 1]);
  for (const [x, y, dx, dy] of passages) if (grid[y][x] === '#' && tileD(x - dx, y - dy) >= 0 && tileD(x - dx, y - dy) === tileD(x + dx, y + dy) && R() < 0.1) grid[y][x] = '.'; // loops, inside a district only
  // chambers: the lobby in the middle (5 x 5), the fixer's back room up the north pipe, the mob's den out east
  const room = grid.map(r => r.map(() => false)), depot = { i: 11, j: 9 }, back = [11, 3], den = [17, 11];
  for (const [rx, ry, r] of [[depot.i, depot.j, 2], [...back, 1], [...den, 1]]) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { grid[ry + dy][rx + dx] = '.'; room[ry + dy][rx + dx] = true; }
  for (const [dx, dy] of DIRS) grid[depot.j + dy * 3][depot.i + dx * 3] = '.'; // one pipe out of the lobby on every side
  const nearRoom = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (room[y + dy] && room[y + dy][x + dx]) return true; return false; };
  const dist = bfs(grid, depot.i, depot.j);
  const cells = []; for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) { const x = cx * 2 + 1, y = cy * 2 + 1; if (!room[y][x] && cellD(cx, cy) >= 0) cells.push([x, y, cellD(cx, cy)]); }
  const exits = (x, y) => DIRS.filter(([dx, dy]) => open(grid[y + dy][x + dx])).length;
  const deadEnds = cells.filter(([x, y]) => exits(x, y) === 1);
  // two delivery points and one gym duct per district: deep in, spread out, dead ends preferred
  const used = new Set(), anchors = [[depot.i, depot.j], back, den];
  const choose = d => { let best = null, bs = -1;
    for (const [x, y, cd] of cells) { if (cd !== d || used.has(key(x, y)) || dist[y][x] < 5) continue;
      const sc = Math.min(...anchors.map(a => Math.hypot(x - a[0], y - a[1]))) + (exits(x, y) === 1 ? 1.5 : 0); if (sc > bs) { bs = sc; best = [x, y]; } }
    if (best) { used.add(key(best[0], best[1])); anchors.push(best); } return best; };
  const points = [], drops = [];
  DISTRICTS.forEach((D, d) => { for (let k = 0; k < 2; k++) { const b = choose(d); if (b) points.push({ i: b[0], j: b[1], x: b[0] * TS, z: b[1] * TS, d, letter: 'ABCDEFGH'[d * 2 + k], name: ADDRESSES[d * 2 + k], order: null }); } });
  DISTRICTS.forEach((D, d) => { const b = choose(d); if (b) drops.push({ i: b[0], j: b[1], x: b[0] * TS, z: b[1] * TS, d, name: D.gym, pay: D.pay }); });
  // vents: holes through walls where the walk around is long. Most end up between districts, where the walk is via the lobby.
  const vents = [];
  const cand = passages.filter(([x, y, dx, dy]) => grid[y][x] === '#' && grid[y - dy][x - dx] === '.' && grid[y + dy][x + dx] === '.' && !nearRoom(x, y))
    .map(([x, y, dx, dy]) => [x, y, bfs(grid, x - dx, y - dy)[y + dy][x + dx]]).filter(c => c[2] >= 14).sort((a, b) => b[2] - a[2]);
  for (const [x, y] of cand) { if (vents.length >= 7) break; if (vents.every(v => Math.abs(v[0] - x) + Math.abs(v[1] - y) >= 5)) { vents.push([x, y]); } }
  for (const [x, y] of vents) grid[y][x] = 'v';
  // sewage channels across straight corridors: one tile wide, always jumpable. The Flood is full of them.
  const wet = shuffle(passages.filter(([x, y, dx, dy]) => grid[y][x] === '.' && !nearRoom(x, y) && grid[y - dy][x - dx] === '.' && grid[y + dy][x + dx] === '.'
    && grid[y - dx][x - dy] === '#' && grid[y + dx][x + dy] === '#' && !used.has(key(x - dx, y - dy)) && !used.has(key(x + dx, y + dy)))), wetLeft = DISTRICTS.map(D => D.wet);
  for (const [x, y, dx, dy] of wet) { const d = tileD(x - dx, y - dy); if (d >= 0 && wetLeft[d] > 0) { wetLeft[d]--; grid[y][x] = '~'; } }
  // creatures by district, spare rolls, coins. Nothing spawns within six tiles' walk of the lobby.
  const things = [['M', den[0] + 1, den[1] - 1], ['M', den[0], den[1] + 1]], taken = new Set(used), far = (x, y, n) => things.every(t => Math.abs(t[1] - x) + Math.abs(t[2] - y) >= n);
  DISTRICTS.forEach((D, d) => { const kinds = D.mobs.slice();
    for (const [x, y, cd] of shuffle(cells.slice())) { if (!kinds.length) break; if (cd === d && dist[y][x] >= 6 && !taken.has(key(x, y)) && far(x, y, 3)) { things.push([kinds.pop(), x, y]); taken.add(key(x, y)); } } });
  let spare = 0; for (const [x, y] of shuffle(deadEnds.slice())) if (spare < 5 && !taken.has(key(x, y))) { things.push(['P', x, y]); taken.add(key(x, y)); spare++; }
  let coins = 0; for (const [x, y] of shuffle(cells.slice())) if (coins < 18 && !taken.has(key(x, y))) { things.push(['$', x, y]); taken.add(key(x, y)); coins++; }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) grid[depot.j + dy][depot.i + dx] = 'L'; // lobby floor: creatures will not step on it
  DISTRICTS.forEach((D, d) => { if (d) grid[depot.j + D.dir[1] * 3][depot.i + D.dir[0] * 3] = String(d); }); // gates on the three pipes that reputation opens
  const dmap = grid.map((r, y) => r.map((c, x) => c === 'L' ? -1 : districtOf(Math.round((x - 1) / 2), Math.round((y - 1) / 2))));
  return { grid, dmap, depot: { ...depot, x: depot.i * TS, z: depot.j * TS, px: depot.i * TS - 5.6, pz: depot.j * TS - 5.6 }, points, drops, fixer: { i: back[0], j: back[1], x: back[0] * TS, z: back[1] * TS, cool: 0 }, things };
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
    quad(c === '#' ? 'top' : c === '~' ? 'sewage' : c === 'v' ? 'vent' : c === 'L' ? 'lobby' : 'floor', [x - hs, y, z + hs], [x + hs, y, z + hs], [x + hs, y, z - hs], [x - hs, y, z - hs], c === 'v' ? 2 : U, c === 'v' ? 2 : U);
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
        f.add(box(TS, 0.3, 0.3, M.steel, 0, 1.45, 0), box(0.3, 1.6, 0.3, M.steel, -hs + 0.15, 0.8, 0), box(0.3, 1.6, 0.3, M.steel, hs - 0.15, 0.8, 0));
        f.add(sphere(0.2, M.ventLamp, 0, 1.75, 0)); g.add(f);
      }
    }
  }
  const mats = { top: M.top, lobby: M.lobby, floor: M.floor, sewage: M.sewage, vent: M.vent, wall: M.wall, curb: M.curb };
  for (const k in bufs) { const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bufs[k].p, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(bufs[k].uv, 2));
    geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, mats[k])); }
  g.add(mesh(new THREE.PlaneGeometry(W * TS, H * TS), M.top, (W - 1) * TS / 2, -0.6, (H - 1) * TS / 2).rotateX(-Math.PI / 2));
  // the lobby: couriers hang about here between orders. Roll pallet in the corner, order board on the wall, a pipe out on each side.
  const d = G.depot, pallet = new THREE.Group(); pallet.position.set(d.px, 0, d.pz);
  pallet.add(box(2.2, 0.2, 2.2, M.wood, 0, 0.1, 0));
  for (const [px, py, pz] of [[-0.55, 0.5, -0.5], [0.55, 0.5, -0.5], [-0.55, 0.5, 0.5], [0.55, 0.5, 0.5], [0, 1.1, 0]]) {
    pallet.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 18), M.paper, px, py, pz), mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.62, 10), M.card, px, py, pz)); }
  g.add(pallet, mesh(new THREE.RingGeometry(2.0, 2.3, 32), M.ring, d.px, 0.03, d.pz).rotateX(-Math.PI / 2));
  g.add(mesh(new THREE.CircleGeometry(3.4, 32), M.rug, d.x, 0.02, d.z).rotateX(-Math.PI / 2));
  const dl = new THREE.PointLight(0xffd9a0, 0.9, 24); dl.position.set(d.x, 3, d.z); g.add(dl);
  for (let k = 0; k < 12; k++) g.add(sphere(0.13, M.lamp, d.x + Math.cos(k * 0.5236) * 6.6, 2.9 + (k % 2) * 0.15, d.z + Math.sin(k * 0.5236) * 6.6));
  const board = mesh(new THREE.PlaneGeometry(2.6, 1.4), new THREE.MeshBasicMaterial({ map: canvasTexture(256, (c2, n) => { c2.fillStyle = '#6e4a22'; c2.fillRect(0, 0, n, n);
    c2.fillStyle = '#f3efe2'; c2.font = `44px ${DISPLAY}`; c2.textAlign = 'center'; c2.fillText('ORDERS', n / 2, 50);
    for (let k = 0; k < 6; k++) { c2.fillStyle = k % 3 ? '#f3efe2' : '#ffe27a'; c2.fillRect(22 + (k % 3) * 76, 76 + Math.floor(k / 3) * 84, 60, 70); c2.fillStyle = '#d8432f'; c2.fillRect(46 + (k % 3) * 76, 72 + Math.floor(k / 3) * 84, 10, 10); } }) }), d.x + 4.4, 0.78, d.z - 7.93);
  g.add(board);
  for (const [dx, dz] of DIRS) { g.add(box(dx ? 0.35 : TS, 0.35, dx ? TS : 0.35, M.copper, d.x + dx * 8, 1.75, d.z + dz * 8), sphere(0.2, M.lamp, d.x + dx * 7.8, 1.5, d.z + dz * 7.8)); }
  G.npcs = [];
  const hats = [0x4f9d5b, 0xe2b23c, 0x3f6fb8, 0xe07a2f, 0x2aa198, 0xb84f8a, 0x7a6ad8], tunics = [0x7a5230, 0x3d6b4f, 0x6b6f78, 0x2f6fa8];
  //            x     z    facing  sits smoke phone
  const crowd = [[-4.6, -1.6, 0.9, 1, -1, 1], [-3.2, -0.6, -2.2, 0, 0, 0], [5.0, -5.4, -0.6, 0, 1, 0], [5.4, 3.6, -1.9, 1, -1, 1],
    [3.9, 5.0, -2.6, 0, -1, 1], [-1.6, 6.0, 2.6, 1, 2, 0], [3.6, -6.2, 3.14, 0, -1, 0]];
  crowd.forEach(([x, z, face, sits, smoke, phone], n) => {
    const m = buildGnome({ npc: true, smoke, phone, hat: lam(hats[n % hats.length]), tunic: lam(tunics[n % tunics.length]) });
    m.position.set(d.x + x, sits ? 0.34 : 0, d.z + z); m.rotation.y = face; g.add(m);
    if (sits) g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.42, 16), M.paper, d.x + x, 0.21, d.z + z));
    G.npcs.push({ mesh: m, x: d.x + x, z: d.z + z, y: sits ? 0.34 : 0, smokes: smoke >= 0, n });
  });
  // delivery points: a porcelain pipe up to someone's bathroom
  for (const p of G.points) {
    const pg = new THREE.Group(); pg.position.set(p.x, 0, p.z);
    pg.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.4, 18, 1, true), M.porcelain, 0, 3.8, 0), mesh(new THREE.TorusGeometry(0.8, 0.14, 8, 22), M.porcelain, 0, 2.6, 0).rotateX(Math.PI / 2));
    p.beam = mesh(new THREE.CylinderGeometry(0.7, 1.5, 2.6, 18, 1, true), M.glow, 0, 1.3, 0);
    p.ring = mesh(new THREE.RingGeometry(1.2, 1.45, 28), M.ring, 0, 0.03, 0).rotateX(-Math.PI / 2);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(64, (c2, n) => { c2.fillStyle = '#d8432f'; c2.beginPath(); c2.arc(32, 32, 30, 0, 7); c2.fill();
      c2.fillStyle = '#f3efe2'; c2.font = `44px ${DISPLAY}`; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText(p.letter, 32, 35); }), depthTest: false }));
    tag.position.y = 2.6; tag.scale.setScalar(1.3); p.tag = tag;
    pg.add(p.beam, p.ring, tag); g.add(pg);
  }
  // the stores, in the lobby's south-west corner: spend banked tips here
  const sx = d.x - 5.5, sz = d.z + 5.6; G.shop = { x: sx + 0.4, z: sz - 1.5 };
  g.add(box(2.8, 0.9, 0.8, M.wood, sx, 0.45, sz - 0.6), box(2.9, 0.06, 0.9, M.hat, sx, 0.93, sz - 0.6));
  for (const [ox, m] of [[-0.8, M.paper], [0, M.blade], [0.8, M.rope]]) g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12), m, sx + ox, 1.05, sz - 0.6));
  const keeper = buildGnome({ npc: true, smoke: 2, hat: M.gold, tunic: M.suit }); keeper.position.set(sx, 0, sz + 0.5); keeper.rotation.y = Math.PI; g.add(keeper);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(128, c2 => { c2.fillStyle = '#e2b23c'; c2.beginPath(); c2.roundRect(4, 40, 120, 48, 10); c2.fill();
    c2.fillStyle = '#10201f'; c2.font = `30px ${DISPLAY}`; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText('STORES', 64, 66); }) }));
  sign.position.set(sx, 2.3, sz - 0.2); sign.scale.set(1.5, 1.5, 1); g.add(sign);
  // gates: bars across the three pipes that reputation opens
  G.gates = DISTRICTS.map((D, n) => { if (!n) return null;
    const gate = new THREE.Group(); gate.position.set(d.x + D.dir[0] * 3 * TS, 0, d.z + D.dir[1] * 3 * TS); if (D.dir[0]) gate.rotation.y = Math.PI / 2;
    for (let k = 0; k < 6; k++) gate.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), M.steel, -1.35 + k * 0.54, 1.3, 0));
    gate.add(box(TS, 0.16, 0.16, M.steel, 0, 2.55, 0), box(TS, 0.16, 0.16, M.steel, 0, 0.5, 0));
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(256, c2 => { c2.fillStyle = '#10201f'; c2.beginPath(); c2.roundRect(8, 78, 240, 100, 16); c2.fill();
      c2.fillStyle = '#f3efe2'; c2.font = `38px ${DISPLAY}`; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText(D.name, 128, 108); c2.fillStyle = '#ffe27a'; c2.font = `30px ${DISPLAY}`; c2.fillText(`Reputation ${D.rep}`, 128, 150); }) }));
    tag.position.y = 1.6; tag.scale.set(2.6, 2.6, 1); gate.add(tag); g.add(gate); return gate; });
  // gym ducts: square steel, with a grille to post packages through
  const purpleRing = new THREE.MeshBasicMaterial({ color: 0xb98cff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  for (const dr of G.drops) {
    const dg = new THREE.Group(); dg.position.set(dr.x, 0, dr.z);
    dg.add(box(1.3, 2.4, 1.3, M.steel, 0, 3.9, 0), box(1.6, 0.14, 1.6, M.steel, 0, 2.7, 0));
    dr.beam = mesh(new THREE.CylinderGeometry(0.6, 1.4, 2.6, 4, 1, true), M.glow, 0, 1.3, 0);
    dr.ring = mesh(new THREE.RingGeometry(1.2, 1.45, 28), purpleRing, 0, 0.03, 0).rotateX(-Math.PI / 2);
    dr.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(64, c2 => { c2.fillStyle = '#8a4fd0'; c2.beginPath(); c2.arc(32, 32, 30, 0, 7); c2.fill();
      c2.fillStyle = '#f3efe2'; c2.font = `44px ${DISPLAY}`; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText('$', 32, 35); }), depthTest: false }));
    dr.tag.position.y = 2.6; dr.tag.scale.setScalar(1.3);
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
  if (o.npc) { plunger.forEach(m => { m.visible = false; }); mouth.forEach((m, i) => { m.visible = i === o.smoke; });
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
  if (kind === 'K') { g.add(box(0.06, 0.16, 0.06, M.boot, 0, -0.2, 0), box(0.03, 0.5, 0.12, M.blade, 0, 0.12, 0), sphere(0.5, M.glow, 0, 0, 0)); return g; }
  if (kind === '$') { g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.07, 16), M.coin).rotateX(Math.PI / 2)); return g; }
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.42, 18), M.paper).rotateZ(Math.PI / 2));
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.44, 10), M.card).rotateZ(Math.PI / 2));
  g.add(sphere(0.6, M.glow, 0, 0, 0));
  return g;
}

/* ---------- world loading ---------- */
function spawnEnemies() { // (re)populate the sewers; called on load and every time a run ends
  for (const e of G.enemies) G.group.remove(e.mesh);
  G.enemies = [];
  for (const [kind, i, j] of G.spawns) {
    const m = buildEnemy(kind); G.group.add(m);
    G.enemies.push({ kind, x: i * TS, z: j * TS, h: 0, vx: 0, vz: 0, vh: 0, hp: kind === 'C' ? 1 : kind === 'M' ? 3 : 2, wind: 0, dash: 0, cool: 0, lx: 0, lz: 1, fx: 0, fz: 1, onGround: true, stun: 0, flash: 0, wrap: 0, launch: 0,
      hitBy: 0, timer: (i % 5) * 0.3, home: [i, j], goal: null, from: null, stuck: 0, mesh: m });
  }
}
const revealDistrict = d => G.dmap.forEach((r, j) => r.forEach((v, i) => { if (v === d) G.seen[j][i] = true; }));
function loadWorld() {
  const world = generate(41);
  Object.assign(G, { grid: world.grid, dmap: world.dmap, depot: world.depot, points: world.points, drops: world.drops, fixer: world.fixer, spawns: world.things.filter(t => 'RCBM'.includes(t[0])),
    hunt: null, huntTimer: 60, enemies: [], pickups: [], shots: [], particles: [], seen: world.grid.map(r => r.map(() => false)), offers: [], decoy: null, rings: [], clouds: [],
    orderTimer: 0, lastPoint: -1, banner: null, shake: 0, pocket: 0, heat: 0, runRep: 0, out: false, shopOpen: false });
  G.group = buildWorld(); scene.add(G.group);
  const pm = buildGnome(); G.group.add(pm);
  G.player = { isPlayer: true, x: G.depot.x, z: G.depot.z + 1.2, h: 0, vx: 0, vz: 0, vh: 0, ang: Math.PI, fx: 0, fz: -1, onGround: true, sheets: MAX_SHEETS,
    invuln: 0, knock: 0, attack: 0, cooldown: 0, throwCd: 0, smoke: 0, smokeCd: SMOKES.map(() => 0), swing: 0, dashT: 0, dashCd: 0, combo: 0, comboT: 0, big: false, walk: 0, pkg: null, knife: SAVE.knife, safe: { x: G.depot.x, z: G.depot.z }, mesh: pm };
  for (const [kind, i, j] of world.things) if (kind === 'P' || kind === '$') { const m = buildPickup(kind); G.group.add(m); G.pickups.push({ kind, x: i * TS, z: j * TS, mesh: m }); }
  spawnEnemies();
  SAVE.maps.forEach((own, d) => { if (own) revealDistrict(d); });
  spawnOrder(); spawnOrder();
  camReady = false;
}
/* Orders arrive as offers on the app. Nothing is on the clock until the gnome accepts one. */
function spawnOrder() { // only from districts whose pipe is open
  let free = G.points.map((p, n) => n).filter(n => !G.points[n].order && SAVE.rep >= DISTRICTS[G.points[n].d].rep && !G.offers.some(o => o.n === n));
  if (free.length > 1) free = free.filter(n => n !== G.lastPoint);
  if (!free.length || G.offers.length >= 3) return;
  const n = free[Math.floor(Math.random() * free.length)], need = 3 + Math.floor(Math.random() * 4);
  G.offers.push({ n, need }); G.orderTimer = 0;
  if (G.state === 'play') { G.banner = { text: `App ping: ${G.points[n].name} wants ${need} sheets`, t: 2.4 }; blip(520, 0.08, 'triangle', 200); setTimeout(() => blip(520, 0.08, 'triangle', 200), 140); }
}
const tipOf = pt => Math.round((4 + pt.order.need + Math.ceil(pt.order.bonus)) * DISTRICTS[pt.d].mult);
const heatUp = n => { G.heat = Math.min(100, G.heat + n); };

/* Walking back into the lobby ends the run: the pocket is banked, heat clears, the sewers repopulate. */
function bankRun() {
  const got = G.pocket, rep = G.runRep, before = SAVE.rep;
  SAVE.bank += got; SAVE.rep += rep; G.pocket = 0; G.runRep = 0; G.heat = 0; G.out = false; G.hunt = null; G.huntTimer = 60; save();
  spawnEnemies();
  const opened = DISTRICTS.filter(D => D.rep > before && D.rep <= SAVE.rep);
  if (opened.length) { say(`The ${opened[opened.length - 1].name} pipe is open!  Banked +${got}`, 4); blip(523, 0.12, 'triangle'); setTimeout(() => blip(784, 0.3, 'triangle'), 130); }
  else if (got || rep) { say(`Home safe. Banked +${got} tips${rep ? `, reputation +${rep}` : ''}`, 2.8); blip(660, 0.15, 'triangle', 200); }
}
/* The stores: what is still for sale, in the order the number keys buy it. */
function shopItems() {
  const it = [];
  SMOKES.forEach((k, n) => { if (!SAVE.smokes[n]) it.push({ label: `${k.name}: ${k.hint}`, cost: [0, 20, 35, 50][n], buy: () => { SAVE.smokes[n] = true; G.player.smoke = n; } }); });
  if (SAVE.roll < 2) it.push({ label: `Bigger roll: ${[16, 20][SAVE.roll]} sheets`, cost: [40, 90][SAVE.roll], buy: () => { SAVE.roll++; MAX_SHEETS = [12, 16, 20][SAVE.roll]; G.player.sheets = MAX_SHEETS; } });
  if (!SAVE.knife) it.push({ label: 'Knife: faster, sharper swings', cost: 35, buy: () => { SAVE.knife = G.player.knife = true; } });
  DISTRICTS.forEach((D, d) => { if (!SAVE.maps[d] && SAVE.rep >= D.rep) it.push({ label: `Map of ${D.name}`, cost: 15, buy: () => { SAVE.maps[d] = true; revealDistrict(d); } }); });
  return it;
}
function buyItem(n) {
  const it = shopItems()[n]; if (!it) return;
  if (SAVE.bank < it.cost) { say(`That costs ${it.cost}. The bank holds ${SAVE.bank}.`, 1.8); return; }
  SAVE.bank -= it.cost; it.buy(); save(); say(`Bought: ${it.label}`, 2.2); blip(880, 0.1, 'triangle', 300);
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
    const sr = G.shopRect;
    if (G.state === 'play' && G.shopOpen && sr && x > sr.x && x < sr.x + sr.w && y > sr.y && y < sr.y + sr.n * 24) pressed['n' + Math.floor((y - sr.y) / 24)] = true; // tapping a row in the stores buys it
    else if (G.state === 'play' && x > 12 && x < 234 && y > 60 && y < 98) pressed.swap = true;
    else if (G.state === 'play' && x > 12 && x < 234 && y >= 98 && y < 100 + (G.panelH || 0)) pressed.accept = true; // tapping the order list accepts the next offer
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
/* What a tile is to a given body: rock stops everyone; vents stop creatures and oversized rolls;
   creatures on their feet will not walk into sewage, but can be knocked or hop into it. */
function solid(c, e) {
  if (c === '#') return true;
  if (c === 'L') return !e.isPlayer; // the lobby is for couriers only
  if (c === '1' || c === '2' || c === '3') return !e.isPlayer || SAVE.rep < DISTRICTS[+c].rep; // a pipe gate: shut until the reputation is there
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
  const g = tileAt(e.x, e.z) === '~' && !(e.dashT > 0) ? -Infinity : 0; // a dash skims over sewage
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

/* Attacks aim themselves: the nearest creature in view gets a ring, and whack, wrap and the pipe ring turn to face it. */
function nearestEnemy(range, skipWrapped) {
  const p = G.player; let best = null, bd = range;
  for (const e of G.enemies) { if (e.dead || e.launch || (skipWrapped && e.wrap > 0)) continue; const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd && sight(p.x, p.z, e.x, e.z)) { bd = d; best = e; } }
  return best;
}
function faceTo(e) { const p = G.player; p.ang = Math.atan2(e.x - p.x, e.z - p.z); p.fx = Math.sin(p.ang); p.fz = Math.cos(p.ang); }
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
  const lost = G.pocket; G.pocket = 0; G.runRep = 0; G.heat = 0; G.out = false; G.hunt = null; G.huntTimer = 60; // the pocket is gone; the bank is safe
  if (lost) msg += `, lost the ${lost} tips in your pocket`;
  if (p.pkg) { p.pkg = null; msg += ', package lost'; }
  spawnEnemies();
  Object.assign(p, { x: G.depot.x, z: G.depot.z + 1.2, h: 0, vx: 0, vz: 0, vh: 0, invuln: 2.5, knock: 0, safe: { x: G.depot.x, z: G.depot.z } });
  say(msg, 3.5); blip(160, 0.5, 'sawtooth', -100); G.shake = 0.3;
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
    if (tileAt(p.x, p.z) === 'L') return; // nobody is hunted in the lobby
    if (G.heat < 20) return; // humans only come looking once there is heat
    G.huntTimer -= dt * (G.heat / 35) * (p.pkg ? 1.5 : 1); // hotter means sooner; carrying a package draws attention
    if (G.huntTimer > 0) return;
    h = G.hunt = { x: p.x - p.fx * 4, z: p.z - p.fz * 4, phase: 'track', timer: 1.8, shots: 0, lost: 0, flash: 0 };
    say('A human spotted you! Keep moving, or hide in a vent or smoke', 3.5); blip(90, 0.6, 'sawtooth', 40, 0.07);
  }
  const covered = 'vL'.includes(tileAt(p.x, p.z)) || inCloud(p.x, p.z);
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
    if (d < 1.6 && !covered) knockout('Caught by a human! Dumped at the lobby');
  } else end();
}

function loseSheets(n) {
  const p = G.player;
  G.shake = 0.3;
  if (p.sheets === 0) { knockout('Knocked out! Dragged back to the lobby'); return; } // nothing left to protect you
  p.sheets = Math.max(0, p.sheets - n);
  burst('sheet', p.x, p.h + 0.8, p.z, n * 3);
}

function updatePlayer(dt) {
  const p = G.player;
  let ax = (held.right ? 1 : 0) - (held.left ? 1 : 0) + stickAxis.x, ay = (held.up ? 1 : 0) - (held.down ? 1 : 0) + stickAxis.y;
  const mag = Math.hypot(ax, ay); if (mag > 1) { ax /= mag; ay /= mag; }
  const wx = ax, wz = -ay, wm = Math.hypot(wx, wz); // the camera never turns, so the stick maps straight onto the floor
  p.dashCd -= dt;
  if (p.dashT > 0) { // mid-dash: committed, untouchable, skimming over sewage
    if (Math.random() < dt * 70) burst('smoke', p.x, 0.5, p.z, 1, 0.6);
    if ((p.dashT -= dt) <= 0) { p.vx *= 0.25; p.vz *= 0.25; }
  } else if (p.knock > 0) p.knock -= dt;
  else {
    const k = Math.min(1, dt * 24); // snappy: near-instant start, stop and turn
    if (p.attack > 0) { p.vx *= 0.8; p.vz *= 0.8; } // a swing commits: the step into it plays out, then control returns
    else { p.vx += (wx * RUN - p.vx) * k; p.vz += (wz * RUN - p.vz) * k; }
    if (wm > 0.2 && p.attack <= 0) { p.ang = Math.atan2(wx, wz); p.fx = Math.sin(p.ang); p.fz = Math.cos(p.ang); }
    if (pressed.jump && p.dashCd <= 0) { // dash where the stick points, or the way the gnome faces
      if (wm > 0.2) { p.fx = wx / wm; p.fz = wz / wm; p.ang = Math.atan2(p.fx, p.fz); }
      p.dashT = 0.17; p.dashCd = 0.65; p.vx = p.fx * 27; p.vz = p.fz * 27; p.attack = 0; p.invuln = Math.max(p.invuln, 0.24);
      blip(520, 0.13, 'sawtooth', -320, 0.04); burst('smoke', p.x, 0.4, p.z, 6, 1.6);
    }
  }
  step(p, dt);
  if (p.bump && '123'.includes(p.bump) && !(G.banner && G.banner.vent)) { const D = DISTRICTS[+p.bump]; G.banner = { text: `${D.name} opens at reputation ${D.rep}. You have ${SAVE.rep}.`, t: 2, vent: true }; }
  if (p.bump === 'v' && !(G.banner && G.banner.vent)) G.banner = { text: `Roll too big for the vent: ${VENT_MAX} sheets or fewer`, t: 1.6, vent: true };
  p.walk = p.onGround && Math.hypot(p.vx, p.vz) > 0.8 ? p.walk + dt * 13 : 0;
  const ti = Math.round(p.x / TS), tj = Math.round(p.z / TS), here = tileAt(p.x, p.z);
  if (p.onGround && p.knock <= 0 && here !== '~') p.safe = { x: ti * TS, z: tj * TS };
  // out in the sewers heat creeps up (fast under the High Street); stepping back into the lobby banks the run
  if (here !== 'L') { G.out = true; heatUp(dt * (G.dmap[tj] && G.dmap[tj][ti] === 3 ? 1.1 : 0.12)); }
  else if (G.out) bankRun();
  for (let j = tj - 3; j <= tj + 3; j++) for (let i = ti - 3; i <= ti + 3; i++) if (G.seen[j] && i >= 0 && i < W && Math.hypot(i - ti, j - tj) < 3.4) G.seen[j][i] = true;

  p.cooldown -= dt; p.attack -= dt; p.invuln -= dt; p.throwCd -= dt;
  if ((p.comboT -= dt) <= 0) p.combo = 0;
  if ((pressed.attack || held.attack) && p.cooldown <= 0 && !(p.dashT > 0)) { const tg = nearestEnemy(3.6); if (tg) faceTo(tg); // hold to keep swinging
    p.combo = p.combo % 3 + 1; p.comboT = 0.75; p.big = p.combo === 3; // every third swing in a row is a heavy one
    p.attack = 0.16; p.cooldown = (p.knife ? 0.22 : 0.3) + (p.big ? 0.14 : 0); p.swing++;
    const reach = tg ? Math.hypot(tg.x - p.x, tg.z - p.z) : 0, sp = tg ? Math.max(0, Math.min(18, (reach - 1.3) / 0.1)) : 6; p.vx = p.fx * sp; p.vz = p.fz * sp; // step in, far enough to connect
    blip(p.big ? 140 : 190, 0.09, 'sawtooth', 220, 0.045); }
  if (pressed.wrap && p.throwCd <= 0) {
    if (p.sheets < 1) say('No paper left to throw');
    else { // costs a sheet; leans towards the nearest creature in front
      p.sheets--; p.throwCd = 0.45;
      const tg = nearestEnemy(11, true); if (tg) faceTo(tg);
      const dx = p.fx, dz = p.fz;
      const m = new THREE.Mesh(PGEO.shot, M.paper); m.rotation.y = Math.atan2(dx, dz); scene.add(m);
      G.shots.push({ x: p.x + dx * 0.6, z: p.z + dz * 0.6, vx: dx * 17, vz: dz * 17, life: 0.65, mesh: m });
      blip(700, 0.12, 'triangle', -400, 0.04);
    }
  }
  for (let i = 0; i < SMOKES.length; i++) p.smokeCd[i] -= dt;
  if (pressed.swap) { do { p.smoke = (p.smoke + 1) % SMOKES.length; } while (!SAVE.smokes[p.smoke]); blip(400, 0.05, 'square', 100, 0.03);
    if (SAVE.smokes.filter(Boolean).length === 1) say('Only the cigarette so far. The stores sell more.', 1.8); }
  G.shopOpen = Math.hypot(p.x - G.shop.x, p.z - G.shop.z) < 2.6;
  for (let n = 0; n < 9; n++) if (pressed['n' + n]) { if (G.shopOpen) buyItem(n); else if (n < 4 && SAVE.smokes[n]) p.smoke = n; } // number keys: buy at the stores, pick a smoke elsewhere
  if (pressed.smoke) useSmoke();
  if (pressed.accept) {
    const o = G.offers[0];
    if (!o) say('No orders on the app right now', 1.4);
    else if (G.points.filter(q => q.order).length >= MAX_ACTIVE) say('Three orders on the go is the limit', 1.6);
    else { G.offers.shift(); G.points[o.n].order = { need: o.need, bonus: 8 }; say(`Accepted: ${G.points[o.n].name}, ${o.need} sheets`, 2); blip(660, 0.1, 'triangle', 200); }
  }
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
    else if (k.kind === 'K') { p.knife = SAVE.knife = true; save(); say('Took the knife: faster, sharper swings', 2.2); blip(900, 0.1, 'square', 300, 0.04); }
    else { G.pocket += 2; blip(880, 0.07, 'square', 400, 0.03); }
  }
  // depot restock
  if (Math.hypot(p.x - G.depot.px, p.z - G.depot.pz) < 2.8 && p.sheets < MAX_SHEETS) { p.sheets = MAX_SHEETS; say('Fresh roll loaded'); blip(440, 0.1, 'triangle', 220); }
  // back room: the fixer hands out steroid packages for the gyms. The duct is narrow, so the roll must be slim to post one.
  const fixer = G.fixer; fixer.cool -= dt;
  if (!p.pkg && fixer.cool <= 0 && G.drops.length && Math.hypot(p.x - fixer.x, p.z - fixer.z) < 2) {
    const ok = G.drops.map((dr, n) => n).filter(n => SAVE.rep >= DISTRICTS[G.drops[n].d].rep), n = ok[Math.floor(Math.random() * ok.length)]; p.pkg = { drop: n };
    say(`Steroids for ${G.drops[n].name}, ${DISTRICTS[G.drops[n].d].name}. Post them down the gym duct.`, 3.5); blip(300, 0.15, 'triangle', -100);
    heatUp(15);
  }
  if (p.pkg) {
    const dr = G.drops[p.pkg.drop];
    if (Math.hypot(p.x - dr.x, p.z - dr.z) > 1.7 || !p.onGround) dr.warned = false;
    else if (p.sheets > VENT_MAX) { if (!dr.warned) { dr.warned = true; say(`The duct is tight: ${VENT_MAX} sheets or fewer to post it`, 2.4); } }
    else { p.pkg = null; G.pocket += dr.pay; G.runRep += 2; heatUp(20); fixer.cool = 8; burst('star', dr.x, 1.5, dr.z, 16, 4); say(`Package posted to ${dr.name}  +${dr.pay} in your pocket`, 2.6);
      blip(392, 0.12, 'triangle'); setTimeout(() => blip(587, 0.25, 'triangle'), 120); }
  }
  // deliveries
  for (const pt of G.points) {
    const o = pt.order; if (!o) continue;
    o.bonus = Math.max(0, o.bonus - dt / 10);
    if (Math.hypot(p.x - pt.x, p.z - pt.z) > 1.7 || !p.onGround) { o.warned = false; continue; }
    if (p.sheets < o.need) { if (!o.warned) { o.warned = true; say(`${pt.name} needs ${o.need} sheets. You have ${p.sheets}.`, 2.4); } continue; }
    const tip = tipOf(pt);
    p.sheets -= o.need; G.pocket += tip; G.runRep++; heatUp(12); pt.order = null; G.lastPoint = G.points.indexOf(pt);
    burst('star', pt.x, 1.5, pt.z, 14, 4); burst('sheet', pt.x, 1.5, pt.z, 6, 3);
    say(`Delivered to ${pt.name}  +${tip} in your pocket`, 2.4);
    blip(523, 0.12, 'triangle'); setTimeout(() => blip(659, 0.12, 'triangle'), 110); setTimeout(() => blip(784, 0.25, 'triangle'), 220);
    if (!G.points.some(q => q.order) && !G.offers.length) spawnOrder();
  }
}

function defeat(e, tip) {
  if (e.dead) return;
  if (e.kind === 'M' && !G.player.knife) { const m = buildPickup('K'); G.group.add(m); G.pickups.push({ kind: 'K', x: e.x, z: e.z, mesh: m }); } // mob gnomes drop their knife
  e.dead = true; burst('poof', e.x, e.h + 0.4, e.z, 10, 3.5); if (e.wrap || e.launch) burst('sheet', e.x, 0.6, e.z, 5, 3); G.pocket += tip; if (e.kind === 'M') heatUp(4); }
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
    const whacked = p.attack > 0 && e.hitBy !== p.swing && d < 2.6 && Math.abs(e.h - p.h) < 1.6 && (d < 0.9 || (-dx * p.fx - dz * p.fz) / d > 0.15);
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
      const spotted = !(e.mellow > 0) && (lured || (!inCloud(p.x, p.z) && d < 7.5 + G.heat * 0.035 && sight(e.x, e.z, p.x, p.z))); // heat sharpens them
      e.alert = spotted ? Math.min(1.6, (e.alert || 0) + dt) : Math.max(0, (e.alert || 0) - dt * 0.6);
      const sees = spotted && (lured || e.alert > 0.9 - G.heat * 0.006);
      if (e.kind === 'B') { // clogling: sits, then hops at the gnome
        if (e.onGround) { e.vx = e.vz = 0; if (e.timer > 2.2 && sees) { e.timer = 0; e.vx = tx / td * 3.4; e.vz = tz / td * 3.4; e.vh = 8.5; e.fx = tx / td; e.fz = tz / td; } }
      } else {
        let wx = 0, wz = 0;
        const speed = e.kind === 'R' ? [1.3, 2.6] : e.kind === 'M' ? [1.5, 3.0] : [2.4, 3.6];
        if (sees) { const hot = 1 + G.heat * 0.003; wx = tx / td * speed[1] * hot; wz = tz / td * speed[1] * hot; if (e.kind === 'C') { wx += Math.sin(e.timer * 9) * 2 * tz / td; wz -= Math.sin(e.timer * 9) * 2 * tx / td; } e.goal = null; }
        else { // wander tile to tile
          const ti = Math.round(e.x / TS), tj = Math.round(e.z / TS);
          if (!e.goal || Math.hypot(e.goal[0] * TS - e.x, e.goal[1] * TS - e.z) < 0.25 || (e.stuck += dt) > 3) {
            let opts = DIRS.map(([a, b]) => [ti + a, tj + b]).filter(([a, b]) => G.grid[b] && G.grid[b][a] === '.');
            if (e.kind === 'M') { const near = opts.filter(([a, b]) => Math.abs(a - e.home[0]) + Math.abs(b - e.home[1]) <= 2 + Math.floor(G.heat / 30)); if (near.length) opts = near; } // the mob stays by its den
            const fresh = opts.filter(([a, b]) => !e.from || a !== e.from[0] || b !== e.from[1]); if (fresh.length) opts = fresh;
            e.from = [ti, tj]; e.goal = opts.length ? opts[Math.floor(Math.random() * opts.length)] : [ti, tj]; e.stuck = 0;
          }
          const gx = e.goal[0] * TS - e.x, gz = e.goal[1] * TS - e.z, gd = Math.hypot(gx, gz) || 1; wx = gx / gd * speed[0]; wz = gz / gd * speed[0];
        }
        e.vx = wx; e.vz = wz;
        if (e.kind === 'M' || e.kind === 'R') { // lunge: stop, wind up (red ring), then dash. The wind-up is the moment to dash clear or hit first.
          e.cool -= dt;
          if (e.dash > 0) { e.dash -= dt; e.vx = e.lx * (e.kind === 'M' ? 10 : 8.5); e.vz = e.lz * (e.kind === 'M' ? 10 : 8.5); wx = e.lx; wz = e.lz; }
          else if (e.wind > 0) { e.vx = e.vz = 0; wx = e.lx; wz = e.lz; if ((e.wind -= dt) <= 0) { e.dash = 0.22; blip(520, 0.08, 'sawtooth', 300, 0.04); } }
          else if (sees && td < 2.6 && e.cool <= 0) { e.wind = 0.65; e.cool = 2.8; e.lx = tx / td; e.lz = tz / td; e.vx = e.vz = 0; }
        }
        if (Math.hypot(wx, wz) > 0.3) { e.fx = wx / Math.hypot(wx, wz); e.fz = wz / Math.hypot(wx, wz); }
      }
    }
    step(e, dt);
    if (e.h < -0.7) { e.dead = true; burst('splash', e.x, -0.3, e.z, 8, 4); G.pocket += 1; continue; }
    if (whacked) {
      const kb = p.big ? 13 : 4.5; // light hits keep it in reach, the heavy one sends it flying // impact: a beat of freeze, a shake, sparks, and the creature thrown back
      e.hitBy = p.swing; e.hp -= (p.knife ? 2 : 1) + (p.big ? 1 : 0); e.wind = e.dash = 0; e.flash = 0.18; e.stun = p.big ? 0.6 : 0.4; e.vx = -dx / d * kb + p.fx * 3; e.vz = -dz / d * kb + p.fz * 3; e.vh = p.big ? 6.5 : 4.5; e.onGround = false;
      G.hitstop = p.big ? 0.09 : 0.05; G.shake = Math.max(G.shake, p.big ? 0.28 : 0.13); burst('star', e.x, 0.7, e.z, p.big ? 9 : 4, 3.5);
      blip(p.big ? 90 : 120, p.big ? 0.16 : 0.1, 'square', -40, 0.07);
      if (e.hp <= 0) defeat(e, 1);
    } else if (p.invuln <= 0 && e.stun <= 0 && !(e.mellow > 0) && d < 0.9 && Math.abs(e.h - p.h) < 1.1 && (e.kind === 'C' || e.kind === 'B' || e.dash > 0)) { // rats and the mob only hurt on a lunge
      p.invuln = 1.2; p.knock = 0.25; p.vx = dx / d * 7; p.vz = dz / d * 7; p.vh = 5.5;
      blip(200, 0.2, 'sawtooth', -120, 0.06);
      if (e.kind === 'M' && p.pkg) { p.pkg = null; say('The mob took the package!', 2.4); }
      loseSheets(e.kind === 'M' ? 3 : e.kind === 'C' ? 1 : 2);
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
    if (go) { G.state = 'brief'; G.t = 0; }
  } else if (G.state === 'brief') {
    if (go && G.t > 0.3) { G.state = 'play'; pressed.jump = false; const p = G.player; p.ang = Math.PI; p.fx = 0; p.fz = -1; }
  } else if (G.state === 'play') {
    if (G.hitstop > 0) { G.hitstop -= dt; dt = 0.0001; } // freeze-frame on impact
    G.clock += dt; G.orderTimer += dt;
    if (G.orderTimer > 14) spawnOrder();
    updatePlayer(dt);
    if (G.state === 'play') { updateDecoy(dt); updateSmokes(dt); updateHunt(dt); if (G.state === 'play') updateEnemies(dt); }
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
    e.mesh.scale.setScalar(e.flash > 0 ? 1.3 : e.wind > 0 ? 1 + Math.sin(t * 30) * 0.06 : 1);
    d.warn.visible = e.wind > 0; if (e.wind > 0) d.warn.scale.setScalar(1.6 - e.wind);
    if (d.tail) d.tail.rotation.z = Math.sin(t * 7 + e.x) * 0.4;
    if (d.mob) { const w = Math.hypot(e.vx, e.vz) > 0.5 ? Math.sin(e.timer * 11) : 0; d.mob.bootL.position.z = 0.05 + w * 0.2; d.mob.bootR.position.z = 0.05 - w * 0.2;
      d.mob.arm.rotation.x = e.wind > 0 ? -2.3 : e.dash > 0 ? 1.5 : 0.35; }
    if (d.legs) d.legs.forEach((l, i) => { l.rotation.y = Math.sin(t * 30 + i * 2) * 0.35; });
    if (d.blob) { const q = e.onGround ? 1 + Math.sin(t * 5 + e.x) * 0.07 : 1.2; d.blob.scale.set(1 / q, q, 1 / q); }
  }
  for (const k of G.pickups) { k.mesh.position.set(k.x, 0.75 + Math.sin(t * 3 + k.x) * 0.12, k.z); k.mesh.rotation.y = t * 2; }
  for (const pt of G.points) { const on = !!pt.order; pt.beam.visible = pt.ring.visible = on; pt.tag.visible = on; pt.tag.position.y = 2.6 + (on ? Math.sin(t * 3) * 0.15 : 0); }
  for (const c of G.npcs) { c.mesh.position.y = c.y + Math.sin(t * 2 + c.n) * 0.02; c.mesh.userData.torso.rotation.z = Math.sin(t * 0.7 + c.n * 2) * 0.05;
    if (c.smokes && Math.random() < dt * 0.5) burst('smoke', c.x + Math.sin(c.mesh.rotation.y) * 0.5, c.y + 0.95, c.z + Math.cos(c.mesh.rotation.y) * 0.5, 1, 0.5); }
  G.drops.forEach((dr, n) => { dr.beam.visible = dr.ring.visible = dr.tag.visible = !!p.pkg && p.pkg.drop === n; });
  G.fixer.ring.visible = !p.pkg && G.fixer.cool <= 0;
  G.gates.forEach((gate, d) => { if (gate) gate.visible = SAVE.rep < DISTRICTS[d].rep; });
  const hu = G.state === 'play' ? G.hunt : null;
  HUNT.ring.visible = !!hu && hu.phase !== 'slam'; HUNT.beam.visible = !!hu && hu.flash > 0; HUNT.hand.visible = !!hu && (hu.phase === 'grab' || hu.phase === 'slam');
  if (hu) {
    HUNT.ring.position.set(hu.x, 0.06, hu.z); HUNT.ring.scale.setScalar((hu.phase === 'grab' ? 1.5 : 1) * (1 + Math.sin(t * 12) * 0.06));
    HUNT.ring.material.color.setHex(hu.phase === 'lock' ? 0xff3020 : hu.phase === 'grab' ? 0xff8a30 : 0xffd24a);
    HUNT.beam.position.set(hu.x, 9, hu.z); HUNT.hand.position.set(hu.x, hu.phase === 'slam' ? 0.5 : 0.5 + 13 * Math.max(0, hu.timer) / 1.1, hu.z);
  }
  const tg = G.state === 'play' ? nearestEnemy(9) : null; TARGET.visible = !!tg;
  if (tg) { TARGET.position.set(tg.x, 0.06, tg.z); TARGET.scale.setScalar(1 + Math.sin(t * 8) * 0.08); }
  M.glow.opacity = 0.22 + 0.08 * Math.sin(t * 4);
  M.ventLamp.color.setHex(p.sheets <= VENT_MAX ? 0x58e070 : 0xff4030);
  M.sewage.map.offset.y = -t * 0.25;
  lantern.position.set(p.x, 3.2, p.z);
  SLASH.visible = p.attack > 0 && G.state === 'play';
  if (SLASH.visible) { const f = 1 - p.attack / 0.16; SLASH.position.set(p.x, 0.75, p.z); SLASH.rotation.y = p.ang; SLASH.scale.setScalar((p.big ? 1.4 : 1) * (0.85 + f * 0.3)); SLASH.children[0].material.opacity = 0.85 * (1 - f); }
  // top-down action camera: one fixed angle that never turns, leading a little in the direction of travel
  if (G.state === 'title') { tmpA.set(p.x + 1.6, 1.8, p.z + 3.0); tmpB.set(p.x, 0.95, p.z); p.ang = 0.5; }
  else {
    const cf = camera.aspect < 1 ? 1.15 : 1, lk = Math.min(1, dt * 3), cl = v => Math.max(-1.8, Math.min(1.8, v * 0.22));
    camLead.x += (cl(p.vx) - camLead.x) * lk; camLead.z += (cl(p.vz) - camLead.z) * lk;
    tmpA.set(p.x + camLead.x, 11 * cf, p.z + 6.4 * cf + camLead.z); tmpB.set(p.x + camLead.x, 0.5, p.z - 0.4 + camLead.z);
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

function drawMap(x0, y0, c) {
  const p = G.player, t = now();
  panel(x0 - 6, y0 - 6, W * c + 12, H * c + 12);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const ch = G.grid[j][i]; if (!G.seen[j][i] || ch === '#') continue;
    ctx.fillStyle = ch === '~' ? '#8aa63c' : ch === 'v' ? '#d5dcdc' : ch === 'L' ? '#a9793f' : '123'.includes(ch) && SAVE.rep < DISTRICTS[+ch].rep ? '#d8432f' : (DISTRICTS[G.dmap[j][i]] || DISTRICTS[0]).tint; ctx.fillRect(x0 + i * c, y0 + j * c, c, c);
  }
  ctx.fillStyle = '#ffe27a'; ctx.fillRect(x0 + (G.depot.i - 2) * c, y0 + (G.depot.j - 2) * c, c, c); // roll pallet
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const pt of G.points) {
    const px = x0 + (pt.i + 0.5) * c, py = y0 + (pt.j + 0.5) * c;
    if (pt.order) { ctx.fillStyle = '#d8432f'; ctx.beginPath(); ctx.arc(px, py, c * 0.9 + Math.sin(t * 5) * 1.2, 0, 7); ctx.fill(); text(pt.letter, px, py + 0.5, `${c * 1.3}px ${DISPLAY}`, '#f3efe2'); }
    else if (G.offers.some(o => G.points[o.n] === pt)) { ctx.strokeStyle = '#d8432f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, c * 0.8, 0, 7); ctx.stroke(); text(pt.letter, px, py + 0.5, `${c * 1.2}px ${DISPLAY}`, '#f3efe2'); }
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
  const st = 180 / MAX_SHEETS;
  for (let i = 0; i < MAX_SHEETS; i++) { ctx.fillStyle = i < p.sheets ? '#f7f4ea' : 'rgba(247,244,234,0.15)'; ctx.fillRect(48 + i * st, 18, st - 3, 18); }
  const fits = p.sheets <= VENT_MAX, vx = 48 + VENT_MAX * st - 1.5;
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
  const orders = G.points.filter(q => q.order), offers = G.offers, ow = 222, quiet = !orders.length && !offers.length, slots = orders.length + offers.length + (quiet ? 1 : 0);
  G.panelH = 42 + (slots + 1) * 22; panel(12, 64, ow, G.panelH);
  // money and heat: the pocket is at risk until it is walked home
  ctx.textAlign = 'left'; text(`Pocket ${G.pocket}`, 22, 78, `14px ${DISPLAY}`, '#ffe27a');
  ctx.textAlign = 'right'; text(`Bank ${SAVE.bank}`, 12 + ow - 10, 78, `14px ${DISPLAY}`, '#f3efe2');
  ctx.textAlign = 'left'; text('HEAT', 22, 95, `800 10px ${BODY}`, '#8fa9a2');
  ctx.fillStyle = 'rgba(247,244,234,0.15)'; ctx.fillRect(56, 92, ow - 54, 6);
  ctx.fillStyle = G.heat < 35 ? '#8fb26a' : G.heat < 70 ? '#e2b23c' : '#d8432f'; ctx.fillRect(56, 92, (ow - 54) * G.heat / 100, 6);
  ctx.fillStyle = '#f3efe2'; ctx.fillRect(56 + (ow - 54) * 0.2, 90, 1.5, 10); // humans start looking past this mark
  if (quiet) { ctx.textAlign = 'left'; text('No pings yet. Hang about.', 22, 117, `600 12px ${BODY}`, '#8fa9a2'); }
  const short = s => s.length > 17 ? s.slice(0, 16) + '…' : s;
  orders.forEach((pt, n) => { // accepted
    const y = 117 + n * 22, ok = p.sheets >= pt.order.need;
    ctx.fillStyle = '#d8432f'; ctx.beginPath(); ctx.arc(30, y, 8, 0, 7); ctx.fill();
    ctx.textAlign = 'center'; text(pt.letter, 30, y + 0.5, `11px ${DISPLAY}`, '#f3efe2');
    ctx.textAlign = 'left'; text(short(pt.name), 44, y, `800 12px ${BODY}`, '#f3efe2');
    ctx.textAlign = 'right'; text(`${pt.order.need} sheets`, 12 + ow - 34, y, `800 12px ${BODY}`, ok ? '#58e070' : '#e2b23c');
    text(`+${tipOf(pt)}`, 12 + ow - 10, y, `800 12px ${BODY}`, '#ffe27a');
  });
  offers.forEach((o, n) => { // on the app, not yet accepted: the first one is taken with F or a tap
    const pt = G.points[o.n], y = 117 + (orders.length + n) * 22;
    ctx.strokeStyle = '#d8432f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(30, y, 7.5, 0, 7); ctx.stroke();
    ctx.textAlign = 'center'; text(pt.letter, 30, y + 0.5, `11px ${DISPLAY}`, '#f3efe2');
    ctx.textAlign = 'left'; text(short(pt.name), 44, y, `600 12px ${BODY}`, '#a9bcb6');
    ctx.textAlign = 'right'; text(`${o.need} sheets`, 12 + ow - 34, y, `600 12px ${BODY}`, '#a9bcb6');
    if (n === 0) { ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.roundRect(12 + ow - 28, y - 8, 18, 16, 4); ctx.fill(); ctx.textAlign = 'center'; text('F', 12 + ow - 19, y + 0.5, `11px ${DISPLAY}`, '#10201f'); }
  });
  { // the back-room job, always the last row
    const y = 117 + slots * 22;
    ctx.fillStyle = '#8a4fd0'; ctx.beginPath(); ctx.arc(30, y, 8, 0, 7); ctx.fill();
    ctx.textAlign = 'center'; text('$', 30, y + 0.5, `11px ${DISPLAY}`, '#f3efe2');
    ctx.textAlign = 'left'; text(p.pkg ? `Steroids: ${G.drops[p.pkg.drop].name}` : G.fixer.cool <= 0 ? 'Back room has a package' : 'Back room: come back soon', 44, y, `800 12px ${BODY}`, p.pkg ? '#d9c2ff' : '#b79be0');
    if (p.pkg) { ctx.textAlign = 'right'; text(`+${G.drops[p.pkg.drop].pay}`, 12 + ow - 10, y, `800 12px ${BODY}`, '#ffe27a'); }
  }
  ctx.restore();
  const c = narrow ? 5 : 7; drawMap(LW - W * c - 18, 18, c);
  if (!G.hunt) { const dn = G.dmap[Math.round(p.z / TS)][Math.round(p.x / TS)], hw = W * c + 12, hx = LW - W * c - 24, hy = 18 + H * c + 12; // where you are
    panel(hx, hy, hw, 24); ctx.textAlign = 'center'; text(dn < 0 ? `Lobby · reputation ${SAVE.rep}` : DISTRICTS[dn].name, hx + hw / 2, hy + 13, `${narrow ? 10 : 13}px ${DISPLAY}`, '#f3efe2'); }
  if (G.shopOpen) { // the stores
    const items = shopItems(), w = Math.min(340, LW - 24), x = LW / 2 - w / 2, h = 62 + Math.max(1, items.length) * 24, y = Math.max(narrow ? 250 : 90, LH / 2 - h / 2), next = DISTRICTS.find(D => D.rep > SAVE.rep);
    ctx.fillStyle = '#f3efe2'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
    ctx.textAlign = 'left'; text('Stores', x + 14, y + 20, `20px ${DISPLAY}`, '#10201f'); ctx.textAlign = 'right'; text(`Bank ${SAVE.bank}`, x + w - 14, y + 20, `16px ${DISPLAY}`, '#d8432f');
    ctx.textAlign = 'left'; text(`Reputation ${SAVE.rep}` + (next ? ` · ${next.name} opens at ${next.rep}` : ' · every pipe is open'), x + 14, y + 40, `600 11px ${BODY}`, '#5b6f6a');
    G.shopRect = { x, y: y + 50, w, n: items.length };
    if (!items.length) text('Sold out. Nice work.', x + 14, y + 64, `800 13px ${BODY}`, '#10201f');
    items.forEach((it, n) => { const ry = y + 62 + n * 24, can = SAVE.bank >= it.cost;
      ctx.fillStyle = '#10201f'; ctx.beginPath(); ctx.roundRect(x + 12, ry - 9, 18, 18, 4); ctx.fill(); ctx.textAlign = 'center'; text(String(n + 1), x + 21, ry + 0.5, `12px ${DISPLAY}`, '#f3efe2');
      ctx.textAlign = 'left'; text(it.label, x + 38, ry, `800 13px ${BODY}`, can ? '#10201f' : '#8a938f'); ctx.textAlign = 'right'; text(String(it.cost), x + w - 14, ry, `15px ${DISPLAY}`, can ? '#2e8b47' : '#b0563f'); });
  }
  if (G.hunt) { const hw = W * c + 12, hx = LW - W * c - 24, hy = 18 + H * c + 12;
    ctx.fillStyle = Math.floor(now() * 4) % 2 ? '#d8432f' : '#a52f20'; ctx.beginPath(); ctx.roundRect(hx, hy, hw, 26, 8); ctx.fill();
    ctx.textAlign = 'center'; text(G.hunt.phase === 'grab' || G.hunt.phase === 'slam' ? 'HAND COMING DOWN' : 'HUMAN ABOVE', hx + hw / 2, hy + 14, `${narrow ? 11 : 14}px ${DISPLAY}`, '#f3efe2'); }
  { // a line of chat from the nearest courier in the lobby
    let best = null, bd = 4.5; for (const c of G.npcs) { const dd = Math.hypot(c.x - p.x, c.z - p.z); if (dd < bd) { bd = dd; best = c; } }
    if (best) { const v = tmpB.set(best.x, best.y + 2.1, best.z).project(camera);
      if (v.z < 1 && Math.abs(v.x) < 0.95) { const line = NPC_LINES[(best.n + Math.floor(now() / 6)) % NPC_LINES.length], sx = (v.x * 0.5 + 0.5) * LW, sy = Math.max(30, (-v.y * 0.5 + 0.5) * LH);
        ctx.font = `800 12px ${BODY}`; const bw = ctx.measureText(line).width + 20; ctx.fillStyle = '#f3efe2'; ctx.beginPath(); ctx.roundRect(sx - bw / 2, sy - 13, bw, 26, 9); ctx.fill();
        ctx.textAlign = 'center'; text(line, sx, sy + 1, `800 12px ${BODY}`, '#10201f'); } }
  }
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
  } else if (G.state === 'play') {
    const vg = ctx.createRadialGradient(LW / 2, LH / 2, Math.min(LW, LH) * 0.42, LW / 2, LH / 2, Math.max(LW, LH) * 0.72); // darkness at the edges of the lantern light
    vg.addColorStop(0, 'rgba(4,10,10,0)'); vg.addColorStop(1, 'rgba(4,10,10,0.7)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, LW, LH);
    drawHUD();
  }
  else if (G.state === 'brief') ticket(384, (cx, y, w) => {
    const body = `600 ${w < 440 ? 12 : 14}px ${BODY}`, lines = [
      ['Orders ping your app. Accept with F or tap the list.', '#10201f'],
      ['Tips go in your pocket. They only count once you walk', '#10201f'],
      ['back into the lobby. Get knocked out and they are gone.', '#5b6f6a'],
      ['Every drop adds heat: sharper creatures, then humans.', '#10201f'],
      ['Heat clears when you come home. One more, or bank it?', '#5b6f6a'],
      ['Your roll is cargo, health and ammo. Reload at the pallet.', '#10201f'],
      [`Vents are shortcuts, but only fit ${VENT_MAX} sheets or fewer.`, '#5b6f6a'],
      ['Spend banked tips at the stores in the lobby corner.', '#10201f'],
      ['Reputation opens the gated pipes: mob, flood, high street.', '#5b6f6a'],
      ['Attacks aim at the ringed creature; every third swing', '#10201f'],
      ['hits hard. Dash crosses sewage and dodges a red-ring lunge.', '#5b6f6a']];
    text('HOW THE JOB WORKS', cx, y + 32, `800 13px ${BODY}`, '#d8432f');
    text('The Lobby', cx, y + 64, `34px ${DISPLAY}`, '#10201f');
    lines.forEach(([s, col], n) => s && text(s, cx, y + 104 + n * 20, body, col));
  });
}

let last = performance.now();
function frame(t) {
  const dt = Math.min(1 / 30, (t - last) / 1000);
  last = t;
  update(dt);
  present(dt);
  overlay();
  requestAnimationFrame(frame);
}
// Signs are painted onto textures once, so wait (briefly) for the display font before building the world.
const fontReady = document.fonts && document.fonts.load ? Promise.race([document.fonts.load('20px "Lilita One"'), new Promise(r => setTimeout(r, 1500))]) : Promise.resolve();
fontReady.catch(() => {}).then(() => { loadWorld(); resize(); last = performance.now(); requestAnimationFrame(frame); });
})();
