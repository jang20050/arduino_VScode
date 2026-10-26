// 조이 스트라이커 1945 — 세로 스크롤 비행 슈팅
// 스틱 = 이동, 택트 = 공격(누르고 있으면 연사), SW(스틱 누르기) = 폭탄

import { input, mountBar, runLoop, fitCanvas, beep, noise } from './joy.js';

mountBar('조이 스트라이커 1945');
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
fitCanvas(cv);

const VW = 540, VH = 720;
const BOSS_AT = 3600;           // 스테이지 시작 후 보스 등장 프레임 (60초)
const HI_KEY = 'joy-striker-hi';

let state = 'title';            // title · play · over
let stateT = 0;
let player, shots, enemies, ebullets, items, fx, pending;
let score = 0, hi = 0, stage = 1, stageT = 0, kills = 0;
let bombFx = null, shake = 0, banner = null, boss = null;
let scroll = 0, islands = [], clouds = [];

try { hi = Number(localStorage.getItem(HI_KEY)) || 0; } catch {}

const rnd = (a, b) => a + Math.random() * (b - a);
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const diff = () => 1 + (stage - 1) * 0.35;

// ---------- 배경 ----------
const sea = document.createElement('canvas');
sea.width = VW; sea.height = VH;
(() => {
  const g = sea.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, VH);
  grad.addColorStop(0, '#0d4f8f'); grad.addColorStop(1, '#0a3d73');
  g.fillStyle = grad; g.fillRect(0, 0, VW, VH);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(160, 210, 255, ${rnd(0.05, 0.18)})`;
    const x = rnd(0, VW), y = rnd(0, VH), w = rnd(8, 40);
    g.fillRect(x, y, w, 2);
    if (x + w > VW) g.fillRect(x - VW, y, w, 2);
  }
})();

function makeIsland() {
  const c = document.createElement('canvas');
  const w = Math.floor(rnd(120, 240)), h = Math.floor(rnd(90, 180));
  c.width = w + 40; c.height = h + 40;
  const g = c.getContext('2d');
  const blobs = Array.from({ length: 7 }, () => [rnd(20 + w * 0.2, 20 + w * 0.8), rnd(20 + h * 0.2, 20 + h * 0.8), rnd(25, Math.min(w, h) * 0.45)]);
  g.fillStyle = '#e8d49a';
  for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x, y, r + 10, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#3f8f3a';
  for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#2d6e2a';
  for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x + r * 0.2, y + r * 0.2, r * 0.55, 0, Math.PI * 2); g.fill(); }
  return { img: c, x: rnd(-60, VW - 120), y: -c.height };
}

function resetBackground() {
  islands = [Object.assign(makeIsland(), { y: 120 })];
  clouds = Array.from({ length: 4 }, () => ({ x: rnd(-60, VW), y: rnd(0, VH), r: rnd(40, 80) }));
}
resetBackground();

function updateBackground() {
  scroll = (scroll + 1.2) % VH;
  for (const i of islands) i.y += 1.2;
  islands = islands.filter(i => i.y < VH + 20);
  if (Math.random() < 0.004 && islands.length < 3) islands.push(makeIsland());
  for (const c of clouds) {
    c.y += 2.6;
    if (c.y - c.r * 2 > VH) { c.y = -c.r * 2; c.x = rnd(-60, VW); c.r = rnd(40, 80); }
  }
}

function drawBackground() {
  ctx.drawImage(sea, 0, scroll - VH);
  ctx.drawImage(sea, 0, scroll);
  for (const i of islands) ctx.drawImage(i.img, i.x, i.y);
}

function drawClouds() {
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (const c of clouds) {
    for (const [dx, dy, k] of [[0, 0, 1], [c.r * 0.8, c.r * 0.3, 0.8], [-c.r * 0.7, c.r * 0.4, 0.7], [c.r * 0.1, c.r * 0.8, 0.75]]) {
      ctx.beginPath(); ctx.arc(c.x + dx, c.y + dy, c.r * k, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ---------- 게임 흐름 ----------
function newGame() {
  score = 0; stage = 1; kills = 0;
  player = { x: VW / 2, y: VH - 110, lives: 3, bombs: 3, power: 1, inv: 120, fireCd: 0, bank: 0, dead: 0 };
  startStage();
  state = 'play'; stateT = 0;
}

function startStage() {
  shots = []; enemies = []; ebullets = []; items = []; fx = []; pending = [];
  stageT = 0; boss = null; bombFx = null;
  banner = { text: `STAGE ${stage}`, t: 0 };
}

function addScore(n) {
  score += n;
  if (score > hi) { hi = score; try { localStorage.setItem(HI_KEY, String(hi)); } catch {} }
}

function explode(x, y, size = 1) {
  for (let i = 0; i < 10 + size * 10; i++) {
    const a = rnd(0, Math.PI * 2), s = rnd(0.5, 3.5) * size;
    fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: rnd(20, 40) * Math.sqrt(size), r: rnd(4, 10) * size });
  }
  fx.push({ ring: true, x, y, life: 0, max: 18, r: 20 * size });
  noise(0.2 + size * 0.15, 0.06 + size * 0.03);
}

// ---------- 적 ----------
function spawn(type, x, y, move, extra = {}) {
  const def = {
    small: { hp: 2, r: 16, score: 100 },
    mid: { hp: 26, r: 34, score: 800 },
    boss: { hp: 700, r: 70, score: 20000 },
  }[type];
  const hp = Math.round(def.hp * (type === 'small' ? 1 : diff()));
  const e = { type, x, y, move, t: 0, hp, maxHp: hp, r: def.r, score: def.score, flash: 0, fireAt: Math.floor(rnd(30, 90)), ...extra };
  enemies.push(e);
  return e;
}

const MOVES = {
  straight: e => { e.y += 2.6; },
  sine: e => { e.y += 2.2; e.x = e.x0 + Math.sin(e.t * 0.045) * 90; },
  swoop: e => { e.x += e.dir * 3.4; e.y += 0.8 + e.t * 0.018; },
  turn: e => { e.y += e.t < 70 ? 3 : e.t < 120 ? 0 : -2.6; },
  mid: e => { e.y += e.y < 150 ? 1.2 : e.t > 700 ? -1 : 0; e.x = e.x0 + Math.sin(e.t * 0.012) * 120; },
  boss: e => {
    if (e.y < 150) e.y += 1;
    else e.x = VW / 2 + Math.sin(e.t * 0.008) * 150;
  },
};

function queue(delay, fn) { pending.push({ delay, fn }); }

function formation() {
  const k = Math.floor(rnd(0, 5));
  if (k === 0) {        // 위에서 일렬로
    const n = 5;
    for (let i = 0; i < n; i++) queue(i * 6, () => spawn('small', 70 + i * 100, -30, 'straight'));
  } else if (k === 1) { // 한 줄로 흔들며
    const x0 = rnd(110, VW - 110);
    for (let i = 0; i < 6; i++) queue(i * 16, () => spawn('small', x0, -30, 'sine', { x0 }));
  } else if (k === 2) { // 옆에서 휩쓸며
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y = rnd(40, 160);
    for (let i = 0; i < 6; i++) queue(i * 12, () => spawn('small', dir > 0 ? -30 : VW + 30, y, 'swoop', { dir }));
  } else if (k === 3) { // 내려와서 멈추고 쏜 뒤 돌아간다
    for (let i = 0; i < 3; i++) queue(i * 20, () => spawn('small', rnd(80, VW - 80), -30, 'turn', { fireAt: 75 }));
  } else {              // V 편대
    const cx = rnd(150, VW - 150);
    [[0, 0], [-50, -40], [50, -40], [-100, -80], [100, -80]].forEach(([dx, dy]) => spawn('small', cx + dx, -30 + dy, 'straight'));
  }
}

function aimed(e, speed, spread = 0, n = 1) {
  const base = Math.atan2(player.y - e.y, player.x - e.x);
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * spread;
    ebullets.push({ x: e.x, y: e.y + e.r * 0.5, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 5 });
  }
}

function ring(e, n, speed, offset = 0) {
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2;
    ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 6 });
  }
}

function enemyFire(e) {
  if (player.dead || e.y < 0 || e.y > player.y - 60) return;
  const s = 3.2 * Math.min(1.8, diff());
  if (e.type === 'small') {
    if (e.t === e.fireAt) aimed(e, s);
  } else if (e.type === 'mid') {
    if (e.t > 60 && e.t % Math.max(40, Math.round(80 / diff())) === 0) aimed(e, s * 0.9, 0.22, stage > 1 ? 5 : 3);
  } else if (e.type === 'boss' && e.y >= 150) {
    const phase = Math.floor(e.t / 300) % 3;
    if (phase === 0 && e.t % 45 === 0) ring(e, 18, 2.6 * Math.min(1.6, diff()), e.t * 0.05);
    if (phase === 1 && e.t % 28 === 0) aimed(e, s, 0.16, 7);
    if (phase === 2 && e.t % 5 === 0) {
      const a = e.t * 0.23;
      for (const k of [0, Math.PI]) ebullets.push({ x: e.x, y: e.y + 20, vx: Math.cos(a + k) * 3, vy: Math.sin(a + k) * 3, r: 5 });
    }
  }
}

function killEnemy(e) {
  e.dead = true;
  addScore(e.score * stage);
  if (e.type === 'boss') {
    for (let i = 0; i < 8; i++) setTimeout(() => explode(e.x + rnd(-90, 90), e.y + rnd(-50, 50), 2), i * 120);
    shake = 40;
    ebullets = [];
    banner = { text: 'STAGE CLEAR', t: 0, next: true };
    boss = null;
    return;
  }
  explode(e.x, e.y, e.type === 'mid' ? 2 : 1);
  kills++;
  if (e.type === 'mid') items.push({ type: player.power < 4 ? 'P' : 'B', x: e.x, y: e.y, t: 0, vx: rnd(-1, 1) });
  else if (kills % 30 === 0) items.push({ type: Math.random() < 0.6 ? 'P' : 'B', x: e.x, y: e.y, t: 0, vx: rnd(-1, 1) });
}

// ---------- 플레이어 ----------
function fire() {
  const p = player;
  const dmg = p.power >= 4 ? 1.4 : 1;
  const add = (dx, a) => shots.push({ x: p.x + dx, y: p.y - 22, vx: Math.sin(a) * 15, vy: -Math.cos(a) * 15, dmg });
  add(-6, 0); add(6, 0);
  if (p.power >= 2) { add(-14, -0.08); add(14, 0.08); }
  if (p.power >= 3) { add(-20, -0.2); add(20, 0.2); }
  beep(880, 0.03, 'square', 660, 0.025);
}

function bomb() {
  const p = player;
  p.bombs--;
  p.inv = Math.max(p.inv, 100);
  bombFx = { x: p.x, y: p.y - 120, t: 0 };
  shake = 25;
  for (const b of ebullets) addScore(10);
  ebullets = [];
  for (const e of enemies) {
    if (e.y < -20) continue;
    e.hp -= e.type === 'boss' ? 60 : 40;
    e.flash = 6;
    if (e.hp <= 0) killEnemy(e);
  }
  noise(0.9, 0.2);
  beep(120, 0.8, 'sawtooth', 40, 0.08);
}

function hitPlayer() {
  const p = player;
  if (p.inv > 0 || p.dead) return;
  explode(p.x, p.y, 2);
  shake = 20;
  p.lives--;
  p.dead = 1;
  p.power = Math.max(1, p.power - 1);
  ebullets = [];
}

function updatePlayer() {
  const p = player;
  if (p.dead) {
    p.dead++;
    if (p.dead > 70) {
      if (p.lives <= 0) { state = 'over'; stateT = 0; return; }
      p.dead = 0; p.x = VW / 2; p.y = VH - 110; p.inv = 150; p.bombs = Math.max(p.bombs, 3);
    }
    return;
  }
  if (p.inv > 0) p.inv--;
  let { x, y } = input;
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  p.x = Math.max(22, Math.min(VW - 22, p.x + x * 5.4));
  p.y = Math.max(40, Math.min(VH - 30, p.y + y * 5.4));
  p.bank += (x - p.bank) * 0.2;

  if (p.fireCd > 0) p.fireCd--;
  if (input.btn && p.fireCd === 0) { fire(); p.fireCd = 6; }
  if (input.swDown && p.bombs > 0 && !bombFx) bomb();
}

// ---------- 업데이트 ----------
function update() {
  stateT++;
  updateBackground();
  if (state !== 'play') {
    if (stateT > 30 && input.btnDown) { newGame(); beep(523, 0.1); }
    return;
  }

  stageT++;
  if (!boss && !banner?.next) {
    if (stageT < BOSS_AT) {
      if (stageT > 90 && stageT % Math.max(45, Math.round(100 / diff())) === 0) formation();
      if (stageT % 720 === 360) spawn('mid', rnd(120, VW - 120), -50, 'mid', { x0: rnd(140, VW - 140) });
    } else if (stageT === BOSS_AT) {
      banner = { text: 'WARNING', t: 0, warn: true };
      beep(220, 1.2, 'sawtooth', 200, 0.05);
    } else if (stageT === BOSS_AT + 150) {
      boss = spawn('boss', VW / 2, -120, 'boss');
    }
  }

  for (const q of pending) q.delay--;
  for (const q of pending.filter(q => q.delay <= 0)) q.fn();
  pending = pending.filter(q => q.delay > 0);

  updatePlayer();
  if (state !== 'play') return;

  for (const s of shots) { s.x += s.vx; s.y += s.vy; }
  shots = shots.filter(s => s.y > -20 && s.x > -20 && s.x < VW + 20 && !s.hit);

  for (const e of enemies) {
    e.t++;
    if (e.flash > 0) e.flash--;
    MOVES[e.move](e);
    enemyFire(e);
    for (const s of shots) {
      if (s.hit || e.dead) continue;
      if (Math.abs(s.x - e.x) < e.r && Math.abs(s.y - e.y) < e.r * (e.type === 'boss' ? 0.6 : 1)) {
        s.hit = true;
        e.hp -= s.dmg; e.flash = 3;
        addScore(e.type === 'boss' ? 5 : 1);
        fx.push({ spark: true, x: s.x, y: s.y, life: 0, max: 8 });
        if (e.hp <= 0) killEnemy(e);
      }
    }
    if (!e.dead && !player.dead && dist2(e, player) < (e.r * 0.7 + 6) ** 2) {
      hitPlayer();
      if (e.type !== 'boss') { e.hp = 0; killEnemy(e); }
    }
  }
  enemies = enemies.filter(e => !e.dead && e.y < VH + 80 && e.y > -200 && e.x > -120 && e.x < VW + 120);

  for (const b of ebullets) {
    b.x += b.vx; b.y += b.vy;
    if (!player.dead && dist2(b, player) < (b.r + 3) ** 2) { b.hit = true; hitPlayer(); }
  }
  ebullets = ebullets.filter(b => !b.hit && b.x > -20 && b.x < VW + 20 && b.y > -20 && b.y < VH + 20);

  for (const it of items) {
    it.t++;
    it.y += 1.1; it.x += it.vx;
    if (it.x < 20 || it.x > VW - 20) it.vx = -it.vx;
    if (!player.dead && dist2(it, player) < 30 ** 2) {
      it.taken = true;
      if (it.type === 'P') { if (player.power < 4) player.power++; else addScore(2000); }
      else player.bombs = Math.min(6, player.bombs + 1);
      beep(660, 0.08, 'triangle'); setTimeout(() => beep(990, 0.12, 'triangle'), 70);
    }
  }
  items = items.filter(it => !it.taken && it.y < VH + 30);

  for (const f of fx) { f.life++; if (!f.ring && !f.spark) { f.x += f.vx; f.y += f.vy; f.vx *= 0.94; f.vy *= 0.94; } }
  fx = fx.filter(f => f.life < f.max);

  if (bombFx && ++bombFx.t > 50) bombFx = null;
  if (shake > 0) shake--;
  if (banner && ++banner.t > 180) {
    if (banner.next) { stage++; startStage(); }
    else banner = null;
  }
}

// ---------- 그리기 ----------
function poly(points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

function drawPlayerPlane(x, y, bank, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(1 - Math.abs(bank) * 0.25, 1);
  // 그림자
  ctx.save(); ctx.globalAlpha *= 0.25; ctx.translate(18, 40); poly([[-30, 0], [30, 0], [0, -10], [0, 18]], '#000'); ctx.restore();
  poly([[-32, -2], [32, -2], [30, 7], [-30, 7]], '#b7c4cf');      // 날개
  ctx.fillStyle = '#8fa1b1';
  ctx.fillRect(-17, -16, 7, 36); ctx.fillRect(10, -16, 7, 36);  // 쌍동체
  ctx.fillRect(-17, 18, 34, 5);                                 // 꼬리
  poly([[-5, -18], [5, -18], [6, 10], [-6, 10]], '#d3dde6');      // 조종석 동체
  ctx.fillStyle = '#3b7bc4';
  ctx.beginPath(); ctx.ellipse(0, -8, 3.5, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';                       // 프로펠러
  const s = (stateT % 4) * 2;
  ctx.fillRect(-21 + s, -19, 15 - s * 2, 2); ctx.fillRect(6 + s, -19, 15 - s * 2, 2);
  ctx.fillStyle = '#e8463c'; ctx.fillRect(-30, 0, 5, 4); ctx.fillRect(25, 0, 5, 4);
  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const hit = e.flash > 0;
  if (e.type === 'small') {
    poly([[-22, -4], [22, -4], [18, 4], [-18, 4]], hit ? '#fff' : '#4b6b3a');
    poly([[-4, -16], [4, -16], [5, 16], [-5, 16]], hit ? '#fff' : '#5c7d48');
    poly([[-9, -14], [9, -14], [8, -10], [-8, -10]], hit ? '#fff' : '#4b6b3a');
    ctx.fillStyle = '#e0b030'; ctx.fillRect(-4, 4, 8, 3);
    ctx.fillStyle = '#26334a'; ctx.beginPath(); ctx.ellipse(0, 2, 2.5, 4, 0, 0, Math.PI * 2); ctx.fill();
  } else if (e.type === 'mid') {
    poly([[-46, -6], [46, -6], [42, 8], [-42, 8]], hit ? '#fff' : '#5a5f4a');
    poly([[-8, -34], [8, -34], [10, 30], [-10, 30]], hit ? '#fff' : '#6d735a');
    poly([[-20, -32], [20, -32], [18, -26], [-18, -26]], hit ? '#fff' : '#5a5f4a');
    ctx.fillStyle = '#3c4032';
    for (const dx of [-28, 28]) ctx.fillRect(dx - 5, -2, 10, 22);
    ctx.fillStyle = '#26334a'; ctx.beginPath(); ctx.ellipse(0, 20, 4, 7, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    poly([[-150, -14], [150, -14], [138, 18], [-138, 18]], hit ? '#fff' : '#4f4a3c');
    poly([[-20, -80], [20, -80], [26, 70], [-26, 70]], hit ? '#fff' : '#605a48');
    poly([[-60, -76], [60, -76], [56, -62], [-56, -62]], hit ? '#fff' : '#4f4a3c');
    ctx.fillStyle = '#35312a';
    for (const dx of [-105, -55, 55, 105]) ctx.fillRect(dx - 8, -6, 16, 36);
    ctx.fillStyle = '#b8323a';
    for (const dx of [-105, -55, 55, 105]) { ctx.beginPath(); ctx.arc(dx, 32, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#26334a'; ctx.beginPath(); ctx.ellipse(0, 50, 8, 14, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function text(s, x, y, size = 20, color = '#fff', align = 'left') {
  ctx.font = `bold ${size}px "Malgun Gothic", monospace`;
  ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(s, x + 2, y + 2);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

function drawHud() {
  text('1P ' + String(score).padStart(8, '0'), 14, 10, 18);
  text('HI ' + String(hi).padStart(8, '0'), VW - 14, 10, 18, '#ffd34d', 'right');
  for (let i = 0; i < player.lives; i++) drawPlayerPlane(24 + i * 34, VH - 26, 0, 0.9);
  for (let i = 0; i < player.bombs; i++) {
    const x = VW - 24 - i * 26, y = VH - 28;
    ctx.fillStyle = '#ffcc33'; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    text('B', x, y - 8, 13, '#4a2a00', 'center');
  }
  text('POWER ' + '■'.repeat(player.power) + '□'.repeat(4 - player.power), VW / 2, VH - 36, 15, '#9fe', 'center');
  if (boss) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(60, 40, VW - 120, 10);
    ctx.fillStyle = '#ff5a4a'; ctx.fillRect(60, 40, (VW - 120) * Math.max(0, boss.hp / boss.maxHp), 10);
  }
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate(rnd(-1, 1) * shake * 0.3, rnd(-1, 1) * shake * 0.3);
  drawBackground();

  if (state === 'play') {
    for (const it of items) {
      const blink = Math.floor(it.t / 8) % 2;
      ctx.fillStyle = it.type === 'P' ? (blink ? '#ff4a4a' : '#ff9a3a') : (blink ? '#3a8aff' : '#7ac0ff');
      ctx.fillRect(it.x - 13, it.y - 11, 26, 22);
      text(it.type, it.x, it.y - 10, 18, '#fff', 'center');
    }
    for (const e of enemies) drawEnemy(e);
    for (const s of shots) {
      ctx.fillStyle = '#fff36a'; ctx.fillRect(s.x - 2, s.y - 9, 4, 16);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x - 1, s.y - 8, 2, 8);
    }
    const p = player;
    if (!p.dead && !(p.inv > 0 && Math.floor(p.inv / 4) % 2)) drawPlayerPlane(p.x, p.y, p.bank);
    for (const f of fx) {
      const k = f.life / f.max;
      if (f.ring) {
        ctx.strokeStyle = `rgba(255,240,200,${1 - k})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + k * 2), 0, Math.PI * 2); ctx.stroke();
      } else if (f.spark) {
        ctx.fillStyle = `rgba(255,255,200,${1 - k})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, 6 * (1 - k) + 2, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = k < 0.3 ? '#fff4c0' : k < 0.6 ? '#ffa030' : `rgba(90,80,80,${1 - k})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const b of ebullets) {
      ctx.fillStyle = '#ff5a8a'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2); ctx.fill();
    }
    if (bombFx) {
      const k = bombFx.t / 50;
      ctx.fillStyle = `rgba(255,255,230,${0.6 * (1 - k)})`; ctx.fillRect(-20, -20, VW + 40, VH + 40);
      ctx.strokeStyle = `rgba(255,200,80,${1 - k})`; ctx.lineWidth = 18 * (1 - k) + 2;
      ctx.beginPath(); ctx.arc(bombFx.x, bombFx.y, k * 600, 0, Math.PI * 2); ctx.stroke();
    }
  }
  drawClouds();
  ctx.restore();

  if (state === 'play') {
    drawHud();
    if (banner && Math.floor(banner.t / 15) % 2 === 0) text(banner.text, VW / 2, VH / 2 - 60, 46, banner.warn ? '#ff4a4a' : '#ffd34d', 'center');
  } else {
    ctx.fillStyle = 'rgba(0,0,20,0.45)'; ctx.fillRect(0, 0, VW, VH);
    if (state === 'over') {
      text('GAME OVER', VW / 2, 200, 56, '#fff', 'center');
      text(`SCORE ${score}`, VW / 2, 280, 26, '#ffd34d', 'center');
    } else {
      text('JOY STRIKER', VW / 2, 150, 54, '#ffd34d', 'center');
      text('1945', VW / 2, 215, 64, '#fff', 'center');
      text('스틱 = 이동', VW / 2, 330, 20, '#fff', 'center');
      text('택트 스위치 = 공격 (누르고 있으면 연사)', VW / 2, 362, 20, '#fff', 'center');
      text('스틱 누르기 = 폭탄', VW / 2, 394, 20, '#fff', 'center');
      text('HI ' + hi, VW / 2, 450, 20, '#ffd34d', 'center');
    }
    if (Math.floor(stateT / 30) % 2 === 0) text('택트 스위치를 눌러 시작', VW / 2, 520, 26, '#fff', 'center');
  }
}

runLoop(update, draw);
