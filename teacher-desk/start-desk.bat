@echo off
chcp 65001 > nul
title 교사 업무 데스크

cd /d "%~dp0"
rem python 이 없으면 py(파이썬 실행기)로 시도
set PY=python
where python > nul 2> nul
if errorlevel 1 set PY=py
where %PY% > nul 2> nul
if errorlevel 1 (
    echo Python 이 설치되어 있지 않습니다. README.md 의 "1. 설치" 를 보세요.
    pause
    exit /b 1
)
%PY% desk.py

pause
