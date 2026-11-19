/* Gnome Delivery Service — prototype.
   Side-scrolling sewer run: carry the roll to the customer's pipe before they give up.
   The roll on the gnome's back is both the cargo and the health bar. */
(() => {
'use strict';

const T = 32, VW = 960, VH = 540;
const GRAV = 1800, RUN = 230, JUMP = 650;
const MAX_SHEETS = 12;
const DISPLAY = '"Lilita One", "Arial Rounded MT Bold", sans-serif';
const BODY = 'Nunito, system-ui, sans-serif';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const SCALE = Math.min(2, window.devicePixelRatio || 1);
canvas.width = VW * SCALE;
canvas.height = VH * SCALE;

/* ---------- levels ----------
   ground: [x0, x1, topRow] solid from topRow down. Anything not covered is a sewage pit.
   plats:  [x0, x1, row] floating pipe sections.
   things: [kind, x, row]  G gnome, R rat, C cockroach, B clogling, P spare paper, T customer pipe. */
const LEVELS = [
  { name: 'The Main Drain', customer: 'Apartment 3B', note: 'There is NO paper. Hurry!!', time: 45, w: 76, h: 17,
    ground: [[1, 18, 13], [22, 34, 13], [35, 44, 11], [48, 58, 13], [63, 74, 13]],
    plats: [[52, 56, 10], [60, 61, 12]],
    things: [['G', 3, 12], ['R', 27, 12], ['C', 39, 10], ['R', 52, 12], ['P', 54, 9], ['C', 67, 12], ['T', 72, 12]] },
  { name: 'The U-Bend', customer: 'Café Bruma, staff toilet', note: 'Customer waiting. Roll holder is empty.', time: 55, w: 90, h: 20,
    ground: [[1, 12, 16], [16, 24, 16], [25, 30, 14], [31, 36, 12], [40, 50, 12], [51, 62, 16], [66, 76, 16], [77, 88, 14]],
    plats: [[54, 57, 13]],
    things: [['G', 3, 15], ['P', 10, 15], ['C', 19, 15], ['R', 27, 13], ['B', 33, 11], ['R', 44, 11], ['C', 47, 11],
      ['B', 59, 15], ['P', 55, 12], ['R', 70, 15], ['C', 73, 15], ['B', 81, 13], ['T', 86, 13]] },
  { name: 'The Grease Trap', customer: 'Night bus depot', note: 'Forty drivers. One cubicle. Zero rolls.', time: 65, w: 100, h: 20,
    ground: [[1, 8, 16], [12, 14, 16], [18, 20, 16], [24, 36, 16], [37, 42, 14], [55, 68, 14], [69, 80, 16], [84, 89, 16], [90, 98, 14]],
    plats: [[45, 47, 13], [50, 52, 12]],
    things: [['G', 3, 15], ['P', 19, 15], ['R', 26, 15], ['C', 30, 15], ['B', 33, 15], ['R', 39, 13], ['P', 46, 12], ['P', 51, 11],
      ['C', 58, 13], ['R', 62, 13], ['B', 65, 13], ['C', 72, 15], ['R', 76, 15], ['B', 86, 15], ['C', 87, 15], ['R', 93, 13], ['T', 96, 13]] },
];

/* ---------- state ---------- */
const G = {
  state: 'title', levelIndex: 0, tips: 0, t: 0,
  grid: null, w: 0, h: 0, level: null,
  player: null, enemies: [], pickups: [], particles: [], exit: null,
  timeLeft: 0, cam: { x: 0, y: 0 }, shake: 0, result: null, banner: null,
};
window.__gds = G;

function loadLevel(i) {
  const L = LEVELS[i];
  const grid = [];
  for (let y = 0; y < L.h; y++) {
    const row = new Array(L.w).fill(y >= L.h - 2 ? '~' : ' ');
    row[0] = row[L.w - 1] = '#';
    if (y === 0) row.fill('#');
    grid.push(row);
  }
  for (const [x0, x1, top] of L.ground) for (let y = top; y < L.h; y++) for (let x = x0; x <= x1; x++) grid[y][x] = '#';
  for (const [x0, x1, y] of L.plats) for (let x = x0; x <= x1; x++) grid[y][x] = '=';
  Object.assign(G, { level: L, grid, w: L.w, h: L.h, enemies: [], pickups: [], particles: [], timeLeft: L.time, banner: null, shake: 0 });
  for (const [kind, tx, ty] of L.things) {
    const cx = tx * T + T / 2, foot = (ty + 1) * T;
    if (kind === 'G') {
      G.player = { x: cx - 9, y: foot - 28.01, w: 18, h: 28, vx: 0, vy: 0, dir: 1, onGround: false, sheets: MAX_SHEETS,
        invuln: 0, knock: 0, attack: 0, cooldown: 0, swing: 0, coyote: 0, jbuf: 0, walk: 0, safe: { x: cx - 9, y: foot - 28.01 } };
    } else if (kind === 'P') {
      G.pickups.push({ x: cx, y: foot - 14, taken: false });
    } else if (kind === 'T') {
      G.exit = { x: tx * T, y: ty * T, tx, ty };
    } else {
      const spec = { R: { w: 28, h: 16, hp: 2, speed: 60 }, C: { w: 20, h: 10, hp: 1, speed: 130 }, B: { w: 24, h: 22, hp: 2, speed: 0 } }[kind];
      G.enemies.push({ kind, x: cx - spec.w / 2, y: foot - spec.h - 0.01, w: spec.w, h: spec.h, hp: spec.hp, speed: spec.speed,
        vx: 0, vy: 0, dir: tx % 2 ? 1 : -1, onGround: false, stun: 0, flash: 0, hitBy: 0, timer: (tx % 5) * 0.3 });
    }
  }
  snapCamera();
}

/* ---------- input ---------- */
const held = {}, pressed = {};
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  KeyX: 'attack', KeyJ: 'attack', KeyK: 'attack', Enter: 'confirm' };
function press(k) { if (!held[k]) pressed[k] = true; held[k] = true; audioInit(); }
function release(k) { held[k] = false; }
addEventListener('keydown', e => { const k = KEYMAP[e.code]; if (k) { press(k); e.preventDefault(); } });
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) release(k); });
addEventListener('blur', () => { for (const k in held) held[k] = false; });
canvas.addEventListener('pointerdown', () => { pressed.confirm = true; audioInit(); });
for (const b of document.querySelectorAll('[data-key]')) {
  const k = b.dataset.key;
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); press(k); });
  for (const ev of ['pointerup', 'pointercancel']) b.addEventListener(ev, () => { b.classList.remove('on'); release(k); });
  b.addEventListener('contextmenu', e => e.preventDefault());
}

