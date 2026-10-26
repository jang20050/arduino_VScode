// 키패드 피아노 타일 — 떨어지는 타일이 판정선에 닿을 때 같은 번호의 키를 누른다.
// 리듬 모드: 박자에 맞춰 누르면 PERFECT / GOOD / BAD, 놓치면 MISS
// 연습 모드: 맞는 키를 누를 때까지 노래가 기다려 준다 (원래 피아노 타일 방식)
// 긴 타일(2박 이상): 끝까지 누르고 있다가 타일이 끝나는 순간에 떼면 보너스 (일찍 떼면 EARLY, 너무 늦으면 LATE)

import { pad, takeEvents, mountBar, fitCanvas, NAMES } from './keypad.js';

mountBar('키패드 피아노 타일');
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
fitCanvas(cv);

const VW = 960, VH = 640;
const LANES = 8, LANE_W = 76, LANE_X = 24, JUDGE_Y = 520;
const LEAD = 3;                       // 첫 음까지의 준비 시간(초)
const WIN = { perfect: 0.07, good: 0.14, bad: 0.2 };
const POINTS = { PERFECT: 300, GOOD: 150, BAD: 50, MISS: 0 };
const LONG_BEATS = 2;                 // 이 박자 이상이면 긴 타일
const RELEASE_GAP = 0.25;             // 긴 타일 끝은 다음 음보다 0.25박 앞 (떼고 다음 키를 누를 여유)
const HOLD_WIN = { perfect: 0.1, good: 0.2 };
const RELEASE_POINTS = { PERFECT: 300, GOOD: 150, LATE: 0, EARLY: 0 };
const BEST_KEY = 'piano-tiles-best-v2';

// 메뉴 조작 키
const KEY_MODE = 13, KEY_SPEED = 14, KEY_BACK = 16;
const SPEEDS = [{ name: '느리게', tempo: 0.75 }, { name: '보통', tempo: 1 }, { name: '빠르게', tempo: 1.3 }];

// 악보: 숫자 = 키 번호, '-' 하나마다 한 박 더 길게, '|' 는 마디 구분(무시)
const SONGS = [
  { title: '비행기', bpm: 110, score: '3 2 1 2 | 3 3 3- | 2 2 2- | 3 5 5- | 3 2 1 2 | 3 3 3- | 2 2 3 2 | 1--' },
  { title: '학교종', bpm: 110, score: '5 5 6 6 | 5 5 3- | 5 5 3 3 | 2-- | 5 5 6 6 | 5 5 3- | 5 3 2 3 | 1--' },
  { title: '반짝반짝 작은 별', bpm: 100, score: '1 1 5 5 | 6 6 5- | 4 4 3 3 | 2 2 1- | 5 5 4 4 | 3 3 2- | 5 5 4 4 | 3 3 2- | 1 1 5 5 | 6 6 5- | 4 4 3 3 | 2 2 1-' },
  { title: '나비야', bpm: 110, score: '5 3 3- | 4 2 2- | 1 2 3 4 | 5 5 5- | 5 3 3 3 | 4 2 2 2 | 1 3 5 5 | 3 3 3- | 2 2 2 2 | 2 3 4- | 3 3 3 3 | 3 4 5- | 5 3 3 3 | 4 2 2 2 | 1 3 5 5 | 1--' },
  { title: '산토끼', bpm: 110, score: '5 3 3 5 | 3 1- | 2 3 2 1 | 3 5- | 8 5 8 5 | 8 5 3- | 5 2 4 3 | 2 1-' },
];

