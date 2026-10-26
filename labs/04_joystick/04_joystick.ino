// 04_joystick: 조이스틱 + 택트 스위치 입력을 시리얼로 PC(웹 게임)에 보낸다
// 보드: Arduino Uno / 시리얼: 115200 baud (게임 입력 지연을 줄이려고 9600 대신 사용)
// 배선: 조이스틱 GND → GND, +5V → 5V, VRx → A0, VRy → A1, SW → D2
//       택트 스위치 한쪽 → D3, 다른 쪽 → GND (내부 풀업 사용, 누르면 LOW)
// 출력: 약 60Hz 로 "x,y,sw,btn" 한 줄 (x·y 0~1023, sw·btn 은 눌림 = 1)
// 웹 게임: labs/04_joystick/web 을 Chrome 으로 열고 [조이스틱 연결] 을 누른다.

const int PIN_X = A0, PIN_Y = A1;
const int PIN_SW = 2, PIN_BTN = 3;
const unsigned long SEND_MS = 16;

unsigned long lastSend = 0;

void setup() {
  pinMode(PIN_SW, INPUT_PULLUP);
  pinMode(PIN_BTN, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  if (millis() - lastSend < SEND_MS) return;
  lastSend = millis();

  Serial.print(analogRead(PIN_X));
  Serial.print(',');
  Serial.print(analogRead(PIN_Y));
  Serial.print(',');
  Serial.print(digitalRead(PIN_SW) == LOW ? 1 : 0);
  Serial.print(',');
  Serial.println(digitalRead(PIN_BTN) == LOW ? 1 : 0);
}
