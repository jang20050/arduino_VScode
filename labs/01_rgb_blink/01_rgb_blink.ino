// RGB LED · 세 가지 빛 섞기
// 보드: Arduino Uno / 시리얼 모니터: 9600 baud
// USB를 뽑고 배선한 뒤, 아래 연결표와 코드의 핀 번호를 대조하세요.

const int R = 9, G = 10, B = 11; // ~ 표시 PWM 핀입니다.
const bool COMMON_ANODE = false; // 공통 -면 false. 공통 +형은 배선도 함께 바꿔야 합니다.
void color(byte red, byte green, byte blue) {
  analogWrite(R, COMMON_ANODE ? 255-red : red);
  analogWrite(G, COMMON_ANODE ? 255-green : green);
  analogWrite(B, COMMON_ANODE ? 255-blue : blue);
}
void setup() { pinMode(R, OUTPUT); pinMode(G, OUTPUT); pinMode(B, OUTPUT); }
void loop() {
  color(255,0,0); delay(800); // 빨강
  color(0,255,0); delay(800); // 초록
  color(0,0,255); delay(800); // 파랑
  color(120,40,160); delay(800); // 섞은 색
}
