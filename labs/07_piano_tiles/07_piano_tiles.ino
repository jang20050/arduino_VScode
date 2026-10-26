// 07_piano_tiles: 키패드 피아노(06_piano) + 웹 리듬게임용 입력 전송
// 보드: Arduino Uno / 시리얼: 9600 baud
// 배선: 06_piano 와 같다 — 부저 + → D10, − → GND / 키패드 1~8번 핀 → D2~D9
// 동작: 누르고 있는 동안 부저로 그 음을 내고, 키 이벤트를 시리얼로 보낸다.
//       "P5" = 5번 키 누름, "R5" = 5번 키 뗌
// 웹 게임: labs/07_piano_tiles/web 을 Chrome 으로 열고 [키패드 연결] 을 누른다.
//
//   [ 1 도  ] [ 2 레  ] [ 3 미  ] [ 4 파  ]
//   [ 5 솔  ] [ 6 라  ] [ 7 시  ] [ 8 도' ]
//   [ 9 레' ] [10 미' ] [11 파' ] [12 솔' ]
//   [13 라' ] [14 시' ] [15 도''] [16 레'']

#include <Keypad.h>

const int BUZZER_PIN = 10;

const byte ROWS = 4, COLS = 4;
byte rowPins[ROWS] = {6, 7, 8, 9};
byte colPins[COLS] = {5, 4, 3, 2};

// 키패드 라이브러리는 0 을 "키 없음"으로 쓰므로 키 값은 1~16 으로 둔다.
char keys[ROWS][COLS] = {
  {1, 2, 3, 4},
  {5, 6, 7, 8},
  {9, 10, 11, 12},
  {13, 14, 15, 16},
};

Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// 키 1~16 의 주파수(Hz): C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6 D6
const unsigned int FREQ[16] = {
  262, 294, 330, 349, 392, 440, 494, 523,
  587, 659, 698, 784, 880, 988, 1047, 1175,
};

int playing = 0;  // 지금 소리 내는 키 (0 = 없음)

// 아직 눌려 있는 다른 키를 찾는다 (여러 개를 누르고 있다가 하나를 뗐을 때 이어서 소리 내기).
int anyHeldKey() {
  for (byte i = 0; i < LIST_MAX; i++) {
    KeyState s = keypad.key[i].kstate;
    if (keypad.key[i].kchar && (s == PRESSED || s == HOLD)) return keypad.key[i].kchar;
  }
  return 0;
}

void setup() {
  Serial.begin(9600);
  keypad.setDebounceTime(5);  // 리듬게임이라 입력 지연을 줄인다 (기본 10ms)
}

void loop() {
  if (!keypad.getKeys()) return;

  int next = playing;
  for (byte i = 0; i < LIST_MAX; i++) {
    if (!keypad.key[i].stateChanged) continue;
    int k = keypad.key[i].kchar;
    if (keypad.key[i].kstate == PRESSED) {
      next = k;                                       // 새로 누른 키가 우선
      Serial.print('P');
      Serial.println(k);
    } else if (keypad.key[i].kstate == RELEASED) {
      if (k == next) next = anyHeldKey();
      Serial.print('R');
      Serial.println(k);
    }
  }
  if (next == playing) return;

  playing = next;
  if (playing) tone(BUZZER_PIN, FREQ[playing - 1]);
  else noTone(BUZZER_PIN);
}
