// LCD1602 · hello, world 출력
// 보드: Arduino Uno / 시리얼 모니터: 9600 baud
// 배선: GND → GND, 5V → VCC, A4 → SDA, A5 → SCL (LCD1602 I2C 백팩)

#include <Wire.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>
hd44780_I2Cexp lcd; // 지원되는 I2C 백팩의 주소·핀 연결을 자동 탐색합니다.
void setup() {
  Serial.begin(9600);
  int status = lcd.begin(16, 2); // 가로 16글자, 세로 2줄
  if (status) { Serial.print("LCD init failed: "); Serial.println(status); while (true) {} }
  lcd.backlight();
  lcd.setCursor(0, 0); // 첫째 칸, 첫째 줄. 번호는 0부터 시작합니다.
  lcd.print("hello, world");
  Serial.println("LCD ok: hello, world");
}
void loop() {
}