/* ---------- sound (tiny synth blips) ---------- */
let ac = null;
function audioInit() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = false; } } }
function blip(freq, dur, type = 'square', slide = 0, vol = 0.05) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
}

/* ---------- physics ---------- */
function tile(tx, ty) {
  if (tx < 0 || tx >= G.w || ty < 0) return '#';
  if (ty >= G.h) return '~';
  return G.grid[ty][tx];
}
const solid = (tx, ty) => { const c = tile(tx, ty); return c === '#' || c === '='; };
const solidAt = (px, py) => solid(Math.floor(px / T), Math.floor(py / T));
function collides(e) {
  const x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w) / T), y0 = Math.floor(e.y / T), y1 = Math.floor((e.y + e.h) / T);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solid(x, y)) return true;
  return false;
}
function move(e, dt) {
  e.hitWall = false;
  e.x += e.vx * dt;
  if (collides(e)) {
    e.x = e.vx > 0 ? Math.floor((e.x + e.w) / T) * T - e.w - 0.01 : (Math.floor(e.x / T) + 1) * T + 0.01;
    e.vx = 0; e.hitWall = true;
  }
  e.y += e.vy * dt;
  e.onGround = false;
  if (collides(e)) {
    if (e.vy > 0) { e.y = Math.floor((e.y + e.h) / T) * T - e.h - 0.01; e.onGround = true; }
    else e.y = (Math.floor(e.y / T) + 1) * T + 0.01;
    e.vy = 0;
  }
}
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inWater = e => tile(Math.floor((e.x + e.w / 2) / T), Math.floor((e.y + e.h - 4) / T)) === '~';

function burst(type, x, y, n, speed = 160) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    G.particles.push({ type, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.5, life: 0.5 + Math.random() * 0.6, rot: a });
  }
}

function loseSheets(n) {
  const p = G.player;
  p.sheets = Math.max(0, p.sheets - n);
  burst('sheet', p.x + p.w / 2, p.y + 6, n * 3);
  G.shake = 0.25;
  if (p.sheets === 0) finish(false, 'The roll is gone. Nothing left to deliver.');
}