let state = 'menu';                   // menu · play · result
let practice = false, speedIdx = 1;
let song, notes, spb, travel, songTime, startAt, lastNow;
let score, combo, maxCombo, counts, rel, judge, flashes, wrongFlash, finishedAt;
let best = {};
try { best = JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch {}

const bestKey = s => `${s.title}|${practice ? 'practice' : 'rhythm'}|${speedIdx}`;

function parse(text) {
  const out = [];
  let beat = 0;
  for (const tok of text.split(/\s+/)) {
    const m = tok.match(/^(\d+)(-*)$/);
    if (!m) continue;
    const len = 1 + m[2].length;
    out.push({ key: Number(m[1]), beat, len });
    beat += len;
  }
  return out;
}

// ---------- 흐름 ----------
function start(s) {
  song = s;
  spb = 60 / (s.bpm * SPEEDS[speedIdx].tempo);
  travel = Math.max(1.1, 1.8 / SPEEDS[speedIdx].tempo);
  // done = 누름 판정, hold = 긴 타일 상태 (null → 'holding' → 떼기 판정)
  notes = parse(s.score).map(n => {
    const t = LEAD + n.beat * spb, dur = n.len * spb, long = n.len >= LONG_BEATS;
    return { ...n, t, dur, long, end: long ? t + dur - RELEASE_GAP * spb : t, done: null, hold: null };
  });
  score = 0; combo = 0; maxCombo = 0;
  counts = { PERFECT: 0, GOOD: 0, BAD: 0, MISS: 0 };
  rel = { PERFECT: 0, GOOD: 0, LATE: 0, EARLY: 0 };
  judge = null; flashes = []; wrongFlash = 0; finishedAt = 0;
  songTime = 0;
  startAt = performance.now();
  lastNow = startAt;
  state = 'play';
}

function finish() {
  state = 'result';
  finishedAt = performance.now();
  const k = bestKey(song);
  if (!best[k] || score > best[k]) {
    best[k] = score;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch {}
  }
}

function grade(name, n) {
  counts[name]++;
  if (name === 'MISS' || name === 'BAD') combo = 0;
  else combo++;
  maxCombo = Math.max(maxCombo, combo);
  score += POINTS[name] + (name === 'MISS' ? 0 : Math.min(combo, 50) * 2);
  judge = { name, at: performance.now() };
  if (n) {
    n.done = name;
    if (name !== 'MISS') flashes.push({ key: n.key, at: performance.now() });
    if (n.long && name !== 'MISS') n.hold = 'holding';
  }
}

function releaseGrade(n, name) {
  rel[name]++;
  n.hold = name;
  if (name === 'EARLY') combo = 0;
  else if (name !== 'LATE') combo++;
  maxCombo = Math.max(maxCombo, combo);
  score += RELEASE_POINTS[name] + (RELEASE_POINTS[name] ? Math.min(combo, 50) * 2 : 0);
  judge = { name, release: true, at: performance.now() };
  if (name === 'PERFECT' || name === 'GOOD') flashes.push({ key: n.key, at: performance.now() });
}

// 긴 타일을 누르고 있던 키를 뗐을 때
function onRelease(key, time) {
  if (state !== 'play') return;
  const n = notes.find(n => n.hold === 'holding' && n.key === key);
  if (!n) return;
  const t = practice ? songTime : (time - startAt) / 1000;
  const d = t - n.end;
  if (d < -HOLD_WIN.good) releaseGrade(n, 'EARLY');
  else if (Math.abs(d) <= HOLD_WIN.perfect) releaseGrade(n, 'PERFECT');
  else if (Math.abs(d) <= HOLD_WIN.good) releaseGrade(n, 'GOOD');
  else releaseGrade(n, 'LATE');
}

// ---------- 입력 처리 ----------
function onPress(key, time) {
  if (state === 'menu') {
    if (key >= 1 && key <= SONGS.length) start(SONGS[key - 1]);
    else if (key === KEY_MODE) practice = !practice;
    else if (key === KEY_SPEED) speedIdx = (speedIdx + 1) % SPEEDS.length;
    return;
  }
  if (state === 'result') {
    if (performance.now() - finishedAt > 600) state = 'menu';
    return;
  }
  if (key === KEY_BACK) { state = 'menu'; return; }

  if (practice) {
    const next = notes.find(n => !n.done);
    if (!next) return;
    // 화면에 보이는 다음 타일과 같은 키면 성공
    if (key === next.key && next.t - songTime < travel) grade('PERFECT', next);
    else { wrongFlash = performance.now(); combo = 0; }
    return;
  }

  const t = (time - startAt) / 1000;
  let target = null;
  for (const n of notes) {
    if (n.done || n.key !== key) continue;
    const d = Math.abs(n.t - t);
    if (d <= WIN.bad && (!target || d < Math.abs(target.t - t))) target = n;
  }
  if (!target) { combo = 0; wrongFlash = performance.now(); return; }
  const d = Math.abs(target.t - t);
  grade(d <= WIN.perfect ? 'PERFECT' : d <= WIN.good ? 'GOOD' : 'BAD', target);
}

// ---------- 업데이트 ----------
function update(now) {
  for (const e of takeEvents()) {
    if (e.type === 'press') onPress(e.key, e.time);
    else onRelease(e.key, e.time);
  }
  if (state !== 'play') return;

  const dt = (now - lastNow) / 1000;
  lastNow = now;
  if (practice) {
    // 맞는 키를 누를 때까지 멈춘다. 긴 타일을 누르고 있는 동안은 떼기 판정을 위해 계속 흐르고,
    // 시간을 되돌리지는 않는다.
    const next = notes.find(n => !n.done);
    const holding = notes.some(n => n.hold === 'holding');
    const t = songTime + dt;
    songTime = holding || !next ? t : Math.max(songTime, Math.min(t, next.t));
  } else {
    songTime = (now - startAt) / 1000;
    for (const n of notes) if (!n.done && songTime - n.t > WIN.bad) grade('MISS', n);
  }
  for (const n of notes) if (n.hold === 'holding' && songTime - n.end > HOLD_WIN.good) releaseGrade(n, 'LATE');

  const last = notes[notes.length - 1];
  if (notes.every(n => n.done && n.hold !== 'holding') && songTime > last.t + last.dur + 0.8) finish();
}

// ---------- 그리기 ----------
const laneColor = (i, l = 60) => `hsl(${(i * 40 + 200) % 360}, 75%, ${l}%)`;

function text(s, x, y, size = 20, color = '#fff', align = 'left', weight = 'bold') {
  ctx.font = `${weight} ${size}px "Malgun Gothic", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function roundRect(x, y, w, h, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawLanes(now) {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#141a30'); g.addColorStop(1, '#0b0f1c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);

  for (let i = 0; i < LANES; i++) {
    const x = LANE_X + i * LANE_W, key = i + 1;
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, 0, LANE_W, JUDGE_Y);
    if (pad.held.has(key)) {
      const lg = ctx.createLinearGradient(0, 0, 0, JUDGE_Y);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, laneColor(i, 60).replace('hsl', 'hsla').replace('%)', '%, 0.35)'));
      ctx.fillStyle = lg; ctx.fillRect(x, 0, LANE_W, JUDGE_Y);
    }
    // 아래쪽 건반
    const down = pad.held.has(key);
    roundRect(x + 3, JUDGE_Y + 10, LANE_W - 6, VH - JUDGE_Y - 20, 8, down ? laneColor(i, 62) : '#222a44');
    text(String(key), x + LANE_W / 2, JUDGE_Y + 48, 30, down ? '#10131f' : '#fff', 'center');
    text(NAMES[i], x + LANE_W / 2, JUDGE_Y + 84, 17, down ? '#10131f' : '#9aa6c8', 'center');
  }
  // 판정선
  ctx.fillStyle = now - wrongFlash < 200 ? '#ff4a5a' : '#ffcc33';
  ctx.fillRect(LANE_X, JUDGE_Y - 2, LANES * LANE_W, 4);
}

function drawNotes(now) {
  const pps = JUDGE_Y / travel;
  const next = notes.find(n => !n.done);
  for (const n of notes) {
    const i = n.key - 1, x = LANE_X + i * LANE_W;

    // 누르고 있는 긴 타일: 판정선 아래로 빨려 들어가며 줄어든다
    if (n.hold === 'holding') {
      const top = JUDGE_Y - (n.end - songTime) * pps;
      const h = JUDGE_Y - Math.max(0, top);
      ctx.save();
      ctx.shadowColor = laneColor(i, 70); ctx.shadowBlur = 24;
      if (h > 0) roundRect(x + 6, JUDGE_Y - h, LANE_W - 12, h, 8, laneColor(i, 68));
      ctx.restore();
      drawReleaseMark(x, Math.min(top, JUDGE_Y), Math.abs(n.end - songTime) <= HOLD_WIN.perfect);
      continue;
    }
    if (n.done) continue;

    const bottom = JUDGE_Y - (n.t - songTime) * pps;
    const h = n.long ? Math.max(30, (n.end - n.t) * pps) : Math.max(30, n.dur * pps - 6);
    if (bottom < 0 || bottom - h > JUDGE_Y + 40) continue;
    const isNext = n === next;
    roundRect(x + 6, bottom - h, LANE_W - 12, h, 8, laneColor(i, isNext ? 58 : 45));
    roundRect(x + 6, bottom - 26, LANE_W - 12, 26, 8, laneColor(i, isNext ? 75 : 60));
    text(String(n.key), x + LANE_W / 2, bottom - 13, 18, '#10131f', 'center');
    if (n.long) {
      drawReleaseMark(x, bottom - h, false);
      text('길게', x + LANE_W / 2, bottom - h / 2 - 6, 13, 'rgba(16,19,31,0.6)', 'center');
    }
    if (isNext && practice) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(x + 6, bottom - h, LANE_W - 12, h, 8); ctx.stroke();
    }
  }
  // 맞힌 타일 빛
  for (const f of flashes) {
    const k = (now - f.at) / 300;
    if (k > 1) continue;
    const x = LANE_X + (f.key - 1) * LANE_W + LANE_W / 2;
    ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - k)})`;
    ctx.beginPath(); ctx.ellipse(x, JUDGE_Y, LANE_W * (0.4 + k * 0.6), 18 + k * 30, 0, 0, Math.PI * 2); ctx.fill();
  }
  flashes = flashes.filter(f => now - f.at < 300);
}

