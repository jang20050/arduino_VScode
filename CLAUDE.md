# 아두이노 우노 실습 프로젝트

> ⚠️ 임시 초안입니다. 사용자가 붙여넣을 CLAUDE.md 원문으로 교체하세요.

## 환경
- 보드: Arduino Uno (FQBN `arduino:avr:uno`), 포트 `COM5`, 시리얼 9600bps
- 도구: arduino-cli + PlatformIO(VS Code 확장), 도우미 스크립트는 Python (`tools/lab.py`)
- 라이브러리는 arduino-cli 로 설치(`C:/Users/jang2/OneDrive/문서/Arduino/libraries`)하고 PlatformIO 가 `lib_extra_dirs` 로 공유

## 구조
- `labs/NN_이름/NN_이름.ino` — 실습마다 하나
- `docs/progress.md` — 완료한 실습 기록
- `platformio.ini` — PlatformIO 설정 (src_dir 은 `tools/lab.py` 가 실습별로 지정)

## 명령
```
python tools/lab.py new 01_이름
python tools/lab.py compile 01_이름      # --cli 를 붙이면 arduino-cli 사용
python tools/lab.py upload 01_이름
python tools/lab.py monitor
python tools/lab.py done 01_이름 "메모"
```
