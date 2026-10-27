@echo off
rem 이 파일은 한국어 윈도우에서 한글이 깨지지 않도록 ANSI(CP949)로 저장되어 있습니다.
title 바탕화면 바로 가기 만들기
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$d = [Environment]::GetFolderPath('Desktop'); $s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d '업무 데스크.lnk')); $s.TargetPath = '%~dp0start-desk.bat'; $s.WorkingDirectory = '%~dp0'; $s.IconLocation = '%SystemRoot%\System32\imageres.dll,109'; $s.Save()"
if errorlevel 1 (
    echo.
    echo  [오류] 바로 가기를 만들지 못했습니다. start-desk.bat 을 오른쪽 클릭해 "바로 가기 만들기" 를 쓰세요.
    pause
    exit /b 1
)
echo.
echo  바탕화면에 "업무 데스크" 바로 가기를 만들었습니다.
pause