function finish(ok, text) {
  if (G.state !== 'play') return;
  const p = G.player, L = G.level;
  if (ok) {
    const stars = 1 + (p.sheets >= MAX_SHEETS * 0.6 ? 1 : 0) + (G.timeLeft >= L.time * 0.35 ? 1 : 0);
    const tip = stars * 5 + p.sheets;
    G.tips += tip;
    G.result = { ok, stars, tip, text: ['', 'Is this… damp? One star.', 'A bit crumpled, but it will do.', 'Five stars. You saved my life.'][stars] };
    G.state = 'delivered';
    blip(523, 0.12, 'triangle'); setTimeout(() => blip(659, 0.12, 'triangle'), 110); setTimeout(() => blip(784, 0.25, 'triangle'), 220);
  } else {
    G.result = { ok, text };
    G.state = 'failed';
    blip(220, 0.5, 'sawtooth', -150);
  }
  G.t = 0;
}

function updatePlayer(dt) {
  const p = G.player;
  const ax = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  if (p.knock > 0) p.knock -= dt;
  else {
    p.vx += (ax * RUN - p.vx) * Math.min(1, dt * 14);
    if (ax) p.dir = ax;
  }
  p.coyote = p.onGround ? 0.1 : p.coyote - dt;
  p.jbuf = pressed.jump ? 0.12 : p.jbuf - dt;
  if (p.jbuf > 0 && p.coyote > 0) { p.vy = -JUMP; p.jbuf = 0; p.coyote = 0; blip(330, 0.12, 'square', 220, 0.03); }
  if (!held.jump && p.vy < 0) p.vy += GRAV * dt * 1.4; // release early for a short hop
  p.vy = Math.min(p.vy + GRAV * dt, 900);
  move(p, dt);
  if (p.onGround && Math.abs(p.vx) > 20) p.walk += dt * 14; else p.walk = 0;

  if (p.onGround && p.knock <= 0 && solidAt(p.x, p.y + p.h + 4) && solidAt(p.x + p.w, p.y + p.h + 4)) p.safe = { x: p.x, y: p.y };

  p.cooldown -= dt; p.attack -= dt; p.invuln -= dt;
  if (pressed.attack && p.cooldown <= 0) { p.attack = 0.2; p.cooldown = 0.34; p.swing++; blip(180, 0.08, 'sawtooth', 200, 0.04); }

  if (inWater(p)) {
    burst('splash', p.x + p.w / 2, p.y + p.h, 14, 220);
    blip(140, 0.3, 'sine', -80, 0.08);
    Object.assign(p, { x: p.safe.x, y: p.safe.y, vx: 0, vy: 0, invuln: 1.5, knock: 0 });
    loseSheets(3);
    G.banner = { text: 'Soggy! −3 sheets', t: 1.4 };
  }

  for (const k of G.pickups) {
    if (!k.taken && Math.abs(k.x - (p.x + p.w / 2)) < 20 && Math.abs(k.y - (p.y + p.h / 2)) < 26) {
      k.taken = true;
      p.sheets = Math.min(MAX_SHEETS, p.sheets + 3);
      burst('star', k.x, k.y, 8, 120);
      blip(660, 0.1, 'triangle', 300);
    }
  }
  const ex = G.exit;
  if (overlap(p, { x: ex.x + 4, y: ex.y - T, w: T - 8, h: T * 2 })) finish(true);
}

function hurtEnemy(e, dir) {
  e.hp--; e.flash = 0.15; e.stun = 0.3; e.vx = dir * 240; e.vy = -220;
  blip(120, 0.1, 'square', -40, 0.06);
  if (e.hp <= 0) { e.dead = true; burst('poof', e.x + e.w / 2, e.y + e.h / 2, 10, 140); G.tips += 1; }
}

function updateEnemies(dt) {
  const p = G.player, pcx = p.x + p.w / 2;
  const hit = p.attack > 0 ? { x: p.dir > 0 ? p.x + p.w - 4 : p.x - 30, y: p.y - 8, w: 34, h: p.h + 10 } : null;
  for (const e of G.enemies) {
    e.flash -= dt; e.timer += dt;
    const ecx = e.x + e.w / 2, dx = pcx - ecx;
    if (e.stun > 0) e.stun -= dt;
    else if (e.kind === 'B') {
      // clogling: sits, then hops at the gnome
      if (e.onGround) {
        e.vx = 0;
        if (e.timer > 1.3 && Math.abs(dx) < 320) { e.timer = 0; e.dir = Math.sign(dx) || 1; e.vx = e.dir * 110; e.vy = -470; }
      }
    } else {
      const aheadX = e.dir > 0 ? e.x + e.w + 3 : e.x - 3;
      if (e.onGround && (solidAt(aheadX, e.y + e.h / 2) || !solidAt(aheadX, e.y + e.h + 4))) e.dir = -e.dir;
      let speed = e.speed;
      if (e.kind === 'R' && Math.abs(dx) < 170 && Math.abs(p.y + p.h - e.y - e.h) < 40 && Math.sign(dx) === e.dir) speed = 125; // rats charge
      if (e.kind === 'C' && e.timer > 1.6 && Math.random() < 0.02) { e.dir = -e.dir; e.timer = 0; } // roaches skitter
      e.vx = e.dir * speed;
    }
    e.vy = Math.min(e.vy + GRAV * dt, 900);
    move(e, dt);
    if (inWater(e)) { e.dead = true; burst('splash', ecx, e.y + e.h, 8, 160); continue; }
    if (hit && e.hitBy !== p.swing && overlap(hit, e)) { e.hitBy = p.swing; hurtEnemy(e, p.dir); }
    else if (!e.dead && p.invuln <= 0 && e.stun <= 0 && overlap(p, e)) {
      p.invuln = 1.2; p.knock = 0.25; p.vx = (dx > 0 ? 1 : -1) * 260; p.vy = -320;
      blip(200, 0.2, 'sawtooth', -120, 0.06);
      loseSheets(2);
    }
  }
  G.enemies = G.enemies.filter(e => !e.dead);
}

