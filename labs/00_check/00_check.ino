// 00_check: 개발 환경 검증용 Blink
// 보드 내장 LED(D13)를 1초 간격으로 깜빡이고, 시리얼(9600)로 상태를 출력한다.

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("00_check: Blink start");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.println("LED ON");
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  Serial.println("LED OFF");
  delay(1000);
}
