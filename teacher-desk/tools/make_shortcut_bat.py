"""make-desktop-shortcut.bat 만들기.

바로 가기 이름 '업무 데스크' 가 윈도우 언어(한국어/영어)와 상관없이 깨지지 않도록,
PowerShell 명령을 UTF-16 base64(-EncodedCommand)로 넣습니다. 안내 문구는 한국어 윈도우용 CP949.
명령을 고치면 이 스크립트를 다시 실행하세요:  python tools/make_shortcut_bat.py
"""

import base64
from pathlib import Path

PS = (
    "$d = [Environment]::GetFolderPath('Desktop'); "
    "$dir = $env:DESK_DIR; "
    "$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d '업무 데스크.lnk')); "
    "$s.TargetPath = (Join-Path $dir 'start-desk.bat'); "
    "$s.WorkingDirectory = $dir; "
    "$s.IconLocation = (Join-Path $env:SystemRoot 'System32\\imageres.dll') + ',109'; "
    "$s.Save()"
)

BAT = r'''@echo off
rem 이 파일은 tools/make_shortcut_bat.py 가 만듭니다 (직접 고치지 말고 스크립트를 고치세요).
rem 한국어 윈도우에서 한글 안내가 깨지지 않도록 ANSI(CP949)로 저장되어 있습니다.
title 바탕화면 바로 가기 만들기
cd /d "%~dp0"
set "DESK_DIR=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand {encoded}
if errorlevel 1 (
    echo.
    echo  [오류] 바로 가기를 만들지 못했습니다. start-desk.bat 을 오른쪽 클릭해 "바로 가기 만들기" 를 쓰세요.
    pause
    exit /b 1
)
echo.
echo  바탕화면에 "업무 데스크" 바로 가기를 만들었습니다.
pause
'''


def main():
    encoded = base64.b64encode(PS.encode("utf-16-le")).decode("ascii")
    out = Path(__file__).resolve().parents[1] / "make-desktop-shortcut.bat"
    out.write_bytes(BAT.replace("{encoded}", encoded).replace("\n", "\r\n").encode("cp949"))
    print(f"만듦: {out}")


if __name__ == "__main__":
    main()