// 긴 타일 윗변: 여기가 판정선에 닿을 때 뗀다. now 가 true 면 지금이 뗄 때.
function drawReleaseMark(x, y, now) {
  ctx.fillStyle = now ? '#ffffff' : 'rgba(255,255,255,0.85)';
  ctx.fillRect(x + 6, y - 2, LANE_W - 12, now ? 6 : 4);
  if (now) text('떼!', x + LANE_W / 2, y - 16, 16, '#fff', 'center');
}

function drawKeypad(x0, y0, highlight) {
  const C = 56, G = 6;
  for (let k = 1; k <= 16; k++) {
    const r = Math.floor((k - 1) / 4), c = (k - 1) % 4;
    const x = x0 + c * (C + G), y = y0 + r * (C + G);
    const down = pad.held.has(k);
    roundRect(x, y, C, C, 8, down ? '#ffcc33' : k === highlight ? '#3a4a80' : '#222a44');
    if (k === highlight && !down) {
      ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(x, y, C, C, 8); ctx.stroke();
    }
    text(String(k), x + C / 2, y + 22, 20, down ? '#10131f' : '#fff', 'center');
    text(NAMES[k - 1], x + C / 2, y + 42, 12, down ? '#10131f' : '#8d97b5', 'center', 'normal');
  }
}

