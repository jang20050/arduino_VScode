// 키패드 입력 모듈
// - 아두이노(07_piano_tiles.ino)가 보내는 "P5"(누름) / "R5"(뗌) 줄을 Web Serial(Chrome·Edge)로 읽는다.
// - 키보드로도 칠 수 있다: 키패드 4×4 배열 = 1 2 3 4 / Q W E R / A S D F / Z X C V
//   키보드로 칠 때는 부저 대신 브라우저에서 소리를 낸다.

const BAUD = 9600;
const USB_FILTERS = [0x2341, 0x2a03, 0x1a86, 0x0403, 0x10c4].map(usbVendorId => ({ usbVendorId }));
const KEYBOARD = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyQ', 'KeyW', 'KeyE', 'KeyR',
                  'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV'];
export const FREQ = [262, 294, 330, 349, 392, 440, 494, 523, 587, 659, 698, 784, 880, 988, 1047, 1175];
export const NAMES = ['도', '레', '미', '파', '솔', '라', '시', "도'", "레'", "미'", "파'", "솔'", "라'", "시'", "도''", "레''"];

export const pad = {
  supported: 'serial' in navigator,
  connected: false,
  port: null,
  held: new Set(),      // 지금 눌려 있는 키 번호(1~16)
  events: [],           // { type: 'press' | 'release', key, time } — 게임이 매 프레임 꺼내 쓴다
};

function emit(type, key) {
  if (key < 1 || key > 16) return;
  if (type === 'press') {
    if (pad.held.has(key)) return;
    pad.held.add(key);
  } else {
    if (!pad.held.has(key)) return;
    pad.held.delete(key);
  }
  pad.events.push({ type, key, time: performance.now() });
}

export function takeEvents() {
  const e = pad.events;
  pad.events = [];
  return e;
}

// ---------- 키보드 + 브라우저 소리 ----------
let audio = null;
const voices = new Map();

function startTone(key) {
  if (pad.connected) return; // 키패드가 연결돼 있으면 부저가 소리를 낸다
  try { audio ||= new AudioContext(); } catch { return; }
  if (audio.state === 'suspended') audio.resume();
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = 'square';
  o.frequency.value = FREQ[key - 1];
  g.gain.value = 0.05;
  o.connect(g).connect(audio.destination);
  o.start();
  voices.set(key, { o, g });
}

function stopTone(key) {
  const v = voices.get(key);
  if (!v) return;
  v.g.gain.setTargetAtTime(0, audio.currentTime, 0.02);
  v.o.stop(audio.currentTime + 0.1);
  voices.delete(key);
}

addEventListener('keydown', e => {
  const i = KEYBOARD.indexOf(e.code);
  if (i < 0 || e.repeat) return;
  e.preventDefault();
  emit('press', i + 1);
  startTone(i + 1);
});
addEventListener('keyup', e => {
  const i = KEYBOARD.indexOf(e.code);
  if (i < 0) return;
  emit('release', i + 1);
  stopTone(i + 1);
});
addEventListener('blur', () => {
  for (const k of [...pad.held]) { emit('release', k); stopTone(k); }
});

// ---------- Web Serial ----------
function handleLine(line) {
  const m = line.trim().match(/^([PR])(\d{1,2})$/);
  if (m) emit(m[1] === 'P' ? 'press' : 'release', Number(m[2]));
}

async function openPort(port) {
  if (pad.port) return;
  pad.port = port;
  try {
    await port.open({ baudRate: BAUD });
  } catch {
    pad.port = null;
    setMessage('포트를 열 수 없습니다. 시리얼 모니터나 다른 게임 탭이 COM 포트를 쓰고 있으면 닫아 주세요.');
    return;
  }
  pad.connected = true;
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
      if (buf.length > 64) buf = '';
    }
  } catch {
    // 케이블이 빠지면 여기로 온다.
  } finally {
    reader.releaseLock();
    await piped;
    try { await port.close(); } catch {}
    pad.port = null;
    pad.connected = false;
    for (const k of [...pad.held]) emit('release', k);
    refreshBar();
  }
}

async function requestPort() {
  try {
    openPort(await navigator.serial.requestPort({ filters: USB_FILTERS }));
  } catch {
    // 사용자가 선택 창을 닫았다.
  }
}

if (pad.supported) {
  navigator.serial.getPorts().then(ports => {
    const port = ports.find(p => USB_FILTERS.some(f => f.usbVendorId === p.getInfo().usbVendorId)) || ports[0];
    if (port) openPort(port);
  });
  navigator.serial.addEventListener('connect', e => openPort(e.target));
}

// ---------- 상단 연결 막대 ----------
let bar = null;

export function mountBar(title) {
  bar = document.createElement('header');
  bar.className = 'padbar';
  bar.innerHTML = `
    <strong class="title"></strong>
    <span class="status"><i class="dot"></i><span class="label"></span></span>
    <button class="connect" type="button">키패드 연결</button>
    <span class="hint">키보드: 1 2 3 4 / Q W E R / A S D F / Z X C V</span>
    <span class="msg"></span>`;
  bar.querySelector('.title').textContent = title;
  bar.querySelector('.connect').addEventListener('click', requestPort);
  document.body.prepend(bar);
  if (!pad.supported) setMessage('이 브라우저는 Web Serial 을 지원하지 않습니다. Chrome 이나 Edge 로 열어 주세요. (키보드로는 플레이 가능)');
  refreshBar();
}

function setMessage(text) {
  if (bar) bar.querySelector('.msg').textContent = text;
}

function refreshBar() {
  if (!bar) return;
  bar.querySelector('.dot').dataset.s = pad.connected ? 'on' : 'off';
  bar.querySelector('.label').textContent = pad.connected ? '키패드 연결됨 (부저로 소리 남)' : '키패드 미연결 (키보드 사용 중)';
  bar.querySelector('.connect').hidden = pad.connected || !pad.supported;
}

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
