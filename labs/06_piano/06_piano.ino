// 06_piano: 4×4 키패드로 수동 피에조 부저를 연주한다 (누르고 있는 동안 소리가 계속 난다)
// 보드: Arduino Uno / 시리얼 모니터: 9600 baud
// 배선: 부저 + → D10, 부저 − → GND
//       키패드 1~8번 핀 → D2~D9 (D6~D9 = 행 위→아래, D5~D2 = 열 왼쪽→오른쪽, 05_44button 에서 확인)
// 음계: 키 1~16 = 도(C4)부터 다장조 음계로 두 옥타브 넘게 올라간다. 악보는 songs.md 참고.
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
const char *NAMES[16] = {
  "도", "레", "미", "파", "솔", "라", "시", "도'",
  "레'", "미'", "파'", "솔'", "라'", "시'", "도''", "레''",
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
  Serial.println("06_piano: 키를 누르고 있으면 그 음이 계속 납니다");
}

void loop() {
  if (!keypad.getKeys()) return;

  int next = playing;
  for (byte i = 0; i < LIST_MAX; i++) {
    if (!keypad.key[i].stateChanged) continue;
    int k = keypad.key[i].kchar;
    if (keypad.key[i].kstate == PRESSED) next = k;                       // 새로 누른 키가 우선
    else if (keypad.key[i].kstate == RELEASED && k == next) next = anyHeldKey();
  }
  if (next == playing) return;

  playing = next;
  if (playing) {
    tone(BUZZER_PIN, FREQ[playing - 1]);
    Serial.print("키 ");
    Serial.print(playing);
    Serial.print(" ");
    Serial.println(NAMES[playing - 1]);
  } else {
    noTone(BUZZER_PIN);
  }
}