function drawPanel(now) {
  const x = 660;
  text(song.title, x, 40, 26);
  text(`${practice ? '연습 모드' : '리듬 모드'} · ${SPEEDS[speedIdx].name}`, x, 72, 15, '#8d97b5', 'left', 'normal');
  text('SCORE', x, 112, 14, '#8d97b5');
  text(String(score).padStart(6, '0'), x, 140, 30);
  text('COMBO', x + 160, 112, 14, '#8d97b5');
  text(String(combo), x + 160, 140, 30, combo >= 10 ? '#ffcc33' : '#fff');

  const done = notes.filter(n => n.done).length;
  roundRect(x, 172, 270, 8, 4, '#222a44');
  roundRect(x, 172, 270 * done / notes.length, 8, 4, '#3ddc84');

  const next = notes.find(n => !n.done);
  text('다음 키', x, 210, 14, '#8d97b5');
  drawKeypad(x, 226, next?.key);
  text('16번 키: 메뉴로', x, 494, 13, '#8d97b5', 'left', 'normal');

  // 판정 글자
  if (judge && now - judge.at < 500) {
    const k = (now - judge.at) / 500;
    const color = { PERFECT: '#ffe066', GOOD: '#7cf29c', BAD: '#ffa64d', MISS: '#ff5a6a', LATE: '#ffa64d', EARLY: '#ff5a6a' }[judge.name];
    ctx.globalAlpha = 1 - k * 0.7;
    text(judge.release ? `떼기 ${judge.name}` : judge.name, LANE_X + LANES * LANE_W / 2, 300 - k * 20, 44, color, 'center');
    if (combo > 1) text(`${combo} COMBO`, LANE_X + LANES * LANE_W / 2, 346 - k * 20, 22, '#fff', 'center');
    ctx.globalAlpha = 1;
  }
  // 준비 카운트다운
  const first = notes[0];
  if (songTime < first.t - travel + 0.2 && !practice) {
    const left = Math.ceil(first.t - travel - songTime);
    text(left > 0 ? String(left) : '시작!', LANE_X + LANES * LANE_W / 2, 260, 72, '#fff', 'center');
  }
}

