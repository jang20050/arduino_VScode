// 08_remotecontrol: IR 수신기로 리모컨 버튼을 읽어 시리얼 모니터에 출력
// 보드: Arduino Uno / 시리얼 모니터: 9600 baud
// 배선: IR 수신기 OUT → D2, GND → GND, Vs → 5V
// 출력: 버튼 이름(아두이노 키트용 21키 리모컨 기준 추정), 프로토콜, 주소, 명령 코드
//       길게 누르고 있으면 "(반복)" 이 붙는다. 이름이 "?" 이면 명령 코드로 구분하면 된다.

#include <IRremote.hpp>

const int IR_PIN = 2;

// 아두이노 키트에 흔히 들어 있는 21키 NEC 리모컨 (주소 0x00)
struct Button { uint8_t code; const char *name; };
const Button BUTTONS[] = {
  {0x45, "CH- / POWER"}, {0x46, "CH / VOL+"}, {0x47, "CH+ / FUNC"},
  {0x44, "|<< 이전"},    {0x40, ">>| 다음"},  {0x43, ">|| 재생"},
  {0x07, "- / 아래"},     {0x15, "+ / VOL-"},  {0x09, "EQ / 위"},
  {0x16, "0"},           {0x19, "100+ / EQ"}, {0x0D, "200+ / ST"},
  {0x0C, "1"}, {0x18, "2"}, {0x5E, "3"},
  {0x08, "4"}, {0x1C, "5"}, {0x5A, "6"},
  {0x42, "7"}, {0x52, "8"}, {0x4A, "9"},
};

const char *buttonName(uint8_t code) {
  for (const Button &b : BUTTONS) {
    if (b.code == code) return b.name;
  }
  return "?";
}

void printHex(uint32_t v) {
  Serial.print("0x");
  if (v < 0x10) Serial.print('0');
  Serial.print(v, HEX);
}

void setup() {
  Serial.begin(9600);
  IrReceiver.begin(IR_PIN, ENABLE_LED_FEEDBACK);  // 신호를 받으면 보드의 L 표시등(D13)이 깜빡인다
  Serial.println("08_remotecontrol: 리모컨을 IR 수신기 쪽으로 향하고 버튼을 누르세요");
}

void loop() {
  if (!IrReceiver.decode()) return;

  IRData &d = IrReceiver.decodedIRData;
  if (d.protocol == UNKNOWN) {
    Serial.print("알 수 없는 신호 (원시값 ");
    printHex(d.decodedRawData);
    Serial.println(")");
  } else {
    bool repeat = d.flags & IRDATA_FLAGS_IS_REPEAT;
    Serial.print("버튼: ");
    Serial.print(d.protocol == NEC && d.address == 0x00 ? buttonName(d.command) : "?");
    if (repeat) Serial.print(" (반복)");
    Serial.print("  | ");
    Serial.print(getProtocolString(d.protocol));
    Serial.print(" 주소 ");
    printHex(d.address);
    Serial.print(" 명령 ");
    printHex(d.command);
    Serial.println();
  }
  IrReceiver.resume();
}