function updateParticles(dt) {
  for (const q of G.particles) {
    q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
    q.vy += (q.type === 'sheet' ? 300 : 700) * dt;
    if (q.type === 'sheet') { q.vx *= 0.96; q.rot += dt * 6; }
  }
  G.particles = G.particles.filter(q => q.life > 0);
}

function snapCamera() {
  const p = G.player;
  G.cam.x = Math.max(0, Math.min(G.w * T - VW, p.x + p.w / 2 - VW / 2));
  G.cam.y = Math.max(0, Math.min(G.h * T - VH, p.y - VH * 0.55));
}
function updateCamera(dt) {
  const p = G.player, k = Math.min(1, dt * 8);
  const tx = Math.max(0, Math.min(G.w * T - VW, p.x + p.w / 2 - VW / 2 + p.dir * 60));
  const ty = Math.max(0, Math.min(G.h * T - VH, p.y - VH * 0.55));
  G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
}

function update(dt) {
  G.t += dt;
  const go = pressed.confirm || pressed.jump;
  if (G.state === 'title') {
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
    updateCamera(dt);
    if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;
    G.shake = Math.max(0, G.shake - dt);
  } else if (G.state === 'delivered' || G.state === 'failed') {
    if (go && G.t > 0.5) {
      if (G.state === 'delivered') G.levelIndex++;
      if (G.levelIndex >= LEVELS.length) { G.state = 'end'; G.t = 0; }
      else { loadLevel(G.levelIndex); G.said50 = G.said25 = false; G.state = 'ticket'; G.t = 0; }
    }
  } else if (G.state === 'end') {
    if (go && G.t > 0.5) { G.state = 'title'; G.t = 0; }
  }
  updateParticles(dt);
  for (const k in pressed) pressed[k] = false;
}

/* ---------- drawing ---------- */
const now = () => performance.now() / 1000;

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#0d1c1c'); g.addColorStop(1, '#162b28');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  // far wall: bent service pipes, slow parallax
  const ox = G.cam.x * 0.35, oy = G.cam.y * 0.35;
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  for (let k = -1; k < 12; k++) {
    const x = k * 300 - ox + (k * 97 % 120), yb = 150 + (k * 53 % 5) * 60 - oy;
    if (x > VW + 320 || x < -620) continue;
    for (const [wd, col] of [[26, '#1a3431'], [10, '#21403c']]) {
      ctx.strokeStyle = col; ctx.lineWidth = wd;
      ctx.beginPath(); ctx.moveTo(x, -20); ctx.lineTo(x, yb); ctx.lineTo(x + 180, yb); ctx.lineTo(x + 180, yb + 140); ctx.lineTo(x + 420, yb + 140);
      ctx.stroke();
    }
    ctx.fillStyle = '#1a3431';
    ctx.fillRect(x - 17, yb - 60, 34, 8); ctx.fillRect(x + 80, yb - 17, 8, 34);
  }
}

