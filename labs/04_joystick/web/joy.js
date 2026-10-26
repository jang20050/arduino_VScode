// 조이스틱 입력 모듈 (두 게임 공용)
// - 아두이노(04_joystick.ino)가 보내는 "x,y,sw,btn" 줄을 Web Serial(Chrome·Edge)로 읽는다.
// - 키보드로도 똑같이 조작할 수 있다: 방향키/WASD = 스틱, Z·스페이스 = 택트 스위치, X = 스틱 누르기(SW)
// 게임은 매 프레임 input.update() 를 한 번 부른 뒤 input.x / input.y / input.btn / input.btnDown … 을 읽는다.

const BAUD = 115200;
const DEAD = 0.22;          // 스틱 중앙 데드존 (0~1)
const SKIP_LINES = 5;       // 연결 직후 보드 리셋 중 깨진 줄은 버린다
const CALIB_LINES = 15;     // 그다음 줄들의 평균을 스틱 중앙값으로 삼는다
const SETTINGS_KEY = 'joy-settings-v1';
const USB_FILTERS = [0x2341, 0x2a03, 0x1a86, 0x0403, 0x10c4].map(usbVendorId => ({ usbVendorId }));

const DEFAULTS = { invertX: false, invertY: false, swap: false };
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
export const settings = loadSettings();
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

export const serial = {
  supported: 'serial' in navigator,
  connected: false,
  port: null,
  raw: { x: 512, y: 512, sw: 0, btn: 0 },
  center: { x: 512, y: 512 },
  idle: { sw: 0, btn: 0 },  // 손대지 않았을 때의 버튼 값 (배선에 따라 1일 수도 있다)
  skip: 0,
  calib: null,
  lines: 0,
};

// ---------- 키보드 ----------
const keys = new Set();
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  unlockAudio();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('pointerdown', unlockAudio);

const clamp = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));

function axis(raw, c) {
  const v = raw >= c ? (raw - c) / Math.max(1, 1023 - c) : (raw - c) / Math.max(1, c);
  const a = Math.abs(v);
  if (a < DEAD) return 0;
  return Math.sign(v) * Math.min(1, (a - DEAD) / (1 - DEAD));
}

// ---------- 게임이 읽는 입력 상태 ----------
export const input = {
  x: 0, y: 0,                 // -1(왼쪽·위) ~ 1(오른쪽·아래)
  left: false, right: false, up: false, down: false,
  leftDown: false, rightDown: false, upDown: false, downDown: false,
  btn: false, btnDown: false, // 택트 스위치
  sw: false, swDown: false,   // 스틱 누르기
  update() {
    let jx = 0, jy = 0, jsw = false, jbtn = false;
    if (serial.connected && !serial.calib && serial.skip === 0) {
      let x = axis(serial.raw.x, serial.center.x);
      let y = axis(serial.raw.y, serial.center.y);
      if (settings.swap) [x, y] = [y, x];
      if (settings.invertX) x = -x;
      if (settings.invertY) y = -y;
      jx = x; jy = y;
      jsw = serial.raw.sw !== serial.idle.sw;
      jbtn = serial.raw.btn !== serial.idle.btn;
    }
    const k = c => keys.has(c);
    const kx = (k('ArrowRight') || k('KeyD') ? 1 : 0) - (k('ArrowLeft') || k('KeyA') ? 1 : 0);
    const ky = (k('ArrowDown') || k('KeyS') ? 1 : 0) - (k('ArrowUp') || k('KeyW') ? 1 : 0);
    const x = clamp(jx + kx), y = clamp(jy + ky);
    const btn = jbtn || k('KeyZ') || k('Space') || k('KeyJ') || k('Enter');
    const sw = jsw || k('KeyX') || k('KeyK');

    const was = { left: this.left, right: this.right, up: this.up, down: this.down };
    this.x = x; this.y = y;
    this.left = x < -0.5; this.right = x > 0.5; this.up = y < -0.5; this.down = y > 0.5;
    for (const d of ['left', 'right', 'up', 'down']) this[d + 'Down'] = this[d] && !was[d];
    this.btnDown = btn && !this.btn; this.btn = btn;
    this.swDown = sw && !this.sw; this.sw = sw;
  },
};

