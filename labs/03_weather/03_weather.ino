// DHT11 온습도 + 날짜·시간(KST) · LCD1602 표시
// 보드: Arduino Uno / 시리얼 모니터: 9600 baud
// 배선: LCD I2C — GND → GND, 5V → VCC, A4 → SDA, A5 → SCL
//       DHT11 — D2 → DATA(S), 5V → VCC(+), GND → GND(−)
// 화면: 날짜·시간 5초 → 왼쪽으로 밀리며 전환 → 온습도 5초 → 다시 전환 … 반복
// 시계: RTC 모듈이 없으므로 시작 시각은 컴파일 시각(PC 시간 = KST)이고,
//       시리얼로 "T2026-10-26 14:30:00" 을 보내면 그 시각으로 맞춘다.
//       보드가 리셋되면 다시 컴파일 시각으로 돌아가므로 그때마다 다시 맞춘다.

#include <Wire.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>
#include <DHT.h>

const int DHT_PIN = 2;
const unsigned long DHT_INTERVAL_MS = 2000; // DHT11 은 1~2초 간격으로만 읽을 수 있다.
const unsigned long SCREEN_MS = 5000;       // 한 화면을 보여 주는 시간
const unsigned long SLIDE_STEP_MS = 40;     // 슬라이드 한 칸 이동 시간 (16칸 = 0.64초)

hd44780_I2Cexp lcd;
DHT dht(DHT_PIN, DHT11);

unsigned long baseSec = 0;    // 기준 시각 (2000-01-01 00:00:00 부터 초)
unsigned long baseMillis = 0; // 기준 시각을 정한 때의 millis()
unsigned long lastLogged = 0xFFFFFFFF;
unsigned long lastDhtRead = 0;
float temp = NAN, humi = NAN;

byte screen = 0;              // 0: 날짜·시간, 1: 온습도
bool sliding = false;
unsigned long phaseStart = 0;
char shown[2][17];            // 지금 LCD 에 떠 있는 내용 (바뀐 줄만 다시 쓴다)

char buf[32];
byte len = 0;

bool isLeap(int y) { return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0; }

byte daysInMonth(int y, byte m) {
  const byte days[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
  return (m == 2 && isLeap(y)) ? 29 : days[m - 1];
}

unsigned long toSec(int y, byte mo, byte d, byte h, byte mi, byte s) {
  unsigned long days = 0;
  for (int i = 2000; i < y; i++) days += isLeap(i) ? 366 : 365;
  for (byte i = 1; i < mo; i++) days += daysInMonth(y, i);
  days += d - 1;
  return days * 86400UL + h * 3600UL + mi * 60UL + s;
}

void fromSec(unsigned long t, int &y, byte &mo, byte &d, byte &h, byte &mi, byte &s) {
  unsigned long days = t / 86400UL;
  unsigned long rest = t % 86400UL;
  y = 2000;
  while (days >= (isLeap(y) ? 366UL : 365UL)) days -= isLeap(y++) ? 366 : 365;
  mo = 1;
  while (days >= daysInMonth(y, mo)) days -= daysInMonth(y, mo++);
  d = days + 1;
  h = rest / 3600;
  mi = rest / 60 % 60;
  s = rest % 60;
}

void setClock(unsigned long sec) {
  baseSec = sec;
  baseMillis = millis();
}

// __DATE__ = "Oct 26 2026", __TIME__ = "14:30:00"
void setClockFromCompileTime() {
  const char *months = "JanFebMarAprMayJunJulAugSepOctNovDec";
  char mon[4];
  int d, y, h, mi, s;
  sscanf(__DATE__, "%3s %d %d", mon, &d, &y);
  sscanf(__TIME__, "%d:%d:%d", &h, &mi, &s);
  byte mo = (strstr(months, mon) - months) / 3 + 1;
  setClock(toSec(y, mo, d, h, mi, s));
}

// "T2026-10-26 14:30:00" 형식 한 줄을 받아 시계를 맞춘다.
void applyLine() {
  int y, mo, d, h, mi, s;
  if (buf[0] == 'T' && sscanf(buf + 1, "%d-%d-%d %d:%d:%d", &y, &mo, &d, &h, &mi, &s) == 6) {
    setClock(toSec(y, mo, d, h, mi, s));
    Serial.println("시간 동기화 완료");
  } else {
    Serial.println("형식 오류: 예) T2026-10-26 14:30:00");
  }
}

void readSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (len > 0) {
        buf[len] = '\0';
        applyLine();
        len = 0;
      }
    } else if (len < sizeof(buf) - 1) {
      buf[len++] = c;
    }
  }
}

