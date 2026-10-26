// 슈퍼 조이 브로스 — 횡스크롤 플랫포머
// 스틱 좌우 = 이동, 스틱 아래 = 웅크리기, 택트 = 점프(길게 누르면 높이), SW = 일시정지

import { input, mountBar, runLoop, fitCanvas, beep, noise } from './joy.js';

mountBar('슈퍼 조이 브로스');
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
fitCanvas(cv);

const VW = 960, VH = 540, T = 36;
const COLS = 200, ROWS = 15;
const FLAG_COL = 186, CASTLE_COL = 191, CHECKPOINT_COL = 100;
const SOLID = new Set(['G', 'D', 'B', 'Q', 'M', 'U', 'S', 'P']);

let map, pipes, enemies, items, particles, popups, bumps;
let player, camX, frame;
let state = 'title';     // title · play · pause · dying · clear · over
let stateT = 0;
let score = 0, coins = 0, lives = 3, time = 300, checkpoint = false;

// ---------- 레벨 ----------
function buildLevel() {
  map = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
  pipes = [];
  const set = (x, y, c) => { if (x >= 0 && x < COLS && y >= 0 && y < ROWS) map[y][x] = c; };
  const row = (x0, x1, y, c) => { for (let x = x0; x <= x1; x++) set(x, y, c); };
  const pipe = (x, h) => { pipes.push({ x, h }); for (let y = 13 - h; y <= 12; y++) { set(x, y, 'P'); set(x + 1, y, 'P'); } };
  const stair = (x0, n, up) => {
    for (let i = 0; i < n; i++) {
      const h = up ? i + 1 : n - i;
      for (let k = 0; k < h; k++) set(x0 + i, 12 - k, 'S');
    }
  };

  const gaps = [[42, 44], [86, 89], [133, 135], [156, 158]];
  for (let x = 0; x < COLS; x++) {
    if (gaps.some(([a, b]) => x >= a && x <= b)) continue;
    set(x, 13, 'G'); set(x, 14, 'D');
  }

  set(16, 9, 'Q');
  row(20, 24, 9, 'B'); set(21, 9, 'Q'); set(22, 9, 'M'); set(23, 9, 'Q'); set(22, 5, 'Q');
  pipe(28, 2); pipe(36, 3);
  row(41, 45, 9, 'o');
  pipe(48, 4); pipe(57, 4);
  row(64, 66, 9, 'B'); set(65, 9, 'Q');
  row(69, 76, 5, 'B'); set(72, 5, 'M'); row(69, 76, 4, 'o');
  row(79, 82, 9, 'B'); set(82, 9, 'Q');
  row(86, 89, 8, 'o');
  set(94, 9, 'Q'); set(97, 9, 'Q'); set(100, 9, 'Q'); set(97, 5, 'M');
  set(106, 9, 'B'); row(109, 111, 5, 'B'); set(110, 5, 'Q');
  row(112, 115, 10, 'o');
  stair(116, 4, true); stair(122, 4, false);
  stair(128, 4, true); set(132, 9, 'S'); set(132, 10, 'S'); set(132, 11, 'S'); set(132, 12, 'S');
  row(133, 135, 7, 'o');
  stair(136, 4, false);
  pipe(145, 2);
  row(150, 153, 9, 'B'); set(151, 9, 'Q'); set(152, 9, 'M');
  row(155, 159, 8, 'o');
  pipe(163, 2);
  stair(170, 8, true); for (let k = 0; k < 8; k++) set(178, 12 - k, 'S');
  set(FLAG_COL, 12, 'S');

  enemies = [22, 34, 40, 52, 54, 66, 80, 82, 96, 98, 108, 110, 126, 127, 140, 142, 149, 166, 168]
    .map(c => ({ x: c * T + 4, y: 12 * T + 8, w: 28, h: 28, vx: -1.1, vy: 0, dead: 0, active: false }));
  items = []; particles = []; popups = []; bumps = [];
}

const tileAt = (tx, ty) => (tx < 0 || tx >= COLS) ? 'S' : (ty < 0 || ty >= ROWS) ? ' ' : map[ty][tx];
const solidAt = (tx, ty) => SOLID.has(tileAt(tx, ty));