function drawTiles() {
  const x0 = Math.max(0, Math.floor(G.cam.x / T)), x1 = Math.min(G.w - 1, Math.floor((G.cam.x + VW) / T));
  const y0 = Math.max(0, Math.floor(G.cam.y / T)), y1 = Math.min(G.h - 1, Math.floor((G.cam.y + VH) / T));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = G.grid[y][x], px = x * T, py = y * T;
    if (c === '#') {
      ctx.fillStyle = (x + y) % 2 ? '#3a4a44' : '#35443f'; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#28342f';
      ctx.fillRect(px, py + 15, T, 2); ctx.fillRect(px + (y % 2 ? 8 : 22), py, 2, 15); ctx.fillRect(px + (y % 2 ? 22 : 8), py + 17, 2, 15);
      if (!solid(x, y - 1)) { // slimy walkable cap
        ctx.fillStyle = '#6f8f58'; ctx.fillRect(px, py, T, 5);
        ctx.fillStyle = '#8fb26a'; ctx.fillRect(px, py, T, 2);
        ctx.fillStyle = '#6f8f58'; ctx.fillRect(px + (x * 7 % 20) + 2, py + 5, 4, 3 + (x * 5 % 5));
      }
    } else if (c === '=') {
      const g = ctx.createLinearGradient(0, py, 0, py + T);
      g.addColorStop(0, '#9ac0a8'); g.addColorStop(0.25, '#5f8f7c'); g.addColorStop(1, '#2c4a44');
      ctx.fillStyle = g; ctx.fillRect(px, py + 2, T, T - 8);
      ctx.fillStyle = '#b7743c';
      if (tile(x - 1, y) !== '=') ctx.fillRect(px, py, 6, T - 4);
      if (tile(x + 1, y) !== '=') ctx.fillRect(px + T - 6, py, 6, T - 4);
    }
  }
}

function drawWater() {
  const t = now();
  const x0 = Math.max(0, Math.floor(G.cam.x / T)), x1 = Math.min(G.w - 1, Math.floor((G.cam.x + VW) / T));
  const top = (G.h - 2) * T;
  for (let x = x0; x <= x1; x++) {
    if (G.grid[G.h - 2][x] !== '~') continue;
    const px = x * T;
    ctx.fillStyle = 'rgba(96,128,52,0.88)';
    ctx.beginPath(); ctx.moveTo(px, top + 2 * T);
    for (let i = 0; i <= T; i += 8) ctx.lineTo(px + i, top + 6 + Math.sin((px + i) * 0.06 + t * 3) * 3);
    ctx.lineTo(px + T, top + 2 * T); ctx.fill();
    ctx.fillStyle = 'rgba(190,214,120,0.7)';
    for (let i = 0; i < T; i += 8) ctx.fillRect(px + i, top + 5 + Math.sin((px + i) * 0.06 + t * 3) * 3, 6, 2);
    const b = (t * 0.6 + x * 0.37) % 1;
    ctx.beginPath(); ctx.arc(px + 16, top + 50 - b * 36, 3 * (1 - b) + 1, 0, 7); ctx.fill();
  }
}