void readDht() {
  if (lastDhtRead != 0 && millis() - lastDhtRead < DHT_INTERVAL_MS) return;
  lastDhtRead = millis();
  temp = dht.readTemperature();
  humi = dht.readHumidity();
}

// 줄 끝을 공백으로 채워 정확히 16칸으로 만든다.
void pad16(char *s) {
  byte n = strlen(s);
  while (n < 16) s[n++] = ' ';
  s[16] = '\0';
}

// 화면 하나(2줄 × 16칸)의 내용을 만든다.
void buildScreen(byte which, unsigned long now, char out[2][17]) {
  if (which == 0) {
    int y;
    byte mo, d, h, mi, s;
    fromSec(now, y, mo, d, h, mi, s);
    snprintf(out[0], 17, "   %04d-%02d-%02d", y, mo, d);
    snprintf(out[1], 17, "    %02d:%02d:%02d", h, mi, s);
  } else if (isnan(temp) || isnan(humi)) {
    snprintf(out[0], 17, "  Sensor error");
    out[1][0] = '\0';
  } else {
    char t[8];
    dtostrf(temp, 4, 1, t); // AVR 의 snprintf 는 %f 를 지원하지 않는다.
    snprintf(out[0], 17, "  Temp %s%cC", t, (char)223); // 223 = LCD 의 ° 기호
    snprintf(out[1], 17, "  Humi %d%%", (int)(humi + 0.5));
  }
  pad16(out[0]);
  pad16(out[1]);
}

void draw(char frame[2][17]) {
  for (byte row = 0; row < 2; row++) {
    if (strcmp(frame[row], shown[row]) == 0) continue;
    lcd.setCursor(0, row);
    lcd.print(frame[row]);
    strcpy(shown[row], frame[row]);
  }
}

void logSerial(unsigned long now) {
  int y;
  byte mo, d, h, mi, s;
  fromSec(now, y, mo, d, h, mi, s);
  char line[24];
  snprintf(line, sizeof(line), "%04d-%02d-%02d %02d:%02d:%02d", y, mo, d, h, mi, s);
  Serial.print(line);
  if (isnan(temp) || isnan(humi)) {
    Serial.println("  센서 읽기 실패");
    return;
  }
  Serial.print("  T=");
  Serial.print(temp, 1);
  Serial.print("C H=");
  Serial.print(humi, 0);
  Serial.println("%");
}

// LCD 와 통신하던 중에 보드가 리셋되면 LCD 가 SDA 를 LOW 로 붙잡고 있어
// lcd.begin() 이 멈출 수 있다. SCL 을 최대 9번 흔들어 버스를 풀어 준다.
void releaseI2C() {
  pinMode(SDA, INPUT_PULLUP);
  pinMode(SCL, OUTPUT);
  for (byte i = 0; i < 9 && digitalRead(SDA) == LOW; i++) {
    digitalWrite(SCL, LOW);
    delayMicroseconds(10);
    digitalWrite(SCL, HIGH);
    delayMicroseconds(10);
  }
  pinMode(SCL, INPUT);
}

void setup() {
  Serial.begin(9600);
  releaseI2C();
  int status = lcd.begin(16, 2); // 가로 16글자, 세로 2줄
  if (status) { Serial.print("LCD init failed: "); Serial.println(status); while (true) {} }
  lcd.backlight();
  dht.begin();
  setClockFromCompileTime();
  Serial.println("03_weather: 시간 맞추기 예) T2026-10-26 14:30:00");
}

void loop() {
  readSerial();
  readDht();

  unsigned long now = baseSec + (millis() - baseMillis) / 1000;
  if (now != lastLogged) {
    lastLogged = now;
    logSerial(now);
  }

  unsigned long elapsed = millis() - phaseStart;
  char cur[2][17], frame[2][17];
  buildScreen(screen, now, cur);

  if (!sliding) {
    memcpy(frame, cur, sizeof(frame));
    if (elapsed >= SCREEN_MS) {
      sliding = true;
      phaseStart = millis();
    }
  } else {
    // 현재 화면은 왼쪽으로 k칸 밀려나고, 다음 화면이 오른쪽에서 k칸 들어온다.
    char next[2][17];
    buildScreen(1 - screen, now, next);
    byte k = min(elapsed / SLIDE_STEP_MS, 16UL);
    for (byte row = 0; row < 2; row++) {
      memcpy(frame[row], cur[row] + k, 16 - k);
      memcpy(frame[row] + 16 - k, next[row], k);
      frame[row][16] = '\0';
    }
    if (k == 16) {
      screen = 1 - screen;
      sliding = false;
      phaseStart = millis();
    }
  }

  draw(frame);
}