// ---------- 충돌 ----------
function overlapTiles(e) {
  const out = [];
  const x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w - 0.001) / T);
  const y0 = Math.floor(e.y / T), y1 = Math.floor((e.y + e.h - 0.001) / T);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (solidAt(tx, ty)) out.push([tx, ty]);
  return out;
}

function moveX(e) {
  e.x += e.vx;
  const hits = overlapTiles(e);
  if (!hits.length) return false;
  if (e.vx > 0) e.x = Math.min(...hits.map(([tx]) => tx)) * T - e.w;
  else e.x = (Math.max(...hits.map(([tx]) => tx)) + 1) * T;
  return true;
}

// 반환: 1 = 땅에 닿음, -1 = 머리를 부딪힘(그 타일들), 0 = 없음
function moveY(e) {
  e.y += e.vy;
  const hits = overlapTiles(e);
  if (!hits.length) return { hit: 0 };
  if (e.vy > 0) {
    e.y = Math.min(...hits.map(([, ty]) => ty)) * T - e.h;
    e.vy = 0;
    return { hit: 1 };
  }
  e.y = (Math.max(...hits.map(([, ty]) => ty)) + 1) * T;
  e.vy = 0;
  return { hit: -1, tiles: hits };
}

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---------- 게임 흐름 ----------
function newGame() {
  score = 0; coins = 0; lives = 3; checkpoint = false;
  startLife();
}

function startLife() {
  buildLevel();
  const col = checkpoint ? CHECKPOINT_COL : 3;
  player = { x: col * T, y: 12 * T - 4, w: 24, h: 32, vx: 0, vy: 0, onGround: false, face: 1, big: false, inv: 0, jumpBuf: 0, coyote: 0, crouch: false, walk: 0 };
  camX = Math.max(0, player.x - VW * 0.35);
  time = 300;
  frame = 0;
  state = 'play'; stateT = 0;
}

function addScore(n, x, y) {
  score += n;
  if (x !== undefined) popups.push({ text: String(n), x, y, t: 0 });
}

function getCoin(x, y) {
  coins++;
  addScore(200, x, y);
  beep(988, 0.05); setTimeout(() => beep(1319, 0.12), 60);
  if (coins >= 100) { coins -= 100; lives++; beep(660, 0.3, 'triangle', 1320); }
}

function hurt() {
  if (player.inv > 0 || state !== 'play') return;
  if (player.big) {
    player.big = false; player.y += 30; player.h = 32; player.inv = 120;
    beep(600, 0.4, 'square', 150);
  } else {
    die();
  }
}

function die() {
  state = 'dying'; stateT = 0;
  player.vy = -11; player.vx = 0;
  beep(500, 0.9, 'square', 80, 0.08);
}

function hitBlock(tx, ty) {
  const c = map[ty][tx];
  if (c === 'Q') {
    map[ty][tx] = 'U';
    particles.push({ kind: 'coin', x: tx * T + 10, y: ty * T - 10, vy: -9, t: 0 });
    getCoin(tx * T, ty * T - 30);
  } else if (c === 'M') {
    map[ty][tx] = 'U';
    items.push({ x: tx * T + 4, y: ty * T, w: 28, h: 28, vx: 0, vy: 0, rise: 28 });
    beep(400, 0.25, 'triangle', 800);
  } else if (c === 'B' && player.big) {
    map[ty][tx] = ' ';
    for (const [dx, dy] of [[-3, -9], [3, -9], [-2, -6], [2, -6]])
      particles.push({ kind: 'brick', x: tx * T + 18, y: ty * T + 18, vx: dx, vy: dy, t: 0 });
    addScore(50);
    noise(0.15, 0.1);
  } else {
    beep(140, 0.06);
  }
  if (c !== 'S' && c !== 'U' && c !== 'P') bumps.push({ tx, ty, t: 0 });
  // 블록 위에 서 있던 적은 튕겨서 죽는다.
  for (const e of enemies) {
    if (!e.dead && e.x + e.w > tx * T && e.x < (tx + 1) * T && Math.abs(e.y + e.h - ty * T) < 4) {
      e.dead = 1; e.flip = true; e.vy = -6; addScore(100, e.x, e.y);
    }
  }
}

