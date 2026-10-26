// 05_44button: 4×4 키패드에서 누른 키의 번호(1~16)를 시리얼로 출력
// 보드: Arduino Uno / 시리얼 모니터: 9600 baud
// 배선: 키패드 1~8번 핀 → D2~D9
//       실제로 눌러 확인한 결과 D6~D9 = 행(위→아래), D5~D2 = 열(왼쪽→오른쪽)
// 번호: 왼쪽 위부터 오른쪽으로 1, 2, 3, 4 / 다음 줄 5 … 16

#include <Keypad.h>

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

// 키에 적힌 글자 (일반적인 4×4 키패드 배열)
const char LABELS[] = "123A456B789C*0#D";

Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

void setup() {
  Serial.begin(9600);
  Serial.println("05_44button: 키를 누르세요");
}

void loop() {
  char key = keypad.getKey();
  if (!key) return;

  int n = key;
  Serial.print("키 ");
  Serial.print(n);
  Serial.print(" (");
  Serial.print(LABELS[n - 1]);
  Serial.println(")");
}
