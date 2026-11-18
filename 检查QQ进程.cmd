@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Diagnose-QQProcess.ps1" -Root "%~dp0."
pause