// ---------- 업데이트 ----------
function update() {
  stateT++;
  if (state === 'title' || state === 'over') {
    if (stateT > 20 && input.btnDown) { newGame(); beep(523, 0.1); }
    return;
  }
  if (state === 'pause') {
    if (input.swDown) state = 'play';
    return;
  }
  if (state === 'play' && input.swDown) { state = 'pause'; beep(330, 0.08); return; }

  frame++;
  if (state === 'play') updatePlayer();
  else if (state === 'dying') {
    player.vy += 0.5; player.y += player.vy;
    if (stateT > 150) {
      lives--;
      if (lives <= 0) { state = 'over'; stateT = 0; }
      else startLife();
      return;
    }
  } else if (state === 'clear') updateClear();

  updateEnemies();
  updateItems();
  for (const p of particles) {
    p.t++;
    if (p.kind === 'coin') { p.y += p.vy; p.vy += 0.6; }
    else { p.x += p.vx; p.y += p.vy; p.vy += 0.5; }
  }
  particles = particles.filter(p => p.kind === 'coin' ? p.t < 30 : p.y < VH + 40);
  for (const p of popups) { p.t++; p.y -= 1; }
  popups = popups.filter(p => p.t < 50);
  for (const b of bumps) b.t++;
  bumps = bumps.filter(b => b.t < 10);

  camX = Math.min(Math.max(camX, player.x - VW * 0.4), COLS * T - VW);
}

function updatePlayer() {
  const p = player;
  if (p.inv > 0) p.inv--;
  if (frame % 24 === 0 && --time <= 0) { die(); return; }

  p.crouch = input.down && p.onGround;
  const target = p.crouch ? 0 : input.x * 5.4;
  const acc = p.onGround ? (p.crouch ? 0.25 : 0.4) : 0.22;
  p.vx += Math.max(-acc, Math.min(acc, target - p.vx));
  if (Math.abs(input.x) > 0.1 && !p.crouch) p.face = Math.sign(input.x);

  // 점프: 착지 직전 입력(버퍼)과 낭떠러지 직후 입력(코요테 타임)도 받아 준다.
  p.jumpBuf = input.btnDown ? 8 : Math.max(0, p.jumpBuf - 1);
  p.coyote = p.onGround ? 6 : Math.max(0, p.coyote - 1);
  if (p.jumpBuf && p.coyote) {
    p.vy = -12 - Math.abs(p.vx) * 0.25;
    p.jumpBuf = 0; p.coyote = 0; p.onGround = false;
    beep(p.big ? 330 : 440, 0.15, 'square', p.big ? 660 : 880);
  }
  const g = p.vy < 0 && input.btn ? 0.45 : 1.0;
  p.vy = Math.min(p.vy + g, 13);

  moveX(p) && (p.vx = 0);
  if (p.x < camX) { p.x = camX; p.vx = Math.max(0, p.vx); }
  const r = moveY(p);
  p.onGround = r.hit === 1;
  if (r.hit === -1) {
    const cx = p.x + p.w / 2;
    const [tx, ty] = r.tiles.reduce((a, b) => Math.abs((a[0] + 0.5) * T - cx) <= Math.abs((b[0] + 0.5) * T - cx) ? a : b);
    hitBlock(tx, ty);
  }
  p.walk += p.onGround ? Math.abs(p.vx) : 0;

  // 동전
  const x0 = Math.floor(p.x / T), x1 = Math.floor((p.x + p.w - 1) / T);
  const y0 = Math.floor(p.y / T), y1 = Math.floor((p.y + p.h - 1) / T);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (tileAt(tx, ty) === 'o') { map[ty][tx] = ' '; getCoin(tx * T, ty * T); }

  if (p.x > CHECKPOINT_COL * T) checkpoint = true;
  if (p.y > VH + 40) { die(); return; }

  // 깃발
  if (p.x + p.w > FLAG_COL * T + 14) {
    state = 'clear'; stateT = 0;
    p.x = FLAG_COL * T + 14 - p.w; p.vx = 0; p.vy = 0;
    const h = Math.max(0, 12 - Math.floor(p.y / T));
    addScore([100, 400, 800, 2000, 4000, 5000][Math.min(5, Math.floor(h / 2))], p.x, p.y);
    beep(784, 0.6, 'square', 1568);
  }
}