// ---------- Web Serial ----------
function handleLine(line) {
  const p = line.trim().split(',');
  if (p.length !== 4) return;
  const v = p.map(Number);
  if (v.some(n => !Number.isInteger(n) || n < 0 || n > 1023)) return;
  serial.lines++;
  if (serial.skip > 0) { serial.skip--; return; }
  serial.raw = { x: v[0], y: v[1], sw: v[2], btn: v[3] };
  if (serial.calib) {
    serial.calib.push(v);
    if (serial.calib.length >= CALIB_LINES) finishCalib();
  }
}

function finishCalib() {
  const c = serial.calib;
  const avg = i => c.reduce((s, a) => s + a[i], 0) / c.length;
  const cx = avg(0), cy = avg(1);
  // 연결 순간 스틱을 기울이고 있었다면 이상한 값이 되므로 그때는 512 를 쓴다.
  serial.center = { x: Math.abs(cx - 512) < 160 ? cx : 512, y: Math.abs(cy - 512) < 160 ? cy : 512 };
  serial.idle = { sw: Math.round(avg(2)), btn: Math.round(avg(3)) };
  serial.calib = null;
  refreshBar();
}

export function recalibrate() {
  if (!serial.connected) return;
  serial.calib = [];
  refreshBar();
}

async function openPort(port) {
  if (serial.port) return;
  serial.port = port;
  try {
    await port.open({ baudRate: BAUD });
  } catch (e) {
    serial.port = null;
    setMessage('포트를 열 수 없습니다. 시리얼 모니터 등 다른 프로그램이 COM 포트를 쓰고 있으면 닫아 주세요.');
    return;
  }
  serial.connected = true;
  serial.skip = SKIP_LINES;
  serial.calib = [];
  serial.lines = 0;
  setMessage('');
  refreshBar();

  const decoder = new TextDecoderStream();
  const piped = port.readable.pipeTo(decoder.writable).catch(() => {});
  const reader = decoder.readable.getReader();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        handleLine(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
      if (buf.length > 256) buf = '';
    }
  } catch {
    // 케이블이 빠지면 여기로 온다.
  } finally {
    reader.releaseLock();
    await piped;
    try { await port.close(); } catch {}
    serial.port = null;
    serial.connected = false;
    refreshBar();
  }
}

async function requestPort() {
  if (!serial.supported) return;
  try {
    const port = await navigator.serial.requestPort({ filters: USB_FILTERS });
    openPort(port);
  } catch {
    // 사용자가 선택 창을 닫았다.
  }
}

if (serial.supported) {
  // 한 번 허용한 포트는 다음부터 자동으로 연결한다 (게임 사이를 오갈 때도).
  navigator.serial.getPorts().then(ports => {
    const port = ports.find(p => USB_FILTERS.some(f => f.usbVendorId === p.getInfo().usbVendorId)) || ports[0];
    if (port) openPort(port);
  });
  navigator.serial.addEventListener('connect', e => openPort(e.target));
}

// ---------- 효과음 (WebAudio) ----------
let audio = null;
function unlockAudio() {
  if (!audio) {
    try { audio = new AudioContext(); } catch { return; }
  }
  if (audio.state === 'suspended') audio.resume();
}

