"""아두이노 우노 실습 도우미.

사용 예:
    python tools/lab.py new 01_led_blink        # 새 실습 폴더/스케치 생성
    python tools/lab.py compile 00_check        # 컴파일 (기본: PlatformIO)
    python tools/lab.py upload 00_check         # 컴파일 + 업로드
    python tools/lab.py monitor                 # 시리얼 모니터
    python tools/lab.py upload 00_check --cli   # arduino-cli 로 업로드
    python tools/lab.py done 00_check "메모"     # docs/progress.md 에 완료 기록
"""

import argparse
import datetime
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LABS = ROOT / "labs"
PROGRESS = ROOT / "docs" / "progress.md"

FQBN = "arduino:avr:uno"
PORT = os.environ.get("ARDUINO_PORT", "COM5")
BAUD = "9600"
PIO = Path.home() / ".platformio" / "penv" / "Scripts" / "pio.exe"

TEMPLATE = """// {name}

void setup() {{
  Serial.begin({baud});
}}

void loop() {{
}}
"""


def lab_dir(name: str) -> Path:
    d = LABS / name
    if not (d / f"{name}.ino").exists():
        sys.exit(f"스케치를 찾을 수 없음: {d / (name + '.ino')}")
    return d


def run(cmd, env=None):
    print(">", " ".join(str(c) for c in cmd))
    sys.exit(subprocess.call(cmd, cwd=ROOT, env=env))


def cmd_new(args):
    d = LABS / args.name
    ino = d / f"{args.name}.ino"
    if ino.exists():
        sys.exit(f"이미 존재함: {ino}")
    d.mkdir(parents=True, exist_ok=True)
    ino.write_text(TEMPLATE.format(name=args.name, baud=BAUD), encoding="utf-8")
    print(f"생성: {ino}")


def cmd_build(args, upload: bool):
    d = lab_dir(args.name)
    if args.cli:
        cmd = ["arduino-cli", "compile", "--fqbn", FQBN, str(d)]
        if upload:
            cmd += ["--upload", "-p", PORT]
        run(cmd)
    env = dict(os.environ, PLATFORMIO_SRC_DIR=str(d))
    cmd = [str(PIO), "run"] + (["-t", "upload", "--upload-port", PORT] if upload else [])
    run(cmd, env=env)


def cmd_monitor(args):
    if args.cli:
        run(["arduino-cli", "monitor", "-p", PORT, "--config", f"baudrate={BAUD}"])
    # direct: ANSI 색 코드를 지우지 않고 그대로 터미널에 넘긴다 (09_sound 등)
    run([str(PIO), "device", "monitor", "-p", PORT, "-b", BAUD, "-f", "direct"])


def cmd_done(args):
    lab_dir(args.name)
    today = datetime.date.today().isoformat()
    with PROGRESS.open("a", encoding="utf-8") as f:
        f.write(f"| {today} | {args.name} | {args.note} |\n")
    print(f"기록됨: {args.name}")


def main():
    p = argparse.ArgumentParser(description="아두이노 우노 실습 도우미")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("new"); s.add_argument("name")
    for c in ("compile", "upload"):
        s = sub.add_parser(c); s.add_argument("name")
        s.add_argument("--cli", action="store_true", help="PlatformIO 대신 arduino-cli 사용")
    s = sub.add_parser("monitor")
    s.add_argument("--cli", action="store_true")
    s = sub.add_parser("done"); s.add_argument("name"); s.add_argument("note", nargs="?", default="")

    args = p.parse_args()
    if args.cmd == "new":
        cmd_new(args)
    elif args.cmd == "compile":
        cmd_build(args, upload=False)
    elif args.cmd == "upload":
        cmd_build(args, upload=True)
    elif args.cmd == "monitor":
        cmd_monitor(args)
    elif args.cmd == "done":
        cmd_done(args)


if __name__ == "__main__":
    main()