function updateClear() {
  const p = player;
  const ground = 12 * T - p.h;
  if (p.y < ground) { p.y = Math.min(ground, p.y + 4); return; }
  if (stateT < 80) return;
  if (p.x < (CASTLE_COL + 2) * T) {
    p.vx = 2.5; p.face = 1;
    moveX(p);
    p.vy = Math.min(p.vy + 1, 13); p.onGround = moveY(p).hit === 1;
    p.walk += p.vx;
  } else if (time > 0) {
    p.hidden = true;
    const n = Math.min(time, 3);
    time -= n; score += n * 50;
    if (frame % 4 === 0) beep(1200, 0.03);
  } else if (input.btnDown) {
    state = 'title'; stateT = 0;
  }
}

function updateEnemies() {
  for (const e of enemies) {
    if (!e.active) { if (e.x < camX + VW + 40) e.active = true; else continue; }
    if (e.dead) {
      e.dead++;
      if (e.flip) { e.vy += 0.5; e.y += e.vy; }
      continue;
    }
    e.vy = Math.min(e.vy + 0.8, 12);
    if (moveX(e)) e.vx = -e.vx;
    moveY(e);
    if (e.y > VH) { e.dead = 999; continue; }
    if (state !== 'play') continue;
    const p = player;
    if (overlap(p, e)) {
      if (p.vy > 0 && p.y + p.h - e.y < 20) {
        e.dead = 1;
        p.vy = input.btn ? -12 : -7;
        addScore(100, e.x, e.y);
        beep(220, 0.1, 'square', 110);
      } else {
        hurt();
      }
    }
  }
  enemies = enemies.filter(e => e.dead < 40 || (e.flip && e.y < VH + 40 && e.dead < 999));
}

function updateItems() {
  for (const m of items) {
    if (m.rise > 0) { m.y -= 1; m.rise--; if (!m.rise) m.vx = 2; continue; }
    m.vy = Math.min(m.vy + 0.8, 12);
    if (moveX(m)) m.vx = -m.vx;
    moveY(m);
    if (state === 'play' && overlap(player, m)) {
      m.taken = true;
      if (!player.big) { player.big = true; player.y -= 30; player.h = 62; }
      addScore(1000, m.x, m.y);
      beep(523, 0.08); setTimeout(() => beep(784, 0.08), 80); setTimeout(() => beep(1047, 0.15), 160);
    }
  }
  items = items.filter(m => !m.taken && m.y < VH + 40);
}

// ---------- 그리기 ----------
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