export function beep(freq, dur = 0.08, type = 'square', to = null, vol = 0.06) {
  if (!audio || audio.state !== 'running') return;
  const t = audio.currentTime;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function noise(dur = 0.3, vol = 0.12) {
  if (!audio || audio.state !== 'running') return;
  const len = Math.floor(audio.sampleRate * dur);
  const b = audio.createBuffer(1, len, audio.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const s = audio.createBufferSource();
  const g = audio.createGain();
  g.gain.value = vol;
  s.buffer = b;
  s.connect(g).connect(audio.destination);
  s.start();
}

// ---------- 고정 60fps 게임 루프 ----------
export function runLoop(update, draw) {
  const STEP = 1000 / 60;
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(100, now - last);
    last = now;
    while (acc >= STEP) {
      input.update();
      update();
      acc -= STEP;
    }
    draw();
    drawStick();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------- 상단 연결 막대 ----------
let bar = null;

export function mountBar(title, { home = true } = {}) {
  bar = document.createElement('header');
  bar.className = 'joybar';
  bar.innerHTML = `
    ${home ? '<a class="home" href="index.html">← 메뉴</a>' : ''}
    <strong class="title"></strong>
    <span class="status"><i class="dot"></i><span class="label"></span></span>
    <button class="connect" type="button">조이스틱 연결</button>
    <canvas class="stick" width="34" height="34" title="현재 스틱 입력"></canvas>
    <span class="btns"><b class="b-btn">택트</b><b class="b-sw">SW</b></span>
    <details class="settings">
      <summary>설정</summary>
      <div class="panel">
        <label><input type="checkbox" data-k="invertX"> 좌우 반전</label>
        <label><input type="checkbox" data-k="invertY"> 상하 반전</label>
        <label><input type="checkbox" data-k="swap"> X·Y 축 바꾸기</label>
        <button type="button" class="recal">스틱 중앙 다시 맞추기</button>
        <p class="raw"></p>
        <p class="hint">키보드: 방향키/WASD = 스틱, Z·스페이스 = 택트, X = SW</p>
      </div>
    </details>
    <span class="msg"></span>`;
  bar.querySelector('.title').textContent = title;
  bar.querySelector('.connect').addEventListener('click', requestPort);
  bar.querySelector('.recal').addEventListener('click', recalibrate);
  for (const cb of bar.querySelectorAll('input[data-k]')) {
    cb.checked = settings[cb.dataset.k];
    cb.addEventListener('change', () => { settings[cb.dataset.k] = cb.checked; saveSettings(); });
  }
  document.body.prepend(bar);
  if (!serial.supported) setMessage('이 브라우저는 Web Serial 을 지원하지 않습니다. Chrome 이나 Edge 로 열어 주세요. (키보드로는 플레이 가능)');
  refreshBar();
}

function setMessage(text) {
  if (bar) bar.querySelector('.msg').textContent = text;
}

function refreshBar() {
  if (!bar) return;
  const label = bar.querySelector('.label');
  const dot = bar.querySelector('.dot');
  const btn = bar.querySelector('.connect');
  btn.hidden = serial.connected || !serial.supported;
  if (!serial.connected) {
    dot.dataset.s = 'off';
    label.textContent = '조이스틱 미연결 (키보드 사용 중)';
  } else if (serial.calib || serial.skip) {
    dot.dataset.s = 'wait';
    label.textContent = '스틱 중앙 맞추는 중… 손대지 마세요';
  } else {
    dot.dataset.s = 'on';
    label.textContent = '조이스틱 연결됨';
  }
}

function drawStick() {
  if (!bar) return;
  const c = bar.querySelector('.stick');
  const g = c.getContext('2d');
  g.clearRect(0, 0, 34, 34);
  g.strokeStyle = '#8899aa';
  g.lineWidth = 2;
  g.beginPath(); g.arc(17, 17, 15, 0, Math.PI * 2); g.stroke();
  g.fillStyle = input.x || input.y ? '#ffcc33' : '#cfd8e3';
  g.beginPath(); g.arc(17 + input.x * 10, 17 + input.y * 10, 6, 0, Math.PI * 2); g.fill();
  bar.querySelector('.b-btn').classList.toggle('on', input.btn);
  bar.querySelector('.b-sw').classList.toggle('on', input.sw);
  const raw = bar.querySelector('.raw');
  if (raw.offsetParent) {
    raw.textContent = serial.connected
      ? `원시값 x=${serial.raw.x} y=${serial.raw.y} sw=${serial.raw.sw} btn=${serial.raw.btn} · 중앙 (${Math.round(serial.center.x)}, ${Math.round(serial.center.y)})`
      : '조이스틱이 연결되지 않았습니다.';
  }
}

// 캔버스를 화면에 맞게 키운다 (비율 유지).
export function fitCanvas(canvas) {
  const fit = () => {
    const top = bar ? bar.offsetHeight : 0;
    const s = Math.min((innerWidth - 16) / canvas.width, (innerHeight - top - 16) / canvas.height);
    canvas.style.width = Math.floor(canvas.width * s) + 'px';
    canvas.style.height = Math.floor(canvas.height * s) + 'px';
  };
  addEventListener('resize', fit);
  fit();
}
