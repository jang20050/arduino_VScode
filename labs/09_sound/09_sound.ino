// 09_sound: 소리 감지 모듈의 소리 크기를 추정 dB 로 보여 주고, 임계값을 넘으면 경보를 띄운다
// 보드: Arduino Uno / 시리얼: 9600 baud
// 배선: 모듈 VCC(+) → 5V, GND(−) → GND, AO → A0
// 터미널: ANSI 색을 쓰므로 VS Code 터미널에서 `python tools/lab.py monitor` 로 본다.
//         (Arduino IDE 시리얼 모니터는 색 코드를 해석하지 못해 글자가 섞여 보인다)
// 임계값 바꾸기: 시리얼로 "T65" 처럼 보내면 65 dB 로 바뀐다 (보드가 리셋되면 기본값으로 돌아감).
//
// dB 계산: 이 모듈은 교정된 소음계가 아니다. 250ms 동안 AO 전압의 흔들림 폭(최대 − 최소)을 재고
//          dB = DB_OFFSET + 20·log10(흔들림 폭) 으로 바꾼 "추정값"이다.
//          흔들림 폭은 1~1023 이므로 표현 가능한 범위는 DB_OFFSET ~ DB_OFFSET + 60.2 dB 이다.
//          모듈의 가변저항(감도)을 돌리면 같은 소리도 값이 달라진다.

#include <math.h>

const int MIC_PIN = A0;
const unsigned long WINDOW_MS = 250;   // 한 번 측정하는 시간 (= 화면 갱신 간격)
const float DB_OFFSET = 30.0;          // 조용한 방이 30~40 dB 쯤 나오도록 맞춘 값
const float DB_MIN = DB_OFFSET;
const float DB_MAX = DB_OFFSET + 20.0 * log10(1023.0);
const byte BAR_LEN = 30;
const unsigned long ALARM_HOLD_MS = 1000;  // 경보 뒤 이만큼 조용해야 "해제" 로 본다

float thresholdDb = 70.0;              // 기본 임계값
bool alarming = false;
unsigned long lastLoud = 0;
float peakDb = 0;

char buf[16];      // 시리얼로 받는 명령 한 줄
byte len = 0;
char num[8];       // 숫자를 글자로 바꿀 때 쓰는 칸

// ANSI 색 코드
#define RESET   "\033[0m"
#define BOLD    "\033[1m"
#define DIM     "\033[2m"
#define GREEN   "\033[92m"
#define YELLOW  "\033[93m"
#define RED     "\033[91m"
#define CYAN    "\033[96m"
#define ALARM   "\033[1;97;41m"
#define CLEAR_LINE "\r\033[2K"

int measurePeakToPeak() {
  int lo = 1023, hi = 0;
  unsigned long start = millis();
  while (millis() - start < WINDOW_MS) {
    int v = analogRead(MIC_PIN);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return hi - lo;
}

float toDb(int p2p) {
  return DB_OFFSET + 20.0 * log10(max(p2p, 1));
}

const char *levelColor(float db) {
  if (db >= thresholdDb) return RED;
  if (db >= thresholdDb - 15) return YELLOW;
  return GREEN;
}

void printDb(float db) {
  dtostrf(db, 5, 1, num);
  Serial.print(num);
  Serial.print(" dB");
}

// 한 줄을 계속 덮어쓰는 막대 그래프:  소리  52.3 dB [██████······]  임계 70 dB
void printMeter(float db, int p2p) {
  byte filled = constrain((db - DB_MIN) / (DB_MAX - DB_MIN) * BAR_LEN + 0.5, 0, BAR_LEN);
  byte mark = constrain((thresholdDb - DB_MIN) / (DB_MAX - DB_MIN) * BAR_LEN, 0, BAR_LEN - 1);
  Serial.print(CLEAR_LINE);
  Serial.print(BOLD "소리 " RESET);
  Serial.print(levelColor(db));
  Serial.print(BOLD);
  printDb(db);
  // 9600bps 로 0.25초 안에 다 보내야 하므로 색 코드는 구간마다 한 번만 보낸다.
  Serial.print(RESET " [");
  Serial.print(levelColor(db));
  for (byte i = 0; i < filled; i++) Serial.print("█");
  Serial.print(RESET DIM);
  for (byte i = filled; i < BAR_LEN; i++) {
    if (i == mark) Serial.print(RESET RED "|" RESET DIM);
    else Serial.print("·");
  }
  Serial.print(RESET "] " DIM "임계 ");
  Serial.print((int)thresholdDb);
  Serial.print(" dB  p2p ");
  Serial.print(p2p);
  Serial.print(RESET);
}

void printAlarm(float db) {
  Serial.print(CLEAR_LINE);
  Serial.print(ALARM " ! 경보 " RESET RED BOLD " ");
  printDb(db);
  Serial.print(" — 임계값 ");
  Serial.print((int)thresholdDb);
  Serial.println(" dB 초과" RESET);
}

void printRecover() {
  Serial.print(CLEAR_LINE);
  Serial.print(GREEN "   해제: 다시 조용해졌습니다 (경보 중 최대 ");
  printDb(peakDb);
  Serial.println(")" RESET);
}

void readSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c != '\n' && c != '\r') {
      if (len < sizeof(buf) - 1) buf[len++] = c;
      continue;
    }
    if (!len) continue;
    buf[len] = '\0';
    len = 0;
    int v;
    Serial.print(CLEAR_LINE);
    if ((buf[0] == 'T' || buf[0] == 't') && sscanf(buf + 1, "%d", &v) == 1 && v >= DB_MIN && v <= DB_MAX) {
      thresholdDb = v;
      Serial.print(CYAN "임계값을 ");
      Serial.print(v);
      Serial.println(" dB 로 바꿨습니다" RESET);
    } else {
      Serial.print(YELLOW "형식: T65 (");
      Serial.print((int)DB_MIN);
      Serial.print("~");
      Serial.print((int)DB_MAX);
      Serial.println(" dB)" RESET);
    }
  }
}

void setup() {
  Serial.begin(9600);
  Serial.println();
  Serial.println(BOLD CYAN "09_sound: 소리 크기 측정 (추정 dB)" RESET);
  Serial.print(DIM "표현 가능한 범위: ");
  Serial.print((int)DB_MIN);
  Serial.print(" ~ ");
  Serial.print((int)DB_MAX);
  Serial.print(" dB  /  임계값 ");
  Serial.print((int)thresholdDb);
  Serial.println(" dB  /  임계값 바꾸기: T65" RESET);
}

void loop() {
  readSerial();
  int p2p = measurePeakToPeak();
  float db = toDb(p2p);

  if (db >= thresholdDb) {
    lastLoud = millis();
    if (!alarming) {
      alarming = true;
      peakDb = db;
      printAlarm(db);
    }
    peakDb = max(peakDb, db);
  } else if (alarming && millis() - lastLoud >= ALARM_HOLD_MS) {
    alarming = false;
    printRecover();
  }
  printMeter(db, p2p);
}