function drawExit() {
  const ex = G.exit, cx = ex.x + T / 2, mouth = ex.y - T * 1.6, pulse = 0.5 + 0.5 * Math.sin(now() * 4);
  // light from the bathroom above
  const g = ctx.createLinearGradient(0, mouth, 0, ex.y + T);
  g.addColorStop(0, `rgba(255,244,190,${0.45 + pulse * 0.2})`); g.addColorStop(1, 'rgba(255,244,190,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(cx - 16, mouth); ctx.lineTo(cx + 16, mouth); ctx.lineTo(cx + 34, ex.y + T); ctx.lineTo(cx - 34, ex.y + T); ctx.fill();
  // porcelain pipe down from the ceiling
  ctx.fillStyle = '#e9e6dc'; ctx.fillRect(cx - 18, T, 36, mouth - T);
  ctx.fillStyle = '#c9c5b8'; ctx.fillRect(cx + 8, T, 10, mouth - T);
  ctx.fillStyle = '#f7f5ee'; ctx.beginPath(); ctx.roundRect(cx - 24, mouth - 10, 48, 12, 4); ctx.fill();
  // sign
  ctx.fillStyle = '#d8432f'; ctx.beginPath(); ctx.roundRect(cx - 76, mouth + 6, 48, 24, 4); ctx.fill();
  ctx.fillStyle = '#f3efe2'; ctx.font = `14px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('WC ↑', cx - 52, mouth + 19);
}

function drawRoll(x, y, r) {
  ctx.fillStyle = '#f7f4ea'; ctx.strokeStyle = '#b9b3a2'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
  if (r > 5) { ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0.4, 5); ctx.stroke(); }
  ctx.fillStyle = '#a98258'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill();
}

function drawGnome(p, x, y, alpha = 1) {
  const t = now();
  ctx.save(); ctx.translate(x, y); ctx.scale(p.dir, 1); ctx.globalAlpha = alpha;
  const step = Math.sin(p.walk), air = !p.onGround;
  // cargo: the roll, roped to the back. It shrinks as sheets are lost.
  const r = 5 + 8 * (p.sheets / MAX_SHEETS), rx = -8 - r * 0.55, ry = -17;
  ctx.fillStyle = '#f7f4ea'; // loose trailing sheet
  ctx.beginPath(); ctx.moveTo(rx - r + 2, ry);
  ctx.quadraticCurveTo(rx - r - 8, ry + 6 + Math.sin(t * 9) * 3, rx - r - 12 - Math.abs(p.vx) * 0.03, ry + 12 + Math.sin(t * 7) * 4);
  ctx.lineTo(rx - r - 8 - Math.abs(p.vx) * 0.03, ry + 15 + Math.sin(t * 7) * 4); ctx.quadraticCurveTo(rx - r - 3, ry + 9, rx - r + 5, ry + 4); ctx.fill();
  drawRoll(rx, ry, r);
  ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 2; // ropes
  ctx.beginPath(); ctx.moveTo(rx - r * 0.7, ry - r * 0.75); ctx.lineTo(3, -20); ctx.moveTo(rx - r * 0.7, ry + r * 0.75); ctx.lineTo(3, -11);
  ctx.moveTo(rx + 1, ry - r); ctx.lineTo(rx + 1, ry + r); ctx.stroke();
  // boots
  ctx.fillStyle = '#4a3222';
  ctx.fillRect(-6 + (air ? -2 : step * 4), -5 + (air ? -2 : 0), 7, 5);
  ctx.fillRect(1 - (air ? -2 : step * 4), -5, 7, 5);
  // tunic + belt
  ctx.fillStyle = '#2f6fa8'; ctx.beginPath(); ctx.roundRect(-7, -19, 14, 15, 4); ctx.fill();
  ctx.fillStyle = '#3a2618'; ctx.fillRect(-7, -10, 14, 3);
  ctx.fillStyle = '#e2b23c'; ctx.fillRect(-1, -11, 4, 5);
  // head, beard, hat
  ctx.fillStyle = '#eab98f'; ctx.beginPath(); ctx.arc(1, -24, 6.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#f7f4ea'; ctx.beginPath(); ctx.moveTo(-5, -23); ctx.quadraticCurveTo(-3, -9, 4, -12); ctx.quadraticCurveTo(9, -16, 8, -23); ctx.quadraticCurveTo(2, -19, -5, -23); ctx.fill();
  ctx.fillStyle = '#e09a7a'; ctx.beginPath(); ctx.arc(7, -23, 2.6, 0, 7); ctx.fill();
  ctx.fillStyle = '#1b1b1b'; ctx.fillRect(3, -27, 2, 2.5);
  ctx.fillStyle = '#d8432f'; ctx.beginPath(); ctx.moveTo(-8, -27); ctx.lineTo(9, -28); ctx.quadraticCurveTo(2, -40, -9, -47 + step); ctx.quadraticCurveTo(-7, -36, -8, -27); ctx.fill();
  // plunger arm
  const a = p.attack > 0 ? -1.1 + (1 - p.attack / 0.2) * 2.0 : -0.5;
  ctx.translate(2, -15); ctx.rotate(a);
  ctx.strokeStyle = '#c99a5b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, 0); ctx.stroke();
  ctx.fillStyle = '#b3261e'; ctx.beginPath(); ctx.moveTo(19, -3); ctx.lineTo(26, -8); ctx.lineTo(26, 8); ctx.lineTo(19, 3); ctx.fill();
  ctx.fillStyle = '#eab98f'; ctx.beginPath(); ctx.arc(3, 0, 3, 0, 7); ctx.fill();
  ctx.restore();
}

function drawEnemy(e) {
  const t = now(), cx = e.x + e.w / 2, foot = e.y + e.h;
  ctx.save(); ctx.translate(cx, foot); ctx.scale(e.dir, 1);
  const white = e.flash > 0;
  if (e.kind === 'R') {
    ctx.strokeStyle = white ? '#fff' : '#d78a9a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-12, -6); ctx.quadraticCurveTo(-24, -4 + Math.sin(t * 6) * 4, -28, -12); ctx.stroke();
    ctx.fillStyle = white ? '#fff' : '#77726f';
    ctx.beginPath(); ctx.ellipse(-2, -8, 13, 8, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, -14); ctx.lineTo(19, -6); ctx.lineTo(6, -2); ctx.fill();
    ctx.fillStyle = white ? '#fff' : '#d78a9a';
    ctx.beginPath(); ctx.arc(6, -15, 4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(19, -6, 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#e03a2a'; ctx.beginPath(); ctx.arc(11, -9, 1.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#55504d'; const s = Math.sin(t * 16) * 2;
    ctx.fillRect(-9 + s, -2, 4, 2); ctx.fillRect(4 - s, -2, 4, 2);
  } else if (e.kind === 'C') {
    ctx.strokeStyle = white ? '#fff' : '#2a1a10'; ctx.lineWidth = 1.2;
    const s = Math.sin(t * 30) * 2;
    ctx.beginPath();
    for (const lx of [-6, 0, 6]) { ctx.moveTo(lx, -4); ctx.lineTo(lx + s, 0); ctx.moveTo(lx, -4); ctx.lineTo(lx - s - 3, 0); }
    ctx.moveTo(8, -6); ctx.quadraticCurveTo(14, -14 + s, 18, -10); ctx.moveTo(8, -5); ctx.quadraticCurveTo(15, -9 - s, 19, -4);
    ctx.stroke();
    ctx.fillStyle = white ? '#fff' : '#6b3d1e'; ctx.beginPath(); ctx.ellipse(0, -5, 10, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = white ? '#fff' : '#a2673a'; ctx.beginPath(); ctx.ellipse(-2, -7, 6, 2, 0, 0, 7); ctx.fill();
  } else {
    const sq = e.onGround ? 1 + Math.sin(t * 5 + e.x) * 0.06 : 0.85;
    ctx.scale(1 / sq, sq);
    ctx.strokeStyle = white ? '#fff' : '#3b2a22'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 14; i++) { const a = Math.PI + (i / 13) * Math.PI, l = 15 + (i * 7 % 5); ctx.moveTo(Math.cos(a) * 9, -10 + Math.sin(a) * 8); ctx.lineTo(Math.cos(a + 0.3) * l, -10 + Math.sin(a) * l); }
    ctx.stroke();
    ctx.fillStyle = white ? '#fff' : '#4d382d'; ctx.beginPath(); ctx.ellipse(0, -10, 12, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f3efe2'; ctx.beginPath(); ctx.arc(1, -12, 4, 0, 7); ctx.arc(8, -11, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(2.5, -12, 1.8, 0, 7); ctx.arc(9, -11, 1.4, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawWorld() {
  drawBackground();
  ctx.save();
  const sh = G.shake > 0 ? (Math.random() - 0.5) * 8 * G.shake / 0.25 : 0;
  ctx.translate(-Math.round(G.cam.x) + sh, -Math.round(G.cam.y) + sh);
  drawExit();
  drawTiles();
  for (const k of G.pickups) if (!k.taken) {
    const y = k.y + Math.sin(now() * 3 + k.x) * 3;
    ctx.fillStyle = 'rgba(255,244,190,0.18)'; ctx.beginPath(); ctx.arc(k.x, y, 15, 0, 7); ctx.fill();
    drawRoll(k.x, y, 8);
  }
  for (const e of G.enemies) drawEnemy(e);
  const p = G.player;
  if (!(p.invuln > 0 && Math.floor(now() * 14) % 2)) drawGnome(p, p.x + p.w / 2, p.y + p.h);
  for (const q of G.particles) {
    ctx.globalAlpha = Math.min(1, q.life * 2);
    if (q.type === 'sheet') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = '#f7f4ea'; ctx.fillRect(-4, -3, 8, 6 * Math.cos(q.rot * 2)); ctx.restore(); }
    else { ctx.fillStyle = { splash: '#a9c46a', poof: '#b9b3a2', star: '#ffe27a' }[q.type]; ctx.beginPath(); ctx.arc(q.x, q.y, q.type === 'poof' ? 5 * q.life + 2 : 3, 0, 7); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  drawWater();
  ctx.restore();
}

function drawHUD() {
  const p = G.player, L = G.level;
  ctx.textBaseline = 'middle';
  // roll gauge
  ctx.fillStyle = 'rgba(8,18,17,0.75)'; ctx.beginPath(); ctx.roundRect(12, 12, 222, 34, 8); ctx.fill();
  drawRoll(30, 29, 10);
  for (let i = 0; i < MAX_SHEETS; i++) {
    ctx.fillStyle = i < p.sheets ? '#f7f4ea' : 'rgba(247,244,234,0.15)';
    ctx.fillRect(48 + i * 15, 20, 12, 18);
  }
  // urgency
  const frac = Math.max(0, G.timeLeft / L.time), bx = VW / 2 - 150;
  ctx.fillStyle = 'rgba(8,18,17,0.75)'; ctx.beginPath(); ctx.roundRect(bx - 10, 12, 320, 34, 8); ctx.fill();
  ctx.fillStyle = 'rgba(247,244,234,0.15)'; ctx.fillRect(bx, 30, 300, 8);
  ctx.fillStyle = frac < 0.25 ? '#d8432f' : frac < 0.5 ? '#e2b23c' : '#8fb26a'; ctx.fillRect(bx, 30, 300 * frac, 8);
  ctx.fillStyle = '#f3efe2'; ctx.font = `800 12px ${BODY}`; ctx.textAlign = 'left';
  ctx.fillText(`${L.customer} can hold on for`, bx, 21);
  ctx.textAlign = 'right'; ctx.fillText(`${Math.max(0, Math.ceil(G.timeLeft))} s`, bx + 300, 21);
  // order + tips
  ctx.fillStyle = 'rgba(8,18,17,0.75)'; ctx.beginPath(); ctx.roundRect(VW - 182, 12, 170, 34, 8); ctx.fill();
  ctx.fillStyle = '#f3efe2'; ctx.font = `15px ${DISPLAY}`; ctx.textAlign = 'left';
  ctx.fillText(`Order ${G.levelIndex + 1}/${LEVELS.length}`, VW - 170, 30);
  ctx.textAlign = 'right'; ctx.fillStyle = '#ffe27a'; ctx.fillText(`${G.tips} tips`, VW - 24, 30);
  if (G.banner) {
    ctx.font = `20px ${DISPLAY}`; ctx.textAlign = 'center';
    const w = ctx.measureText(G.banner.text).width + 32;
    ctx.fillStyle = '#f3efe2'; ctx.beginPath(); ctx.roundRect(VW / 2 - w / 2, 58, w, 36, 10); ctx.fill();
    ctx.fillStyle = '#10201f'; ctx.fillText(G.banner.text, VW / 2, 77);
  }
}

/* A delivery ticket: the card every between-level screen is printed on. */
function ticket(h, draw) {
  ctx.fillStyle = 'rgba(8,18,17,0.72)'; ctx.fillRect(0, 0, VW, VH);
  const w = 460, x = VW / 2 - w / 2, y = VH / 2 - h / 2;
  ctx.fillStyle = '#f3efe2'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(8,18,17,0.72)'; // perforated ends, like a torn sheet
  for (let i = 0; i < w; i += 20) { ctx.beginPath(); ctx.arc(x + i + 10, y, 5, 0, 7); ctx.arc(x + i + 10, y + h, 5, 0, 7); ctx.fill(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  draw(VW / 2, y, w);
  if (Math.floor(now() * 2) % 2) {
    ctx.fillStyle = '#5b6f6a'; ctx.font = `800 13px ${BODY}`;
    ctx.fillText('Press Enter or tap to continue', VW / 2, y + h - 24);
  }
}
const text = (s, x, y, font, color) => { ctx.font = font; ctx.fillStyle = color; ctx.fillText(s, x, y); };

function drawTitle() {
  drawBackground();
  // floor
  ctx.fillStyle = '#35443f'; ctx.fillRect(0, 420, VW, 120); ctx.fillStyle = '#8fb26a'; ctx.fillRect(0, 420, VW, 3); ctx.fillStyle = '#6f8f58'; ctx.fillRect(0, 423, VW, 4);
  const t = now();
  const hero = { dir: 1, walk: t * 14, onGround: true, sheets: MAX_SHEETS, attack: 0, vx: RUN };
  ctx.save(); ctx.translate(VW / 2 - 40, 420); ctx.scale(3.4, 3.4); drawGnome(hero, 0, 0); ctx.restore();
  ctx.save(); ctx.translate(VW / 2 + 200, 420); ctx.scale(2.4, 2.4);
  drawEnemy({ kind: 'R', x: -14, y: -16, w: 28, h: 16, dir: -1, flash: 0, onGround: true }); ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  text('GNOME', VW / 2, 86, `64px ${DISPLAY}`, '#f3efe2');
  text('DELIVERY SERVICE', VW / 2, 146, `44px ${DISPLAY}`, '#d8432f');
  text('Emergency toilet paper, straight up the pipe.', VW / 2, 192, `800 17px ${BODY}`, '#8fa9a2');
  if (Math.floor(t * 2) % 2) text('Press Enter or tap to start your shift', VW / 2, 486, `22px ${DISPLAY}`, '#f3efe2');
}

function render() {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  if (G.state === 'title') return drawTitle();
  drawWorld();
  const L = G.level;
  if (G.state === 'play') drawHUD();
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

let last = performance.now();
function frame(t) {
  const dt = Math.min(1 / 30, (t - last) / 1000);
  last = t;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