function drawBackground() {
  rect(0, 0, VW, VH, '#5c94fc');
  // 언덕 (느리게 움직인다)
  const hx = camX * 0.5;
  for (let i = -1; i < 8; i++) {
    const x = i * 560 - (hx % 560) + 80;
    ctx.fillStyle = '#3aa64a';
    ctx.beginPath(); ctx.ellipse(x, 470, 190, 150, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#5cc85c';
    ctx.beginPath(); ctx.ellipse(x + 300, 470, 110, 80, 0, Math.PI, 0); ctx.fill();
  }
  // 구름
  const cx = camX * 0.3;
  ctx.fillStyle = '#fff';
  for (let i = -1; i < 7; i++) {
    const x = i * 420 - (cx % 420) + 60, y = 70 + (i & 1) * 50 + (i % 3 === 0 ? 30 : 0);
    for (const [dx, dy, r] of [[0, 10, 24], [26, -4, 30], [56, 10, 24], [28, 16, 24]]) {
      ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawTile(c, x, y) {
  switch (c) {
    case 'G':
      rect(x, y, T, T, '#c8641c');
      rect(x, y, T, 8, '#58c83c'); rect(x, y + 8, T, 3, '#2e8a24');
      rect(x + 6, y + 18, 6, 4, '#a04c10'); rect(x + 22, y + 26, 6, 4, '#a04c10');
      break;
    case 'D':
      rect(x, y, T, T, '#c8641c');
      rect(x + 4, y + 6, 6, 4, '#a04c10'); rect(x + 20, y + 16, 6, 4, '#a04c10'); rect(x + 10, y + 28, 6, 4, '#a04c10');
      break;
    case 'B':
      rect(x, y, T, T, '#c0581c');
      rect(x, y, T, 2, '#f0a070');
      ctx.fillStyle = '#4a1c04';
      ctx.fillRect(x, y + 17, T, 2); ctx.fillRect(x, y + T - 2, T, 2);
      ctx.fillRect(x + 17, y, 2, 17); ctx.fillRect(x + 7, y + 19, 2, 17); ctx.fillRect(x + 27, y + 19, 2, 17);
      break;
    case 'Q':
    case 'M': {
      const shine = [0, 0, 1, 2][Math.floor(frame / 10) % 4];
      rect(x, y, T, T, '#a05000');
      rect(x + 2, y + 2, T - 4, T - 4, ['#f8b800', '#fcd850', '#e09800'][shine]);
      ctx.fillStyle = '#a05000';
      for (const [dx, dy] of [[4, 4], [T - 8, 4], [4, T - 8], [T - 8, T - 8]]) ctx.fillRect(x + dx, y + dy, 3, 3);
      ctx.fillStyle = '#6a2c00';
      ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', x + T / 2 + 1, y + T / 2 + 2);
      break;
    }
    case 'U':
      rect(x, y, T, T, '#6a3a1a'); rect(x + 2, y + 2, T - 4, T - 4, '#9c5a28');
      break;
    case 'S':
      rect(x, y, T, T, '#7a3a14'); rect(x + 3, y + 3, T - 6, T - 6, '#b8642c'); rect(x + 3, y + 3, T - 6, 4, '#e09050');
      break;
    case 'o': {
      const w = Math.abs(Math.cos(frame / 12)) * 10 + 3;
      ctx.fillStyle = '#fcd000';
      ctx.beginPath(); ctx.ellipse(x + T / 2, y + T / 2, w, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff6a0'; ctx.fillRect(x + T / 2 - 1, y + T / 2 - 7, 2, 14);
      break;
    }
  }
}

function drawPipe(p) {
  const x = p.x * T - camX, top = (13 - p.h) * T;
  const body = (cx, w, y, h) => {
    rect(cx, y, w, h, '#0a5c0a');
    rect(cx + 2, y, w - 4, h, '#2cb82c');
    rect(cx + 8, y, 8, h, '#8ee850');
    rect(cx + w - 12, y, 6, h, '#108010');
  };
  body(x + 4, T * 2 - 8, top + 30, p.h * T - 30);
  body(x, T * 2, top, 30);
  rect(x, top + 28, T * 2, 3, '#0a5c0a');
}

function drawFlagAndCastle() {
  const fx = FLAG_COL * T + T / 2 - camX;
  if (fx > -100 && fx < VW + 260) {
    rect(fx - 2, 3 * T, 4, 9 * T, '#9ad040');
    ctx.fillStyle = '#2a8a2a'; ctx.beginPath(); ctx.arc(fx, 3 * T - 4, 8, 0, Math.PI * 2); ctx.fill();
    const fy = state === 'clear' ? Math.min(11 * T - 30, 3 * T + 8 + stateT * 4) : 3 * T + 8;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(fx - 2, fy); ctx.lineTo(fx - 50, fy + 18); ctx.lineTo(fx - 2, fy + 36); ctx.fill();
    ctx.fillStyle = '#2a8a2a'; ctx.beginPath(); ctx.arc(fx - 18, fy + 18, 6, 0, Math.PI * 2); ctx.fill();
  }
  const cx = CASTLE_COL * T - camX;
  if (cx > -260 && cx < VW) {
    const bw = 5 * T, by = 13 * T;
    rect(cx, by - 3 * T, bw, 3 * T, '#b8642c');
    rect(cx + T, by - 5 * T, 3 * T, 2 * T, '#b8642c');
    ctx.fillStyle = '#7a3a14';
    for (let i = 0; i < 5; i++) rect(cx + i * T + 4, by - 3 * T - 14, T - 8, 14, '#b8642c');
    for (let i = 0; i < 3; i++) rect(cx + T + i * T + 4, by - 5 * T - 14, T - 8, 14, '#b8642c');
    for (let r = 0; r < 5; r++) for (let i = 0; i < 5; i++) rect(cx + i * T + ((r & 1) ? 18 : 0), by - (r + 1) * 18 - 1, 16, 2, '#7a3a14');
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.moveTo(cx + 2 * T, by); ctx.lineTo(cx + 2 * T, by - 40); ctx.arc(cx + 2.5 * T, by - 40, T / 2, Math.PI, 0); ctx.lineTo(cx + 3 * T, by); ctx.fill();
    rect(cx + 1.6 * T, by - 4.4 * T, 14, 22, '#000'); rect(cx + 3 * T, by - 4.4 * T, 14, 22, '#000');
  }
}

function drawPlayer() {
  const p = player;
  if (p.hidden) return;
  if (p.inv > 0 && Math.floor(p.inv / 4) % 2) return;
  const crouch = p.crouch && p.big;
  const h = crouch ? 40 : p.h;
  const x = Math.round(p.x + p.w / 2 - camX), y = Math.round(p.y + p.h - h);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(p.face, 1);
  const RED = '#e03c28', SKIN = '#fcb88c', BLUE = '#2c4cdc', BROWN = '#6a3a10';
  // 모자
  rect(-11, 0, 20, 6, RED); rect(4, 4, 10, 3, RED);
  // 얼굴
  rect(-10, 6, 19, 9, SKIN); rect(-10, 6, 5, 7, BROWN); rect(4, 8, 2, 3, '#000'); rect(3, 12, 9, 2, BROWN);
  // 몸
  const bodyH = h - 15 - 6;
  rect(-11, 15, 22, bodyH, RED);
  rect(-8, 15 + Math.floor(bodyH * 0.35), 16, Math.ceil(bodyH * 0.65), BLUE);
  rect(-6, 15 + Math.floor(bodyH * 0.35) + 2, 3, 3, '#fcd000'); rect(3, 15 + Math.floor(bodyH * 0.35) + 2, 3, 3, '#fcd000');
  rect(-13, 17, 4, Math.min(10, bodyH - 4), SKIN); rect(9, 17, 4, Math.min(10, bodyH - 4), SKIN);
  // 다리
  const step = p.onGround && Math.abs(p.vx) > 0.4 ? Math.floor(p.walk / 10) % 2 : 0;
  if (!p.onGround && state === 'play') { rect(-10, h - 6, 9, 6, BROWN); rect(4, h - 8, 9, 6, BROWN); }
  else if (step) { rect(-12, h - 6, 10, 6, BROWN); rect(5, h - 6, 10, 6, BROWN); }
  else { rect(-9, h - 6, 9, 6, BROWN); rect(1, h - 6, 9, 6, BROWN); }
  ctx.restore();
}

function drawEnemy(e) {
  const x = Math.round(e.x - camX), y = Math.round(e.y);
  if (x < -40 || x > VW + 40) return;
  if (e.dead && !e.flip) {
    ctx.fillStyle = '#8a4214';
    ctx.beginPath(); ctx.ellipse(x + 14, y + 24, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  ctx.save();
  if (e.flip) { ctx.translate(x + 14, y + 14); ctx.scale(1, -1); ctx.translate(-14, -14); } else ctx.translate(x, y);
  ctx.fillStyle = '#9c4a1a';
  ctx.beginPath(); ctx.ellipse(14, 12, 16, 12, 0, Math.PI, 0); ctx.lineTo(30, 16); ctx.lineTo(-2, 16); ctx.fill();
  rect(4, 14, 20, 8, '#f4c890');
  rect(5, 6, 6, 7, '#fff'); rect(17, 6, 6, 7, '#fff');
  rect(8, 8, 3, 5, '#000'); rect(17, 8, 3, 5, '#000');
  rect(3, 4, 9, 2, '#000'); rect(16, 4, 9, 2, '#000');
  const step = Math.floor(frame / 10) % 2;
  rect(step ? -1 : 2, 22, 11, 6, '#000'); rect(step ? 19 : 16, 22, 11, 6, '#000');
  ctx.restore();
}

function drawMushroom(m) {
  const x = Math.round(m.x - camX), y = Math.round(m.y);
  rect(x + 7, y + 14, 14, 14, '#f8e0b0');
  ctx.fillStyle = '#e03c28';
  ctx.beginPath(); ctx.ellipse(x + 14, y + 14, 15, 14, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#fff';
  for (const [dx, dy, r] of [[14, 5, 4], [4, 11, 3], [24, 11, 3]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill(); }
  rect(x + 10, y + 17, 2, 4, '#000'); rect(x + 16, y + 17, 2, 4, '#000');
}

function text(s, x, y, size = 22, color = '#fff', align = 'left') {
  ctx.font = `bold ${size}px "Malgun Gothic", monospace`;
  ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(s, x + 2, y + 2);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

function drawHud() {
  text('SCORE', 30, 12, 16); text(String(score).padStart(6, '0'), 30, 32);
  text('COIN', 250, 12, 16); text('×' + String(coins).padStart(2, '0'), 250, 32);
  text('WORLD', 440, 12, 16); text('1-1', 440, 32);
  text('TIME', 640, 12, 16); text(String(Math.max(0, time)).padStart(3, '0'), 640, 32);
  text('LIFE', 820, 12, 16); text('×' + lives, 820, 32);
}

function draw() {
  if (state === 'title' || state === 'over' || !player) {
    if (!map) { buildLevel(); camX = 0; frame = 0; }
    frame++;
    drawBackground();
    drawWorld();
    rect(0, 0, VW, VH, 'rgba(0,0,0,0.35)');
    if (state === 'over') {
      text('GAME OVER', VW / 2, 180, 64, '#fff', 'center');
      text(`SCORE ${score}`, VW / 2, 270, 28, '#ffd34d', 'center');
    } else {
      text('SUPER JOY BROS', VW / 2, 130, 68, '#ffd34d', 'center');
      text('스틱 좌우 = 이동   ·   택트 스위치 = 점프   ·   스틱 누르기 = 일시정지', VW / 2, 240, 20, '#fff', 'center');
    }
    if (Math.floor(stateT / 30) % 2 === 0) text('택트 스위치를 눌러 시작', VW / 2, 340, 30, '#fff', 'center');
    return;
  }
  drawBackground();
  drawWorld();
  drawHud();
  if (state === 'pause') {
    rect(0, 0, VW, VH, 'rgba(0,0,0,0.45)');
    text('일시정지', VW / 2, 200, 56, '#fff', 'center');
    text('스틱을 눌러 계속', VW / 2, 290, 24, '#fff', 'center');
  }
  if (state === 'clear' && player.hidden && time === 0) {
    text('COURSE CLEAR!', VW / 2, 170, 60, '#ffd34d', 'center');
    text('택트 스위치를 눌러 처음으로', VW / 2, 270, 26, '#fff', 'center');
  }
}

function drawWorld() {
  const x0 = Math.floor(camX / T), x1 = Math.min(COLS - 1, x0 + Math.ceil(VW / T) + 1);
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const c = map[ty][tx];
      if (c === ' ' || c === 'P') continue;
      const b = bumps.find(b => b.tx === tx && b.ty === ty);
      const off = b ? -Math.sin((b.t / 10) * Math.PI) * 10 : 0;
      drawTile(c, tx * T - camX, ty * T + off);
    }
  }
  for (const p of pipes) if ((p.x + 2) * T > camX && p.x * T < camX + VW) drawPipe(p);
  drawFlagAndCastle();
  for (const m of items) drawMushroom(m);
  for (const e of enemies) if (e.active) drawEnemy(e);
  if (player && state !== 'title' && state !== 'over') drawPlayer();
  for (const p of particles) {
    if (p.kind === 'coin') {
      ctx.fillStyle = '#fcd000';
      ctx.beginPath(); ctx.ellipse(p.x + 8 - camX, p.y, Math.abs(Math.cos(p.t / 3)) * 9 + 2, 12, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      rect(p.x - camX, p.y, 12, 12, '#c0581c');
    }
  }
  for (const p of popups) text(p.text, p.x - camX, p.y, 16);
}

runLoop(update, draw);