function drawMenu() {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#1a2244'); g.addColorStop(1, '#0b0f1c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  text('키패드 피아노 타일', 60, 70, 44);
  text('떨어지는 타일이 노란 선에 닿을 때 같은 번호의 키를 누르세요.', 60, 116, 17, '#9aa6c8', 'left', 'normal');

  SONGS.forEach((s, i) => {
    const y = 160 + i * 64;
    roundRect(60, y, 500, 54, 10, '#1f2744');
    roundRect(72, y + 9, 36, 36, 8, '#ffcc33');
    text(String(i + 1), 90, y + 28, 20, '#10131f', 'center');
    text(s.title, 126, y + 28, 22);
    const b = best[bestKey(s)];
    text(b ? `최고 ${b}` : '', 544, y + 28, 15, '#8d97b5', 'right', 'normal');
  });
  text('노래 번호 키를 누르면 시작합니다.', 60, 500, 16, '#9aa6c8', 'left', 'normal');
  text('긴 타일은 끝까지 누르고 있다가, 흰 선이 노란 선에 닿을 때 떼면 보너스!', 60, 528, 16, '#9aa6c8', 'left', 'normal');

  const x = 620;
  roundRect(x, 160, 300, 54, 10, '#1f2744');
  text(`${KEY_MODE}번 키`, x + 16, 187, 15, '#ffcc33');
  text(practice ? '연습 모드 (기다려 줌)' : '리듬 모드 (박자 판정)', x + 100, 187, 17);
  roundRect(x, 224, 300, 54, 10, '#1f2744');
  text(`${KEY_SPEED}번 키`, x + 16, 251, 15, '#ffcc33');
  text(`속도: ${SPEEDS[speedIdx].name}`, x + 100, 251, 17);
  drawKeypad(x + 26, 300, 0);
}

function drawResult() {
  ctx.fillStyle = 'rgba(8,10,20,0.82)'; ctx.fillRect(0, 0, VW, VH);
  const longs = notes.filter(n => n.long).length;
  const total = notes.length + longs;
  const acc = (counts.PERFECT + counts.GOOD * 0.6 + counts.BAD * 0.2 + rel.PERFECT + rel.GOOD * 0.6 + rel.LATE * 0.3) / total;
  const rank = practice ? '완주!' : acc >= 0.95 ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.7 ? 'B' : acc >= 0.5 ? 'C' : 'D';
  text(song.title, VW / 2, 110, 30, '#fff', 'center');
  text(rank, VW / 2, 200, practice ? 64 : 110, '#ffcc33', 'center');
  text(`SCORE ${score}`, VW / 2, 300, 30, '#fff', 'center');
  if (!practice) {
    text(`PERFECT ${counts.PERFECT}   GOOD ${counts.GOOD}   BAD ${counts.BAD}   MISS ${counts.MISS}`, VW / 2, 350, 20, '#c8d0ea', 'center', 'normal');
    text(`정확도 ${(acc * 100).toFixed(1)}%   ·   최대 콤보 ${maxCombo}`, VW / 2, 422, 20, '#c8d0ea', 'center', 'normal');
  } else {
    text(`틀린 키 없이 이어 친 최대 콤보 ${maxCombo}`, VW / 2, 422, 20, '#c8d0ea', 'center', 'normal');
  }
  if (longs) text(`긴 타일 떼기  PERFECT ${rel.PERFECT}   GOOD ${rel.GOOD}   LATE ${rel.LATE}   EARLY ${rel.EARLY}`, VW / 2, 386, 20, '#c8d0ea', 'center', 'normal');
  if (best[bestKey(song)] === score) text('최고 기록!', VW / 2, 460, 22, '#3ddc84', 'center');
  text('아무 키나 누르면 메뉴로', VW / 2, 510, 20, '#fff', 'center');
}

function frame(now) {
  update(now);
  if (state === 'menu') drawMenu();
  else {
    drawLanes(now);
    drawNotes(now);
    drawPanel(now);
    if (state === 'result') drawResult();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
